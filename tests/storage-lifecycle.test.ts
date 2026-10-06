import { expect, test } from 'bun:test'
import { Storage, type StorageLifecycleOptions } from '@hbar/storage'
import { fileURLToPath } from 'node:url'

function fixture(name: string, lifecycle?: StorageLifecycleOptions) {
  const original = process.env.HBAR_STORAGE_WORKER
  process.env.HBAR_STORAGE_WORKER = fileURLToPath(new URL('./fixtures/storage-lifecycle-worker.ts', import.meta.url))
  try {
    return new Storage(name, undefined, lifecycle)
  } finally {
    if (original === undefined) delete process.env.HBAR_STORAGE_WORKER
    else process.env.HBAR_STORAGE_WORKER = original
  }
}

test('an unexpectedly exited Storage worker rejects its pending request instead of leaving it unresolved', async () => {
  const storage = fixture('exit.sqlite')
  const outcome = await Promise.race([
    storage.call('ready').catch((error: unknown) => error),
    Bun.sleep(500).then(() => 'unresolved'),
  ])
  expect(outcome).toMatchObject({ code: 'STORAGE_WORKER_EXITED' })
  await storage.close()
})

test('unresponsive requests reject all pending work and terminate their worker without a replay', async () => {
  const storage = fixture('silent.sqlite', { requestTimeoutMs: 250 })
  const outcomes = await Promise.all([
    storage.call('ready').catch((error: unknown) => error),
    storage.call('ready').catch((error: unknown) => error),
  ])
  for (const outcome of outcomes) expect(outcome).toMatchObject({ code: 'STORAGE_TIMEOUT' })
  await storage.close()
  expect(await storage.call('ready').catch((error: unknown) => error)).toMatchObject({ code: 'STORAGE_CLOSED' })
})

test('a crashing Storage worker rejects pending work and remains closable', async () => {
  const storage = fixture('crash.sqlite')
  expect(await storage.call('ready').catch((error: unknown) => error)).toMatchObject({ code: 'STORAGE_WORKER_FAILED' })
  await storage.close()
})

test('a stalled close handshake still terminates the worker and concurrent close callers share the failure', async () => {
  const storage = fixture('silent-close.sqlite', { requestTimeoutMs: 1_000, closeTimeoutMs: 100 })
  await storage.call('ready')
  const first = storage.close()
  const second = storage.close()
  expect(second).toBe(first)
  expect(await first.catch((error: unknown) => error)).toMatchObject({ code: 'STORAGE_TIMEOUT' })
  expect(await storage.call('ready').catch((error: unknown) => error)).toMatchObject({ code: 'STORAGE_CLOSED' })
})

test('normal replies cancel request timers, and closing rejects new work without a duplicate close handshake', async () => {
  const storage = fixture('reply.sqlite', { requestTimeoutMs: 1_000, closeTimeoutMs: 1_000 })
  await storage.call('ready')
  await storage.call('ready')
  const closed = storage.close()
  expect(storage.close()).toBe(closed)
  expect(await storage.call('ready').catch((error: unknown) => error)).toMatchObject({ code: 'STORAGE_CLOSED' })
  await closed
})

test('invalid lifecycle timeouts fail before spawning a Storage worker', () => {
  for (const value of [0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648]) {
    expect(() => fixture('reply.sqlite', { requestTimeoutMs: value })).toThrow(RangeError)
    expect(() => fixture('reply.sqlite', { closeTimeoutMs: value })).toThrow(RangeError)
  }
})
