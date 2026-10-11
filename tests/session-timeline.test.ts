import { expect, test } from 'bun:test'
import { createAppRuntime, type SessionTimelinePort, type SessionTimelineUpdate } from '@hbar/app-runtime'
import { createSessionTimelineClient } from '@hbar/client'
import {
  runSchema,
  type PlanState,
  type Run,
  type SessionEvent,
  type SessionSnapshot,
  type StreamDelta,
  type WireNotification,
} from '@hbar/contracts'
import { fileChangeSummary } from './fixtures/run-file-changes'

const workspace = { id: 'workspace', path: 'D:/workspace', name: 'Workspace', createdAt: 1 }
const sessions = [
  {
    id: 'session-one',
    workspaceId: workspace.id,
    title: 'One',
    archived: false,
    parentId: null,
    createdAt: 2,
    updatedAt: 3,
    seq: 1,
  },
  {
    id: 'session-two',
    workspaceId: workspace.id,
    title: 'Two',
    archived: false,
    parentId: null,
    createdAt: 4,
    updatedAt: 5,
    seq: 2,
  },
]

function snapshot(sessionId: string, cursor: number, text: string): SessionSnapshot {
  const session = sessions.find((item) => item.id === sessionId)!
  return {
    session: { ...session, seq: cursor },
    messages: [
      {
        id: `message-${cursor}`,
        sessionId,
        runId: `run-${cursor}`,
        role: 'assistant',
        content: [{ type: 'text', text }],
        seq: cursor,
        createdAt: cursor,
      },
    ],
    runs: [],
    approvals: [],
    userInputs: [],
    usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, cost: 0.01 },
    cursor,
    hasOlder: false,
    streams: [],
  }
}

function event(sessionId: string, seq: number, type: string, data: unknown, runId: string | null = null): SessionEvent {
  return {
    eventId: `${sessionId}-${seq}-${type}`,
    sessionId,
    seq,
    runId,
    stepId: null,
    type,
    data,
    time: seq,
    version: 1,
  }
}

async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (check()) return
    await Bun.sleep(1)
  }
  throw new Error('state did not settle')
}

function directory() {
  return {
    async execute(name: string, input: unknown) {
      if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
      if (name === 'workspace.get') return workspace
      if (name === 'session.list') return { items: sessions, nextCursor: null }
      if (name === 'session.get')
        return sessions.find((item) => item.id === (input as { sessionId: string }).sessionId) ?? null
      throw new Error(`Unsupported directory query: ${name}`)
    },
  }
}

test('recovery queue and execution facts project the successor while preserving the real interrupted predecessor and messages', async () => {
  const original: Run = { id: 'original', sessionId: 'session-one', requestId: 'user-input', input: { text: 'Continue once', images: [] }, modelId: 'fixture',
    status: 'interrupted', createdAt: 1, startedAt: 1, endedAt: 2, error: 'Owner exited', failure: { code: 'EXECUTION_INTERRUPTED', category: 'interrupted', retryable: true } }
  const successor: Run = { ...original, id: 'successor', requestId: 'recovery-id', status: 'queued', createdAt: 3, startedAt: null, endedAt: null, error: null,
    recovery: { recoveryId: 'recovery-id', chainId: 'chain', rootRunId: original.id, predecessorRunId: original.id, attempt: 1 } }
  delete successor.failure
  let publish: ((value: SessionTimelineUpdate) => void) | undefined
  const runtime = createAppRuntime({ instanceId: 'recovery-timeline', hostId: 'host', directory: directory(), timeline: {
    snapshot: async () => ({ ...snapshot('session-one', 1, 'Committed context'), runs: [original] }),
    watch: async (_id, _cursor, listener) => { publish = listener; return () => {} },
  } })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: 'session-one' }); await waitFor(() => Boolean(publish))
    publish?.({ kind: 'event', event: event('session-one', 2, 'run.recoveryQueued', {
      recoveryId: 'recovery-id', predecessorRunId: original.id, run: successor,
      chain: { chainId: 'chain', sessionId: 'session-one', rootRunId: original.id, currentRunId: successor.id, attempts: 1, status: 'running', reasonCode: null, updatedAt: 3 },
    }, successor.id) })
    await waitFor(() => runtime.view.state.timeline.getSnapshot().runs.length === 2)
    expect(runtime.view.state.timeline.getSnapshot().runs[0]?.recovery).toEqual(successor.recovery)
    publish?.({ kind: 'event', event: event('session-one', 3, 'execution.claimed', { run: { ...successor, status: 'running', startedAt: 4 } }, successor.id) })
    await waitFor(() => runtime.view.state.timeline.getSnapshot().cursor === 3)
    expect(runtime.view.state.timeline.getSnapshot().runs[0]?.status).toBe('running')
    expect(runtime.view.state.timeline.getSnapshot().runs.find(run => run.id === original.id)?.failure).toEqual(original.failure)
    expect(runtime.view.state.timeline.getSnapshot().messages).toHaveLength(1)
  } finally { runtime.dispose() }
})

test('live Run settlements and undo preserve canonical file summaries and reject a foreign Run', async () => {
  let update: ((value: SessionTimelineUpdate) => void) | undefined
  const timeline: SessionTimelinePort = {
    async snapshot() {
      return snapshot('session-one', 1, 'Final reply')
    },
    async watch(_id, _cursor, listener) {
      update = listener
      return () => {}
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'file-summary-live',
    hostId: 'host',
    directory: directory(),
    timeline,
  })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: 'session-one' })
    await waitFor(() => Boolean(update))
    const run = runSchema.parse({
      id: 'run',
      sessionId: 'session-one',
      requestId: 'request',
      input: { text: 'edit', images: [] },
      modelId: 'mock',
      status: 'failed',
      createdAt: 1,
      startedAt: 1,
      endedAt: 2,
      error: 'later failure',
      fileChanges: fileChangeSummary(10, { seq: 2 }),
    })
    update?.({ kind: 'event', event: event('session-one', 2, 'run.settled', { run }, run.id) })
    expect(runtime.view.state.timeline.getSnapshot().runs[0]?.fileChanges).toEqual(run.fileChanges)
    const undone = { ...run, fileChanges: { ...fileChangeSummary(10, { seq: 2 }), canUndo: false, undoneAt: 3 } }
    update?.({ kind: 'event', event: event('session-one', 3, 'run.filesUndone', { run: undone }, run.id) })
    expect(runtime.view.state.timeline.getSnapshot().runs[0]?.fileChanges?.undoneAt).toBe(3)
    update?.({
      kind: 'event',
      event: event(
        'session-one',
        4,
        'run.settled',
        { run: { ...run, id: 'foreign', sessionId: 'session-two' } },
        'foreign',
      ),
    })
    expect(runtime.view.state.timeline.getSnapshot().runs).toHaveLength(1)
  } finally {
    runtime.dispose()
  }
})

test('resnapshot preserves resolved ordinary approval facts for loaded history but drops missing pending requests', async () => {
  const resolved = {
    id: 'resolved-edit',
    sessionId: 'session-one',
    runId: 'run-1',
    callId: 'edit-call',
    tool: 'edit_file',
    args: { path: 'draft.md' },
    status: 'allowed' as const,
    createdAt: 1,
  }
  const pending = { ...resolved, id: 'pending-edit', callId: 'pending-call', status: 'pending' as const }
  const initial = snapshot('session-one', 1, 'Original call')
  const message = initial.messages[0]
  if (!message) throw new Error('Original approval call fixture is missing')
  let current: SessionSnapshot = {
    ...initial,
    messages: [
      {
        ...message,
        content: [{ type: 'tool_call', name: resolved.tool, callId: resolved.callId, args: resolved.args }],
      },
    ],
    approvals: [resolved, pending],
  }
  const timeline: SessionTimelinePort = {
    async snapshot(sessionId) {
      return structuredClone(sessionId === 'session-one' ? current : snapshot(sessionId, 3, 'Other Session'))
    },
    async watch() {
      return () => undefined
    },
  }
  const runtime = createAppRuntime({ instanceId: 'approval-history', hostId: 'host', directory: directory(), timeline })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: 'session-one' })
    await waitFor(() => runtime.view.state.timeline.getSnapshot().status === 'ready')
    expect(runtime.view.state.timeline.getSnapshot().approvals).toHaveLength(2)
    current = snapshot('session-one', 2, 'Newer page without the older call')
    await runtime.view.commands.execute('timeline.retry', { sessionId: 'session-one' })
    expect(runtime.view.state.timeline.getSnapshot().messages).toHaveLength(2)
    expect(runtime.view.state.timeline.getSnapshot().approvals).toEqual([resolved])
    await runtime.view.commands.execute('app.setSession', { sessionId: 'session-two' })
    await waitFor(() => runtime.view.state.timeline.getSnapshot().sessionId === 'session-two')
    expect(runtime.view.state.timeline.getSnapshot().approvals).toEqual([])
  } finally {
    runtime.dispose()
  }
})

test('tool execution facts survive snapshots, coalesce by call identity and reject invalid or stale progress', async () => {
  const original = event(
    'session-one',
    2,
    'tool.execution',
    {
      callId: 'read',
      name: 'read_file',
      execution: { startedAt: 1, elapsedMs: 10 },
    },
    'run-1',
  )
  let update: ((value: SessionTimelineUpdate) => void) | undefined
  const timeline: SessionTimelinePort = {
    async snapshot() {
      return { ...snapshot('session-one', 2, 'initial'), toolEvents: [original], toolObservedAt: 20 }
    },
    async watch(_sessionId, _cursor, onUpdate) {
      update = onUpdate
      return () => {}
    },
  }
  const runtime = createAppRuntime({ instanceId: 'tool-timing', hostId: 'host', directory: directory(), timeline })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: 'session-one' })
    await waitFor(() => Boolean(update))
    const state = () => runtime.view.state.timeline.getSnapshot()
    expect(state().toolEvents).toEqual([original])
    expect(state().toolClock?.hostTime).toBe(20)
    update?.({
      kind: 'event',
      event: event(
        'session-one',
        3,
        'tool.execution',
        {
          callId: 'read',
          name: 'read_file',
          execution: { startedAt: 1, elapsedMs: 20, progress: { completed: 1, total: 4 } },
        },
        'run-1',
      ),
    })
    await waitFor(() => state().cursor === 3)
    expect(state().toolEvents).toHaveLength(1)
    expect(state().toolEvents?.[0]?.seq).toBe(3)
    update?.({
      kind: 'event',
      event: event(
        'session-one',
        4,
        'tool.execution',
        {
          callId: 'read',
          name: 'read_file',
          execution: { startedAt: 1, elapsedMs: -20 },
        },
        'run-1',
      ),
    })
    await waitFor(() => state().cursor === 4)
    expect(state().toolEvents?.[0]?.seq).toBe(3)
    await runtime.view.commands.execute('timeline.retry', { sessionId: 'session-one' })
    expect(state().toolEvents).toEqual([original])
  } finally {
    runtime.dispose()
  }
})

test('timeline follows the selected session incrementally and rejects stale or malformed updates', async () => {
  const updates = new Map<string, (update: SessionTimelineUpdate) => void>()
  const closed: string[] = []
  const snapshots = new Map([
    ['session-one', snapshot('session-one', 1, 'first')],
    ['session-two', snapshot('session-two', 2, 'second')],
  ])
  const plans = new Map<string, PlanState | null>([
    [
      'session-one',
      {
        sessionId: 'session-one',
        revision: 1,
        turnId: 'run-one',
        explanation: 'Initial plan',
        plan: [{ step: 'Inspect', status: 'in_progress' }],
        updatedAt: 1,
      },
    ],
    ['session-two', null],
  ])
  const timeline: SessionTimelinePort = {
    async snapshot(sessionId) {
      return structuredClone(snapshots.get(sessionId)!)
    },
    async plan(sessionId) {
      return structuredClone(plans.get(sessionId) ?? null)
    },
    async watch(sessionId, _cursor, onUpdate) {
      updates.set(sessionId, onUpdate)
      return () => {
        closed.push(sessionId)
        updates.delete(sessionId)
      }
    },
  }
  const runtime = createAppRuntime({ instanceId: 'timeline', hostId: 'host', directory: directory(), timeline })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: 'session-one' })
    await waitFor(() => runtime.view.state.timeline.getSnapshot().status === 'ready')
    expect(runtime.view.state.timeline.getSnapshot().messages[0]?.content).toEqual([{ type: 'text', text: 'first' }])
    expect(Object.isFrozen(runtime.view.state.timeline.getSnapshot().messages[0])).toBeTrue()
    expect(runtime.view.state.timeline.getSnapshot().plan).toMatchObject({
      turnId: 'run-one',
      explanation: 'Initial plan',
    })

    const onFirst = updates.get('session-one')!
    onFirst({
      kind: 'stream',
      stream: {
        id: 'stream-one',
        sessionId: 'session-one',
        runId: 'run-one',
        operation: 'reset',
        text: 'hel',
        thinking: '',
        textOffset: 0,
        thinkingOffset: 0,
        version: 1,
      },
    })
    onFirst({
      kind: 'stream',
      stream: {
        id: 'stream-one',
        sessionId: 'session-one',
        runId: 'run-one',
        operation: 'append',
        text: 'lo',
        thinking: '',
        textOffset: 3,
        thinkingOffset: 0,
        version: 2,
      },
    })
    expect(runtime.view.state.timeline.getSnapshot().streams['stream-one']?.text).toBe('hello')

    onFirst({
      kind: 'event',
      event: event(
        'session-one',
        2,
        'message.committed',
        { id: 'message-two', role: 'assistant', content: [{ type: 'text', text: 'done' }] },
        'run-one',
      ),
    })
    expect(runtime.view.state.timeline.getSnapshot().messages.at(-1)?.id).toBe('message-two')
    expect(runtime.view.state.timeline.getSnapshot().streams['stream-one']).toBeUndefined()

    onFirst({ kind: 'event', event: event('session-one', 3, 'message.committed', { role: 'bad' }, 'run-one') })
    expect(runtime.view.state.timeline.getSnapshot().messages).toHaveLength(2)
    expect(runtime.view.state.timeline.getSnapshot().cursor).toBe(3)

    onFirst({
      kind: 'event',
      event: event(
        'session-one',
        4,
        'plan.updated',
        {
          plan: {
            sessionId: 'session-one',
            revision: 2,
            turnId: 'run-one',
            explanation: 'Updated plan',
            plan: [
              { step: 'Inspect', status: 'completed' },
              { step: 'Verify', status: 'in_progress' },
            ],
            updatedAt: 4,
          },
        },
        'run-one',
      ),
    })
    expect(runtime.view.state.timeline.getSnapshot().plan).toMatchObject({
      turnId: 'run-one',
      explanation: 'Updated plan',
      plan: [{ status: 'completed' }, { status: 'in_progress' }],
    })
    plans.set('session-one', null)
    onFirst({ kind: 'event', event: event('session-one', 5, 'plan.cleared', { sessionId: 'session-one' }) })
    expect(runtime.view.state.timeline.getSnapshot().plan).toBeNull()

    snapshots.set('session-one', snapshot('session-one', 9, 'stream resynced'))
    onFirst({
      kind: 'stream',
      stream: {
        id: 'missing-stream',
        sessionId: 'session-one',
        runId: 'run-one',
        operation: 'append',
        text: 'gap',
        thinking: '',
        textOffset: 20,
        thinkingOffset: 0,
        version: 4,
      },
    })
    await waitFor(() => runtime.view.state.timeline.getSnapshot().cursor === 9)
    expect(runtime.view.state.timeline.getSnapshot().messages.at(-1)?.content).toEqual([
      { type: 'text', text: 'stream resynced' },
    ])

    await runtime.view.commands.execute('app.setSession', { sessionId: 'session-two' })
    await waitFor(() => runtime.view.state.timeline.getSnapshot().sessionId === 'session-two')
    expect(closed).toContain('session-one')
    onFirst({ kind: 'event', event: event('session-one', 4, 'message.committed', {}, 'run-one') })
    expect(runtime.view.state.timeline.getSnapshot().sessionId).toBe('session-two')

    snapshots.set('session-two', snapshot('session-two', 8, 'resynced'))
    updates.get('session-two')!({ kind: 'reset' })
    await waitFor(() => runtime.view.state.timeline.getSnapshot().cursor === 8)
    expect(runtime.view.state.timeline.getSnapshot().messages.at(-1)?.content).toEqual([
      { type: 'text', text: 'resynced' },
    ])
  } finally {
    runtime.dispose()
  }
})

test('timeline stops older page requests at its 1,000-message bound', async () => {
  const messages = Array.from({ length: 1_100 }, (_, index) => ({
    id: `bounded-${index + 1}`,
    sessionId: 'session-one',
    runId: `run-${index + 1}`,
    role: 'assistant' as const,
    content: [{ type: 'text' as const, text: 'History' }],
    seq: index + 1,
    createdAt: index + 1,
  }))
  let reads = 0
  const timeline: SessionTimelinePort = {
    async snapshot(sessionId, before, limit = 60) {
      reads++
      const candidates = messages.filter((message) => message.seq < (before ?? Number.MAX_SAFE_INTEGER))
      const page = candidates.slice(-limit)
      return { ...snapshot(sessionId, 1_100, 'unused'), messages: page, hasOlder: candidates.length > page.length }
    },
    async watch() {
      return () => undefined
    },
  }
  const runtime = createAppRuntime({ instanceId: 'bounded-history', hostId: 'host', directory: directory(), timeline })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: 'session-one' })
    await waitFor(() => runtime.view.state.timeline.getSnapshot().status === 'ready')
    for (let page = 0; page < 16; page++)
      await runtime.view.commands.execute('timeline.loadOlder', { sessionId: 'session-one' })
    expect(runtime.view.state.timeline.getSnapshot()).toMatchObject({ olderStatus: 'limit', hasOlder: true })
    expect(runtime.view.state.timeline.getSnapshot().messages).toHaveLength(1_000)
    const before = reads
    expect(await runtime.view.commands.execute('timeline.loadOlder', { sessionId: 'session-one' })).toMatchObject({
      loaded: 0,
    })
    expect(reads).toBe(before)
  } finally {
    runtime.dispose()
  }
})

test('timeline pages older history, preserves cached content on reconnect, and ignores work for old selections', async () => {
  const messages = Array.from({ length: 180 }, (_, index) => ({
    id: `history-${index + 1}`,
    sessionId: 'session-one',
    runId: `run-${index + 1}`,
    role: 'assistant' as const,
    content: [{ type: 'text' as const, text: `History ${index + 1}` }],
    seq: index + 1,
    createdAt: index + 1,
  }))
  let failLatest = false
  let failOlder = true
  let holdLatest = false
  let update: ((value: SessionTimelineUpdate) => void) | undefined
  let releaseLatest: ((value: SessionSnapshot) => void) | undefined
  let releaseSecond: ((value: SessionSnapshot) => void) | undefined
  const timeline: SessionTimelinePort = {
    async snapshot(sessionId, before, limit = 60) {
      if (sessionId === 'session-two')
        return new Promise<SessionSnapshot>((resolve) => {
          releaseSecond = resolve
        })
      if (before === undefined && holdLatest)
        return new Promise<SessionSnapshot>((resolve) => {
          releaseLatest = resolve
        })
      if (before === undefined && failLatest) throw new Error('DISCONNECTED')
      if (before !== undefined && failOlder) {
        failOlder = false
        throw new Error('PAGE_UNAVAILABLE')
      }
      const candidates = messages.filter((message) => message.seq < (before ?? Number.MAX_SAFE_INTEGER))
      const page = candidates.slice(-limit)
      return {
        ...snapshot(sessionId, 180, 'unused'),
        messages: page,
        hasOlder: candidates.length > page.length,
        contextCompactions: [20, 80, 140]
          .filter((seq) => seq >= (page[0]?.seq ?? 0) && seq < (before ?? Infinity))
          .map((seq) => ({
            id: `compaction-${seq}`,
            sessionId,
            seq,
            time: seq,
            trigger: 'manual' as const,
          })),
      }
    },
    async watch(sessionId, _cursor, onUpdate) {
      if (sessionId === 'session-one') update = onUpdate
      return () => undefined
    },
  }
  const runtime = createAppRuntime({ instanceId: 'timeline-history', hostId: 'host', directory: directory(), timeline })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: 'session-one' })
    await waitFor(() => runtime.view.state.timeline.getSnapshot().status === 'ready')
    expect(runtime.view.state.timeline.getSnapshot().messages.map((message) => message.seq)).toEqual(
      Array.from({ length: 60 }, (_, index) => index + 121),
    )

    await expect(runtime.view.commands.execute('timeline.loadOlder', { sessionId: 'session-one' })).rejects.toThrow()
    expect(runtime.view.state.timeline.getSnapshot()).toMatchObject({
      olderStatus: 'error',
      olderError: 'PAGE_UNAVAILABLE',
    })
    expect(runtime.view.state.timeline.getSnapshot().messages).toHaveLength(60)

    await runtime.view.commands.execute('timeline.loadOlder', { sessionId: 'session-one' })
    await runtime.view.commands.execute('timeline.loadOlder', { sessionId: 'session-one' })
    expect(runtime.view.state.timeline.getSnapshot()).toMatchObject({
      olderStatus: 'idle',
      hasOlder: false,
    })
    expect(runtime.view.state.timeline.getSnapshot().messages.map((message) => message.seq)).toEqual(
      Array.from({ length: 180 }, (_, index) => index + 1),
    )

    failLatest = true
    update?.({ kind: 'reset' })
    await waitFor(() => runtime.view.state.timeline.getSnapshot().status === 'error')
    expect(runtime.view.state.timeline.getSnapshot().messages).toHaveLength(180)

    expect(runtime.view.state.timeline.getSnapshot().contextCompactions?.map((marker) => marker.seq)).toEqual([
      20, 80, 140,
    ])
    expect(runtime.view.state.timeline.getSnapshot().error).toBe('DISCONNECTED')
    failLatest = false
    await runtime.view.commands.execute('timeline.retry', { sessionId: 'session-one' })
    expect(runtime.view.state.timeline.getSnapshot()).toMatchObject({ status: 'ready', error: null })
    expect(runtime.view.state.timeline.getSnapshot().messages).toHaveLength(180)
    expect(runtime.view.state.timeline.getSnapshot().contextCompactions?.map((marker) => marker.seq)).toEqual([
      20, 80, 140,
    ])

    await runtime.view.commands.execute('app.setSession', { sessionId: 'session-two' })
    expect(runtime.view.state.timeline.getSnapshot()).toMatchObject({ sessionId: 'session-two', status: 'loading' })
    holdLatest = true
    await runtime.view.commands.execute('app.setSession', { sessionId: 'session-one' })
    expect(runtime.view.state.timeline.getSnapshot()).toMatchObject({ sessionId: 'session-one', status: 'loading' })
    expect(runtime.view.state.timeline.getSnapshot().messages).toHaveLength(180)
    releaseSecond?.(snapshot('session-two', 200, 'late second session'))
    releaseLatest?.({
      ...snapshot('session-one', 180, 'unused'),
      messages: messages.slice(-60),
      hasOlder: true,
    })
    await waitFor(() => runtime.view.state.timeline.getSnapshot().status === 'ready')
    expect(runtime.view.state.timeline.getSnapshot().sessionId).toBe('session-one')
    expect(
      runtime.view.state.timeline.getSnapshot().messages.some((message) => message.sessionId === 'session-two'),
    ).toBeFalse()
  } finally {
    runtime.dispose()
  }
})

test('client timeline adapter filters notifications and releases its exact follow', async () => {
  const listeners = new Set<(event: WireNotification) => void>()
  const calls: string[] = []
  const transport = {
    async call(method: string) {
      if (method === 'session.snapshot') return snapshot('session-one', 1, 'initial')
      if (method === 'plan.get')
        return {
          sessionId: 'session-one',
          revision: 1,
          turnId: 'run',
          explanation: null,
          plan: [{ step: 'Verify', status: 'in_progress' }],
          updatedAt: 1,
        }
      throw new Error(`Unexpected call: ${method}`)
    },
    onEvent(listener: (event: WireNotification) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async follow(sessionId: string, cursor: number) {
      calls.push(`follow:${sessionId}:${cursor}`)
    },
    async unfollow(sessionId: string) {
      calls.push(`unfollow:${sessionId}`)
    },
  }
  const client = createSessionTimelineClient(transport as never)
  expect(await client.plan('session-one')).toMatchObject({ turnId: 'run' })
  const received: SessionTimelineUpdate[] = []
  const close = await client.watch('session-one', 1, (update) => received.push(update))
  const stream: StreamDelta = {
    id: 'stream',
    sessionId: 'session-one',
    runId: 'run',
    operation: 'append',
    text: 'x',
    thinking: '',
    textOffset: 0,
    thinkingOffset: 0,
    version: 1,
  }
  for (const listener of listeners) {
    listener({ method: 'session.event', params: event('session-two', 2, 'ignored', {}) })
    listener({ method: 'stream.update', params: stream })
    listener({ method: 'host.changed', params: { kind: 'resync' } })
  }
  expect(received.map((item) => item.kind)).toEqual(['stream', 'reset'])
  expect(calls).toEqual(['follow:session-one:1'])
  await close()
  expect(calls).toEqual(['follow:session-one:1', 'unfollow:session-one'])
  expect(listeners.size).toBe(0)
})
