import { expect, test } from 'bun:test'
import { StableStoragePort, type ManagedStorageWriter, type StorageMethods } from '@hbar/storage'
import type { RuntimeOwner } from '@hbar/contracts/runtime'
function owner(generation: number): RuntimeOwner { return { unitId: 'storage', generation, incarnation: `storage-${generation}` } }
function deferred<Value>() {
  let resolve!: (value: Value) => void
  const promise = new Promise<Value>(done => { resolve = done })
  return { promise, resolve }
}
const outcome = (promise: Promise<unknown>) => promise.catch((error: unknown) => error)

test('lost reads do not create unknown write outcomes, while a dispatched write remains counted through fencing', async () => {
  const physical = deferred<unknown>(), port = new StableStoragePort(1000)
  port.install(writer(1, () => physical.promise))
  const read = port.call('getSetting', 'policy')
  const write = port.call('setSetting', 'policy', 'deny')
  expect(port.snapshot()).toMatchObject({ inFlight: 2 })
  expect(port.writeCallsInFlight).toBe(1)
  port.fence('STORAGE_RESULT_UNKNOWN')
  expect(port.snapshot()).toMatchObject({ phase: 'fenced', inFlight: 2 })
  expect(port.writeCallsInFlight).toBe(1)
  physical.resolve('deny'); await Promise.all([read, write])
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(port.snapshot()).toMatchObject({ inFlight: 0 })
  expect(port.writeCallsInFlight).toBe(0)
  await port.close()
})
function writer(generation: number, operate: () => Promise<unknown> = async () => undefined, retire: () => Promise<void> = async () => {}) {
  const value: ManagedStorageWriter = {
    owner: owner(generation),
    // The fixture's operation supplies each method's controlled response; production uses the validated RPC port.
    async call<K extends keyof StorageMethods>() { return await operate() as ReturnType<StorageMethods[K]> },
    retire,
  }
  return value
}

test('handover waits for accepted calls and confirmed exit, then routes waiting calls to the new writer', async () => {
  const accepted = deferred<unknown>(), exit = deferred<void>()
  let retirements = 0
  const port = new StableStoragePort(1000)
  port.install(writer(1, () => accepted.promise, () => { retirements++; return exit.promise }))
  const first = port.call('ready')
  const switchWriter = port.beginHandover()
  const waiting = port.call('ready')
  expect(port.snapshot()).toMatchObject({ phase: 'handover', inFlight: 1, queued: 1 })
  expect(retirements).toBe(0)
  accepted.resolve({ version: 24 })
  await first
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(retirements).toBe(1)
  expect(() => port.install(writer(2))).toThrow('old writer')
  exit.resolve()
  await switchWriter
  port.install(writer(2, async () => ({ version: 24 })))
  expect(await waiting).toEqual({ version: 24 })
  expect(port.snapshot().owner?.generation).toBe(2)
  await port.close()
})

test('a stuck transaction fences admission, never replays it, and retains its physical slot until completion', async () => {
  const physical = deferred<unknown>()
  let calls = 0
  const port = new StableStoragePort(25)
  port.install(writer(1, () => { calls++; return physical.promise }))
  const first = port.call('setSetting', 'key', 'value')
  const failure = await outcome(port.beginHandover())
  expect(failure).toMatchObject({ code: 'STORAGE_HANDOVER_TIMEOUT' })
  expect(port.snapshot()).toMatchObject({ phase: 'fenced', inFlight: 1 })
  expect(await outcome(port.call('setSetting', 'key', 'value'))).toMatchObject({ code: 'STORAGE_HANDOVER_TIMEOUT' })
  expect(() => port.reconcileExited(owner(1))).toThrow('reconciled')
  physical.resolve(undefined)
  await first
  await Promise.resolve()
  expect(calls).toBe(1)
  expect(() => port.install(writer(2))).toThrow('old writer')
  port.reconcileExited(owner(1))
  port.install(writer(2))
  await port.close()
})

test('uncertain writer exit leaves storage unwritable and does not enable a replacement', async () => {
  const port = new StableStoragePort(20)
  port.install(writer(1, undefined, () => new Promise(() => {})))
  expect(await outcome(port.beginHandover())).toMatchObject({ code: 'STORAGE_EXIT_UNCONFIRMED' })
  expect(port.snapshot().phase).toBe('fenced')
  expect(() => port.install(writer(2))).toThrow('old writer')
  expect(await outcome(port.close())).toMatchObject({ code: 'STORAGE_EXIT_UNCONFIRMED' })
  expect(port.snapshot().phase).toBe('closed')
})

test('admission is bounded to 64 physical and 256 waiting calls, with one captured target and payload', async () => {
  const physical = deferred<unknown>()
  const port = new StableStoragePort(1000)
  port.install(writer(1, () => physical.promise))
  const calls = Array.from({ length: 320 }, () => port.call('ready'))
  expect(port.snapshot()).toMatchObject({ inFlight: 64, queued: 256 })
  expect(await outcome(port.call('ready'))).toMatchObject({ code: 'STORAGE_CAPACITY' })
  physical.resolve({ version: 24 })
  await Promise.all(calls)
  expect(port.snapshot()).toMatchObject({ inFlight: 0, queued: 0, bufferedBytes: 0 })
  await port.close()
})

test('queued calls expire without dispatching and explicit close rejects waiting calls', async () => {
  const port = new StableStoragePort(20)
  expect(await outcome(port.call('ready'))).toMatchObject({ code: 'STORAGE_HANDOVER_TIMEOUT' })
  const pending = outcome(port.call('ready'))
  await port.close()
  expect(await pending).toMatchObject({ code: 'STORAGE_CLOSED' })
  expect(port.snapshot()).toMatchObject({ phase: 'closed', queued: 0, bufferedBytes: 0 })
  expect(() => port.install(writer(1))).toThrow('old writer')
})

test('maintenance drains calls and waits for Worker exit, keeps a single owner, and resumes queued calls only after verification', async () => {
  const accepted = deferred<unknown>(), suspending = deferred<void>(), joined = deferred<void>(), verified = deferred<void>()
  const events: string[] = []
  let calls = 0
  const port = new StableStoragePort(1_000)
  port.install({ ...writer(1, () => ++calls === 1 ? accepted.promise : Promise.resolve({ version: 24 })),
    suspend: async id => { events.push('suspend:' + id); suspending.resolve(); await joined.promise; events.push('joined') },
    resume: async id => { events.push('verify:' + id); await verified.promise; events.push('reopened') },
  })
  const first = port.call('ready'), maintenance = port.beginMaintenance('vacuum')
  const waiting = port.call('ready')
  expect(events).toEqual([])
  accepted.resolve({ version: 24 }); await first; await suspending.promise
  expect(events).toEqual(['suspend:vacuum'])
  expect(port.snapshot()).toMatchObject({ phase: 'handover', queued: 1, owner: owner(1) })
  expect(await outcome(port.beginHandover())).toMatchObject({ code: 'STORAGE_MAINTENANCE_ACTIVE' })
  joined.resolve(); await maintenance
  expect(await outcome(port.endMaintenance('another'))).toMatchObject({ code: 'STORAGE_RECONCILIATION_REQUIRED' })
  const end = port.endMaintenance('vacuum')
  expect(calls).toBe(1)
  verified.resolve(); await end
  expect(await waiting).toEqual({ version: 24 })
  expect(events).toEqual(['suspend:vacuum', 'joined', 'verify:vacuum', 'reopened'])
  expect(port.snapshot()).toMatchObject({ phase: 'serving', owner: owner(1), inFlight: 0 })
  await port.close()
})

test('unconfirmed maintenance Worker exit or failed reopen keeps admission fenced', async () => {
  const port = new StableStoragePort(20)
  port.install({ ...writer(1), suspend: async () => {}, resume: async () => { throw new Error('integrity') } })
  await port.beginMaintenance('vacuum')
  expect(await outcome(port.endMaintenance('vacuum'))).toMatchObject({ message: 'integrity' })
  expect(port.snapshot()).toMatchObject({ phase: 'fenced', reasonCode: 'STORAGE_INTEGRITY_UNKNOWN' })
  expect(await outcome(port.call('ready'))).toMatchObject({ code: 'STORAGE_INTEGRITY_UNKNOWN' })
  await port.close()
  const blocked = new StableStoragePort(20)
  blocked.install({ ...writer(1), suspend: () => new Promise(() => {}), resume: async () => {} })
  expect(await outcome(blocked.beginMaintenance('vacuum'))).toMatchObject({ code: 'STORAGE_EXIT_UNCONFIRMED' })
  expect(blocked.snapshot().phase).toBe('fenced')
  await blocked.close()
})
