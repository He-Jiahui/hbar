import { expect, test } from 'bun:test'
import type { RpcResults, SessionEvent } from '@hbar/contracts'
import { createActivityModel } from '../apps/web/src/activity-model'

function event(seq: number): SessionEvent {
  return {
    eventId: `event-${seq}`,
    sessionId: 'session',
    runId: null,
    stepId: null,
    seq,
    type: 'test.event',
    data: { seq },
    time: seq,
    version: 1,
  }
}
function result(events: SessionEvent[], cursor = events.at(-1)?.seq ?? 0): RpcResults['session.follow'] {
  return { events, cursor, streams: [], reset: false }
}

test('trace requests coalesce and merge by stable event IDs without switching selected objects', async () => {
  const source = {},
    pending: Array<{ cursor: number; resolve: (value: RpcResults['session.follow']) => void }> = []
  const model = createActivityModel({
    identity: () => source,
    resetError: () => 'History changed',
    follow: (_, cursor) => new Promise((resolve) => pending.push({ cursor, resolve })),
  })
  const first = model.load('session', 2)
  const second = model.load('session', 4)
  expect(pending).toHaveLength(1)
  pending[0]!.resolve(result([event(1), event(2)]))
  await Promise.resolve()
  await Promise.resolve()
  expect(pending[1]?.cursor).toBe(2)
  model.select('session', 'event-1')
  pending[1]!.resolve(result([event(2), event(3), event(4)]))
  await Promise.all([first, second])
  expect(model.store.getState().traces.session?.events).toHaveLength(4)
  expect(model.store.getState().traces.session?.selectedId).toBe('event-1')
  model.select('session', 'removed')
  expect(model.store.getState().traces.session?.selectedId).toBeUndefined()
})

test('trace retention is bounded and an evicted selected event is cleared', async () => {
  const source = {}
  let newest = 2000
  const model = createActivityModel({
    identity: () => source,
    resetError: () => 'History changed',
    follow: async (_, cursor) =>
      result(Array.from({ length: newest - cursor }, (_, index) => event(cursor + index + 1))),
  })
  await model.load('session', 0)
  model.select('session', 'event-1')
  newest = 2100
  await model.load('session', newest)
  const trace = model.store.getState().traces.session
  expect(trace?.events).toHaveLength(2000)
  expect(trace?.events[0]?.seq).toBe(101)
  expect(trace?.selectedId).toBeUndefined()
  expect(trace?.partial).toBe(true)
})

test('reset reloads a recent window, errors remain retryable, and replaced hosts reject old results', async () => {
  let source: object = {},
    count = 0
  const cursors: number[] = []
  const model = createActivityModel({
    identity: () => source,
    resetError: () => 'History changed',
    follow: async (_, cursor) => {
      cursors.push(cursor)
      count++
      if (count === 1) return { ...result([], 900), reset: true }
      if (count === 2) throw new Error('Transient')
      return result([event(900)])
    },
  })
  await model.load('session', 10)
  expect(cursors).toEqual([0, 700])
  expect(model.store.getState().traces.session?.error).toBe('Transient')
  await model.load('session', 900)
  expect(model.store.getState().traces.session?.events[0]?.seq).toBe(900)
  expect(model.store.getState().traces.session?.error).toBeUndefined()
  const old = model.load('session', 901)
  const before = model.store.getState().traces.session
  source = {}
  await old
  expect(model.store.getState().traces.session).toBe(before)
})
