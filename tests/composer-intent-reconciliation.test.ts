import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry } from '@hbar/commands'
import type { ThreadGoal } from '@hbar/contracts'
import { goalPlanCommands, type GoalPlanSnapshot } from '@hbar/contracts/commands/goals'
import { createComposerIntent } from '../packages/app-runtime/src/composer-intent'
import { createState } from '../packages/app-runtime/src/state'
import type { NavigationState } from '../packages/app-runtime/src/types'

const outcome = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => error,
  )
async function eventually(check: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (check()) return
    await Bun.sleep(1)
  }
  throw new Error('Expected bounded fixture condition was not reached')
}
function goal(sessionId: string, status: ThreadGoal['status'] = 'active'): ThreadGoal {
  return {
    threadId: sessionId,
    goalId: `goal-${sessionId}`,
    objective: `Objective ${sessionId}`,
    status,
    tokenBudget: null,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    createdAt: 1,
    updatedAt: 1,
  }
}
function fixture() {
  const local = new CommandRegistry({ maxConcurrent: 128 })
  const navigation = createState<NavigationState>(
    { workspaceId: 'w', sessionId: null, status: 'idle', error: null },
    () => {},
  )
  const values = new Map<string, GoalPlanSnapshot>()
  const writes: { command: string; input: unknown }[] = []
  const reads: { sessionId: string; signal: AbortSignal | undefined }[] = []
  let gate: Promise<void> | null = null
  let readError: unknown = null
  let onConnection: ((connected: boolean) => void) | undefined
  let subscriptions = 0
  let archived = false
  const value = (sessionId: string): GoalPlanSnapshot =>
    values.get(sessionId) ?? {
      sessionId,
      goal: goal(sessionId),
      goalSeq: 1,
      remainingTokens: null,
      plan: null,
      planSeq: 0,
    }
  const composer = createComposerIntent(local, {
    navigation: navigation.reader,
    events: {
      onConnection(listener) {
        onConnection = listener
        subscriptions++
        return () => {
          subscriptions--
          onConnection = undefined
        }
      },
    },
    preparation: {
      async capture(sessionId) {
        if (archived) throw new CommandError('SESSION_ARCHIVED', 'Fixture archive')
        return { sessionId, workspaceId: 'w' }
      },
      assertCanPrepare() {
        if (archived) throw new CommandError('SESSION_ARCHIVED', 'Fixture archive')
      },
    },
    goals: {
      async snapshot(sessionId, options) {
        reads.push({ sessionId, signal: options?.signal })
        const captured = value(sessionId)
        const capturedError = readError
        if (gate) await gate // Deliberately ignores AbortSignal to prove physical occupancy.
        if (capturedError) throw capturedError
        return captured
      },
      async execute(command, raw) {
        writes.push({ command, input: raw })
        if (command === 'goal.set') {
          const input = goalPlanCommands['goal.set'].input.parse(raw)
          const before = value(input.sessionId)
          values.set(input.sessionId, {
            ...before,
            goal: { ...goal(input.sessionId), status: input.status ?? 'active' },
            goalSeq: before.goalSeq + 1,
          })
        } else if (command === 'goal.clear') {
          const input = goalPlanCommands['goal.clear'].input.parse(raw)
          const before = value(input.sessionId)
          values.set(input.sessionId, { ...before, goal: null, goalSeq: before.goalSeq + 1 })
        } else throw new Error('Unexpected fixture write')
        throw new CommandError('RESULT_UNKNOWN', 'Lost reply after a real fixture effect')
      },
    },
    executeRun: async () => {
      throw new Error('No Run is permitted')
    },
    reconcileRun: async () => {
      throw new Error('No Run receipt is permitted')
    },
    onSubscriberError: (error) => {
      throw error
    },
  })
  return {
    local,
    composer,
    values,
    writes,
    reads,
    value,
    entry: (id = 'a') => composer.reader.getSnapshot().entries[id],
    async unknown(id = 'a', action: 'pause' | 'resume' | 'clear' = 'pause') {
      expect(
        await outcome(
          local.execute('composerIntent.controlGoal', { sessionId: id, expectedGoalId: `goal-${id}`, action }),
        ),
      ).toMatchObject({ code: 'RESULT_UNKNOWN' })
    },
    reconcile: (id = 'a') => local.execute('composerIntent.reconcile', { sessionId: id }),
    refresh: (id = 'a') => local.execute('composerIntent.refresh', { sessionId: id }),
    hold(next: Promise<void> | null) {
      gate = next
    },
    error(next: unknown) {
      readError = next
    },
    connected(next: boolean) {
      onConnection?.(next)
    },
    archived(next: boolean) {
      archived = next
    },
    select(id: string | null) {
      navigation.replace({ workspaceId: 'w', sessionId: id, status: 'idle', error: null })
    },
    subscriptionCount: () => subscriptions,
    dispose() {
      composer.dispose()
      local.dispose()
      navigation.dispose()
    },
  }
}

test('both Goal entry points share checking for the exact original control and one physical read', async () => {
  const f = fixture(),
    gate = Promise.withResolvers<void>()
  try {
    await f.unknown()
    f.hold(gate.promise)
    const first = f.reconcile(),
      second = f.reconcile()
    expect(f.entry()?.goalAction).toEqual({
      status: 'unknown',
      error: 'RESULT_UNKNOWN',
      reconciliation: {
        status: 'checking',
        error: null,
        requestInFlight: true,
        operation: { sessionId: 'a', expectedGoalId: 'goal-a', action: 'pause' },
      },
    })
    expect(f.reads).toHaveLength(1)
    expect(f.reads[0]?.signal).toBeInstanceOf(AbortSignal)
    expect(
      await outcome(
        f.local.execute('composerIntent.controlGoal', { sessionId: 'a', expectedGoalId: 'goal-a', action: 'clear' }),
      ),
    ).toMatchObject({ code: 'BUSY' })
    gate.resolve()
    await Promise.all([first, second])
    expect(f.entry()?.goalAction).toEqual({ status: 'succeeded', error: null })
    expect(f.writes).toHaveLength(1)
  } finally {
    gate.resolve()
    f.dispose()
  }
})

for (const absent of [true, false])
  test(`a ${absent ? 'null' : 'nonmatching status'} snapshot remains unknown without a repeated write`, async () => {
    const f = fixture()
    try {
      await f.unknown()
      f.values.set('a', { ...f.value('a'), goal: absent ? null : goal('a') })
      expect(await outcome(f.reconcile())).toMatchObject({ code: 'RESULT_UNKNOWN' })
      expect(f.entry()?.goalAction).toMatchObject({
        status: 'unknown',
        error: 'RESULT_UNKNOWN',
        reconciliation: {
          status: 'unconfirmed',
          error: 'RESULT_UNKNOWN',
          requestInFlight: false,
          operation: { sessionId: 'a', expectedGoalId: 'goal-a', action: 'pause' },
        },
      })
      expect(await outcome(f.reconcile())).toMatchObject({ code: 'RESULT_UNKNOWN' })
      expect(f.writes).toHaveLength(1)
      expect(f.reads).toHaveLength(2)
    } finally {
      f.dispose()
    }
  })

test('failed check exposes safe read failure without replacing original unknown action or retrying its write', async () => {
  const f = fixture()
  try {
    await f.unknown()
    f.error(new Error('Secret transport detail must never enter public state'))
    expect(await outcome(f.reconcile())).toBeInstanceOf(Error)
    expect(f.entry()?.goalAction).toMatchObject({
      status: 'unknown',
      error: 'RESULT_UNKNOWN',
      reconciliation: {
        status: 'failed',
        error: 'READ_FAILED',
        requestInFlight: false,
      },
    })
    expect(JSON.stringify(f.composer.reader.getSnapshot())).not.toContain('Secret')
    f.error(null)
    await f.reconcile()
    expect(f.entry()?.goalAction.status).toBe('succeeded')
    expect(f.writes).toHaveLength(1)
  } finally {
    f.dispose()
  }
})

test('clear is checked as a current absent Goal fact, not an exact persisted receipt', async () => {
  const f = fixture()
  try {
    await f.unknown('a', 'clear')
    await f.reconcile()
    expect(f.entry()?.goalAction).toEqual({ status: 'succeeded', error: null })
    expect(f.writes).toHaveLength(1)
  } finally {
    f.dispose()
  }
})

test('a snapshot for a different Goal session is a read failure, never confirmation for the original target', async () => {
  const f = fixture()
  try {
    await f.unknown()
    f.values.set('a', { ...f.value('a'), sessionId: 'b', goal: goal('b', 'paused') })
    expect(await outcome(f.reconcile())).toMatchObject({ code: 'INVALID_OUTPUT' })
    expect(f.entry()?.goalAction).toMatchObject({
      status: 'unknown',
      error: 'RESULT_UNKNOWN',
      reconciliation: {
        status: 'failed',
        error: 'INVALID_OUTPUT',
        requestInFlight: false,
        operation: { sessionId: 'a', expectedGoalId: 'goal-a', action: 'pause' },
      },
    })
    expect(f.entry('b')).toBeUndefined()
    expect(f.writes).toHaveLength(1)
  } finally {
    f.dispose()
  }
})

test('a replacement Goal fails the captured operation without mutating that replacement', async () => {
  const f = fixture()
  try {
    await f.unknown()
    f.values.set('a', { ...f.value('a'), goal: { ...goal('a'), goalId: 'replacement' } })
    expect(await outcome(f.reconcile())).toMatchObject({ code: 'GOAL_CONFLICT' })
    expect(f.entry()?.goalAction).toEqual({ status: 'failed', error: 'GOAL_CONFLICT' })
    expect(f.value('a').goal?.goalId).toBe('replacement')
    expect(f.writes).toHaveLength(1)
  } finally {
    f.dispose()
  }
})

test('A to B to A invalidates an old check and never shares its captured snapshot with the new selection', async () => {
  const f = fixture(),
    gate = Promise.withResolvers<void>()
  try {
    f.select('a')
    await f.refresh()
    await f.unknown()
    f.hold(gate.promise)
    const checked = outcome(f.reconcile())
    const oldCount = f.reads.length
    f.select('b')
    f.select('a')
    expect(await checked).toMatchObject({ code: 'STALE_TARGET' })
    expect(f.entry()?.goalAction.status).toBe('unknown')
    expect(f.entry()?.goalAction.reconciliation?.requestInFlight).toBe(true)
    // A's invalidated read is still physically pending; recheck cannot create another.
    expect(await outcome(f.reconcile())).toMatchObject({ code: 'BUSY' })
    expect(f.reads.length).toBe(oldCount + 1) // B only.
    f.values.set('a', { ...f.value('a'), goal: goal('a'), goalSeq: 10 })
    f.hold(null)
    gate.resolve()
    await eventually(() => f.composer.reader.getSnapshot().facts.status === 'ready')
    expect(f.composer.reader.getSnapshot().facts.snapshot?.goal?.status).toBe('active')
    expect(f.entry()?.goalAction.status).toBe('unknown')
    expect(f.entry()?.goalAction.reconciliation?.requestInFlight).toBe(false)
    expect(await outcome(f.reconcile())).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(f.writes).toHaveLength(1)
  } finally {
    gate.resolve()
    f.dispose()
  }
})

test('disconnect invalidates a held check immediately; reconnect cannot release the physical slot or replay writes', async () => {
  const f = fixture(),
    gate = Promise.withResolvers<void>()
  try {
    await f.unknown()
    f.hold(gate.promise)
    const checked = outcome(f.reconcile())
    f.connected(false)
    expect(f.entry()?.goalAction.reconciliation).toMatchObject({
      status: 'failed',
      error: 'DISCONNECTED',
      requestInFlight: true,
    })
    expect(f.reads[0]?.signal?.aborted).toBe(true)
    expect(await checked).toMatchObject({ code: 'DISCONNECTED' })
    expect(await outcome(f.reconcile())).toMatchObject({ code: 'DISCONNECTED' })
    f.connected(true)
    expect(await outcome(f.reconcile())).toMatchObject({ code: 'BUSY' })
    expect(f.reads).toHaveLength(1)
    f.hold(null)
    gate.resolve()
    await eventually(() => f.entry()?.goalAction.reconciliation?.requestInFlight === false)
    expect(f.entry()?.goalAction.status).toBe('unknown')
    await f.reconcile()
    expect(f.entry()?.goalAction.status).toBe('succeeded')
    expect(f.writes).toHaveLength(1)
  } finally {
    gate.resolve()
    f.dispose()
  }
})

test('an archived original session can read-check its old control but cannot prepare a new resume', async () => {
  const f = fixture()
  try {
    await f.unknown()
    f.archived(true)
    await f.reconcile()
    expect(f.entry()?.goalAction.status).toBe('succeeded')
    expect(
      await outcome(
        f.local.execute('composerIntent.controlGoal', { sessionId: 'a', expectedGoalId: 'goal-a', action: 'resume' }),
      ),
    ).toMatchObject({ code: 'SESSION_ARCHIVED' })
    expect(f.writes).toHaveLength(1)
  } finally {
    f.dispose()
  }
})

test('caller cancellation cannot free or duplicate the shared physical reconciliation', async () => {
  const f = fixture(),
    gate = Promise.withResolvers<void>(),
    controller = new AbortController()
  try {
    await f.unknown()
    f.hold(gate.promise)
    const first = outcome(
      f.local.execute('composerIntent.reconcile', { sessionId: 'a' }, { signal: controller.signal }),
    )
    const second = f.reconcile()
    controller.abort()
    expect(await first).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(f.entry()?.goalAction.reconciliation?.requestInFlight).toBe(true)
    expect(f.reads).toHaveLength(1)
    gate.resolve()
    await second
    expect(f.entry()?.goalAction.status).toBe('succeeded')
    expect(f.writes).toHaveLength(1)
  } finally {
    gate.resolve()
    f.dispose()
  }
})

test('dispose releases connection subscription, cancels reads, and no late success or failure publishes', async () => {
  for (const fail of [false, true]) {
    const f = fixture(),
      gate = Promise.withResolvers<void>()
    await f.unknown()
    f.hold(gate.promise)
    if (fail) f.error(new CommandError('TIMEOUT', 'Late read'))
    const checked = outcome(f.reconcile())
    const before = f.composer.reader.getSnapshot()
    expect(f.subscriptionCount()).toBe(1)
    f.composer.dispose()
    expect(f.subscriptionCount()).toBe(0)
    expect(f.reads[0]?.signal?.aborted).toBe(true)
    gate.resolve()
    expect(await checked).toMatchObject({ code: 'DISPOSED' })
    expect(f.composer.reader.getSnapshot()).toBe(before)
    expect(f.writes).toHaveLength(1)
    f.dispose()
  }
})

test('pre-aborted reconciliation sends no snapshot and leaves the original control untouched', async () => {
  const f = fixture(),
    controller = new AbortController()
  try {
    await f.unknown()
    const before = f.entry()
    controller.abort()
    expect(
      await outcome(f.local.execute('composerIntent.reconcile', { sessionId: 'a' }, { signal: controller.signal })),
    ).toMatchObject({ code: 'CANCELLED' })
    expect(f.entry()).toBe(before)
    expect(f.reads).toHaveLength(0)
    expect(f.writes).toHaveLength(1)
  } finally {
    f.dispose()
  }
})

test('a second session reconciles only its own original operation while an older session read settles late', async () => {
  const f = fixture(),
    gate = Promise.withResolvers<void>()
  try {
    f.select('a')
    await f.refresh()
    await f.unknown('a')
    await f.unknown('b', 'clear')
    f.hold(gate.promise)
    const old = outcome(f.reconcile('a'))
    f.select('b')
    const next = f.reconcile('b')
    expect(f.entry('b')?.goalAction.reconciliation?.operation).toEqual({
      sessionId: 'b',
      expectedGoalId: 'goal-b',
      action: 'clear',
    })
    expect(await old).toMatchObject({ code: 'STALE_TARGET' })
    gate.resolve()
    await next
    expect(f.entry('a')?.goalAction.status).toBe('unknown')
    expect(f.entry('b')?.goalAction).toEqual({ status: 'succeeded', error: null })
    expect(f.composer.reader.getSnapshot().facts.sessionId).toBe('b')
    expect(f.composer.reader.getSnapshot().facts.snapshot?.goal).toBeNull()
    expect(f.writes).toHaveLength(2)
  } finally {
    gate.resolve()
    f.dispose()
  }
})

test('composer entry capacity rejects before creating a hidden control or dispatching another write', async () => {
  const f = fixture()
  try {
    for (let index = 0; index < 100; index++) await f.unknown(`s-${index}`)
    expect(Object.keys(f.composer.reader.getSnapshot().entries)).toHaveLength(100)
    const overflow = { sessionId: 'overflow', expectedGoalId: 'goal-overflow', action: 'pause' }
    expect(await outcome(f.local.execute('composerIntent.controlGoal', overflow))).toMatchObject({ code: 'BUSY' })
    expect(f.entry('overflow')).toBeUndefined()
    expect(f.writes).toHaveLength(100)
    // No leaked private controls record: reconcile must report absent, not start another snapshot.
    expect(await outcome(f.reconcile('overflow'))).toMatchObject({ code: 'INVALID_INPUT' })
    expect(f.reads).toHaveLength(0)
    await f.reconcile('s-0')
    expect(f.entry('s-0')?.goalAction.status).toBe('succeeded')
  } finally {
    f.dispose()
  }
})

test('rapid session navigation retains at most 32 physical reads even when every adapter ignores cancellation', async () => {
  const f = fixture(),
    gate = Promise.withResolvers<void>()
  try {
    f.hold(gate.promise)
    for (let index = 0; index < 33; index++) f.select(`session-${index}`)
    await eventually(() => f.composer.reader.getSnapshot().facts.status === 'error')
    expect(f.reads).toHaveLength(32)
    expect(f.composer.reader.getSnapshot().facts).toMatchObject({
      sessionId: 'session-32',
      error: 'BUSY',
      snapshot: null,
    })
    expect(f.reads.every((read) => read.signal?.aborted)).toBe(true)
    f.hold(null)
    gate.resolve()
    // Let the physical promises settle; a new explicit refresh can then acquire the freed slot.
    await Bun.sleep(1)
    await f.refresh('session-32')
    expect(f.composer.reader.getSnapshot().facts).toMatchObject({ sessionId: 'session-32', status: 'ready' })
    expect(f.reads).toHaveLength(33)
    expect(f.writes).toHaveLength(0)
  } finally {
    gate.resolve()
    f.dispose()
  }
})

test('30-second logical deadline keeps the original physical snapshot occupied until it really settles', async () => {
  const f = fixture(),
    gate = Promise.withResolvers<void>()
  try {
    await f.unknown()
    f.hold(gate.promise)
    const result = outcome(f.reconcile())
    await result // Registry interruption may reach its caller just before the owner deadline publishes.
    await eventually(() => f.entry()?.goalAction.reconciliation?.error === 'TIMEOUT')
    expect(f.entry()?.goalAction).toMatchObject({
      status: 'unknown',
      error: 'RESULT_UNKNOWN',
      reconciliation: {
        status: 'failed',
        error: 'TIMEOUT',
        requestInFlight: true,
      },
    })
    expect(f.reads[0]?.signal?.aborted).toBe(true)
    expect(await outcome(f.reconcile())).toMatchObject({ code: 'BUSY' })
    expect(f.reads).toHaveLength(1)
    f.hold(null)
    gate.resolve()
    await eventually(() => f.entry()?.goalAction.reconciliation?.requestInFlight === false)
    expect(f.entry()?.goalAction.status).toBe('unknown')
    await f.reconcile()
    expect(f.entry()?.goalAction.status).toBe('succeeded')
    expect(f.reads).toHaveLength(2)
    expect(f.writes).toHaveLength(1)
  } finally {
    gate.resolve()
    f.dispose()
  }
}, 40_000)
