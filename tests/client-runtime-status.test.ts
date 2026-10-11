import { expect, test } from 'bun:test'
import { RuntimeStatusClient } from '@hbar/client'
import type { RuntimeSnapshot, RuntimeWatchResult } from '@hbar/contracts/runtime'

const snapshot = (revision: number, instanceId = 'runtime-client'): RuntimeSnapshot => ({ revision, instanceId, ready: true, units: [], preparedArtifactSets: [] })
const reset = (revision: number, instanceId?: string): RuntimeWatchResult => ({ revision, snapshot: snapshot(revision, instanceId), events: [], reset: true })

test('a live publication before the watch reply is already covered by its snapshot; duplicates do not advance an applied cursor', async () => {
  let respond!: (value: RuntimeWatchResult) => void, stopped = 0
  const client = new RuntimeStatusClient({ watch: () => new Promise(resolve => { respond = resolve }), unwatch: async () => { stopped++ } })
  client.connection('runtime-client')
  const dispose = client.subscribe(() => {})
  await Bun.sleep(0)
  client.receive({ revision: 1, instanceId: 'runtime-client', ready: false, units: [], operations: [] })
  respond(reset(1)); await client.refresh()
  expect(client.state().snapshot?.revision).toBe(1)
  client.receive({ revision: 2, instanceId: 'runtime-client', ready: false, units: [], operations: [] })
  client.receive({ revision: 2, instanceId: 'runtime-client', ready: true, units: [], operations: [] })
  expect(client.state().snapshot).toMatchObject({ revision: 2, ready: false })
  dispose(); expect(stopped).toBe(1)
})

test('gaps recover from the continuous applied cursor and reconnection to the same Host retains that cursor', async () => {
  const cursors: Array<number | undefined> = []
  const client = new RuntimeStatusClient({ watch: async cursor => {
    cursors.push(cursor)
    return cursor === undefined ? reset(1) : { revision: 3, snapshot: null, reset: false, events: [2, 3].filter(revision => revision > cursor).map(revision => ({ revision, instanceId: 'runtime-client', units: [], operations: [] })) }
  }, unwatch: async () => {} })
  client.connection('runtime-client')
  const dispose = client.subscribe(() => {})
  await client.refresh()
  client.receive({ revision: 3, instanceId: 'runtime-client', units: [], operations: [] })
  await client.refresh()
  expect(client.state().snapshot?.revision).toBe(3)
  expect(cursors.slice(0, 2)).toEqual([undefined, 1])
  client.connection(null); client.connection('runtime-client'); await client.refresh()
  expect(cursors.at(-1)).toBe(3)
  dispose()
})

test('an expired replay window uses a new snapshot and a reply from an earlier connection cannot replace it', async () => {
  let first!: (value: RuntimeWatchResult) => void, reads = 0
  const client = new RuntimeStatusClient({ watch: () => {
    reads++
    return reads === 1 ? new Promise(resolve => { first = resolve }) : Promise.resolve(reset(90, 'new-runtime'))
  }, unwatch: async () => {} })
  client.connection('runtime-client')
  const dispose = client.subscribe(() => {})
  await Bun.sleep(0)
  client.connection(null); client.connection('new-runtime'); await client.refresh()
  first(reset(1)); await Bun.sleep(0)
  expect(client.state().snapshot).toMatchObject({ instanceId: 'new-runtime', revision: 90 })
  dispose()
})

test('a transient observer failure keeps the applied cursor and other subscribers still see the recovery', async () => {
  const cursors: Array<number | undefined> = [], seen: number[] = []
  let failed = false
  const client = new RuntimeStatusClient({ watch: async cursor => {
    cursors.push(cursor)
    return cursor === undefined ? reset(1) : { revision: 2, reset: false, snapshot: null, events: [{ revision: 2, instanceId: 'runtime-client', units: [], operations: [] }] }
  }, unwatch: async () => {} })
  client.connection('runtime-client')
  const bad = client.subscribe(state => { if (state.snapshot?.revision === 2 && !failed) { failed = true; throw new Error('Injected projection observer failure') } })
  const good = client.subscribe(state => { if (state.snapshot) seen.push(state.snapshot.revision) })
  await client.refresh()
  client.receive({ revision: 2, instanceId: 'runtime-client', units: [], operations: [] })
  await client.refresh()
  expect(cursors.at(-1)).toBe(1)
  expect(client.state().snapshot?.revision).toBe(2)
  expect(seen).toContain(2)
  bad(); good()
})

test('an oversized live backlog discards its gap through a bounded snapshot recovery rather than applying an incomplete stream', async () => {
  let respond!: (value: RuntimeWatchResult) => void, reads = 0
  const client = new RuntimeStatusClient({ watch: () => {
    reads++
    return reads === 1 ? new Promise(resolve => { respond = resolve }) : Promise.resolve(reset(100))
  }, unwatch: async () => {} })
  client.connection('runtime-client')
  const dispose = client.subscribe(() => {})
  await Bun.sleep(0)
  for (let revision = 1; revision <= 90; revision++) client.receive({ revision, instanceId: 'runtime-client', units: [], operations: [] })
  respond(reset(1)); await client.refresh(); await client.refresh()
  expect(client.state().snapshot?.revision).toBe(100)
  expect(reads).toBe(2)
  dispose()
})
