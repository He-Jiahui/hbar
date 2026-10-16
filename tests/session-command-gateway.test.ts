import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { CommandRegistry, createCommandRouter } from '@hbar/commands'
import { directoryCommands } from '@hbar/contracts/commands'
import { fileCommands } from '@hbar/contracts/commands/files'
import type { ExecutionOwnership } from '@hbar/contracts/runtime'
import { Storage } from '@hbar/storage'
import { SessionCommandGateway } from '../apps/host/src/session-command-gateway'
import { SessionCommandExecution } from '../apps/host/src/session-command-execution'
import { SessionCommandDiscovery } from '../apps/host/src/session-command-discovery'
import { HostCommandExecutionScopes } from '../apps/host/src/command-execution-scopes'
import { LocalCommandJobs } from '../apps/host/src/local-command-jobs'
import { CommandResultPayloads } from '../apps/host/src/command-result-payloads'
import { removeOwnedTestDirectory } from './owned-temp-directory'

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('Expected command rejection')
}

async function fixture() {
  const prefix = 'hbar-command-gateway-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const storage = new Storage(join(root, 'state.sqlite'))
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', root, 'allowed')
  const device = {
    id: 'gateway-actor',
    name: 'Gateway actor',
    role: 'operator' as const,
    workspaceIds: null,
    createdAt: 1,
    lastSeenAt: 1,
  }
  await storage.call('putDevice', device, 'fixture-hash')
  const session = await storage.call('createSessionCommand', {
    workspaceId: workspace.id,
    actorId: device.id,
    idempotencyKey: 'source-session',
  })
  const run = await storage.call(
    'enqueue',
    session.id,
    'source-request',
    { text: 'command proof', images: [] },
    'fixture',
  )
  await storage.call('claim', session.id)
  const source: ExecutionOwnership = {
    sessionId: session.id,
    runId: run.id,
    leaseId: 'gateway-lease',
    fence: 1,
    acquiredAt: 1,
    owner: { unitId: 'kernel', generation: 1, incarnation: 'gateway-kernel' },
    versions: {
      kernel: { unitId: 'kernel', generation: 1, artifactId: 'a'.repeat(64) },
      driver: { unitId: 'driver', generation: 1, artifactId: 'b'.repeat(64) },
      plugins: [],
      hooks: [],
    },
  }
  const signal = new AbortController().signal
  const scopes = new HostCommandExecutionScopes()
  let reads = 0,
    resources = 0
  const registry = new CommandRegistry({ execution: 'host' })
  registry.register(directoryCommands['workspace.list'], async () => {
    reads++
    return { items: await storage.call('workspaces'), nextCursor: null }
  })
  registry.register(directoryCommands['workspace.get'], async (input) => {
    reads++
    return storage.call('findWorkspace', input.workspaceId)
  })
  const unexpectedFile = async (): Promise<never> => {
    throw new Error('Preparation must not execute a file operation')
  }
  registry.register(fileCommands['file.read'], unexpectedFile)
  registry.register(fileCommands['file.write'], unexpectedFile)
  const jobs = new LocalCommandJobs({
    scopes,
    retainSource: () => {
      resources++
      return () => {
        resources--
      }
    },
  })
  const routing = createCommandRouter({
    catalogs: () => [registry.list()],
    resolve: (id) => ({
      describe: () => registry.describe(id),
      prepare: async (value) => registry.prepare(value),
      dispatch: (value, actorId) => registry.dispatch(value, { actorId }),
      dispatchPrepared: registry.dispatchPrepared.bind(registry),
      dispatchPreparedTracked: (value, actorId, expectation, options) =>
        jobs.execute(
          actorId,
          (actualSignal) => registry.dispatchPreparedTracked(value, actorId, expectation, { signal: actualSignal }),
          options,
        ),
    }),
  })
  const discovery = new SessionCommandDiscovery()
  const detach = discovery.attach(routing)
  const service = new SessionCommandExecution({
    storage,
    routing,
    scopes,
    assertSource: (actual) => {
      expect(actual).toEqual(source)
    },
    payloads: new CommandResultPayloads({
      write: async () => {
        throw new Error('Unexpected large result')
      },
      read: async () => {
        throw new Error('Unexpected artifact read')
      },
    }),
  })
  const createGateway = () =>
    new SessionCommandGateway({
      storage,
      discovery,
      execution: () => service,
      assertSource: (actual) => {
        expect(actual).toEqual(source)
      },
    })
  const gateway = createGateway()
  const call = { commandId: 'workspace.list', commandVersion: 1, operationKey: 'list-once', input: {} }
  return {
    storage,
    workspace,
    device,
    source,
    signal,
    gateway,
    createGateway,
    call,
    counts: () => ({ reads, resources }),
    async close() {
      service.assertCanClose()
      jobs.dispose()
      detach()
      discovery.close()
      registry.dispose()
      await storage.close()
      await removeOwnedTestDirectory(root, prefix)
    },
  }
}

test('preparation normalizes without executing and admitted repeated operation keys return the saved original result', async () => {
  const f = await fixture()
  try {
    const prepared = await f.gateway.prepare(f.source, 'first-call', f.call, f.signal)
    expect(prepared.admission).toMatchObject({ effect: 'read', workspaceAccess: { kind: 'none' } })
    expect(prepared.arguments.input).toHaveProperty('limit')
    expect(f.counts()).toEqual({ reads: 0, resources: 0 })
    expect(
      await f.storage.call('commandExecutionRead', {
        sessionId: f.source.sessionId,
        actorId: f.device.id,
        operationKey: f.call.operationKey,
      }),
    ).toBeNull()
    const result = await f.gateway.execute(f.source, 'first-call', prepared, f.signal)
    expect(result.isError).toBe(false)
    const decoded = z
      .object({
        status: z.literal('succeeded'),
        physical: z.literal('succeeded'),
        acknowledged: z.literal(true),
        result: z.object({ items: z.array(z.object({ id: z.string() })) }),
      })
      .parse(JSON.parse(result.text) as unknown)
    expect(decoded.result.items.map((item) => item.id)).toEqual([f.workspace.id])
    const repeated = await f.gateway.prepare(f.source, 'second-call', f.call, f.signal)
    expect(await f.gateway.execute(f.source, 'second-call', repeated, f.signal)).toEqual(result)
    expect(f.counts()).toEqual({ reads: 1, resources: 0 })
    const changed = await f.gateway.prepare(f.source, 'changed-call', { ...f.call, input: { limit: 1 } }, f.signal)
    expect(await failure(f.gateway.execute(f.source, 'changed-call', changed, f.signal))).toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    })
    expect(f.counts().reads).toBe(1)
  } finally {
    await f.close()
  }
})

test('signed preparations reject changed source calls, arguments, admission and a replacement Host before command intent', async () => {
  const f = await fixture()
  try {
    const prepared = await f.gateway.prepare(f.source, 'bound-call', f.call, f.signal)
    for (const tampered of [
      { ...prepared, arguments: { ...prepared.arguments, operationKey: 'another-operation' } },
      { ...prepared, invocation: { ...prepared.invocation, input: { limit: 1 } } },
      { ...prepared, admission: { ...prepared.admission, effect: 'write' as const } },
      { ...prepared, sourceMethods: ['execution.write'] },
    ])
      expect(await failure(f.gateway.execute(f.source, 'bound-call', tampered, f.signal))).toMatchObject({
        code: 'COMMAND_PREPARATION_INVALID',
      })
    expect(await failure(f.gateway.execute(f.source, 'another-call', prepared, f.signal))).toMatchObject({
      code: 'COMMAND_PREPARATION_INVALID',
    })
    expect(await failure(f.createGateway().execute(f.source, 'bound-call', prepared, f.signal))).toMatchObject({
      code: 'COMMAND_PREPARATION_INVALID',
    })
    expect(f.counts()).toEqual({ reads: 0, resources: 0 })
    expect(
      await f.storage.call('commandExecutionRead', {
        sessionId: f.source.sessionId,
        actorId: f.device.id,
        operationKey: f.call.operationKey,
      }),
    ).toBeNull()
  } finally {
    await f.close()
  }
})

test('current device authorization, cancellation and unsupported concrete effects stop before dispatch', async () => {
  const f = await fixture()
  try {
    const prepared = await f.gateway.prepare(f.source, 'bound-call', f.call, f.signal)
    await f.storage.call('revokeDevice', f.device.id)
    await f.storage.call('putDevice', { ...f.device, workspaceIds: [] }, 'narrowed-hash')
    expect(await failure(f.gateway.execute(f.source, 'bound-call', prepared, f.signal))).toMatchObject({
      code: 'FORBIDDEN',
    })
    await f.storage.call('revokeDevice', f.device.id)
    await f.storage.call('putDevice', f.device, 'restored-hash')
    await expect(
      f.gateway.prepare(f.source, 'unsupported', { ...f.call, commandId: 'system.restart' }, f.signal),
    ).rejects.toMatchObject({ code: 'COMMAND_ADMISSION_UNAVAILABLE' })
    await expect(
      f.gateway.prepare(
        f.source,
        'unsupported-target',
        { ...f.call, target: { clientId: 'connected-client', generation: 1 } },
        f.signal,
      ),
    ).rejects.toMatchObject({ code: 'COMMAND_TARGET_UNAVAILABLE' })
    const controller = new AbortController()
    controller.abort(new Error('Source stopped'))
    await expect(f.gateway.execute(f.source, 'bound-call', prepared, controller.signal)).rejects.toThrow(
      'Source stopped',
    )
    expect(f.counts()).toEqual({ reads: 0, resources: 0 })
  } finally {
    await f.close()
  }
})

test('file preparation pins the source target and exact nested path without opening a source capability or command intent', async () => {
  const f = await fixture()
  try {
    const call = {
      commandId: 'file.write',
      commandVersion: 1,
      operationKey: 'create-proof',
      input: {
        workspaceId: f.workspace.id,
        path: 'proof.txt',
        text: 'source data',
        expectedSha256: null,
      },
    }
    const prepared = await f.gateway.prepare(f.source, 'file-call', call, f.signal)
    expect(prepared.arguments.input.sessionTarget).toEqual({ sessionId: f.source.sessionId, expectedRevision: 0 })
    expect(prepared.admission).toMatchObject({
      effect: 'write',
      workspaceAccess: {
        kind: 'paths',
        arguments: [{ field: 'input.path', fieldPath: ['input', 'path'], access: 'write' }],
      },
    })
    expect(prepared.sourceMethods).toEqual([
      'launchTarget.workspaceForRun',
      'workspaceSandbox.prepare',
      'execution.readBytes',
      'execution.write',
    ])
    expect(await failure(f.gateway.execute(f.source, 'file-call', prepared, f.signal))).toMatchObject({
      code: 'COMMAND_SOURCE_APPLICATION_REQUIRED',
    })
    for (const input of [
      { ...call.input, workspaceId: 'foreign-workspace' },
      { ...call.input, sessionTarget: { sessionId: 'another-session', expectedRevision: 0 } },
    ])
      expect(await failure(f.gateway.prepare(f.source, 'foreign-call', { ...call, input }, f.signal))).toMatchObject({
        code: 'COMMAND_SOURCE_WORKSPACE_MISMATCH',
      })
    expect(
      await failure(
        f.gateway.prepare(
          f.source,
          'stale-call',
          { ...call, input: { ...call.input, sessionTarget: { sessionId: f.source.sessionId, expectedRevision: 99 } } },
          f.signal,
        ),
      ),
    ).toMatchObject({ code: 'COMMAND_CONFLICT' })
    expect(
      await f.storage.call('commandExecutionRead', {
        sessionId: f.source.sessionId,
        actorId: f.device.id,
        operationKey: call.operationKey,
      }),
    ).toBeNull()
    expect(f.counts()).toEqual({ reads: 0, resources: 0 })
  } finally {
    await f.close()
  }
})

test('bounded source preparation stays read-only across repeated real Worker authorization and normalization', async () => {
  const f = await fixture()
  try {
    const samples: number[] = []
    for (let index = 0; index < 32; index++) {
      const started = performance.now()
      await f.gateway.prepare(f.source, `sample-${index}`, f.call, f.signal)
      samples.push(performance.now() - started)
    }
    samples.sort((left, right) => left - right)
    console.log(
      JSON.stringify({
        event: 'session-command-preparation-latency',
        samples: samples.length,
        p95Ms: samples[Math.ceil(samples.length * 0.95) - 1],
        maxMs: samples.at(-1),
      }),
    )
    expect(f.counts()).toEqual({ reads: 0, resources: 0 })
    expect(
      await f.storage.call('commandExecutionRead', {
        sessionId: f.source.sessionId,
        actorId: f.device.id,
        operationKey: f.call.operationKey,
      }),
    ).toBeNull()
  } finally {
    await f.close()
  }
})
