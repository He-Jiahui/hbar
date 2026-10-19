import { afterEach, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { HbarError } from '@hbar/contracts'
import { Storage } from '@hbar/storage'

// Actual Worker threads, synthetic close protocol. No SQLite/native process exit claim.
const owned: { storage: Storage; expectedCloseFailure?: string }[] = []
function fixture(name: string, expectedCloseFailure?: string): Storage {
  const storage = new Storage(name, undefined, {
    workerPath: fileURLToPath(new URL('./fixtures/storage-lifecycle-worker.ts', import.meta.url)),
    requestTimeoutMs: 250,
    closeTimeoutMs: 100,
  })
  owned.push({ storage, ...(expectedCloseFailure ? { expectedCloseFailure } : {}) })
  return storage
}
afterEach(async () => {
  const failures: unknown[] = []
  for (const entry of owned.splice(0)) {
    try {
      await entry.storage.close()
    } catch (error) {
      if (!(error instanceof HbarError) || error.code !== entry.expectedCloseFailure) failures.push(error)
    }
  }
  if (failures.length)
    throw new AggregateError(failures, 'Storage idle protocol cleanup failed', { cause: failures[0] })
})

test('closeIdle cannot return a clean checkpoint when the Worker never acknowledges close', async () => {
  const storage = fixture('silent-close.sqlite', 'STORAGE_TIMEOUT')
  await storage.call('ready')
  let resolved = false
  let failure: unknown
  try {
    await storage.closeIdle()
    resolved = true
  } catch (error) {
    failure = error
  }
  expect(resolved).toBe(false)
  expect(failure).toMatchObject({ code: 'STORAGE_TIMEOUT' })
  // The same failed physical cleanup remains retained, rather than a new close/replay attempt.
  const first = storage.close()
  expect(storage.close()).toBe(first)
  expect(await first.catch((error: unknown) => error)).toMatchObject({ code: 'STORAGE_TIMEOUT' })
  expect(await storage.closeIdle().catch((error: unknown) => error)).toMatchObject({ code: 'STORAGE_IDLE_BUSY' })
  expect(await storage.call('ready').catch((error: unknown) => error)).toMatchObject({ code: 'STORAGE_CLOSED' })
})

test('closeIdle refuses an actually pending Worker request without taking the close boundary', async () => {
  const storage = fixture('silent.sqlite')
  // call synchronously registers the pending request before closeIdle is invoked.
  const pending = storage.call('ready').catch((error: unknown) => error)
  let resolved = false
  let failure: unknown
  try {
    await storage.closeIdle()
    resolved = true
  } catch (error) {
    failure = error
  }
  expect(resolved).toBe(false)
  expect(failure).toMatchObject({ code: 'STORAGE_IDLE_BUSY' })
  expect(await pending).toMatchObject({ code: 'STORAGE_TIMEOUT' })
  await storage.close()
})

test('closeIdle cannot borrow a concurrent general close as its own clean checkpoint', async () => {
  const storage = fixture('silent-close.sqlite', 'STORAGE_TIMEOUT')
  await storage.call('ready')
  const closing = storage.close().catch((error: unknown) => error)
  let resolved = false
  let failure: unknown
  try {
    await storage.closeIdle()
    resolved = true
  } catch (error) {
    failure = error
  }
  expect(resolved).toBe(false)
  expect(failure).toMatchObject({ code: 'STORAGE_IDLE_BUSY' })
  expect(await closing).toMatchObject({ code: 'STORAGE_TIMEOUT' })
})
