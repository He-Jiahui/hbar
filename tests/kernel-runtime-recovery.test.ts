import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets, createRunCommands } from '@hbar/kernel'
import { Storage, type StoragePort } from '@hbar/storage'
import {
  definePlugin,
  provide,
  service,
  type HarnessDriver,
  type GoalService,
  type BudgetService,
} from '@hbar/plugin-sdk'
import { emptyUsage, providerSchema, type Run } from '@hbar/contracts'

const resources: { root: string; kernel: Kernel; storage: Storage }[] = []
afterEach(async () => {
  for (const entry of resources.splice(0)) {
    await entry.kernel.close()
    await entry.storage.close()
    await rm(entry.root, { recursive: true, force: true })
  }
})
async function fixture(source: 'user' | 'goal' = 'user') {
  const root = await mkdtemp(join(tmpdir(), 'hbar-kernel-recovery-'))
  const storage = new Storage(join(root, 'state.sqlite'))
  await storage.call('ready')
  await storage.call(
    'saveProvider',
    providerSchema.parse({
      id: 'fixture',
      name: 'Fixture',
      protocol: 'mock',
      baseUrl: 'http://127.0.0.1',
      model: 'fixture',
      imageInput: true,
      reasoning: true,
    }),
  )
  const workspace = await storage.call('createWorkspace', root, 'fixture')
  const session = await storage.call('createSession', workspace.id)
  const executions: Run[] = []
  const histories: string[][] = []
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Recovery fixture',
      description: 'Verify preserved context',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      provides: { driver: '1.0.0' },
      requires: { goal: '^1.0.0' },
      permissions: [],
    },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        async run(input) {
          executions.push(input.run)
          histories.push(
            input.request.messages.flatMap((message) =>
              message.content.flatMap((block) =>
                block.type === 'text' || block.type === 'tool_result' ? [block.text] : [],
              ),
            ),
          )
          if (source === 'goal')
            await service<GoalService>(ctx, 'goal').update(input.session.id, 'complete', input.run.id)
          await input.commit('assistant', [{ type: 'text', text: 'Recovered remaining work' }])
        },
        summarize: async () => ({ text: '', usage: emptyUsage() }),
      })
    },
  })
  const port: StoragePort = { call: (method, ...args) => storage.call(method, ...args), close: async () => {} }
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    demo: true,
    lifecycle: 'managed',
    secrets: new MemorySecrets(),
    profile: { createStorage: async () => port, replacements: { 'driver.pi': driver } },
  })
  resources.push({ root, kernel, storage })
  const goal =
    source === 'goal'
      ? await kernel.plugins.get<GoalService>('goal').create(session.id, 'Finish the remaining work', 100)
      : null
  const original = await kernel.submit(
    session.id,
    'original',
    { text: 'original user request', images: [], source },
    'fixture',
  )
  await storage.call('claim', session.id)
  await storage.call('commit', session.id, original.id, 'user', [{ type: 'text', text: 'original user request' }])
  if (goal?.goal)
    await storage.call(
      'append',
      session.id,
      'goal.run_bound',
      {
        accounting: {
          goalId: goal.goal.goalId,
          sessionId: session.id,
          startedAt: Date.now(),
          usageThroughSeq: 0,
          tokensAccounted: 0,
          timeAccounted: 0,
        },
      },
      original.id,
    )
  return { root, storage, kernel, session, original, goal, executions, histories }
}

test('manual retry after the two automatic rounds continues the same chain once, retains settled context and restores its receipt', async () => {
  const f = await fixture()
  await f.storage.call('commit', f.session.id, f.original.id, 'assistant', [
    { type: 'tool_call', callId: 'written', name: 'write_file', args: { path: 'result' } },
  ])
  await f.storage.call('toolStart', f.session.id, f.original.id, 'written', 'write_file', { path: 'result' })
  await f.storage.call('commit', f.session.id, f.original.id, 'tool', [
    { type: 'tool_result', callId: 'written', name: 'write_file', text: 'Settled write receipt', isError: false },
  ])
  let current = f.original
  for (let attempt = 0; attempt < 2; attempt++) {
    const recovered = (await f.kernel.recoverRuns([current.id]))[0]
    if (!recovered?.run) throw new Error('Expected the automatic continuation')
    const claimed = await f.storage.call('claim', f.session.id)
    if (!claimed) throw new Error('Expected the queued recovery identity')
    current = claimed
  }
  const limited = (await f.kernel.recoverRuns([current.id]))[0]
  expect(limited?.chain).toMatchObject({
    status: 'manual_required',
    reasonCode: 'RECOVERY_LIMIT',
    attempts: 2,
    automaticAttempts: 2,
  })
  const commands = createRunCommands(f.kernel)
  try {
    const input = { sessionId: f.session.id, operationId: f.original.id }
    const continueInterrupted = f.kernel.continueInterrupted.bind(f.kernel)
    f.kernel.continueInterrupted = async (...args) => {
      await continueInterrupted(...args)
      throw new Error('The accepted manual continuation acknowledgement was lost')
    }
    const [accepted, repeated] = await Promise.all([
      commands.execute('run.retry', input, {
        actorId: 'manual-actor',
        idempotencyKey: 'continue',
        requestId: 'manual-first',
      }),
      commands.execute('run.retry', input, {
        actorId: 'manual-actor',
        idempotencyKey: 'continue',
        requestId: 'manual-second',
      }),
    ])
    expect(repeated).toEqual(accepted)
    const resumed = await f.storage.call('run', accepted.operationId)
    expect(resumed.recovery).toMatchObject({
      manual: true,
      attempt: 3,
      automaticAttempt: 2,
      predecessorRunId: current.id,
      rootRunId: f.original.id,
    })
    expect(await commands.getReceipt('run.retry', f.session.id, 'manual-actor', 'continue')).toEqual(accepted)
    await f.kernel.activate()
    await f.kernel.waitForIdle()
    expect(f.executions).toHaveLength(1)
    expect(f.histories[0]?.filter((text) => text === 'original user request')).toHaveLength(1)
    expect(f.histories[0]?.filter((text) => text === 'Settled write receipt')).toHaveLength(1)
    expect((await f.storage.call('run', f.original.id)).status).toBe('interrupted')
    expect((await f.storage.call('run', resumed.id)).status).toBe('completed')
  } finally {
    commands.dispose()
  }
}, 60_000)

test('manual retry cannot replay an unknown effect or poison later receipt checks', async () => {
  const f = await fixture()
  await f.storage.call('toolStart', f.session.id, f.original.id, 'unknown', 'write_file', { path: 'unconfirmed' })
  await f.kernel.recoverRuns([f.original.id])
  const commands = createRunCommands(f.kernel)
  try {
    const outcome = await commands
      .execute(
        'run.retry',
        { sessionId: f.session.id, operationId: f.original.id },
        { actorId: 'manual-actor', idempotencyKey: 'unknown', requestId: 'unknown-retry' },
      )
      .catch((error: unknown) => error)
    expect(outcome).toMatchObject({ code: 'EFFECT_UNKNOWN' })
    expect(await commands.getReceipt('run.retry', f.session.id, 'manual-actor', 'unknown')).toBeNull()
    expect(f.executions).toHaveLength(0)
    expect((await f.storage.call('snapshot', f.session.id)).runs).toHaveLength(1)
  } finally {
    commands.dispose()
  }
})

test('manual continuation respects Goal pause and budget controls without resetting the automatic recovery budget', async () => {
  const f = await fixture('goal')
  await f.kernel.plugins.get<GoalService>('goal').set(f.session.id, { status: 'paused' })
  await f.kernel.recoverRuns([f.original.id])
  const commands = createRunCommands(f.kernel)
  let attempts = 0
  const retry = () =>
    commands.execute(
      'run.retry',
      { sessionId: f.session.id, operationId: f.original.id },
      { actorId: 'manual-actor', idempotencyKey: `controlled-${attempts++}`, requestId: 'controlled-retry' },
    )
  try {
    expect(await retry().catch((error: unknown) => error)).toMatchObject({ code: 'GOAL_PAUSED' })
    await f.kernel.plugins.get<GoalService>('goal').set(f.session.id, { status: 'active' })
    await f.kernel.plugins.get<BudgetService>('budget').set(f.session.id, 1)
    await f.storage.call('append', f.session.id, 'usage.recorded', { ...emptyUsage(), output: 2 }, f.original.id)
    const failure: unknown = await retry().catch((error: unknown) => error)
    expect(failure instanceof Error && 'code' in failure ? failure.code : null).toMatch(/BUDGET/)
    expect(f.executions).toHaveLength(0)
    expect((await f.storage.call('runtimeRecoveryRead', f.original.id))?.run).toBeNull()
  } finally {
    commands.dispose()
  }
})

test('a retained manual request waits for durable approval, then admits once without an old callback or a repeated input', async () => {
  const f = await fixture()
  await f.storage.call('createApproval', {
    id: 'retained-manual-approval',
    sessionId: f.session.id,
    runId: f.original.id,
    callId: 'planned-call',
    tool: 'write_file',
    args: {},
    status: 'pending',
    createdAt: Date.now(),
  })
  await f.kernel.recoverRuns([f.original.id])
  const commands = createRunCommands(f.kernel)
  const retry = () =>
    commands.execute(
      'run.retry',
      { sessionId: f.session.id, operationId: f.original.id },
      { actorId: 'manual-actor', idempotencyKey: 'approval', requestId: 'approval-retry' },
    )
  try {
    expect(await retry().catch((error: unknown) => error)).toMatchObject({ code: 'APPROVAL_PENDING' })
    expect(await commands.getReceipt('run.retry', f.session.id, 'manual-actor', 'approval')).toBeNull()
    await f.kernel.resolveApproval('retained-manual-approval', 'allowed')
    const accepted = await retry()
    expect(await retry()).toEqual(accepted)
    expect((await f.storage.call('run', accepted.operationId)).recovery).toMatchObject({
      manual: true,
      automaticAttempt: 0,
    })
    await f.kernel.activate()
    await f.kernel.waitForIdle()
    expect(f.executions).toHaveLength(1)
    expect(f.histories[0]?.filter((text) => text === 'original user request')).toHaveLength(1)
  } finally {
    commands.dispose()
  }
})

for (const source of ['user', 'goal'] as const)
  test(`${source} recovery retains one user message and one settled effect across duplicate fault notifications`, async () => {
    const f = await fixture(source)
    await f.storage.call('commit', f.session.id, f.original.id, 'assistant', [
      { type: 'tool_call', callId: 'written', name: 'write_file', args: { path: 'result' } },
    ])
    await f.storage.call('toolStart', f.session.id, f.original.id, 'written', 'write_file', { path: 'result' })
    await f.storage.call('commit', f.session.id, f.original.id, 'tool', [
      { type: 'tool_result', callId: 'written', name: 'write_file', text: 'The write committed once', isError: false },
    ])
    const [a, b] = await Promise.all([f.kernel.recoverRuns([f.original.id]), f.kernel.recoverRuns([f.original.id])])
    const first = a[0],
      second = b[0]
    if (!first?.run || !second) throw new Error('Expected durable recovery records')
    expect(first.recoveryId).toBe(second.recoveryId)
    expect(a[0]?.run?.recovery).toMatchObject({ attempt: 1, predecessorRunId: f.original.id })
    await f.kernel.activate()
    await f.kernel.waitForIdle()
    const snapshot = await f.storage.call('snapshot', f.session.id)
    expect(snapshot.messages.filter((message) => message.role === 'user')).toHaveLength(1)
    expect(
      snapshot.messages
        .flatMap((message) => message.content)
        .filter((block) => block.type === 'tool_result' && block.callId === 'written'),
    ).toHaveLength(1)
    expect(f.executions).toHaveLength(1)
    expect(f.histories[0]).toContain('The write committed once')
    expect((await f.storage.call('run', f.original.id)).status).toBe('interrupted')
    expect((await f.storage.call('run', a[0]!.run!.id)).status).toBe('completed')
    expect((await f.storage.call('runtimeRecoveryChain', a[0]!.chain.chainId))?.status).toBe('settled')
  })

test('recovery waits for missing models and changed permissions, then reconciles the same recovery identity', async () => {
  const f = await fixture()
  await f.storage.call('deleteProvider', 'fixture')
  const records = await f.kernel.recoverRuns([f.original.id])
  const identity = records[0]?.recoveryId
  if (!identity) throw new Error('Expected a recovery identity')
  expect(records[0]?.chain).toMatchObject({ status: 'waiting', reasonCode: 'MODEL_NOT_FOUND' })
  expect(records[0]?.run).toBeNull()
  await f.storage.call(
    'saveProvider',
    providerSchema.parse({
      id: 'fixture',
      name: 'Fixture',
      protocol: 'mock',
      baseUrl: 'http://127.0.0.1',
      model: 'fixture',
    }),
  )
  await f.kernel.setPermissionMode('allow')
  expect((await f.kernel.resumeRecovery(f.original.id)).chain.reasonCode).toBe('PERMISSION_CHANGED')
  expect(f.executions).toHaveLength(0)
  await f.kernel.setPermissionMode('ask')
  const resumed = await f.kernel.resumeRecovery(f.original.id)
  expect(resumed.recoveryId).toBe(identity)
  expect(resumed.run).not.toBeNull()
  await f.kernel.activate()
  await f.kernel.waitForIdle()
  expect(f.executions).toHaveLength(1)
})

test('paused Goal and exhausted budgets cannot automatically resume the interrupted work', async () => {
  const f = await fixture('goal')
  await f.kernel.plugins.get<GoalService>('goal').set(f.session.id, { status: 'paused' })
  const paused = await f.kernel.recoverRuns([f.original.id])
  expect(paused[0]?.chain.reasonCode).toBe('GOAL_PAUSED')
  expect(paused[0]?.run).toBeNull()
  await f.kernel.plugins.get<GoalService>('goal').set(f.session.id, { status: 'active' })
  await f.kernel.plugins.get<BudgetService>('budget').set(f.session.id, 1)
  await f.storage.call('append', f.session.id, 'usage.recorded', { ...emptyUsage(), output: 2 }, f.original.id)
  const budget = await f.kernel.resumeRecovery(f.original.id)
  expect(budget.run).toBeNull()
  expect(budget.chain.reasonCode).toMatch(/BUDGET/)
  expect(f.executions).toHaveLength(0)
})

test('an unknown side effect preserves waiting without driver execution', async () => {
  const f = await fixture()
  await f.storage.call('toolStart', f.session.id, f.original.id, 'unknown', 'write_file', {})
  const unknown = await f.kernel.recoverRuns([f.original.id])
  expect(unknown[0]?.chain.reasonCode).toBe('EFFECT_UNKNOWN')
  expect(unknown[0]?.run).toBeNull()
  expect((await f.kernel.resumeRecovery(f.original.id)).run).toBeNull()
  expect(f.executions).toHaveLength(0)
})

test('cancellation of an interrupted predecessor is durable and prevents its recovery round', async () => {
  const f = await fixture()
  const record = (await f.kernel.recoverRuns([f.original.id]))[0]!
  const cancelled = await f.storage.call('runtimeRecoveryCancel', f.original.id)
  expect(cancelled.run.status).toBe('cancelled')
  expect((await f.storage.call('run', f.original.id)).status).toBe('interrupted')
  expect(await f.storage.call('cancelRequested', f.original.id)).toBe(true)
  expect((await f.storage.call('run', record.run!.id)).status).toBe('cancelled')
  await f.kernel.activate()
  await f.kernel.waitForIdle()
  expect(f.executions).toHaveLength(0)
  expect((await f.storage.call('runtimeRecoveryCancel', f.original.id)).events).toEqual([])
})

test('pending approval remains pending across fault recovery and cancellation prevents queueing', async () => {
  const f = await fixture()
  await f.storage.call('createApproval', {
    id: 'pending',
    sessionId: f.session.id,
    runId: f.original.id,
    callId: 'call',
    tool: 'write_file',
    args: {},
    status: 'pending',
    createdAt: Date.now(),
  })
  const pending = await f.kernel.recoverRuns([f.original.id])
  expect(pending[0]?.chain.reasonCode).toBe('APPROVAL_PENDING')
  expect((await f.storage.call('approval', 'pending')).status).toBe('pending')
  expect((await f.kernel.resumeRecovery(f.original.id)).run).toBeNull()
  expect(f.executions).toHaveLength(0)
  const other = await f.storage.call('createSession', f.session.workspaceId)
  const run = await f.storage.call('enqueue', other.id, 'cancelled', { text: 'cancelled', images: [] }, 'fixture')
  await f.storage.call('claim', other.id)
  await f.storage.call('requestCancel', run.id)
  const cancelled = await f.kernel.recoverRuns([run.id])
  expect(cancelled[0]?.chain).toMatchObject({ status: 'manual_required', reasonCode: 'USER_CANCELLED' })
})

test('recovery after interruption before input commit creates the user message once and respects queued user priority', async () => {
  const f = await fixture()
  await f.storage.call('setRun', f.original.id, 'completed')
  const other = await f.storage.call('createSession', f.session.workspaceId)
  const interrupted = await f.kernel.submit(
    other.id,
    'before-message',
    { text: 'accepted once', images: [] },
    'fixture',
  )
  await f.storage.call('claim', other.id)
  const user = await f.kernel.submit(other.id, 'user-first', { text: 'queued user', images: [] }, 'fixture')
  const records = await f.kernel.recoverRuns([interrupted.id])
  const continuation = records[0]?.run
  if (!continuation) throw new Error('Expected a recovery Run')
  await f.kernel.activate()
  await f.kernel.waitForIdle()
  expect(f.executions.map((run) => run.id)).toEqual([user.id, continuation.id])
  const snapshot = await f.storage.call('snapshot', other.id)
  expect(snapshot.messages.filter((message) => message.role === 'user')).toHaveLength(2)
  expect(
    snapshot.messages
      .flatMap((message) => message.content)
      .filter((block) => block.type === 'text' && block.text === 'accepted once'),
  ).toHaveLength(1)
})
