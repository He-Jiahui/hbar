import { expect, test } from 'bun:test'
import { AsyncLocalStorage, AsyncResource } from 'node:async_hooks'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import type { ExecutionOwnership } from '@hbar/contracts/runtime'
import { IpcPeer, RuntimeCoordinator, RuntimeValuePort } from '@hbar/runtime'
import { createPathLayout } from '@hbar/storage'
import { HostCommandExecutionScopes } from '../apps/host/src/command-execution-scopes'
import { RuntimeKernelFacade } from '../apps/host/src/runtime-kernel-facade'

const source = (index: number): ExecutionOwnership => ({
  leaseId: `lease-${index}`,
  sessionId: `session-${index}`,
  runId: `run-${index}`,
  fence: index,
  acquiredAt: index,
  owner: { unitId: 'kernel', generation: 1, incarnation: 'kernel-current' },
  versions: {
    kernel: { unitId: 'kernel', generation: 1, artifactId: 'a'.repeat(64) },
    driver: { unitId: 'driver.pi', generation: 1, artifactId: 'b'.repeat(64) },
    plugins: [],
    hooks: [],
  },
})

test('concurrent command scopes preserve their source callbacks across awaits and detach the exact executor identity', async () => {
  const scopes = new HostCommandExecutionScopes()
  const observed: string[] = []
  await Promise.all(
    [1, 2].map((index) =>
      scopes.run(
        {
          source: source(index),
          beforeStart: async (owner, signal) => {
            expect(Object.isFrozen(owner)).toBe(true)
            if (owner.kind !== 'runtime') throw new Error('Expected a managed executor')
            expect(Object.isFrozen(owner.owner)).toBe(true)
            await Bun.sleep(1)
            observed.push(`${index}:${owner.owner.incarnation}:${owner.jobId}:${signal.aborted}`)
          },
        },
        async () => {
          await Bun.sleep(1)
          const actual = {
            kind: 'runtime' as const,
            owner: {
              unitId: 'controller',
              generation: index,
              incarnation: `controller-${index}`,
            },
            jobId: `job-${index}`,
          }
          const start = scopes.beforeStart(actual)
          actual.jobId = 'caller-mutated'
          actual.owner.incarnation = 'caller-mutated'
          await start?.(new AbortController().signal)
        },
      ),
    ),
  )
  expect(observed.sort()).toEqual(['1:controller-1:job-1:false', '2:controller-2:job-2:false'])
  expect(scopes.beforeStart({ kind: 'host', instanceId: 'host-current', jobId: 'outside' })).toBeUndefined()
})

test('file commands use their captured source capability across isolated IPC without resolving the operator Kernel', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-source-command-'))
  const scopes = new HostCommandExecutionScopes()
  const sourceContext = new AsyncLocalStorage<{ root: string; leaseId: string }>()
  const transport = new AsyncResource('isolated-source-command')
  const execution = source(1)
  let remote!: IpcPeer
  const local = new IpcPeer({
    owner: { unitId: 'base', generation: 1, incarnation: 'source-host' },
    remote: execution.owner,
    transport: { send: (frame) => transport.runInAsyncScope(() => remote.receive(JSON.parse(JSON.stringify(frame)))) },
  })
  remote = new IpcPeer({
    owner: local.remote,
    remote: local.owner,
    transport: { send: (frame) => transport.runInAsyncScope(() => local.receive(JSON.parse(JSON.stringify(frame)))) },
  })
  const application = new RuntimeValuePort(local, { prefix: 'kernel.command.proof' })
  const sourceApplication = new RuntimeValuePort(remote, { prefix: 'kernel.command.proof' })
  let operatorResolutions = 0
  const unexpectedOperator = () => {
    operatorResolutions++
    throw new Error('Operator Kernel must not receive a source file command')
  }
  const facade = new RuntimeKernelFacade({
    instanceId: 'source-host',
    layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
    demo: false,
    storage: { call: () => Promise.reject(new Error('Unexpected storage call')), close: async () => {} },
    coordinator: new RuntimeCoordinator({
      claim: async (draft) => draft,
      release: async () => {},
      revoke: async () => {},
    }),
    commandScopes: scopes,
    current: unexpectedOperator,
    endpoints: () => [],
    resolve: unexpectedOperator,
    maintain: (operation) => operation(),
  })
  const admitted = sourceContext.run({ root, leaseId: execution.leaseId }, () => AsyncLocalStorage.snapshot())
  sourceApplication.register('execution.write', (args) =>
    admitted(async () => {
      const [workspace, path, text] = z.tuple([z.string(), z.literal('result.txt'), z.string()]).parse(args)
      expect(sourceContext.getStore()).toEqual({ root, leaseId: execution.leaseId })
      expect(workspace).toBe(root)
      await writeFile(join(root, path), text)
      return { before: '', after: text, path, revision: 'written-once' }
    }),
  )
  sourceApplication.register('execution.read', (args) =>
    admitted(async () => {
      const [workspace, path] = z.tuple([z.string(), z.literal('result.txt')]).parse(args)
      expect(sourceContext.getStore()).toEqual({ root, leaseId: execution.leaseId })
      expect(workspace).toBe(root)
      return readFile(join(root, path), 'utf8')
    }),
  )
  try {
    const capability = facade.api.plugins.get('execution')
    const signal = new AbortController().signal
    await scopes.run(
      {
        source: execution,
        callId: 'source-call',
        beforeStart: async () => {},
        application: { owner: execution.owner, callId: 'source-call', signal, timeoutMs: 5_000, port: application },
      },
      async () => {
        const written = await capability.write(root, 'result.txt', 'source capability: 你好')
        expect(written.revision).toBe('written-once')
        expect(await capability.read(root, 'result.txt')).toBe('source capability: 你好')
      },
    )
    expect(await readFile(join(root, 'result.txt'), 'utf8')).toBe('source capability: 你好')
    await expect(
      scopes.run({ source: execution, beforeStart: async () => {} }, () =>
        capability.write(root, 'result.txt', 'must not write'),
      ),
    ).rejects.toMatchObject({ code: 'COMMAND_SOURCE_APPLICATION_REQUIRED' })
    expect(await readFile(join(root, 'result.txt'), 'utf8')).toBe('source capability: 你好')
    expect(operatorResolutions).toBe(0)
  } finally {
    application.dispose()
    sourceApplication.dispose()
    local.close()
    remote.close()
    transport.emitDestroy()
    await rm(root, { recursive: true, force: true })
  }
})

test('source applications reject a different owner, tool call, invalid deadline, undeclared method and cancelled source', () => {
  const scopes = new HostCommandExecutionScopes()
  const execution = source(1)
  let effects = 0
  const controller = new AbortController()
  const application = {
    owner: { ...execution.owner },
    callId: 'source-call',
    signal: controller.signal,
    timeoutMs: 5_000,
    port: {
      call: () => {
        effects++
        return Promise.reject(new Error('Must not execute'))
      },
    },
  }
  const scope = { source: execution, callId: 'source-call', beforeStart: async () => {}, application }
  expect(() =>
    scopes.run({ ...scope, application: { ...application, owner: { ...execution.owner, generation: 2 } } }, () => {}),
  ).toThrow('Source application belongs to another Kernel or tool call')
  expect(() => scopes.run({ ...scope, callId: 'another-call' }, () => {})).toThrow(
    'Source application belongs to another Kernel or tool call',
  )
  for (const timeoutMs of [0, -1, 1.5, 1_200_001, Number.NaN, Number.POSITIVE_INFINITY])
    expect(() => scopes.run({ ...scope, application: { ...application, timeoutMs } }, () => {})).toThrow(
      'Source application deadline is invalid',
    )
  scopes.run(scope, () => {
    expect(() => scopes.invokeApplication('execution', 'undeclared', [])).toThrow(
      'Undeclared source application capability',
    )
    expect(scopes.invokeApplication('budget', 'get', [])).toBeUndefined()
    controller.abort(new Error('Source stopped'))
    expect(() => scopes.invokeApplication('execution', 'write', [])).toThrow('Source stopped')
  })
  expect(scopes.invokeApplication('execution', 'write', [])).toBeUndefined()
  expect(effects).toBe(0)
})
