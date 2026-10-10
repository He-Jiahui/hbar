import { expect, test } from 'bun:test'
import { createAppRuntime, type SessionTimelineUpdate } from '@hbar/app-runtime'
import type { SessionSnapshot, SessionEvent } from '@hbar/contracts'
import type { ContextHistoryPage } from '@hbar/contracts/context-history'
import { contextRecord, contextHistoryPage } from './fixtures/context-history'

async function waitFor(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return
    await Bun.sleep(5)
  }
  throw new Error('Projection did not settle')
}
function fixture(read?: (before?: number) => Promise<ContextHistoryPage>) {
  let update: ((value: SessionTimelineUpdate) => void) | undefined
  let current = contextHistoryPage([
    contextRecord({ status: 'running', endedAt: null, durationMs: null, afterTokens: null }),
  ])
  const workspace = { id: 'workspace', path: 'D:/fixture', name: 'Fixture', createdAt: 1 }
  const session = {
    id: 'session-one',
    workspaceId: workspace.id,
    title: 'Fixture',
    archived: false,
    parentId: null,
    createdAt: 1,
    updatedAt: 1,
    seq: 11,
  }
  const snapshot = (): SessionSnapshot => ({
    session,
    messages: [],
    runs: [],
    approvals: [],
    userInputs: [],
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    cursor: session.seq,
    hasOlder: false,
    streams: [],
    contextHistory: current,
  })
  const runtime = createAppRuntime({
    instanceId: 'context-history',
    hostId: 'host',
    directory: {
      async execute(command) {
        if (command === 'workspace.list') return { items: [workspace], nextCursor: null }
        if (command === 'workspace.get') return workspace
        if (command === 'session.list') return { items: [session], nextCursor: null }
        if (command === 'session.get') return session
        throw new Error('Unexpected query')
      },
    },
    timeline: {
      async snapshot() {
        return snapshot()
      },
      async watch(_id, _cursor, listener) {
        update = listener
        return () => undefined
      },
      async contextHistory(input) {
        return read ? read(input.before) : current
      },
    },
  })
  return {
    runtime,
    setPage(value: ContextHistoryPage) {
      current = value
    },
    emit(value: SessionEvent) {
      session.seq = value.seq
      update?.({ kind: 'event', event: value })
    },
  }
}
const event = (type: string, seq: number, data: unknown): SessionEvent => ({
  type,
  seq,
  data,
  eventId: `event-${seq}`,
  sessionId: 'session-one',
  runId: null,
  stepId: null,
  time: 7000,
  version: 1,
})

test('reload restores active telemetry and completion removes the notice before a metadata refresh', async () => {
  const { runtime, emit, setPage } = fixture()
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: 'session-one' })
    await waitFor(() => runtime.view.state.timeline.getSnapshot().status === 'ready')
    expect(runtime.view.state.timeline.getSnapshot().activeCompaction?.id).toBe('compaction-1')
    const completed = contextRecord()
    setPage(contextHistoryPage([completed]))
    emit(event('context.compacted', 12, { compaction: completed }))
    expect(runtime.view.state.timeline.getSnapshot().activeCompaction).toBeNull()
    expect(runtime.view.state.timeline.getSnapshot().contextHistory?.records[0]?.status).toBe('completed')
    emit(event('context.compacted', 12, { compaction: completed }))
    expect(runtime.view.state.timeline.getSnapshot().contextHistory?.records).toHaveLength(1)
    await runtime.view.commands.execute('timeline.retry', { sessionId: 'session-one' })
    expect(runtime.view.state.timeline.getSnapshot().contextHistory?.records[0]?.afterTokens).toBe(1000)
  } finally {
    runtime.dispose()
  }
})

test('older pages replace the visible page and failures remain retryable without an unbounded cache', async () => {
  let fail = true
  const { runtime } = fixture(async (before) => {
    if (before && fail) throw new Error('Offline')
    return contextHistoryPage([contextRecord({ id: before ? 'older' : 'latest', seq: before ? 2 : 11 })])
  })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: 'session-one' })
    await waitFor(() => runtime.view.state.timeline.getSnapshot().status === 'ready')
    const result = await runtime.view.commands
      .execute('timeline.contextHistory', { sessionId: 'session-one', before: 11 })
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(result).toBeInstanceOf(Error)
    expect(runtime.view.state.timeline.getSnapshot().contextHistoryStatus).toBe('error')
    await Bun.sleep(300)
    expect(runtime.view.state.timeline.getSnapshot().contextHistoryError).toBe('Offline')
    expect(runtime.view.state.timeline.getSnapshot().contextHistoryRequestBefore).toBe(11)
    expect(runtime.view.state.timeline.getSnapshot().contextHistory?.records[0]?.id).toBe('compaction-1')
    fail = false
    await runtime.view.commands.execute('timeline.contextHistory', { sessionId: 'session-one', before: 11 })
    expect(runtime.view.state.timeline.getSnapshot().contextHistory?.records.map((value) => value.id)).toEqual([
      'older',
    ])
    await runtime.view.commands.execute('timeline.contextHistory', { sessionId: 'session-one' })
    expect(runtime.view.state.timeline.getSnapshot().contextHistory?.records.map((value) => value.id)).toEqual([
      'latest',
    ])
  } finally {
    runtime.dispose()
  }
})

test('late history reads after navigation or disposal cannot repopulate the old session', async () => {
  let resolve: ((value: ContextHistoryPage) => void) | undefined
  const { runtime } = fixture(
    () =>
      new Promise<ContextHistoryPage>((done) => {
        resolve = done
      }),
  )
  await runtime.view.commands.execute('app.setSession', { sessionId: 'session-one' })
  await waitFor(() => runtime.view.state.timeline.getSnapshot().status === 'ready')
  const pending = runtime.view.commands.execute('timeline.contextHistory', { sessionId: 'session-one', before: 11 })
  await waitFor(() => Boolean(resolve))
  await runtime.view.commands.execute('app.setWorkspace', { workspaceId: 'workspace' })
  resolve?.(contextHistoryPage([contextRecord({ id: 'late' })]))
  await pending
  expect(runtime.view.state.timeline.getSnapshot().sessionId).toBeNull()
  expect(runtime.view.state.timeline.getSnapshot().contextHistory).toBeUndefined()
  runtime.dispose()
})

test('rapid paging keeps one actual request and sends only the latest queued cursor', async () => {
  const pending: ((value: ContextHistoryPage) => void)[] = []
  const cursors: (number | undefined)[] = []
  const { runtime } = fixture((before) => {
    cursors.push(before)
    return new Promise<ContextHistoryPage>((resolve) => {
      pending.push(resolve)
    })
  })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: 'session-one' })
    await waitFor(() => runtime.view.state.timeline.getSnapshot().status === 'ready')
    const first = runtime.view.commands.execute('timeline.contextHistory', { sessionId: 'session-one', before: 11 })
    await waitFor(() => pending.length === 1)
    const second = runtime.view.commands.execute('timeline.contextHistory', { sessionId: 'session-one', before: 10 })
    const latest = runtime.view.commands.execute('timeline.contextHistory', { sessionId: 'session-one', before: 9 })
    expect(cursors).toEqual([11])
    pending[0]?.(contextHistoryPage([contextRecord({ seq: 10 })]))
    await waitFor(() => pending.length === 2)
    expect(cursors).toEqual([11, 9])
    pending[1]?.(contextHistoryPage([contextRecord({ id: 'latest-page', seq: 8 })]))
    await Promise.all([first, second, latest])
    expect(runtime.view.state.timeline.getSnapshot().contextHistory?.records[0]?.id).toBe('latest-page')
  } finally {
    runtime.dispose()
  }
})
