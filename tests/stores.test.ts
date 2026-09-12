import { expect, test } from 'bun:test'
import type { HbarClient } from '@hbar/client'
import type { Message, SessionSnapshot } from '@hbar/contracts'

if (!('location' in globalThis))
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'http://hbar.test' } })

const { loadOlder, useConnection, useSessions, useWorkbench } = await import('../apps/web/src/stores')

type CallHandler = (method: string, params: unknown) => Promise<unknown>

function fakeClient(handler: CallHandler): HbarClient {
  return { call: handler as HbarClient['call'] } as unknown as HbarClient
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function message(sessionId: string, id: string, seq: number): Message {
  return {
    id,
    sessionId,
    runId: `run-${sessionId}`,
    role: 'user',
    content: [{ type: 'text', text: id }],
    seq,
    createdAt: seq,
  }
}

function snapshot(sessionId: string, sequences: number[], hasOlder = true): SessionSnapshot {
  const lastSequence = sequences.at(-1) ?? 0
  return {
    session: {
      id: sessionId,
      workspaceId: 'workspace-1',
      title: sessionId,
      archived: false,
      parentId: null,
      createdAt: 1,
      updatedAt: lastSequence,
      seq: lastSequence,
    },
    messages: sequences.map((seq) => message(sessionId, `message-${seq}`, seq)),
    runs: [],
    approvals: [],
    userInputs: [],
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    cursor: lastSequence,
    hasOlder,
    streams: [],
  }
}

function resetState() {
  useConnection.setState({ client: null, status: 'disconnected', host: null, error: '', url: 'http://hbar.test' })
  useSessions.setState({ snapshots: {}, loading: new Set() })
  useWorkbench.setState({ activeSession: '' })
}

test('ignores an older-page response from a replaced Host connection', async () => {
  resetState()
  const sessionId = 'stale-host-session'
  const initial = snapshot(sessionId, [5, 6])
  const pending = deferred<SessionSnapshot>()
  const firstConnection = fakeClient(async () => pending.promise)
  useConnection.setState({ client: firstConnection, status: 'connected' })
  useSessions.setState({ snapshots: { [sessionId]: initial } })
  useWorkbench.setState({ activeSession: sessionId })

  const request = loadOlder(sessionId)
  const replacement = fakeClient(async () => snapshot(sessionId, [1, 2], false))
  useConnection.setState({ client: replacement, status: 'connected' })
  pending.resolve(snapshot(sessionId, [1, 2], false))
  await request

  expect(useSessions.getState().snapshots[sessionId]?.messages.map((item) => item.id)).toEqual([
    'message-5',
    'message-6',
  ])
})

test('deduplicates repeated older-page requests for the same session cursor', async () => {
  resetState()
  const sessionId = 'repeated-history-session'
  const initial = snapshot(sessionId, [5, 6])
  const first = deferred<SessionSnapshot>()
  let calls = 0
  const connection = fakeClient(async () => {
    calls += 1
    return first.promise
  })
  useConnection.setState({ client: connection, status: 'connected' })
  useSessions.setState({ snapshots: { [sessionId]: initial } })
  useWorkbench.setState({ activeSession: sessionId })

  const firstRequest = loadOlder(sessionId)
  const secondRequest = loadOlder(sessionId)
  expect(calls).toBe(1)
  first.resolve(snapshot(sessionId, [1, 2], false))
  await Promise.all([firstRequest, secondRequest])

  expect(useSessions.getState().snapshots[sessionId]?.messages.map((item) => item.id)).toEqual([
    'message-1',
    'message-2',
    'message-5',
    'message-6',
  ])
  expect(useSessions.getState().snapshots[sessionId]?.hasOlder).toBe(false)
})
