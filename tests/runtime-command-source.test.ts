import { expect, test } from 'bun:test'
import { AsyncLocalStorage, AsyncResource } from 'node:async_hooks'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { ExecutionOwnership } from '@hbar/contracts/runtime'
import type { ExecutionProvider, ExecOptions, GitService, ToolContext } from '@hbar/plugin-sdk'
import { IpcPeer, RuntimeValuePort } from '@hbar/runtime'
import {
  RuntimeCommandSources,
  connectRuntimeCommandSource,
  type OpenCommandSource,
} from '../apps/host/src/runtime-command-source'
import { removeOwnedTestDirectory } from './owned-temp-directory'

const owner = { unitId: 'kernel', generation: 1, incarnation: 'source-kernel' }
function execution(context: ToolContext): ExecutionOwnership {
  return {
    leaseId: 'source-lease',
    owner,
    sessionId: context.session.id,
    runId: context.run.id,
    fence: 1,
    acquiredAt: 1,
    versions: {
      kernel: { unitId: 'kernel', generation: 1, artifactId: 'a'.repeat(64) },
      driver: { unitId: 'driver', generation: 1, artifactId: 'b'.repeat(64) },
      plugins: [],
      hooks: [],
    },
  }
}
function context(root: string, signal = new AbortController().signal): ToolContext {
  return {
    session: {
      id: 'source-session',
      workspaceId: 'source-workspace',
      title: '',
      archived: false,
      parentId: null,
      createdAt: 1,
      updatedAt: 1,
      seq: 0,
    },
    workspace: { id: 'source-workspace', path: root, name: 'Source', createdAt: 1 },
    run: {
      id: 'source-run',
      sessionId: 'source-session',
      requestId: 'source-request',
      input: { text: '', images: [], approval: 'allow' },
      modelId: 'fixture',
      status: 'running',
      createdAt: 1,
      startedAt: 1,
      endedAt: null,
      error: null,
    },
    callId: 'source-call',
    timeoutMs: 1_000,
    signal,
    nodeAuthority: {
      sessionId: 'source-session',
      runId: 'source-run',
      callId: 'source-call',
      sandbox: null,
      admission: { kind: 'allow' },
    },
  }
}
function peers() {
  const transport = new AsyncResource('isolated-command-source')
  let kernel!: IpcPeer
  const host = new IpcPeer({
    owner: { unitId: 'base', generation: 1, incarnation: 'source-host' },
    remote: owner,
    transport: { send: (frame) => transport.runInAsyncScope(() => kernel.receive(JSON.parse(JSON.stringify(frame)))) },
  })
  kernel = new IpcPeer({
    owner,
    remote: host.owner,
    transport: { send: (frame) => transport.runInAsyncScope(() => host.receive(JSON.parse(JSON.stringify(frame)))) },
  })
  const sources = new RuntimeCommandSources(kernel)
  return {
    host,
    sources,
    close() {
      sources.assertCanClose()
      host.close()
      kernel.close()
      transport.emitDestroy()
    },
  }
}
function provider(overrides: Partial<ExecutionProvider> = {}): ExecutionProvider {
  const unexpected = async (): Promise<never> => {
    throw new Error('Unexpected source operation')
  }
  return {
    list: unexpected,
    read: unexpected,
    readBytes: unexpected,
    write: unexpected,
    exec: unexpected,
    ...overrides,
  }
}
async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 3_000
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Source operation did not progress')
    await Bun.sleep(1)
  }
}

test('the real Kernel opens source capabilities after ordinary admission and preserves source workspace authority across isolated IPC', async () => {
  const prefix = 'hbar-command-source-kernel-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const f = peers(),
    scope = new AsyncLocalStorage<string>()
  let kernel: Kernel | undefined,
    opens = 0
  const input = z.strictObject({ path: z.string() })
  kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    toolCalls: {
      prepare: async (name, args) =>
        name !== 'source_probe'
          ? undefined
          : {
              arguments: input.parse(args),
              admission: {
                effect: 'write',
                timeoutMs: 5_000,
                workspaceAccess: { kind: 'paths', arguments: [{ field: 'path', access: 'write' }] },
              },
              execute: async (_args, tool) => {
                const active = kernel
                if (!active) throw new Error('Kernel is unavailable')
                opens++
                const original = active.plugins.get<ExecutionProvider>('execution')
                const capabilities = provider({
                  read: original.read.bind(original),
                  write: async (workspace, path, text, options) => {
                    expect(scope.getStore()).toBe('source-tool')
                    expect(active.workspaceExecutionScope()?.authority?.callId).toBe(tool.callId)
                    return original.write(workspace, path, text, options)
                  },
                })
                const opened = scope.run('source-tool', () =>
                  f.sources.open(tool, ['execution.read', 'execution.write'], { execution: capabilities }),
                )
                const connection = connectRuntimeCommandSource(
                  f.host,
                  opened.descriptor,
                  execution(tool),
                  tool.callId,
                  tool.signal,
                  5_000,
                )
                try {
                  expect(Object.isFrozen(opened.descriptor)).toBe(true)
                  await connection.application.port.call('execution.write', [
                    root,
                    'proof.txt',
                    'admitted source write',
                  ])
                  expect(await connection.application.port.call<string>('execution.read', [root, 'proof.txt'])).toBe(
                    'admitted source write',
                  )
                  await expect(
                    connection.application.port.call('execution.exec', [root, 'must not run']),
                  ).rejects.toMatchObject({ code: 'RUNTIME_METHOD_UNAVAILABLE' })
                  await expect(
                    connection.application.port.call('execution.write', [
                      join(root, 'other'),
                      'proof.txt',
                      'must not write',
                    ]),
                  ).rejects.toMatchObject({ code: 'COMMAND_SOURCE_WORKSPACE_MISMATCH' })
                  return { text: 'source completed' }
                } finally {
                  await connection.close()
                  await opened.close()
                }
              },
            },
    },
  })
  kernel.tools.register({
    name: 'source_probe',
    description: 'Resolve an admitted source operation',
    effect: 'read',
    inputSchema: input,
    execute: async () => {
      throw new Error('Unprepared source execution is forbidden')
    },
  })
  try {
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Source workspace is unavailable')
    const session = await kernel.createSession(workspace.id)
    const run = await kernel.submit(
      session.id,
      'source-allow',
      { text: '/tool source_probe {"path":"proof.txt"}', images: [], approval: 'allow' },
      'local-fixture',
    )
    await kernel.waitForIdle()
    expect((await kernel.storage.call('run', run.id)).status).toBe('completed')
    expect(await readFile(join(root, 'proof.txt'), 'utf8')).toBe('admitted source write')
    await kernel.submit(
      session.id,
      'source-deny',
      { text: '/tool source_probe {"path":"proof.txt"}', images: [], approval: 'deny' },
      'local-fixture',
    )
    await kernel.waitForIdle()
    expect(opens).toBe(1)
    expect(await readFile(join(root, 'proof.txt'), 'utf8')).toBe('admitted source write')
  } finally {
    await kernel.close()
    f.close()
    await removeOwnedTestDirectory(root, prefix)
  }
})

test('cancellation seals new source calls while both port lifetimes wait for the original physical write', async () => {
  const prefix = 'hbar-command-source-cancel-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const f = peers(),
    controller = new AbortController(),
    tool = context(root, controller.signal)
  const gate = Promise.withResolvers<void>(),
    entered = Promise.withResolvers<void>()
  let writes = 0,
    sourceClosed = false,
    hostClosed = false
  const opened = f.sources.open(tool, ['execution.write'], {
    execution: provider({
      write: async (_workspace, path, text) => {
        entered.resolve()
        await gate.promise
        await writeFile(join(root, path), text)
        writes++
        return { before: '', after: text, path, revision: 'once' }
      },
    }),
  })
  const connection = connectRuntimeCommandSource(
    f.host,
    opened.descriptor,
    execution(tool),
    tool.callId,
    tool.signal,
    tool.timeoutMs ?? 1_000,
  )
  const operation = connection.application.port.call('execution.write', [root, 'proof.txt', 'late source write'], {
    signal: tool.signal,
  })
  try {
    await entered.promise
    controller.abort()
    expect(() => connection.application.port.call('execution.write', [root, 'proof.txt', 'repeat'])).toThrow()
    const closingSource = opened.close().then(() => {
        sourceClosed = true
      }),
      closingHost = connection.close().then(() => {
        hostClosed = true
      })
    await Bun.sleep(1)
    expect(sourceClosed).toBe(false)
    expect(hostClosed).toBe(false)
    expect(() => f.sources.assertCanClose()).toThrow('Source command calls must finish')
    gate.resolve()
    expect(await operation).toMatchObject({ revision: 'once' })
    await Promise.all([closingSource, closingHost])
    expect(writes).toBe(1)
    expect(await readFile(join(root, 'proof.txt'), 'utf8')).toBe('late source write')
  } finally {
    gate.resolve()
    await operation.catch(() => undefined)
    await connection.close()
    await opened.close()
    f.close()
    await removeOwnedTestDirectory(root, prefix)
  }
})

test('source workspace resolution reuses the admitted mount without resolving the base workspace again', async () => {
  const f = peers()
  const tool = context('source-node:/mounted/worktree')
  const opened = f.sources.open(tool, ['launchTarget.workspaceForRun', 'workspaceSandbox.prepare'], {
    execution: provider(),
  })
  const connection = connectRuntimeCommandSource(
    f.host,
    opened.descriptor,
    execution(tool),
    tool.callId,
    tool.signal,
    1_000,
  )
  try {
    tool.session.id = 'changed-session'
    tool.workspace.id = 'changed-workspace'
    tool.workspace.path = 'base-workspace'
    expect(
      await connection.application.port.call<string>('launchTarget.workspaceForRun', [
        'source-session',
        'base-workspace',
      ]),
    ).toBe('source-node:/mounted/worktree')
    expect(
      await connection.application.port.call<string>('workspaceSandbox.prepare', [
        'source-workspace',
        'source-node:/mounted/worktree',
      ]),
    ).toBe('source-node:/mounted/worktree')
    await expect(
      connection.application.port.call('launchTarget.workspaceForRun', ['changed-session', 'base-workspace']),
    ).rejects.toMatchObject({ code: 'COMMAND_SOURCE_WORKSPACE_MISMATCH' })
    await expect(
      connection.application.port.call('workspaceSandbox.prepare', ['source-workspace', 'base-workspace']),
    ).rejects.toMatchObject({ code: 'COMMAND_SOURCE_WORKSPACE_MISMATCH' })
    await expect(
      connection.application.port.call('workspaceSandbox.prepare', [
        'changed-workspace',
        'source-node:/mounted/worktree',
      ]),
    ).rejects.toMatchObject({ code: 'COMMAND_SOURCE_WORKSPACE_MISMATCH' })
  } finally {
    await connection.close()
    await opened.close()
    f.close()
  }
})

test('source ports fence identity and bound live sources, physical calls and total calls', async () => {
  const f = peers(),
    tool = context(process.cwd()),
    gate = Promise.withResolvers<void>()
  let entered = 0
  const capabilities = {
    execution: provider({
      read: async () => {
        entered++
        await gate.promise
        return 'read'
      },
    }),
  }
  const opened = f.sources.open(tool, ['execution.read'], capabilities)
  const values = new RuntimeValuePort(f.host, { prefix: opened.descriptor.prefix })
  const extra: OpenCommandSource[] = []
  try {
    expect(() => f.sources.open({ ...tool, callId: 'other' }, [], capabilities)).toThrow('this admitted tool call')
    const unadmitted = { ...tool }
    delete unadmitted.nodeAuthority
    expect(() => f.sources.open(unadmitted, [], capabilities)).toThrow()
    expect(() =>
      connectRuntimeCommandSource(
        f.host,
        opened.descriptor,
        { ...execution(tool), runId: 'other' },
        tool.callId,
        tool.signal,
        1_000,
      ),
    ).toThrow('another Kernel or admitted tool call')
    expect(() =>
      connectRuntimeCommandSource(
        f.host,
        opened.descriptor,
        { ...execution(tool), owner: { ...owner, generation: 2 } },
        tool.callId,
        tool.signal,
        1_000,
      ),
    ).toThrow('another Kernel or admitted tool call')
    const accepted = Array.from({ length: 16 }, () => values.call('execution.read', [tool.workspace.path, 'proof.txt']))
    await until(() => entered === 16)
    await expect(values.call('execution.read', [tool.workspace.path, 'proof.txt'])).rejects.toMatchObject({
      code: 'BUSY',
    })
    gate.resolve()
    await Promise.all(accepted)
    for (let index = 16; index < 128; index++) await values.call('execution.read', [tool.workspace.path, 'proof.txt'])
    await expect(values.call('execution.read', [tool.workspace.path, 'proof.txt'])).rejects.toMatchObject({
      code: 'BUSY',
    })
    extra.push(...Array.from({ length: 63 }, () => f.sources.open(tool, [], capabilities)))
    expect(() => f.sources.open(tool, [], capabilities)).toThrow('capacity is full')
    expect(entered).toBe(128)
  } finally {
    gate.resolve()
    values.dispose()
    for (const source of extra) await source.close()
    await opened.close()
    f.close()
  }
})

test('process capabilities use detached admitted options and refuse Git when that backend cannot enforce confinement', async () => {
  const f = peers(),
    tool = context(process.cwd()),
    observed: (ExecOptions | undefined)[] = []
  const environment = { LANG: 'source' }
  tool.environment = environment
  tool.osConfinement = {
    level: 'unelevated',
    writableRoots: [],
    readableRoots: [process.cwd()],
    networkEnabled: false,
    envOverrides: {},
  }
  const unexpected = async (): Promise<never> => {
    throw new Error('Git must not start')
  }
  const git: GitService = {
    info: unexpected,
    status: unexpected,
    diff: unexpected,
    log: unexpected,
    stats: unexpected,
    commit: unexpected,
    stage: unexpected,
    unstage: unexpected,
    branch: unexpected,
    worktree: unexpected,
    launchBranchSnapshot: unexpected,
    diffToRemote: unexpected,
  }
  const opened = f.sources.open(tool, ['execution.exec', 'git.status'], {
    git,
    execution: provider({
      exec: async (workspace, _command, signal, options) => {
        expect(workspace).toBe(tool.workspace.path)
        expect(signal.aborted).toBe(false)
        observed.push(options)
        return { text: 'admitted process options' }
      },
    }),
  })
  const connection = connectRuntimeCommandSource(
    f.host,
    opened.descriptor,
    execution(tool),
    tool.callId,
    tool.signal,
    1_000,
  )
  try {
    environment.LANG = 'mutated after admission'
    await connection.application.port.call('execution.exec', [
      undefined,
      'probe',
      new AbortController().signal,
      { timeoutMs: 10_000, environment: { PATH: 'forged' }, nodeAuthority: { callId: 'forged' } },
    ])
    await connection.application.port.call('execution.exec', [
      undefined,
      'probe',
      new AbortController().signal,
      { timeoutMs: 10 },
    ])
    expect(observed[0]).toMatchObject({
      timeoutMs: 1_000,
      environment: { LANG: 'source' },
      osConfinement: tool.osConfinement,
      nodeAuthority: tool.nodeAuthority,
    })
    expect(observed[1]?.timeoutMs).toBe(10)
    expect(observed[0]?.environment).not.toHaveProperty('PATH')
    await expect(connection.application.port.call('git.status', [undefined])).rejects.toMatchObject({
      code: 'COMMAND_SOURCE_CONFINEMENT_UNAVAILABLE',
    })
  } finally {
    await connection.close()
    await opened.close()
    f.close()
  }
})
