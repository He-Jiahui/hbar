import { expect, test } from 'bun:test'
import { createAppRuntime, type SessionTimelinePort, type SessionTimelineUpdate } from '@hbar/app-runtime'
import type { Run, SessionEvent, SessionSnapshot } from '@hbar/contracts'
import { isQueuedRunGuidanceEvent } from '../packages/app-runtime/src/session-timeline'

const workspace = { id: 'workspace', path: 'D:/workspace', name: 'Workspace', createdAt: 1 }
const session = {
  id: 'session-guidance',
  workspaceId: workspace.id,
  title: 'Guidance',
  archived: false,
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  seq: 1,
}
const activeRunId = 'run-active'
const queuedRunId = 'run-queued'

function run(id: string, status: Run['status'], createdAt: number, source?: 'user'): Run {
  return {
    id,
    sessionId: session.id,
    requestId: `request-${id}`,
    input: {
      text: id === queuedRunId ? 'queued steering text' : 'active text',
      images: [],
      files: [],
      ...(source ? { source } : {}),
    },
    modelId: 'model',
    status,
    createdAt,
    startedAt: status === 'running' ? createdAt : null,
    endedAt: status === 'guided' ? 20 : null,
    error: null,
  }
}

const activeRun = run(activeRunId, 'running', 2, 'user')
const queuedRun = run(queuedRunId, 'queued', 3)

function snapshot(): SessionSnapshot {
  return {
    session,
    messages: [],
    runs: [activeRun, queuedRun],
    approvals: [],
    userInputs: [],
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    cursor: 1,
    hasOlder: false,
    streams: [
      {
        id: 'stream-active',
        sessionId: session.id,
        runId: activeRunId,
        text: 'partial assistant text',
        thinking: '',
        offset: 23,
        version: 1,
      },
    ],
  }
}

function guidanceEvent(eventId: string, seq: number, receiptEventId = eventId): SessionEvent {
  const guidedRun: Run = {
    ...queuedRun,
    status: 'guided',
    endedAt: seq === 2 ? 20 : seq,
    // A queued Run persisted before source was added is still a valid user Run.
    input: { ...queuedRun.input, source: undefined },
  }
  const content = [{ type: 'text' as const, text: guidedRun.input.text }]
  return {
    eventId,
    sessionId: session.id,
    seq,
    runId: activeRunId,
    stepId: null,
    type: 'message.committed',
    time: guidedRun.endedAt ?? seq,
    version: 1,
    data: {
      id: `guided-message-${seq}`,
      role: 'user',
      content,
      queueGuidance: {
        activeRunId,
        guidedRun,
        expectedRevision: 1,
        actorId: 'host:test',
        payloadHash: 'a'.repeat(64),
        receipt: {
          commandId: 'queuedRun.guide',
          commandVersion: 1,
          sessionId: session.id,
          operationId: queuedRunId,
          activeRunId,
          idempotencyKey: `guide-${seq}`,
          status: 'accepted',
          operationStatus: 'guided',
          messageId: `guided-message-${seq}`,
          eventId: receiptEventId,
          revision: seq,
          sessionSeq: seq,
          queueRevision: 1,
          guidedAt: guidedRun.endedAt ?? seq,
        },
      },
    },
  }
}

function directory() {
  return {
    async execute(name: string, _input: unknown) {
      if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
      if (name === 'workspace.get') return workspace
      if (name === 'session.list') return { items: [session], nextCursor: null }
      if (name === 'session.get') return session
      throw new Error(`Unsupported directory query: ${name}`)
    },
  }
}

async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (check()) return
    await Bun.sleep(1)
  }
  throw new Error('state did not settle')
}

test('valid guidance replaces the queued Run while preserving the active stream and deduping replay', async () => {
  const updates = new Map<string, (update: SessionTimelineUpdate) => void>()
  const timeline: SessionTimelinePort = {
    async snapshot() {
      return structuredClone(snapshot())
    },
    async watch(sessionId, _cursor, onUpdate) {
      updates.set(sessionId, onUpdate)
      return () => {
        updates.delete(sessionId)
      }
    },
  }
  const runtime = createAppRuntime({ instanceId: 'guidance', hostId: 'host', directory: directory(), timeline })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    await waitFor(() => runtime.view.state.timeline.getSnapshot().status === 'ready')
    const event = guidanceEvent('event-guided', 2)
    expect(isQueuedRunGuidanceEvent(event)).toBeTrue()
    updates.get(session.id)!({ kind: 'event', event })
    const projected = runtime.view.state.timeline.getSnapshot()
    expect(projected.messages).toHaveLength(1)
    expect(projected.messages[0]?.content).toEqual([{ type: 'text', text: queuedRun.input.text }])
    expect(projected.runs.find((item) => item.id === queuedRunId)?.status).toBe('guided')
    expect(projected.streams['stream-active']?.text).toBe('partial assistant text')
    expect(projected.events).toHaveLength(1)

    updates.get(session.id)!({ kind: 'event', event })
    const replayed = runtime.view.state.timeline.getSnapshot()
    expect(replayed.messages).toHaveLength(1)
    expect(replayed.events).toHaveLength(1)
    expect(replayed.streams['stream-active']?.text).toBe('partial assistant text')
  } finally {
    runtime.dispose()
  }
})

test('invalid guidance proof forces a snapshot reload without a false user message or queue mutation', async () => {
  const updates = new Map<string, (update: SessionTimelineUpdate) => void>()
  let snapshotCalls = 0
  const timeline: SessionTimelinePort = {
    async snapshot() {
      snapshotCalls += 1
      return structuredClone(snapshot())
    },
    async watch(sessionId, _cursor, onUpdate) {
      updates.set(sessionId, onUpdate)
      return () => {
        updates.delete(sessionId)
      }
    },
  }
  const runtime = createAppRuntime({ instanceId: 'guidance-invalid', hostId: 'host', directory: directory(), timeline })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    await waitFor(() => runtime.view.state.timeline.getSnapshot().status === 'ready' && snapshotCalls === 1)
    const invalid = guidanceEvent('event-invalid', 2, 'event-not-the-canonical-id')
    expect(isQueuedRunGuidanceEvent(invalid)).toBeFalse()
    updates.get(session.id)!({ kind: 'event', event: invalid })
    await waitFor(() => snapshotCalls >= 2 && runtime.view.state.timeline.getSnapshot().status === 'ready')
    const resynced = runtime.view.state.timeline.getSnapshot()
    expect(resynced.messages).toHaveLength(0)
    expect(resynced.runs.find((item) => item.id === queuedRunId)?.status).toBe('queued')
    expect(resynced.streams['stream-active']?.text).toBe('partial assistant text')
    expect(resynced.cursor).toBe(1)
  } finally {
    runtime.dispose()
  }
})
