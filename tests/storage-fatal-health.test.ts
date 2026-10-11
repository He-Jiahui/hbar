import { expect, test } from 'bun:test'
import type { DiagnosticEvent } from '@hbar/contracts'
import { Storage, type StorageFatalEvent, type StorageLifecycleOptions } from '@hbar/storage'
import { fileURLToPath } from 'node:url'

function fixture(name: string, lifecycle?: StorageLifecycleOptions): Storage {
  const original = process.env.HBAR_STORAGE_WORKER
  process.env.HBAR_STORAGE_WORKER = fileURLToPath(new URL('./fixtures/storage-lifecycle-worker.ts', import.meta.url))
  try {
    return new Storage(name, undefined, lifecycle)
  } finally {
    if (original === undefined) delete process.env.HBAR_STORAGE_WORKER
    else process.env.HBAR_STORAGE_WORKER = original
  }
}

test('Storage reports one fatal timeout with unknown outcome and never replays the request', async () => {
  const events: StorageFatalEvent[] = []
  const storage = fixture('silent.sqlite', { requestTimeoutMs: 100 })
  storage.onFatal?.((event) => events.push(event))
  const result = await storage.call('ready').catch((error: unknown) => error)
  expect(result).toMatchObject({ code: 'STORAGE_TIMEOUT' })
  expect(events).toHaveLength(1)
  expect(events[0]).toMatchObject({ kind: 'timeout', code: 'STORAGE_TIMEOUT', method: 'ready' })
  expect(await storage.call('ready').catch((error: unknown) => error)).toMatchObject({ code: 'STORAGE_CLOSED' })
  await storage.close()
})

test('normal Storage close does not emit a fatal lifecycle event', async () => {
  const events: StorageFatalEvent[] = []
  const diagnostics: DiagnosticEvent[] = []
  const storage = fixture('reply.sqlite', { requestTimeoutMs: 250, closeTimeoutMs: 250 })
  storage.onFatal?.((event) => events.push(event))
  const withDiagnostics = fixture('reply-diagnostics.sqlite', {
    requestTimeoutMs: 250,
    closeTimeoutMs: 250,
    diagnostics: { emit: (event) => diagnostics.push(event) },
  })
  await storage.call('ready')
  await storage.close()
  await withDiagnostics.call('ready')
  await withDiagnostics.close()
  expect(events).toEqual([])
  expect(
    diagnostics.some(
      (event) => event.event === 'storage.close' && event.level === 'info' && event.outcome === 'success',
    ),
  ).toBe(true)
})
