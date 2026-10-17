import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CommandRegistry, createCommandRouter, type CommandPreparation } from '@hbar/commands'
import { ClientCommandEndpoint } from '@hbar/client'
import { HbarError } from '@hbar/contracts'
import { surfaceCommands } from '@hbar/contracts/commands/surfaces'
import type { ExecutionOwnership } from '@hbar/contracts/runtime'
import { Storage } from '@hbar/storage'
import { IpcPeer, RuntimeValuePort } from '@hbar/runtime'
import { SESSION_COMMAND_CLIENT_SOURCE_METHOD } from '@hbar/kernel/session-command-port'
import { SessionCommandGateway } from '../apps/host/src/session-command-gateway'
import { ClientCommandRelay } from '../apps/host/src/client-command-relay'
import { ClientCommandJobs, captureClientCommandPreparation } from '../apps/host/src/client-command-jobs'
import { HostCommandExecutionScopes } from '../apps/host/src/command-execution-scopes'
import { CommandResultPayloads } from '../apps/host/src/command-result-payloads'
import { SessionCommandExecution } from '../apps/host/src/session-command-execution'
import { removeOwnedTestDirectory } from './owned-temp-directory'

async function failure(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
  } catch (error) {
    return error
  }
  throw new Error('Expected client command failure')
}
async function until(check: () => boolean | Promise<boolean>): Promise<void> {
  const end = Date.now() + 3_000
  while (!(await check())) {
    if (Date.now() > end) throw new Error('Client command fixture did not settle')
    await Bun.sleep(2)
  }
}

async function fixture() {
  const prefix = 'hbar-session-client-command-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const storage = new Storage(join(root, 'state.sqlite'))
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', root, 'allowed')
  const actorId = 'client-source-actor'
  await storage.call(
    'putDevice',
    { id: actorId, name: 'Client owner', role: 'operator', workspaceIds: null, createdAt: 1, lastSeenAt: 1 },
    'fixture-token-hash',
  )
  const session = await storage.call('createSessionCommand', {
    workspaceId: workspace.id,
    actorId,
    idempotencyKey: 'create',
  })
  const run = await storage.call(
    'enqueue',
    session.id,
    'client-source',
    { text: 'execute client once', images: [] },
    'fixture',
  )
  await storage.call('claim', session.id)
  const source: ExecutionOwnership = {
    leaseId: 'client-source-lease',
    sessionId: session.id,
    runId: run.id,
    fence: 1,
    acquiredAt: 1,
    owner: { unitId: 'kernel', generation: 1, incarnation: 'client-source-kernel' },
    versions: {
      kernel: { unitId: 'kernel', generation: 1, artifactId: 'a'.repeat(64) },
      driver: { unitId: 'driver', generation: 1, artifactId: 'b'.repeat(64) },
      plugins: [],
      hooks: [],
    },
  }
  const target = { clientId: 'selected-client', generation: 9 }
  const identity = { sessionId: session.id, actorId, operationKey: 'client-operation' }
  const gate = Promise.withResolvers<void>()
  const entered = Promise.withResolvers<void>()
  let resources = 0,
    executions = 0,
    cancelled = false
  const registry = new CommandRegistry({ execution: 'client' })
  registry.register(surfaceCommands['app.setSidebarVisible'], async (input, context) => {
    executions++
    expect(context.actorId).toBe(actorId)
    expect((await storage.call('commandExecutionRead', identity))?.owner).toMatchObject({ kind: 'client', ...target })
    context.signal.addEventListener(
      'abort',
      () => {
        cancelled = true
      },
      { once: true },
    )
    entered.resolve()
    await gate.promise
    return {
      page: 'session' as const,
      pageInstanceId: null,
      toolInstanceId: null,
      modalInstanceId: null,
      sidebarOpen: input.visible,
    }
  })
  const routing = createCommandRouter({
    catalogs: () => [registry.list()],
    resolve: () => ({
      describe: () => registry.describe('app.setSidebarVisible'),
      prepare: (input) => registry.prepare(input),
      dispatch: (input, actor) => registry.dispatch(input, { actorId: actor }),
      dispatchPreparedTracked: registry.dispatchPreparedTracked.bind(registry),
    }),
  })
  const endpoint = new ClientCommandEndpoint({ ...target, actorId }, new Set(['app.setSidebarVisible']), routing)
  const relay = new ClientCommandRelay((connectionId, request) => {
    void endpoint.dispatch(request).then(
      (result) =>
        relay.reply(connectionId, actorId, { ...target, requestId: request.requestId, outcome: { ok: true, result } }),
      (error: unknown) =>
        relay.reply(connectionId, actorId, {
          ...target,
          requestId: request.requestId,
          outcome: {
            ok: false,
            error: {
              code: error instanceof HbarError ? error.code : 'EXECUTION_FAILED',
              message: error instanceof Error ? error.message : 'Client failed',
            },
          },
        }),
    )
  })
  const register = (connectionId: string) =>
    relay.register(connectionId, actorId, { ...target, commands: ['app.setSidebarVisible'] })
  register('original-connection')
  const scopes = new HostCommandExecutionScopes()
  let remote!: IpcPeer
  const local = new IpcPeer({
    owner: { unitId: 'base', generation: 1, incarnation: 'client-source-host' },
    remote: source.owner,
    transport: { send: (frame) => queueMicrotask(() => remote.receive(JSON.parse(JSON.stringify(frame)))) },
  })
  remote = new IpcPeer({
    owner: local.remote,
    remote: local.owner,
    transport: { send: (frame) => queueMicrotask(() => local.receive(JSON.parse(JSON.stringify(frame)))) },
  })
  const prefixPort = `kernel.command.${crypto.randomUUID()}`
  const sourcePort = new RuntimeValuePort(remote, { prefix: prefixPort })
  const applicationPort = new RuntimeValuePort(local, { prefix: prefixPort })
  sourcePort.register(SESSION_COMMAND_CLIENT_SOURCE_METHOD, (args) => {
    expect(args).toEqual([source.sessionId, source.runId, 'client-source-call'])
  })
  const application = {
    owner: source.owner,
    callId: 'client-source-call',
    signal: new AbortController().signal,
    timeoutMs: 5_000,
    port: applicationPort,
  }
  const jobs = new ClientCommandJobs({
    relay,
    scopes,
    retainSource: () => {
      resources++
      return () => {
        resources--
      }
    },
  })
  const service = new SessionCommandExecution({
    storage,
    routing,
    scopes,
    clients: jobs,
    assertSource: (actual) => {
      expect(actual).toEqual(source)
    },
    payloads: new CommandResultPayloads({
      write: async () => {
        throw new Error('Unexpected artifact output')
      },
      read: async () => {
        throw new Error('Unexpected artifact read')
      },
    }),
  })
  const gateway = new SessionCommandGateway({
    storage,
    discovery: { prepare: routing.prepare.bind(routing) },
    execution: () => service,
    assertSource: (actual) => {
      expect(actual).toEqual(source)
    },
  })
  const prepared = await jobs.prepare(
    target,
    actorId,
    {
      protocol: 1,
      requestId: 'client-command',
      commandId: 'app.setSidebarVisible',
      commandVersion: 1,
      idempotencyKey: 'client-operation',
      input: { visible: true },
    },
    new AbortController().signal,
  )
  const request = {
    source,
    callId: 'client-source-call',
    operationKey: identity.operationKey,
    prepared,
    target,
    application,
  }
  return {
    storage,
    actorId,
    session,
    run,
    identity,
    target,
    jobs,
    service,
    relay,
    register,
    gate,
    entered,
    prepared,
    request,
    source,
    gateway,
    application,
    executions: () => executions,
    resources: () => resources,
    cancelled: () => cancelled,
    async dispose() {
      if (resources) register('cleanup-connection')
      gate.resolve()
      await service.reconcile(session.id, run.id, identity.operationKey)
      jobs.dispose()
      endpoint.dispose()
      relay.close()
      registry.dispose()
      applicationPort.dispose()
      sourcePort.dispose()
      local.close()
      remote.close()
      await storage.close()
      await removeOwnedTestDirectory(root, prefix)
    },
  }
}

test('client commands bind durable owner and target before one physical execution and acknowledge saved results', async () => {
  const f = await fixture()
  try {
    expect(f.executions()).toBe(0)
    const running = f.service.execute(f.request)
    await f.entered.promise
    expect(f.resources()).toBe(1)
    const saved = await f.storage.call('commandExecutionRead', f.identity)
    expect(saved?.target).toEqual(f.target)
    expect(saved?.owner).toMatchObject({ kind: 'client', ...f.target })
    expect(() => f.jobs.assertCanClose()).toThrow('confirmed settlement')
    expect(await failure(f.service.execute({ ...f.request, target: { ...f.target, generation: 10 } }))).toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    })
    f.gate.resolve()
    await running
    const receipt = await f.service.wait(f.session.id, f.run.id, f.identity.operationKey)
    expect(receipt?.physical).toMatchObject({ status: 'succeeded', executionStarted: true })
    expect(receipt?.acknowledgedAt).not.toBeNull()
    expect(f.resources()).toBe(0)
    expect(f.executions()).toBe(1)
    await f.service.execute(f.request)
    expect(f.executions()).toBe(1)
  } finally {
    await f.dispose()
  }
})

test('model client preparation signs the exact target and process admission before real client execution', async () => {
  const f = await fixture()
  try {
    const call = {
      commandId: 'app.setSidebarVisible',
      commandVersion: 1,
      operationKey: f.identity.operationKey,
      input: { visible: true },
      target: f.target,
    }
    const prepared = await f.gateway.prepare(f.source, 'client-source-call', call, f.application.signal)
    expect(prepared.admission).toMatchObject({
      effect: 'process',
      requiresProcess: true,
      workspaceAccess: { kind: 'none' },
    })
    expect(prepared.sourceMethods).toEqual([SESSION_COMMAND_CLIENT_SOURCE_METHOD])
    expect(f.executions()).toBe(0)
    expect(
      await failure(
        f.gateway.execute(
          f.source,
          'client-source-call',
          { ...prepared, arguments: { ...prepared.arguments, target: { ...f.target, generation: 10 } } },
          f.application.signal,
          f.application,
        ),
      ),
    ).toMatchObject({ code: 'COMMAND_PREPARATION_INVALID' })
    expect(
      await failure(f.gateway.execute(f.source, 'client-source-call', prepared, f.application.signal)),
    ).toMatchObject({ code: 'COMMAND_SOURCE_APPLICATION_REQUIRED' })
    expect(await f.storage.call('commandExecutionRead', f.identity)).toBeNull()
    const running = f.gateway.execute(f.source, 'client-source-call', prepared, f.application.signal, f.application)
    await f.entered.promise
    f.gate.resolve()
    expect(await running).toMatchObject({ isError: false })
    expect(f.executions()).toBe(1)
    expect(f.resources()).toBe(0)
  } finally {
    await f.dispose()
  }
})

test('model client directory pages only the original actor and rejects missing or unsupported targets before execution', async () => {
  const f = await fixture()
  try {
    f.relay.register('a', f.actorId, { clientId: 'a-client', generation: 1, commands: ['app.back'] })
    f.relay.register('z', f.actorId, { clientId: 'z-client', generation: 2, commands: ['app.back'] })
    f.relay.register('outsider', 'another-actor', { clientId: 'private-client', generation: 8, commands: ['app.back'] })
    const first = await f.service.clientDirectory(f.source, { limit: 1 }, f.application.signal)
    expect(first).toMatchObject({ items: [{ clientId: 'a-client', generation: 1 }], nextCursor: 'a-client' })
    const rest = await f.service.clientDirectory(f.source, { after: first.nextCursor, limit: 2 }, f.application.signal)
    expect(rest.items.map((item) => item.clientId)).toEqual(['selected-client', 'z-client'])
    expect(rest.nextCursor).toBeUndefined()
    const call = {
      commandId: 'app.setSidebarVisible',
      commandVersion: 1,
      operationKey: f.identity.operationKey,
      input: { visible: true },
    }
    expect(await failure(f.gateway.prepare(f.source, 'client-source-call', call, f.application.signal))).toMatchObject({
      code: 'COMMAND_TARGET_UNAVAILABLE',
    })
    expect(
      await failure(
        f.gateway.prepare(
          f.source,
          'client-source-call',
          { ...call, commandId: 'workspace.list', target: f.target },
          f.application.signal,
        ),
      ),
    ).toMatchObject({ code: 'COMMAND_ADMISSION_UNAVAILABLE' })
    expect(f.executions()).toBe(0)
    expect(await f.storage.call('commandExecutionRead', f.identity)).toBeNull()
  } finally {
    await f.dispose()
  }
})

test('client disconnect remains physically unknown and reconnect follows the original job without replay', async () => {
  const f = await fixture()
  try {
    const controller = new AbortController()
    const running = f.service.execute({ ...f.request, signal: controller.signal })
    await f.entered.promise
    controller.abort(new Error('Stop the source task'))
    await until(f.cancelled)
    f.relay.disconnected('original-connection')
    await running
    await f.service.wait(f.session.id, f.run.id, f.identity.operationKey)
    const waiting = await f.storage.call('commandExecutionRead', f.identity)
    expect(waiting?.physical).toBeNull()
    expect(waiting?.uncertainty).not.toBeNull()
    expect(f.resources()).toBe(1)
    f.register('reconnected-client')
    f.gate.resolve()
    const receipt = await f.service.reconcile(f.session.id, f.run.id, f.identity.operationKey)
    expect(receipt?.physical).toMatchObject({ status: 'succeeded', executionStarted: true })
    expect(receipt?.acknowledgedAt).not.toBeNull()
    expect(f.resources()).toBe(0)
    expect(f.executions()).toBe(1)
  } finally {
    await f.dispose()
  }
})

test('client preparation cannot change reviewed schemas, execution domain or original identities', async () => {
  const f = await fixture()
  try {
    const forged: CommandPreparation = {
      ...f.prepared,
      descriptor: { ...f.prepared.descriptor, metadata: { ...f.prepared.descriptor.metadata, execution: 'host' } },
    }
    expect(() => captureClientCommandPreparation(forged)).toThrow('differs from the Host catalog')
    expect(() =>
      captureClientCommandPreparation({
        ...f.prepared,
        invocation: { ...f.prepared.invocation, input: { visible: 'yes' } },
      }),
    ).toThrow()
    expect(await failure(f.service.execute({ ...f.request, target: { ...f.target, generation: 8 } }))).toMatchObject({
      code: 'COMMAND_TARGET_STALE',
    })
    expect(f.executions()).toBe(0)
    expect(f.resources()).toBe(0)
    expect(await f.storage.call('commandExecutionRead', f.identity)).toBeNull()
  } finally {
    await f.dispose()
  }
})
