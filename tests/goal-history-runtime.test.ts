import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry, type CommandExecutor } from '@hbar/commands'
import type { SessionEvent, SessionSnapshot } from '@hbar/contracts'
import type {
  GoalHistoryFact,
  GoalHistoryInput,
  GoalHistoryPage,
  GoalHistorySnapshot,
} from '@hbar/contracts/commands/goal-history'
import {
  createGoalHistory,
  getGoalHistoryProjection,
  type GoalHistoryTimelinePort,
  type GoalHistoryTimelineSnapshot,
  type GoalHistoryTimelineUpdate,
} from '../packages/app-runtime/src/goal-history'
import { createSessionTimeline } from '../packages/app-runtime/src/session-timeline'
import { createState } from '../packages/app-runtime/src/state'
import type { NavigationState, SessionTimelinePort, SessionTimelineUpdate } from '../packages/app-runtime/src/types'

const goal = (seq: number): GoalHistorySnapshot => ({
  goalId: 'goal',
  objective: `Objective ${seq}`,
  status: 'active',
  tokenBudget: null,
  tokensUsed: seq,
  timeUsedSeconds: seq,
  createdAt: 1,
  updatedAt: seq,
})
const fact = (seq: number, sessionId = 'one'): GoalHistoryFact => ({
  eventId: `${sessionId}-${seq}`,
  sessionId,
  seq,
  time: seq,
  runId: null,
  type: 'goal.updated',
  goal: goal(seq),
})
const canonical = (value: GoalHistoryFact): SessionEvent => ({
  eventId: value.eventId,
  sessionId: value.sessionId,
  seq: value.seq,
  time: value.time,
  type: value.type,
  runId: null,
  stepId: null,
  version: 1,
  data: value.goal ? { goal: { ...value.goal, threadId: value.sessionId } } : { sessionId: value.sessionId },
})
function page(input: GoalHistoryInput, facts: readonly GoalHistoryFact[]): GoalHistoryPage {
  const anchorSeq = input.anchorSeq ?? 0
  const eligible = facts.filter(
    (item) =>
      item.sessionId === input.sessionId &&
      item.seq <= anchorSeq &&
      (input.beforeSeq === undefined || item.seq < input.beforeSeq),
  )
  const items = eligible.slice(-(input.limit ?? 100))
  const preceding = eligible[eligible.length - items.length - 1]
  return {
    sessionId: input.sessionId,
    anchorSeq,
    items,
    preceding: preceding ? { seq: preceding.seq, goal: preceding.goal } : { seq: 0, goal: null },
    nextBeforeSeq: preceding ? (items[0]?.seq ?? null) : null,
  }
}
async function settle(check: () => boolean) {
  for (let turn = 0; turn < 200; turn += 1) {
    if (check()) return
    await Bun.sleep(1)
  }
  throw new Error('Goal history did not settle')
}
async function failure(promise: Promise<unknown>, expected: string) {
  let reason: unknown
  try {
    await promise
  } catch (error) {
    reason = error
  }
  expect(reason).toBeInstanceOf(CommandError)
  expect(reason).toMatchObject({ code: expected })
}
function fixture(port?: CommandExecutor, first: Partial<GoalHistoryTimelineSnapshot> = {}) {
  const local = new CommandRegistry()
  const errors: unknown[] = []
  const nav = createState<NavigationState>(
    { workspaceId: 'workspace', sessionId: 'one', status: 'idle', error: null },
    (error) => errors.push(error),
  )
  let snapshot: GoalHistoryTimelineSnapshot = {
    sessionId: 'one',
    generation: 1,
    status: 'ready',
    cursor: 500,
    messageFromSeq: 450,
    hasOlderMessages: true,
    watching: true,
    ...first,
  }
  const listeners = new Set<(update: GoalHistoryTimelineUpdate) => void | Promise<void>>()
  const timeline: GoalHistoryTimelinePort = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  const owner = createGoalHistory(
    local,
    port,
    timeline,
    nav.reader,
    (error) => errors.push(error),
    () => false,
  )
  return {
    local,
    owner,
    errors,
    entry: (sessionId = 'one') => {
      const entry = owner.reader.getSnapshot().sessions[sessionId]
      if (!entry) throw new Error('Missing entry')
      return entry
    },
    async update(
      kind: 'loading' | 'snapshot' | 'window' | 'error',
      changes: Partial<GoalHistoryTimelineSnapshot> = {},
    ) {
      snapshot = { ...snapshot, ...changes }
      nav.replace({ ...nav.reader.getSnapshot(), sessionId: snapshot.sessionId })
      await Promise.all([...listeners].map((listener) => listener({ kind, snapshot })))
    },
    async event(value: GoalHistoryFact) {
      snapshot = { ...snapshot, cursor: value.seq }
      await Promise.all(
        [...listeners].map((listener) => listener({ kind: 'event', snapshot, event: canonical(value) })),
      )
    },
    async rawEvent(event: SessionEvent) {
      snapshot = { ...snapshot, cursor: event.seq }
      await Promise.all([...listeners].map((listener) => listener({ kind: 'event', snapshot, event })))
    },
    dispose() {
      owner.dispose()
      local.dispose()
      nav.dispose()
    },
  }
}

test('Goal pages use a distinct anchored cursor; projection clips older facts to the loaded message window', async () => {
  const facts = Array.from({ length: 500 }, (_, index) => fact(index + 1))
  const calls: GoalHistoryInput[] = []
  const f = fixture({
    async execute(_name, input) {
      const query = input as GoalHistoryInput
      calls.push(query)
      return page(query, facts)
    },
  })
  try {
    await settle(() => f.entry().status === 'ready')
    expect(calls).toHaveLength(1)
    expect(f.entry().facts).toHaveLength(100)
    expect(f.entry().preceding?.seq).toBe(400)
    expect(getGoalHistoryProjection(f.entry()).facts[0]?.seq).toBe(450)
    expect(getGoalHistoryProjection(f.entry()).preceding?.seq).toBe(449)
    expect(getGoalHistoryProjection(f.entry()).gap).toBeFalse()
    await f.update('window', { messageFromSeq: 250 })
    expect(calls.map((call) => call.beforeSeq)).toEqual([undefined, 401, 301])
    expect(calls.every((call) => call.anchorSeq === 500 && call.limit === 100)).toBeTrue()
    expect(getGoalHistoryProjection(f.entry()).facts[0]?.seq).toBe(250)
    expect(getGoalHistoryProjection(f.entry()).preceding?.seq).toBe(249)
    await f.update('window', { messageFromSeq: 50 })
    expect(f.entry().facts).toHaveLength(500)
    expect(f.entry().preceding).toEqual({ seq: 0, goal: null })
    expect(f.entry().hasOlder).toBeFalse()
    expect(f.errors).toEqual([])
    expect(Object.isFrozen(f.entry().facts[0]?.goal)).toBeTrue()
  } finally {
    f.dispose()
  }
})

test('canonical Goal facts append without a query, duplicates do not change immutable facts and malformed facts fail closed', async () => {
  let reads = 0
  const f = fixture(
    {
      async execute(_name, input) {
        reads += 1
        return page(input as GoalHistoryInput, [fact(2)])
      },
    },
    { cursor: 2, messageFromSeq: 1, hasOlderMessages: false },
  )
  try {
    await settle(() => f.entry().status === 'ready')
    await f.event(fact(3))
    await f.event(fact(3))
    await f.rawEvent({ ...canonical(fact(4)), type: 'run.settled', data: {} })
    expect(reads).toBe(1)
    expect(f.entry().facts.map((item) => item.seq)).toEqual([2, 3])
    expect(f.entry().coveredToSeq).toBe(4)
    await f.rawEvent({ ...canonical(fact(5)), data: { goal: { ...goal(5), threadId: 'other' } } })
    expect(f.entry()).toMatchObject({ status: 'error', error: 'INVALID_OUTPUT', stale: true })
    expect(f.entry().facts.map((item) => item.seq)).toEqual([2, 3])
  } finally {
    f.dispose()
  }
})

test('Goal-only sessions can page independently; absent capability is explicit and does not manufacture an empty-history boundary', async () => {
  const facts = Array.from({ length: 150 }, (_, index) => fact(index + 1))
  const f = fixture(
    {
      async execute(_name, input) {
        return page(input as GoalHistoryInput, facts)
      },
    },
    { cursor: 150, messageFromSeq: null, hasOlderMessages: false },
  )
  const unsupported = fixture()
  try {
    await settle(() => f.entry().status === 'ready')
    expect(f.entry().facts).toHaveLength(100)
    await f.local.execute('goalHistory.loadOlder', { sessionId: 'one' })
    expect(f.entry().facts).toHaveLength(150)
    expect(f.entry().hasOlder).toBeFalse()
    expect(unsupported.entry()).toMatchObject({ status: 'unsupported', preceding: null })
    expect(unsupported.owner.reader.getSnapshot().available).toBeFalse()
    await failure(unsupported.local.execute('goalHistory.refresh', { sessionId: 'one' }), 'CAPABILITY_UNAVAILABLE')
  } finally {
    f.dispose()
    unsupported.dispose()
  }
})

test('snapshot generations cancel old work, re-read authoritative coverage and never reuse a future cached fact', async () => {
  let release: ((value: GoalHistoryPage) => void) | undefined
  let pending: GoalHistoryInput | undefined
  let hold = true
  const f = fixture(
    {
      async execute(_name, input) {
        const query = input as GoalHistoryInput
        if (query.sessionId === 'one' && hold) {
          pending = query
          return new Promise<GoalHistoryPage>((resolve) => {
            release = resolve
          })
        }
        return page(query, [fact(2, query.sessionId)])
      },
    },
    { cursor: 5, messageFromSeq: 1, hasOlderMessages: false },
  )
  try {
    await settle(() => Boolean(release))
    await failure(f.local.execute('goalHistory.refresh', { sessionId: 'one' }), 'BUSY')
    await f.update('loading', { sessionId: 'two', generation: 2, status: 'loading', watching: false })
    await f.update('snapshot', { cursor: 5, status: 'ready', watching: true })
    expect(f.entry('two').facts[0]?.sessionId).toBe('two')
    if (!release || !pending) throw new Error('Missing pending read')
    release(page(pending, [fact(4)]))
    await Bun.sleep(2)
    expect(f.entry('one').facts).toEqual([])
    expect(f.owner.reader.getSnapshot().sessionId).toBe('two')
    await failure(f.local.execute('goalHistory.loadOlder', { sessionId: 'one' }), 'STALE_TARGET')
    hold = false
    await f.update('loading', { sessionId: 'one', generation: 3, status: 'loading', watching: false })
    await f.update('snapshot', { cursor: 5, status: 'ready', watching: true })
    await f.event(fact(6))
    await f.update('loading', { generation: 4, status: 'loading', watching: false })
    await f.update('snapshot', { cursor: 3, status: 'ready', watching: true })
    expect(f.entry().facts.map((item) => item.seq)).toEqual([2])
    expect(f.entry().coveredToSeq).toBe(3)
  } finally {
    f.dispose()
  }
})

test('bounded fill exposes a real history gap at 1000 facts and the LRU cache retains only eight sessions', async () => {
  const facts = Array.from({ length: 1_200 }, (_, index) => fact(index + 1))
  let reads = 0
  const f = fixture(
    {
      async execute(_name, input) {
        reads += 1
        const query = input as GoalHistoryInput
        return page(query, query.sessionId === 'one' ? facts : [])
      },
    },
    { cursor: 1_200, messageFromSeq: 1, hasOlderMessages: true },
  )
  try {
    await settle(() => f.entry().limit)
    expect(reads).toBe(10)
    expect(f.entry().facts).toHaveLength(1_000)
    expect(getGoalHistoryProjection(f.entry())).toMatchObject({
      gap: true,
      gapReason: 'limit',
      hasOlder: true,
      limit: true,
    })
    expect(await f.local.execute('goalHistory.loadOlder', { sessionId: 'one' })).toMatchObject({
      loaded: 0,
      hasOlder: true,
    })
    expect(reads).toBe(10)
    for (let id = 2; id <= 10; id += 1) {
      await f.update('loading', { sessionId: `session-${id}`, generation: id, status: 'loading', watching: false })
      await f.update('snapshot', { cursor: 0, messageFromSeq: null, status: 'ready', watching: true })
    }
    expect(Object.keys(f.owner.reader.getSnapshot().sessions)).toHaveLength(8)
    expect(f.owner.reader.getSnapshot().sessions.one).toBeUndefined()
  } finally {
    f.dispose()
  }
})

test('invalid page targets/anchors and disconnected older boundaries keep confirmed facts and offer explicit retry', async () => {
  const facts = Array.from({ length: 150 }, (_, index) => fact(index + 1))
  let mode = 'valid'
  const f = fixture(
    {
      async execute(_name, input) {
        const query = input as GoalHistoryInput
        const result = page(query, facts)
        if (mode === 'target') return { ...result, sessionId: 'other', items: [] }
        if (mode === 'anchor') return { ...result, anchorSeq: 149 }
        if (mode === 'boundary')
          return page(
            query,
            facts.filter((item) => item.seq < 50),
          )
        return result
      },
    },
    { cursor: 150, messageFromSeq: null, hasOlderMessages: false },
  )
  try {
    await settle(() => f.entry().status === 'ready')
    mode = 'boundary'
    await failure(f.local.execute('goalHistory.loadOlder', { sessionId: 'one' }), 'INVALID_OUTPUT')
    expect(f.entry().facts).toHaveLength(100)
    expect(f.entry().olderError).toBe('INVALID_OUTPUT')
    mode = 'target'
    await failure(f.local.execute('goalHistory.refresh', { sessionId: 'one' }), 'INVALID_OUTPUT')
    expect(f.entry().facts).toHaveLength(100)
    mode = 'anchor'
    await failure(f.local.execute('goalHistory.refresh', { sessionId: 'one' }), 'INVALID_OUTPUT')
    mode = 'valid'
    await f.local.execute('goalHistory.refresh', { sessionId: 'one' })
    expect(f.entry()).toMatchObject({ status: 'ready', stale: false, error: null })
  } finally {
    f.dispose()
  }
})

test('live facts received while an anchored query is pending survive its response and never change historical snapshots', async () => {
  let release: ((value: GoalHistoryPage) => void) | undefined
  let query: GoalHistoryInput | undefined
  const f = fixture(
    {
      async execute(_name, input) {
        query = input as GoalHistoryInput
        return new Promise<GoalHistoryPage>((resolve) => {
          release = resolve
        })
      },
    },
    { cursor: 2, messageFromSeq: 1, hasOlderMessages: false },
  )
  try {
    await settle(() => Boolean(release))
    await f.event(fact(3))
    await f.rawEvent({ ...canonical(fact(4)), type: 'usage.recorded', data: {} })
    if (!query || !release) throw new Error('Missing pending read')
    release(page(query, [fact(2)]))
    await settle(() => f.entry().status === 'ready')
    expect(f.entry().facts.map((item) => item.seq)).toEqual([2, 3])
    expect(f.entry().facts[0]?.goal?.objective).toBe('Objective 2')
    expect(f.entry().anchorSeq).toBe(2)
    expect(f.entry().coveredToSeq).toBe(4)
    expect(f.entry().stale).toBeFalse()
  } finally {
    f.dispose()
  }
})

test('explicit cancellation aborts a pending query, preserves confirmed facts and releases single-flight for retry', async () => {
  let hang = false
  let pendingSignal: AbortSignal | undefined
  const f = fixture(
    {
      async execute(_name, input, options) {
        if (hang) {
          pendingSignal = options?.signal
          return new Promise<unknown>(() => {})
        }
        return page(input as GoalHistoryInput, [fact(2)])
      },
    },
    { cursor: 2, messageFromSeq: null, hasOlderMessages: false },
  )
  try {
    await settle(() => f.entry().status === 'ready')
    hang = true
    const controller = new AbortController()
    const promise = f.local.execute('goalHistory.refresh', { sessionId: 'one' }, { signal: controller.signal })
    await settle(() => Boolean(pendingSignal))
    controller.abort()
    // Client application commands conservatively report an interrupted handler as unknown.
    // The owner's read-only request is still cancelled and its single-flight is released.
    await failure(promise, 'RESULT_UNKNOWN')
    await settle(() => f.entry().error === 'CANCELLED')
    expect(pendingSignal?.aborted).toBeTrue()
    expect(f.entry().facts.map((item) => item.seq)).toEqual([2])
    expect(f.entry().stale).toBeTrue()
    hang = false
    await f.local.execute('goalHistory.refresh', { sessionId: 'one' })
    expect(f.entry()).toMatchObject({ status: 'ready', stale: false })
  } finally {
    f.dispose()
  }
})

test('a canonical tail beyond capacity evicts only its old prefix and exposes a truthful gap', async () => {
  const facts = Array.from({ length: 1_000 }, (_, index) => fact(index + 1))
  let reads = 0
  const f = fixture(
    {
      async execute(_name, input) {
        reads += 1
        return page(input as GoalHistoryInput, facts)
      },
    },
    { cursor: 1_000, messageFromSeq: 1, hasOlderMessages: false },
  )
  try {
    await settle(() => f.entry().facts.length === 1_000)
    await f.event(fact(1_001))
    expect(f.entry().facts).toHaveLength(1_000)
    expect(f.entry().facts[0]?.seq).toBe(2)
    expect(f.entry().facts.at(-1)?.seq).toBe(1_001)
    expect(f.entry().preceding?.seq).toBe(1)
    expect(getGoalHistoryProjection(f.entry())).toMatchObject({
      gap: true,
      gapReason: 'limit',
      limit: true,
      hasOlder: true,
    })
    expect(reads).toBe(10)
  } finally {
    f.dispose()
  }
})

test('query timeout is bounded, aborts its Host request and allows an explicit read retry', async () => {
  let signal: AbortSignal | undefined
  let hang = true
  const f = fixture(
    {
      async execute(_name, input, options) {
        if (hang) {
          signal = options?.signal
          return new Promise<unknown>(() => {})
        }
        return page(input as GoalHistoryInput, [])
      },
    },
    { status: 'loading', watching: false },
  )
  try {
    await f.update('loading', { status: 'ready', watching: true })
    await failure(f.local.execute('goalHistory.refresh', { sessionId: 'one' }), 'TIMEOUT')
    expect(signal?.aborted).toBeTrue()
    expect(f.entry()).toMatchObject({ status: 'error', error: 'TIMEOUT', stale: true })
    hang = false
    await f.local.execute('goalHistory.refresh', { sessionId: 'one' })
    expect(f.entry()).toMatchObject({ status: 'ready', preceding: { seq: 0, goal: null } })
  } finally {
    f.dispose()
  }
}, 15_000)

function snapshot(sessionId: string, cursor: number, sequences: number[], hasOlder = false): SessionSnapshot {
  return {
    session: {
      id: sessionId,
      workspaceId: 'workspace',
      title: sessionId,
      archived: false,
      parentId: null,
      createdAt: 1,
      updatedAt: cursor,
      seq: cursor,
    },
    messages: sequences.map((seq) => ({
      id: `message-${seq}`,
      sessionId,
      runId: `run-${seq}`,
      role: 'user',
      content: [{ type: 'text', text: `Message ${seq}` }],
      seq,
      createdAt: seq,
    })),
    runs: [],
    approvals: [],
    userInputs: [],
    streams: [],
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    cursor,
    hasOlder,
  }
}

test('the real timeline bridge awaits Goal coverage but preserves loaded messages on a history failure; streams never re-read Goal', async () => {
  const local = new CommandRegistry()
  const errors: unknown[] = []
  const navigation = createState<NavigationState>(
    { workspaceId: 'workspace', sessionId: null, status: 'idle', error: null },
    (error) => errors.push(error),
  )
  let update: ((value: SessionTimelineUpdate) => void) | undefined
  let snapshots = 0
  let reads = 0
  let failOlder = true
  const facts = Array.from({ length: 180 }, (_, index) => fact(index + 1))
  const timelinePort: SessionTimelinePort = {
    async snapshot(sessionId, before) {
      snapshots += 1
      return snapshot(sessionId, 180, before === undefined ? [170, 175] : [20, 30], before === undefined)
    },
    async watch(_sessionId, _cursor, listener) {
      update = listener
      return () => {
        update = undefined
      }
    },
  }
  const timeline = createSessionTimeline(
    local,
    timelinePort,
    navigation.reader,
    (error) => errors.push(error),
    () => false,
  )
  const history = createGoalHistory(
    local,
    {
      async execute(_name, input) {
        reads += 1
        const query = input as GoalHistoryInput
        if (query.beforeSeq !== undefined && failOlder) throw new CommandError('CONNECTION_CLOSED', 'Offline')
        return page(query, facts)
      },
    },
    timeline.history,
    navigation.reader,
    (error) => errors.push(error),
    () => false,
  )
  const current = () => {
    const entry = history.reader.getSnapshot().sessions.one
    if (!entry) throw new Error('Missing entry')
    return entry
  }
  try {
    navigation.replace({ ...navigation.reader.getSnapshot(), sessionId: 'one' })
    await settle(() => current().status === 'ready')
    expect(reads).toBe(1)
    if (!update) throw new Error('Missing watch')
    update({
      kind: 'stream',
      stream: {
        id: 'stream',
        sessionId: 'one',
        runId: 'run',
        operation: 'reset',
        version: 1,
        text: 'Tokens',
        thinking: '',
        textOffset: 0,
        thinkingOffset: 0,
      },
    })
    expect(reads).toBe(1)
    const result = await local.execute('timeline.loadOlder', { sessionId: 'one' })
    expect(result).toMatchObject({ loaded: 2, hasOlder: false })
    expect(timeline.reader.getSnapshot().messages.map((item) => item.seq)).toEqual([20, 30, 170, 175])
    expect(timeline.reader.getSnapshot().olderError).toBeNull()
    expect(current()).toMatchObject({ olderStatus: 'error', olderError: 'CONNECTION_CLOSED' })
    expect(getGoalHistoryProjection(current()).gap).toBeTrue()
    failOlder = false
    await local.execute('goalHistory.loadOlder', { sessionId: 'one' })
    expect(current().facts).toHaveLength(180)
    expect(getGoalHistoryProjection(current()).gap).toBeFalse()
    update({ kind: 'event', event: canonical(fact(181)) })
    expect(current().facts.at(-1)?.seq).toBe(181)
    expect(reads).toBe(3)
    update({ kind: 'event', event: canonical(fact(184)) })
    await settle(() => snapshots === 3 && current().status === 'ready')
    expect(current().facts.some((item) => item.seq === 184)).toBeFalse()
    expect(errors).toEqual([])
  } finally {
    history.dispose()
    timeline.dispose()
    local.dispose()
    navigation.dispose()
  }
})
