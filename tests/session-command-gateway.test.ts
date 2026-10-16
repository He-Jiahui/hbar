import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { CommandRegistry, createCommandRouter } from '@hbar/commands'
import { directoryCommands } from '@hbar/contracts/commands'
import { fileCommands } from '@hbar/contracts/commands/files'
import { gitCommands } from '@hbar/contracts/commands/git'
import { goalPlanCommands } from '@hbar/contracts/commands/goals'
import { budgetCommands } from '@hbar/contracts/commands/budget'
import { configurationCommands } from '@hbar/contracts/commands/configuration'
import { SESSION_COMMAND_STATE_QUERY_IDS } from '@hbar/kernel/session-command-port'
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
  registry.register(goalPlanCommands['goal.get'], () => {
    reads++
    return { goal: null, remainingTokens: null }
  })
  registry.register(goalPlanCommands['goal.snapshot'], ({ sessionId }) => {
    reads++
    return { sessionId, goal: null, remainingTokens: null, plan: null, goalSeq: 0, planSeq: 0 }
  })
  registry.register(goalPlanCommands['goal.history'], ({ sessionId }) => {
    reads++
    return { sessionId, anchorSeq: 0, items: [], preceding: { seq: 0, goal: null }, nextBeforeSeq: null }
  })
  registry.register(goalPlanCommands['plan.get'], () => {
    reads++
    return null
  })
  registry.register(budgetCommands['session.getBudget'], () => {
    reads++
    return null
  })
  registry.register(configurationCommands['mode.get'], () => {
    reads++
    return { mode: 'default' as const }
  })
  const unexpectedFile = async (): Promise<never> => {
    throw new Error('Preparation must not execute a file operation')
  }
  registry.register(fileCommands['file.read'], unexpectedFile)
  registry.register(fileCommands['file.write'], unexpectedFile)
  registry.register(gitCommands['git.info'], unexpectedFile)
  registry.register(gitCommands['git.status'], unexpectedFile)
  registry.register(gitCommands['git.diff'], unexpectedFile)
  registry.register(gitCommands['git.log'], unexpectedFile)
  registry.register(gitCommands['git.stats'], unexpectedFile)
  registry.register(gitCommands['git.commit'], unexpectedFile)
  registry.register(gitCommands['git.branch'], unexpectedFile)
  registry.register(gitCommands['git.worktree'], unexpectedFile)
  registry.register(gitCommands['git.diffToRemote'], unexpectedFile)
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
    discovery,
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

test('state query commands bind defaults, preserve source aliases and reconcile their original receipt', async () => {
  const f = await fixture()
  try {
    for (const commandId of SESSION_COMMAND_STATE_QUERY_IDS) {
      const call = { commandId, commandVersion: 1, operationKey: `read-${commandId}`, input: {} }
      const prepared = await f.gateway.prepare(f.source, `call-${commandId}`, call, f.signal)
      expect(prepared.arguments.input.sessionId).toBe(f.source.sessionId)
      expect(prepared.admission.effect).toBe('read')
      expect(prepared.admission.workspaceAccess).toEqual({ kind: 'none' })
      if (commandId === 'goal.snapshot')
        expect(prepared.admission.permissionAliases).toEqual([
          { name: 'get_goal', arguments: {} },
          { name: 'get_plan', arguments: {} },
        ])
      const first = await f.gateway.execute(f.source, `call-${commandId}`, prepared, f.signal)
      expect(first.isError).toBe(false)
      expect(z.object({ status: z.literal('succeeded') }).parse(JSON.parse(first.text) as unknown).status).toBe(
        'succeeded',
      )
      const replay = await f.gateway.prepare(f.source, `again-${commandId}`, call, f.signal)
      expect(await f.gateway.execute(f.source, `again-${commandId}`, replay, f.signal)).toEqual(first)
    }
    expect(f.counts()).toEqual({ reads: SESSION_COMMAND_STATE_QUERY_IDS.length, resources: 0 })
  } finally {
    await f.close()
  }
})

test('explicit state query targets require current workspace access and cannot borrow source-only aliases', async () => {
  const f = await fixture()
  try {
    const otherWorkspace = await f.storage.call('createWorkspace', join(f.workspace.path, 'other'), 'Other workspace')
    const target = await f.storage.call('createSession', otherWorkspace.id, 'Other state')
    await f.storage.call('revokeDevice', f.device.id)
    await f.storage.call('putDevice', { ...f.device, workspaceIds: [f.workspace.id] }, 'scoped-hash')
    const call = {
      commandId: 'goal.get',
      commandVersion: 1,
      operationKey: 'other-goal',
      input: { sessionId: target.id },
    }
    expect(await failure(f.gateway.prepare(f.source, 'denied-target', call, f.signal))).toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(f.counts().reads).toBe(0)
    await f.storage.call('revokeDevice', f.device.id)
    await f.storage.call('putDevice', f.device, 'operator-hash')
    const prepared = await f.gateway.prepare(f.source, 'allowed-target', call, f.signal)
    expect(prepared.arguments.input.sessionId).toBe(target.id)
    expect(prepared.admission.permissionAliases).toBeUndefined()
    await f.storage.call('revokeDevice', f.device.id)
    expect(await failure(f.gateway.execute(f.source, 'allowed-target', prepared, f.signal))).toMatchObject({
      code: 'COMMAND_PRINCIPAL_REVOKED',
    })
    expect(f.counts().reads).toBe(0)
    expect(
      await f.storage.call('commandExecutionRead', {
        sessionId: f.source.sessionId,
        actorId: f.device.id,
        operationKey: call.operationKey,
      }),
    ).toBeNull()
  } finally {
    await f.close()
  }
})

test('state query admission rejects a substituted canonical owner, scope, version or state effect before intent', async () => {
  const f = await fixture()
  try {
    for (const change of [
      { owner: 'hbar.core' },
      { scope: 'global' as const },
      { version: 2 },
      { stateEffect: 'persistent' as const },
    ]) {
      const gateway = new SessionCommandGateway({
        storage: f.storage,
        discovery: {
          async prepare(...args: Parameters<SessionCommandDiscovery['prepare']>) {
            const prepared = await f.discovery.prepare(...args)
            return {
              ...prepared,
              descriptor: { ...prepared.descriptor, metadata: { ...prepared.descriptor.metadata, ...change } },
            }
          },
        },
        execution: () => undefined,
        assertSource: () => {},
      })
      expect(
        await failure(
          gateway.prepare(
            f.source,
            'substituted-query',
            { commandId: 'goal.get', commandVersion: 1, operationKey: 'substituted-query', input: {} },
            f.signal,
          ),
        ),
      ).toMatchObject({ code: 'COMMAND_ADMISSION_UNAVAILABLE' })
    }
    expect(f.counts()).toEqual({ reads: 0, resources: 0 })
  } finally {
    await f.close()
  }
})

test('state query input and output schemas cannot be substituted under the same owner and version', async () => {
  const f = await fixture()
  try {
    for (const field of ['inputSchema', 'outputSchema'] as const) {
      const gateway = new SessionCommandGateway({
        storage: f.storage,
        discovery: {
          async prepare(...args: Parameters<SessionCommandDiscovery['prepare']>) {
            const prepared = await f.discovery.prepare(...args)
            return { ...prepared, descriptor: { ...prepared.descriptor, [field]: { type: 'null' } } }
          },
        },
        execution: () => undefined,
        assertSource: () => {},
      })
      expect(
        await failure(
          gateway.prepare(
            f.source,
            'substituted-schema',
            {
              commandId: 'goal.get',
              commandVersion: 1,
              operationKey: 'substituted-schema',
              input: {},
            },
            f.signal,
          ),
        ),
      ).toMatchObject({ code: 'COMMAND_ADMISSION_UNAVAILABLE' })
    }
    expect(f.counts()).toEqual({ reads: 0, resources: 0 })
  } finally {
    await f.close()
  }
})

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
      {
        ...prepared,
        admission: { ...prepared.admission, permissionAliases: [{ name: 'different_policy', arguments: {} }] },
      },
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
    ).rejects.toMatchObject({ code: 'COMMAND_ADMISSION_UNAVAILABLE' })
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

test('all public Git commands prepare their actual process, mutation and native permission facts without execution', async () => {
  const f = await fixture()
  try {
    for (const commandId of [
      'git.info',
      'git.status',
      'git.diff',
      'git.log',
      'git.stats',
      'git.diffToRemote',
      'git.commit',
      'git.branch',
      'git.worktree',
    ]) {
      const prepared = await f.gateway.prepare(
        f.source,
        commandId,
        {
          commandId,
          commandVersion: 1,
          operationKey: commandId,
          input: commandId === 'git.commit' ? { message: 'Source task commit' } : {},
        },
        f.signal,
      )
      expect(prepared.admission).toMatchObject({
        effect: commandId === 'git.commit' ? 'write' : 'read',
        requiresProcess: true,
        workspaceAccess: { kind: 'workspace' },
      })
      expect(prepared.sourceMethods).toEqual([commandId])
      expect(prepared.admission.permissionAliases).toHaveLength(1)
      expect(prepared.admission.permissionAliases?.[0]?.arguments).toEqual(prepared.arguments.input)
      if (commandId === 'git.commit')
        expect(prepared.arguments.input).toMatchObject({ sessionId: f.source.sessionId, runId: f.source.runId })
    }
    for (const [commandId, input] of [
      ['git.branch', { operation: 'create', name: 'task-branch' }],
      ['git.branch', { operation: 'delete', name: 'task-branch' }],
      ['git.worktree', { operation: 'add', path: 'task-worktree' }],
      ['git.worktree', { operation: 'remove', path: 'task-worktree' }],
    ] as const) {
      const prepared = await f.gateway.prepare(
        f.source,
        commandId,
        {
          commandId,
          commandVersion: 1,
          operationKey: `${commandId}:${input.operation}`,
          input,
        },
        f.signal,
      )
      expect(prepared.admission.effect).toBe('write')
    }
    expect(f.counts()).toEqual({ reads: 0, resources: 0 })
  } finally {
    await f.close()
  }
})

test('Git preparation rejects borrowed cwd and attribution and classifies final normalized operation arguments', async () => {
  const f = await fixture()
  try {
    for (const input of [{ cwd: f.workspace.path }, { sessionId: 'another-session' }, { runId: 'another-run' }]) {
      const error = await failure(
        f.gateway.prepare(
          f.source,
          'spoof',
          {
            commandId: 'git.commit',
            commandVersion: 1,
            operationKey: 'spoof',
            input: { message: 'Commit', ...input },
          },
          f.signal,
        ),
      )
      expect(error).toMatchObject({
        code: 'cwd' in input ? 'COMMAND_SOURCE_WORKSPACE_MISMATCH' : 'COMMAND_SOURCE_MISMATCH',
      })
    }
    const gateway = new SessionCommandGateway({
      storage: f.storage,
      discovery: {
        async prepare(invocation, signal) {
          const prepared = await f.discovery.prepare(invocation, signal)
          return {
            ...prepared,
            invocation: {
              ...prepared.invocation,
              input: { operation: 'create', name: 'final-task-branch', force: false },
            },
          }
        },
      },
      execution: () => undefined,
      assertSource: () => {},
    })
    const prepared = await gateway.prepare(
      f.source,
      'final-transform',
      {
        commandId: 'git.branch',
        commandVersion: 1,
        operationKey: 'final-transform',
        input: { operation: 'list' },
      },
      f.signal,
    )
    expect(prepared.admission.effect).toBe('write')
    expect(prepared.admission.permissionAliases?.[0]).toEqual({
      name: 'git_branch',
      arguments: { operation: 'create', name: 'final-task-branch', force: false },
    })
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
