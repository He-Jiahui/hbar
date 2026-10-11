import { expect, test } from 'bun:test'
import type { RuntimeSnapshot, RuntimeDelta } from '@hbar/contracts/runtime'
import { RuntimeStatusFeed } from '../apps/host/src/runtime-status-feed'

test('one cursor joins admission changes and unit updates, and a quiet feed publishes no repeated state', () => {
  let snapshot: RuntimeSnapshot = { instanceId: 'status-host', revision: 99, ready: true, units: [], preparedArtifactSets: [] }
  const feed = new RuntimeStatusFeed(() => snapshot)
  const initial = feed.watch()
  expect(initial).toMatchObject({ reset: true, revision: 1, snapshot: { revision: 1, ready: true }, events: [] })
  const updates: RuntimeDelta[] = []
  const dispose = feed.subscribe(delta => updates.push(delta))
  feed.refresh(); feed.snapshot(); feed.refresh()
  expect(updates).toHaveLength(0)
  snapshot = { ...snapshot, ready: false }
  feed.refresh()
  feed.accept({ revision: 800, units: [], operations: [] })
  expect(updates.map(delta => delta.revision)).toEqual([2, 3])
  expect(feed.watch(initial.revision)).toMatchObject({ reset: false, revision: 3, snapshot: null, events: [{ revision: 2, ready: false }, { revision: 3 }] })
  dispose(); feed.close()
})

test('an expired or future cursor receives one controlled snapshot, while live subscribers continue after another observer throws', () => {
  const snapshot: RuntimeSnapshot = { instanceId: 'status-window', revision: 0, ready: true, units: [], preparedArtifactSets: [] }
  const feed = new RuntimeStatusFeed(() => snapshot)
  feed.watch()
  let delivered = 0
  feed.subscribe(() => { throw new Error('Observer failure') })
  feed.subscribe(() => { delivered++ })
  for (let index = 0; index < 70; index++) feed.accept({ revision: index + 1, units: [], operations: [] })
  expect(delivered).toBe(70)
  expect(feed.watch(1)).toMatchObject({ reset: true, revision: 71, events: [], snapshot: { instanceId: 'status-window', revision: 71 } })
  expect(feed.watch(90)).toMatchObject({ reset: true, events: [] })
  expect(feed.watch(7).events).toHaveLength(64)
  expect(feed.watch(71)).toMatchObject({ reset: false, events: [], snapshot: null })
  feed.close()
})

test('a subscription established before its snapshot can safely discard the live publication already included in that snapshot', () => {
  const snapshot: RuntimeSnapshot = { instanceId: 'status-race', revision: 0, ready: false, units: [], preparedArtifactSets: [] }
  const feed = new RuntimeStatusFeed(() => snapshot)
  const received: RuntimeDelta[] = []
  const dispose = feed.subscribe(delta => received.push(delta))
  const watch = feed.watch()
  expect(received).toHaveLength(1)
  expect(received[0]?.revision).toBe(watch.snapshot?.revision)
  expect(received.filter(delta => delta.revision > watch.revision)).toHaveLength(0)
  dispose(); feed.close()
})

test('an asynchronous observer rejection stays local and does not reject snapshot reads or other subscriptions', async () => {
  const snapshot: RuntimeSnapshot = { instanceId: 'status-async', revision: 0, ready: true, units: [], preparedArtifactSets: [] }
  const feed = new RuntimeStatusFeed(() => snapshot)
  let delivered = 0
  feed.subscribe(async () => { throw new Error('Injected rejected observer') })
  feed.subscribe(() => { delivered++ })
  expect(feed.watch().snapshot?.ready).toBe(true)
  await Bun.sleep(0)
  feed.accept({ revision: 2, units: [], operations: [] })
  await Bun.sleep(0)
  expect(delivered).toBe(2)
  expect(feed.snapshot().revision).toBe(2)
  feed.close()
})
