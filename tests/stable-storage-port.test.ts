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
