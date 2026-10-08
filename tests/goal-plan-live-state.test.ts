import { afterEach, expect, test } from 'bun:test'
import { createAppRuntime } from '@hbar/app-runtime'
import type { GoalPlanChange, GoalPlanSnapshot } from '@hbar/contracts/commands/goals'
import type { ThreadGoal } from '@hbar/contracts'

const runtimes: ReturnType<typeof createAppRuntime>[] = []
afterEach(() => {
  for (const runtime of runtimes.splice(0)) runtime.dispose()
})
function gate() {
  let release!: () => void
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  return { wait, release }
}
async function fixture() {
  const workspace = { id: 'workspace', name: 'Workspace', path: 'D:/fixture', createdAt: 1 }
  const session = {
    id: 'session',
    workspaceId: workspace.id,
    title: 'Live state',
    archived: false,
    parentId: null,
    createdAt: 1,
    updatedAt: 1,
    seq: 1,
  }
  const goal: ThreadGoal = {
    threadId: session.id,
    goalId: 'goal',
    objective: 'Live Goal',
    status: 'active',
    tokenBudget: 1000,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    createdAt: 1,
    updatedAt: 1,
  }
  const facts: { snapshot: GoalPlanSnapshot; reads: number; afterRead?: () => Promise<void> } = {
    snapshot: { sessionId: session.id, goal, plan: null, remainingTokens: 1000, goalSeq: 1, planSeq: 0 },
    reads: 0,
  }
  const listeners = new Set<(change: GoalPlanChange | { kind: 'reset' }) => void>()
  const runtime = createAppRuntime({
    instanceId: 'live-goals',
    hostId: 'host',
    directory: {
      async execute(name) {
        if (name === 'session.get') return session
        if (name === 'workspace.get') return workspace
        if (name === 'session.list') return { items: [session], nextCursor: null }
        if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
        throw new Error(`Unexpected query ${name}`)
      },
    },
    goals: {
      async execute() {
        throw new Error('Live panels should use a bounded versioned snapshot, not unversioned queries')
      },
      async snapshot() {
        facts.reads++
        const result = facts.snapshot
        await facts.afterRead?.()
        return result
      },
      watch(_id, listener) {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
    surfaces: { canRender: (id) => id === 'goals' },
  })
  runtimes.push(runtime)
  await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
  const composerListeners = new Set(listeners)
  expect(composerListeners.size).toBe(1)
  const panel = await runtime.view.commands.execute('app.openPanel', { panelId: 'goals' })
  const target = { instanceId: panel.instanceId }
  const entry = () => runtime.view.state.goals.getSnapshot().entries[panel.instanceId]!
  const emit = (change: GoalPlanChange | { kind: 'reset' }) => {
    for (const listener of [...listeners]) listener(change)
  }
  return { runtime, facts, goal, session, target, entry, emit, listeners, composerListeners }
}

test('a Goal/Plan event between subscribing and snapshot response is never lost', async () => {
  const { runtime, facts, target, goal, session, emit, entry } = await fixture()
  const pending = gate(),
    entered = gate()
  facts.afterRead = async () => {
    entered.release()
    await pending.wait
  }
  const load = runtime.view.commands.execute('goalPlanWorkspace.refresh', target)
  await entered.wait
  emit({
    kind: 'goal',
    sessionId: session.id,
    seq: 5,
    goal: {
      ...goal,
      tokensUsed: 200,
      continuation: { intentId: 'intent', trigger: 'run', phase: 'stopped', reason: 'no_progress', updatedAt: 5 },
    },
  })
  emit({
    kind: 'plan',
    sessionId: session.id,
    seq: 4,
    plan: {
      sessionId: session.id,
      revision: 1,
      turnId: null,
      updatedAt: 4,
      explanation: null,
      plan: [{ step: 'Agent published this', status: 'in_progress' }],
    },
  })
  pending.release()
  await load
  expect(entry().goal).toMatchObject({ tokensUsed: 200, continuation: { reason: 'no_progress' } })
  expect(entry().plan?.plan[0]?.step).toBe('Agent published this')
  expect(facts.reads).toBe(2) // One initial snapshot for each visible consumer: composer and panel.
})

test('live facts merge by entity sequence without refetching and preserve a dirty editor', async () => {
  const { runtime, facts, target, goal, session, emit, entry } = await fixture()
  await runtime.view.commands.execute('goalPlanWorkspace.refresh', target)
  await runtime.view.commands.execute('goalPlanWorkspace.showGoalEditor', target)
  await runtime.view.commands.execute('goalPlanWorkspace.setGoalField', {
    ...target,
    field: 'tokenBudget',
    value: '2000',
  })
  emit({ kind: 'goal', sessionId: session.id, seq: 10, goal: { ...goal, status: 'budget_limited', tokensUsed: 1000 } })
  emit({ kind: 'goal', sessionId: session.id, seq: 9, goal })
  emit({ kind: 'goal', sessionId: session.id, seq: 10, goal })
  emit({ kind: 'goal', sessionId: 'different-session', seq: 100, goal })
  emit({
    kind: 'plan',
    sessionId: session.id,
    seq: 8,
    plan: {
      sessionId: session.id,
      revision: 1,
      turnId: null,
      updatedAt: 8,
      explanation: null,
      plan: [{ step: 'Independent plan sequence', status: 'pending' }],
    },
  })
  expect(entry().goal).toMatchObject({ status: 'budget_limited', tokensUsed: 1000 })
  expect(entry().plan?.plan[0]?.step).toBe('Independent plan sequence')
  expect(entry().goalDraft).toMatchObject({ tokenBudget: '2000', baseline: { status: 'active', goalId: 'goal' } })
  expect(facts.reads).toBe(2) // Incoming facts do not refetch either consumer.
})

test('clear tombstones reject old updates and closing the panel releases its feed', async () => {
  const { runtime, target, goal, session, emit, entry, listeners, composerListeners } = await fixture()
  await runtime.view.commands.execute('goalPlanWorkspace.refresh', target)
  emit({ kind: 'goal', sessionId: session.id, seq: 20, goal: null })
  emit({ kind: 'plan', sessionId: session.id, seq: 21, plan: null })
  emit({ kind: 'goal', sessionId: session.id, seq: 19, goal })
  expect(entry().goal).toBeNull()
  expect(entry().plan).toBeNull()
  const stale = [...listeners].find((listener) => !composerListeners.has(listener))!
  await runtime.view.commands.execute('app.closePanel', target)
  expect([...listeners]).toEqual([...composerListeners])
  stale({ kind: 'goal', sessionId: session.id, seq: 100, goal })
  expect(entry().goal).toBeNull()
  expect(runtime.view.state.composerIntent.getSnapshot().facts.snapshot?.goal).toBeNull()
  runtime.dispose()
  expect(listeners.size).toBe(0)
})

test('Goal clocks keep their receipt anchor across Plan updates and reject stale timing samples', async () => {
  const { runtime, target, goal, session, emit, entry } = await fixture()
  await runtime.view.commands.execute('goalPlanWorkspace.refresh', target)
  emit({
    kind: 'goal',
    sessionId: session.id,
    seq: 30,
    goal: {
      ...goal,
      timing: { observedAt: 1, elapsedMilliseconds: 3500, running: true },
    },
  })
  const receivedAt = entry().goalReceivedAt
  expect(receivedAt).toBeGreaterThan(0)
  const composerReceivedAt = runtime.view.state.composerIntent.getSnapshot().facts.goalReceivedAt
  expect(composerReceivedAt).toBeGreaterThan(0)
  emit({ kind: 'plan', sessionId: session.id, seq: 31, plan: null })
  emit({ kind: 'goal', sessionId: session.id, seq: 29, goal })
  expect(entry().goalReceivedAt).toBe(receivedAt)
  expect(runtime.view.state.composerIntent.getSnapshot().facts.goalReceivedAt).toBe(composerReceivedAt)
  expect(entry().goal?.timing?.elapsedMilliseconds).toBe(3500)
})

test('reconnect reconciles authoritative facts automatically and disposes previous listeners', async () => {
  const { runtime, target, goal, facts, emit, entry, listeners } = await fixture()
  await runtime.view.commands.execute('goalPlanWorkspace.refresh', target)
  facts.snapshot = { ...facts.snapshot, goal: { ...goal, status: 'paused' }, goalSeq: 30 }
  emit({ kind: 'reset' })
  for (let attempt = 0; attempt < 100 && entry().goal?.status !== 'paused'; attempt++) await Bun.sleep(5)
  expect(entry().goal?.status).toBe('paused')
  expect(facts.reads).toBe(4) // Exactly one reconnect snapshot per consumer.
  expect(listeners.size).toBe(2)
  expect(runtime.view.state.composerIntent.getSnapshot().facts.snapshot?.goal?.status).toBe('paused')
  runtime.dispose()
  expect(listeners.size).toBe(0)
})

test('reopening a cached panel restores its live feed and reconciles facts without manual refresh', async () => {
  const { runtime, target, goal, session, facts, listeners, entry, emit, composerListeners } = await fixture()
  await runtime.view.commands.execute('goalPlanWorkspace.refresh', target)
  await runtime.view.commands.execute('goalPlanWorkspace.showGoalEditor', target)
  await runtime.view.commands.execute('goalPlanWorkspace.setGoalField', {
    ...target,
    field: 'tokenBudget',
    value: '2000',
  })
  await runtime.view.commands.execute('app.closePanel', target)
  expect([...listeners]).toEqual([...composerListeners])
  facts.snapshot = {
    ...facts.snapshot,
    goal: { ...goal, status: 'paused' },
    goalSeq: 30,
    plan: {
      sessionId: session.id,
      revision: 1,
      turnId: null,
      explanation: null,
      plan: [{ step: 'While closed', status: 'in_progress' }],
      updatedAt: 30,
    },
    planSeq: 31,
  }
  const reopened = await runtime.view.commands.execute('app.openPanel', { panelId: 'goals' })
  expect(reopened.instanceId).toBe(target.instanceId)
  for (let attempt = 0; attempt < 100 && entry().goal?.status !== 'paused'; attempt++) await Bun.sleep(5)
  expect(listeners.size).toBe(2)
  expect(entry().goal?.status).toBe('paused')
  expect(entry().goalDirty).toBe(true)
  expect(entry().goalDraft).toMatchObject({ tokenBudget: '2000', baseline: { goalId: 'goal', status: 'active' } })
  expect(entry().plan?.plan[0]?.step).toBe('While closed')
  emit({ kind: 'plan', sessionId: session.id, plan: null, seq: 32 })
  expect(entry().plan).toBeNull()
})

test('a stale refresh cannot roll back a newer live Goal fact', async () => {
  const { runtime, target, goal, session, facts, emit, entry } = await fixture()
  await runtime.view.commands.execute('goalPlanWorkspace.refresh', target)
  emit({ kind: 'goal', sessionId: session.id, seq: 20, goal: { ...goal, tokensUsed: 500 } })
  await runtime.view.commands.execute('goalPlanWorkspace.refresh', target)
  expect(entry().goal?.tokensUsed).toBe(500)
  expect(facts.reads).toBe(3) // Composer initial read plus two explicit panel reads.
})

test('closing the Goal panel keeps the composer live, and runtime disposal releases the remaining consumer', async () => {
  const { runtime, target, goal, session, facts, listeners, composerListeners, emit } = await fixture()
  await runtime.view.commands.execute('goalPlanWorkspace.refresh', target)
  expect(listeners.size).toBe(2)
  expect(facts.reads).toBe(2)
  await runtime.view.commands.execute('app.closePanel', target)
  expect([...listeners]).toEqual([...composerListeners])
  emit({ kind: 'goal', sessionId: session.id, seq: 50, goal: { ...goal, status: 'paused' } })
  expect(runtime.view.state.composerIntent.getSnapshot().facts.snapshot?.goal?.status).toBe('paused')
  expect(facts.reads).toBe(2)
  const staleComposerListener = [...listeners][0]!
  const confirmed = runtime.view.state.composerIntent.getSnapshot()
  runtime.dispose()
  expect(listeners.size).toBe(0)
  staleComposerListener({ kind: 'goal', sessionId: session.id, seq: 51, goal })
  expect(runtime.view.state.composerIntent.getSnapshot()).toBe(confirmed)
})
