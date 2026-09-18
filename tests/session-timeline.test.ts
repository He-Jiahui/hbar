import { expect, test } from 'bun:test'
import { createAppRuntime, type SessionTimelinePort, type SessionTimelineUpdate } from '@hbar/app-runtime'
import { createSessionTimelineClient } from '@hbar/client'
import type { SessionEvent, SessionSnapshot, StreamDelta, WireNotification } from '@hbar/contracts'

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

test('timeline follows the selected session incrementally and rejects stale or malformed updates', async () => {
  const updates = new Map<string, (update: SessionTimelineUpdate) => void>()
  const closed: string[] = []
  const snapshots = new Map([
    ['session-one', snapshot('session-one', 1, 'first')],
    ['session-two', snapshot('session-two', 2, 'second')],
  ])
  const timeline: SessionTimelinePort = {
    async snapshot(sessionId) {
      return structuredClone(snapshots.get(sessionId)!)
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
    expect(runtime.view.state.timeline.getSnapshot().messages[0]?.content).toEqual([
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
    expect(runtime.view.state.timeline.getSnapshot().messages[0]?.content).toEqual([{ type: 'text', text: 'resynced' }])
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
