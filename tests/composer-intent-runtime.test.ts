import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry, type ExecuteOptions } from '@hbar/commands'
import { goalPlanCommands, type GoalPlanChange, type GoalPlanSnapshot } from '@hbar/contracts/commands/goals'
import { runAcceptedSchema, submitRunInputSchema, type RunAccepted } from '@hbar/contracts/commands/run'
import type { ThreadGoal } from '@hbar/contracts'
import { createComposerIntent } from '../packages/app-runtime/src/composer-intent'
import { createDrafts } from '../packages/app-runtime/src/drafts'
import { createState } from '../packages/app-runtime/src/state'
import type { GoalPlanWorkspacePort, NavigationState, RunCommandPort } from '../packages/app-runtime/src/types'

function fixture() {
  const local = new CommandRegistry()
  const navigation = createState<NavigationState>(
    { workspaceId: 'w', sessionId: null, status: 'idle', error: null },
    () => {},
  )
  const values = new Map<string, GoalPlanSnapshot>()
  const listeners = new Map<string, Set<(change: GoalPlanChange | { kind: 'reset' }) => void>>()
  const calls: { name: string; input: unknown; key?: string | undefined }[] = []
  const receipts = new Map<string, RunAccepted>()
  let createFailure: 'before' | 'after' | 'generic' | null = null
  let runFailure: 'known' | 'unknown' | null = null
  let controlFailure = false
  let runGate: Promise<void> | null = null
  let readGate: Promise<void> | null = null
  let goalNumber = 0
  const value = (sessionId: string): GoalPlanSnapshot =>
    values.get(sessionId) ?? {
      sessionId,
      goal: null,
      remainingTokens: null,
      goalSeq: 0,
      plan: null,
      planSeq: 0,
    }
  const setGoal = (sessionId: string, goal: ThreadGoal | null) => {
    const previous = value(sessionId)
    const next = {
      ...previous,
      goal,
      goalSeq: previous.goalSeq + 1,
      remainingTokens: goal?.tokenBudget == null ? null : Math.max(0, goal.tokenBudget - goal.tokensUsed),
    }
    values.set(sessionId, next)
    for (const listener of listeners.get(sessionId) ?? [])
      listener({ kind: 'goal', sessionId, seq: next.goalSeq, goal })
  }
  const makeGoal = (sessionId: string, objective = 'Ship it'): ThreadGoal => ({
    threadId: sessionId,
    goalId: `goal-${++goalNumber}`,
    objective,
    status: 'active',
    tokenBudget: null,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    createdAt: 1,
    updatedAt: 1,
  })
  const goals: GoalPlanWorkspacePort = {
    snapshot: async (sessionId) => {
      const captured = value(sessionId)
      if (readGate) await readGate
      return captured
    },
    watch(sessionId, listener) {
      const set = listeners.get(sessionId) ?? new Set()
      set.add(listener)
      listeners.set(sessionId, set)
      return () => {
        set.delete(listener)
      }
    },
    async execute(name, raw) {
      calls.push({ name, input: raw })
      if (name === 'goal.create') {
        const input = goalPlanCommands['goal.create'].input.parse(raw)
        if (createFailure === 'before') throw new CommandError('RESULT_UNKNOWN', 'Lost request')
        if (value(input.sessionId).goal?.status === 'active') throw new CommandError('GOAL_EXISTS', 'Existing')
        setGoal(input.sessionId, {
          ...makeGoal(input.sessionId, input.objective),
          tokenBudget: input.tokenBudget ?? null,
        })
        if (createFailure === 'after') throw new CommandError('RESULT_UNKNOWN', 'Lost confirmation')
        if (createFailure === 'generic') throw new Error('Unclassified failure after the side effect')
        const snapshot = value(input.sessionId)
        return { goal: snapshot.goal, remainingTokens: snapshot.remainingTokens }
      }
      if (name === 'goal.set') {
        const input = goalPlanCommands['goal.set'].input.parse(raw)
        const before = value(input.sessionId).goal
        if (!before || before.goalId !== input.expectedGoalId) throw new CommandError('GOAL_CONFLICT', 'Stale goal')
        setGoal(input.sessionId, { ...before, status: input.status ?? before.status })
        if (controlFailure) throw new CommandError('RESULT_UNKNOWN', 'Lost goal control')
        const snapshot = value(input.sessionId)
        return { goal: snapshot.goal, remainingTokens: snapshot.remainingTokens }
      }
      if (name === 'goal.clear') {
        const input = goalPlanCommands['goal.clear'].input.parse(raw)
        if (value(input.sessionId).goal?.goalId !== input.expectedGoalId)
          throw new CommandError('GOAL_CONFLICT', 'Stale goal')
        setGoal(input.sessionId, null)
        if (controlFailure) throw new CommandError('RESULT_UNKNOWN', 'Lost clear')
        return { cleared: true }
      }
      throw new Error(`Unexpected goal command ${name}`)
    },
  }
  const run: RunCommandPort = {
    async execute(name: string, raw: unknown, execution?: ExecuteOptions) {
      calls.push({ name, input: raw, key: execution?.idempotencyKey })
      const input = submitRunInputSchema.parse(raw)
      if (runGate) await runGate
      if (runFailure === 'known') throw new CommandError('MODEL_NOT_FOUND', 'Configure a model')
      const accepted = runAcceptedSchema.parse({
        status: 'accepted',
        commandId: 'run.submit',
        commandVersion: 1,
        requestId: 'request',
        idempotencyKey: execution?.idempotencyKey,
        operationId: `run-${calls.length}`,
        sessionId: input.sessionId,
        acceptedAt: 1,
      })
      receipts.set(`${input.sessionId}:${accepted.idempotencyKey}`, accepted)
      if (runFailure === 'unknown') throw new CommandError('RESULT_UNKNOWN', 'Lost Run receipt')
      return accepted
    },
    async getReceipt(sessionId, key) {
      return receipts.get(`${sessionId}:${key}`) ?? null
    },
  }
  const drafts = createDrafts(
    local,
    run,
    undefined,
    () => {},
    () => false,
  )
  const composer = createComposerIntent(local, {
    goals,
    navigation: navigation.reader,
    onSubscriberError: () => {},
    executeRun: drafts.executeRun,
    reconcileRun: async (sessionId) =>
      runAcceptedSchema.nullable().parse(await local.execute('draft.reconcileSubmission', { sessionId })),
  })
  const submit = (sessionId: string, text = 'Ship it') =>
    local.execute('composerIntent.submit', {
      sessionId,
      modelId: 'provider/model',
      input: { text, images: [] },
    })
  const intent = (sessionId: string, intent: 'default' | 'goal' | 'plan') =>
    local.execute('composerIntent.setIntent', { sessionId, intent })
  return {
    local,
    composer,
    drafts,
    calls,
    setGoal,
    makeGoal,
    value,
    submit,
    intent,
    listeners,
    select(sessionId: string | null) {
      navigation.replace({ workspaceId: 'w', sessionId, status: 'idle', error: null })
    },
    failures(next: { create?: typeof createFailure; run?: typeof runFailure; control?: boolean }) {
      if (next.create !== undefined) createFailure = next.create
      if (next.run !== undefined) runFailure = next.run
      if (next.control !== undefined) controlFailure = next.control
    },
    gates(next: { run?: Promise<void> | null; read?: Promise<void> | null }) {
      if (next.run !== undefined) runGate = next.run
      if (next.read !== undefined) readGate = next.read
    },
    dispose() {
      composer.dispose()
      drafts.dispose()
      local.dispose()
      navigation.dispose()
    },
  }
}

test('composer intent is a per-session draft, cancellation never clears a Goal, and mode is explicit on every Run', async () => {
  const f = fixture()
  try {
    f.setGoal('one', f.makeGoal('one'))
    await f.intent('one', 'goal')
    await f.intent('two', 'plan')
    await f.intent('one', 'default')
    expect(f.calls).toHaveLength(0)
    expect(f.composer.reader.getSnapshot().entries.two?.intent).toBe('plan')
    await f.submit('one')
    await f.submit('two')
    expect(f.calls.map((call) => submitRunInputSchema.parse(call.input).input.mode)).toEqual(['default', 'plan'])
    expect(f.value('one').goal).not.toBeNull()
    expect(f.composer.reader.getSnapshot().entries.two?.intent).toBe('default')
  } finally {
    f.dispose()
  }
})

test('confirmed Goal plus failed Run stays partial; retry reuses the Goal and Run key and clears the actual draft only on acceptance', async () => {
  const f = fixture()
  try {
    await f.intent('one', 'goal')
    await f.local.execute('draft.setText', { sessionId: 'one', text: 'Ship it' })
    f.failures({ run: 'known' })
    await expect(f.submit('one')).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' })
    expect(f.composer.reader.getSnapshot().entries.one?.submission).toMatchObject({
      status: 'partial',
      phase: 'run',
      preparedGoalId: 'goal-1',
    })
    expect(f.drafts.reader.getSnapshot().one?.text).toBe('Ship it')
    f.failures({ run: null })
    await f.submit('one')
    expect(f.calls.filter((call) => call.name === 'goal.create')).toHaveLength(1)
    const runs = f.calls.filter((call) => call.name === 'run.submit')
    expect(runs).toHaveLength(2)
    expect(runs[0]?.key).toBe(runs[1]?.key)
    expect(f.drafts.reader.getSnapshot().one?.text).toBe('')
    expect(f.composer.reader.getSnapshot().entries.one?.submission.status).toBe('idle')
  } finally {
    f.dispose()
  }
})

test('uncertain Goal creation is read-reconciled and requires an explicit retry before sending', async () => {
  const f = fixture()
  try {
    await f.intent('one', 'goal')
    f.failures({ create: 'after' })
    await expect(f.submit('one')).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    await expect(f.submit('one')).rejects.toMatchObject({ code: 'BUSY' })
    await expect(f.intent('one', 'default')).rejects.toMatchObject({ code: 'BUSY' })
    expect(f.calls).toHaveLength(1)
    await f.local.execute('composerIntent.reconcile', { sessionId: 'one' })
    expect(f.composer.reader.getSnapshot().entries.one?.submission.status).toBe('partial')
    expect(f.calls).toHaveLength(1)
    await f.submit('one')
    expect(f.calls.map((call) => call.name)).toEqual(['goal.create', 'run.submit'])
  } finally {
    f.dispose()
  }
})

test('an unclassified error after Goal creation is unknown and cannot replay the write', async () => {
  const f = fixture()
  try {
    await f.intent('one', 'goal')
    f.failures({ create: 'generic' })
    await expect(f.submit('one')).rejects.toThrow()
    expect(f.composer.reader.getSnapshot().entries.one?.submission.status).toBe('unknown')
    await expect(f.submit('one')).rejects.toMatchObject({ code: 'BUSY' })
    expect(f.calls.filter((call) => call.name === 'goal.create')).toHaveLength(1)
    await f.local.execute('composerIntent.reconcile', { sessionId: 'one' })
    expect(f.composer.reader.getSnapshot().entries.one?.submission.status).toBe('partial')
  } finally {
    f.dispose()
  }
})

test('an absent Goal snapshot is not permission to blindly replay an uncertain creation', async () => {
  const f = fixture()
  try {
    await f.intent('one', 'goal')
    f.failures({ create: 'before' })
    await expect(f.submit('one')).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    await expect(f.local.execute('composerIntent.reconcile', { sessionId: 'one' })).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    await expect(f.submit('one')).rejects.toMatchObject({ code: 'BUSY' })
    expect(f.calls).toHaveLength(1)
  } finally {
    f.dispose()
  }
})

test('uncertain Run acceptance uses the existing draft receipt reconciliation without a second Run or Goal', async () => {
  const f = fixture()
  try {
    await f.intent('one', 'goal')
    await f.local.execute('draft.setText', { sessionId: 'one', text: 'Ship it' })
    f.failures({ run: 'unknown' })
    await expect(f.submit('one')).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(f.composer.reader.getSnapshot().entries.one?.submission).toMatchObject({ status: 'unknown', phase: 'run' })
    await f.local.execute('composerIntent.reconcile', { sessionId: 'one' })
    expect(f.calls).toHaveLength(2)
    expect(f.drafts.reader.getSnapshot().one?.text).toBe('')
    expect(f.composer.reader.getSnapshot().entries.one?.intent).toBe('default')
  } finally {
    f.dispose()
  }
})

test('partial retry rejects changed drafts and replaced Goals; cancelling intent never removes the saved Goal', async () => {
  const f = fixture()
  try {
    await f.intent('one', 'goal')
    f.failures({ run: 'known' })
    await expect(f.submit('one')).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' })
    await expect(f.submit('one', 'Different')).rejects.toMatchObject({ code: 'GOAL_SUBMISSION_CHANGED' })
    const replacement = f.makeGoal('one', 'Replacement')
    f.setGoal('one', replacement)
    await expect(f.submit('one')).rejects.toMatchObject({ code: 'GOAL_CONFLICT' })
    await f.intent('one', 'default')
    expect(f.value('one').goal).toEqual(replacement)
    expect(f.calls.filter((call) => call.name === 'goal.create')).toHaveLength(1)
    expect(f.calls.filter((call) => call.name === 'run.submit')).toHaveLength(1)
  } finally {
    f.dispose()
  }
})

test('Goal strip controls use exact identity and resume never submits a duplicate Run', async () => {
  const f = fixture()
  try {
    const goal = f.makeGoal('one')
    f.setGoal('one', goal)
    const base = { sessionId: 'one', expectedGoalId: goal.goalId }
    await f.local.execute('composerIntent.controlGoal', { ...base, action: 'pause' })
    expect(f.value('one').goal?.status).toBe('paused')
    await f.local.execute('composerIntent.controlGoal', { ...base, action: 'resume' })
    expect(f.value('one').goal?.status).toBe('active')
    await f.local.execute('composerIntent.controlGoal', { ...base, action: 'clear' })
    expect(f.value('one').goal).toBeNull()
    expect(f.calls.map((call) => call.name)).toEqual(['goal.set', 'goal.set', 'goal.clear'])
  } finally {
    f.dispose()
  }
})

test('unknown Goal control reconciles facts and never retries against a replacement Goal', async () => {
  const f = fixture()
  try {
    const goal = f.makeGoal('one')
    f.setGoal('one', goal)
    f.failures({ control: true })
    await expect(
      f.local.execute('composerIntent.controlGoal', { sessionId: 'one', expectedGoalId: goal.goalId, action: 'pause' }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    await f.local.execute('composerIntent.reconcile', { sessionId: 'one' })
    expect(f.composer.reader.getSnapshot().entries.one?.goalAction.status).toBe('succeeded')
    await expect(
      f.local.execute('composerIntent.controlGoal', { sessionId: 'one', expectedGoalId: goal.goalId, action: 'clear' }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    const replacement = f.makeGoal('one', 'New goal')
    f.setGoal('one', replacement)
    await expect(f.local.execute('composerIntent.reconcile', { sessionId: 'one' })).rejects.toMatchObject({
      code: 'GOAL_CONFLICT',
    })
    expect(f.value('one').goal).toEqual(replacement)
    expect(f.calls).toHaveLength(2)
  } finally {
    f.dispose()
  }
})

test('Goal facts subscribe before snapshots, ignore stale targets, and release watches on navigation and disposal', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<void>()
  try {
    f.setGoal('one', f.makeGoal('one'))
    f.gates({ read: gate.promise })
    f.select('one')
    expect(f.listeners.get('one')?.size).toBe(1)
    const updated = { ...f.value('one').goal!, status: 'paused' as const }
    f.setGoal('one', updated)
    gate.resolve()
    await f.local.execute('composerIntent.refresh', { sessionId: 'one' })
    expect(f.composer.reader.getSnapshot().facts.snapshot?.goal?.status).toBe('paused')
    f.select('two')
    await f.local.execute('composerIntent.refresh', { sessionId: 'two' })
    f.setGoal('one', { ...updated, status: 'active' })
    expect(f.composer.reader.getSnapshot().facts.sessionId).toBe('two')
    expect(f.composer.reader.getSnapshot().facts.snapshot?.goal).toBeNull()
    expect(f.listeners.get('one')?.size).toBe(0)
    f.composer.dispose()
    expect(f.listeners.get('two')?.size).toBe(0)
  } finally {
    gate.resolve()
    f.dispose()
  }
})

test('pending sends are duplicate guarded and old-session completion cannot clear another session intent', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<void>()
  try {
    await f.intent('one', 'plan')
    f.gates({ run: gate.promise })
    const submission = f.submit('one')
    await expect(f.submit('one')).rejects.toMatchObject({ code: 'BUSY' })
    f.select('two')
    await f.intent('two', 'goal')
    gate.resolve()
    await submission
    expect(f.composer.reader.getSnapshot().entries.two?.intent).toBe('goal')
    expect(f.calls).toHaveLength(1)
  } finally {
    gate.resolve()
    f.dispose()
  }
})

test('invalid Goal drafts and forged continuation inputs fail before any Host write', async () => {
  const f = fixture()
  try {
    await f.intent('one', 'goal')
    await expect(f.submit('one', '')).rejects.toMatchObject({ code: 'GOAL_INVALID' })
    await expect(f.submit('one', 'x'.repeat(4_001))).rejects.toMatchObject({ code: 'GOAL_INVALID' })
    await expect(
      f.local.execute('composerIntent.submit', {
        sessionId: 'one',
        modelId: 'provider/model',
        input: { text: 'Ship it', images: [], source: 'goal' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(
      f.local.execute('composerIntent.submit', {
        sessionId: 'one',
        modelId: 'provider/model',
        input: { text: 'Ship it', images: [] },
        expectedIntentRevision: 0,
      }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    expect(f.calls).toHaveLength(0)
  } finally {
    f.dispose()
  }
})

test('accepted submissions preserve text edited during acceptance and do not overwrite a newer session draft', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<void>()
  try {
    await f.local.execute('draft.setText', { sessionId: 'one', text: 'Ship it' })
    await f.intent('one', 'plan')
    f.gates({ run: gate.promise })
    const submitted = f.submit('one')
    await f.local.execute('draft.setText', { sessionId: 'one', text: 'Newer text' })
    gate.resolve()
    await submitted
    expect(f.drafts.reader.getSnapshot().one?.text).toBe('Newer text')
    expect(f.composer.reader.getSnapshot().entries.one?.intent).toBe('default')
  } finally {
    gate.resolve()
    f.dispose()
  }
})

test('a model change repairs a rejected Run without recreating its confirmed Goal', async () => {
  const f = fixture()
  try {
    await f.intent('one', 'goal')
    f.failures({ run: 'known' })
    await expect(f.submit('one')).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' })
    f.failures({ run: null })
    await f.local.execute('composerIntent.submit', {
      sessionId: 'one',
      modelId: 'provider/working',
      input: { text: 'Ship it', images: [], thinking: 'low' },
    })
    expect(f.calls.filter((call) => call.name === 'goal.create')).toHaveLength(1)
    const runs = f.calls.filter((call) => call.name === 'run.submit')
    expect(runs).toHaveLength(2)
    expect(runs[0]?.key).not.toBe(runs[1]?.key)
    expect(submitRunInputSchema.parse(runs[1]?.input).modelId).toBe('provider/working')
  } finally {
    f.dispose()
  }
})
