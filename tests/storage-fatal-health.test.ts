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
  const callbackEvents: StorageFatalEvent[] = []
  const storage = fixture('silent.sqlite', {
    requestTimeoutMs: 100,
    onFatal: (_error, event) => callbackEvents.push(event),
  })
  storage.onFatal?.((event) => events.push(event))
  const result = await storage.call('ready').catch((error: unknown) => error)
  expect(result).toMatchObject({ code: 'STORAGE_TIMEOUT' })
  expect(events).toHaveLength(1)
  const fatal = events[0]
  expect(fatal).toMatchObject({
    kind: 'timeout',
    code: 'STORAGE_TIMEOUT',
    method: 'ready',
    storageRequestId: 1,
    pendingCount: 1,
    workerState: 'failed',
    outcome: 'unknown',
  })
  if (!fatal || typeof fatal.durationMs !== 'number') throw new Error('Fatal timeout duration was not recorded')
  expect(fatal.durationMs).toBeGreaterThanOrEqual(0)
  expect(await storage.call('ready').catch((error: unknown) => error)).toMatchObject({ code: 'STORAGE_CLOSED' })
  expect(callbackEvents).toEqual(events)
  await storage.close()
})

test('Storage worker error and exit report a single pending request without exposing worker messages', async () => {
  for (const scenario of [
    { fixtureName: 'crash.sqlite', kind: 'worker-error', code: 'STORAGE_WORKER_FAILED' },
    { fixtureName: 'exit.sqlite', kind: 'worker-exit', code: 'STORAGE_WORKER_EXITED' },
  ] as const) {
    const events: StorageFatalEvent[] = []
    const storage = fixture(scenario.fixtureName, {
      requestTimeoutMs: 2_000,
      onFatal: (_error, event) => events.push(event),
    })
    const result = await storage.call('ready').catch((error: unknown) => error)
    await storage.close()
    expect(result).toMatchObject({ code: scenario.code })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: scenario.kind,
      code: scenario.code,
      method: 'ready',
      storageRequestId: 1,
      pendingCount: 1,
      workerState: 'failed',
      outcome: 'unknown',
    })
  }
})

test('Storage worker error and exit do not guess one request when several are pending', async () => {
  for (const scenario of [
    { fixtureName: 'crash.sqlite', kind: 'worker-error', code: 'STORAGE_WORKER_FAILED' },
    { fixtureName: 'exit.sqlite', kind: 'worker-exit', code: 'STORAGE_WORKER_EXITED' },
  ] as const) {
    const events: StorageFatalEvent[] = []
    const storage = fixture(scenario.fixtureName, {
      requestTimeoutMs: 2_000,
      onFatal: (_error, event) => events.push(event),
    })
    const results = await Promise.all(
      Array.from({ length: 2 }, () => storage.call('ready').catch((error: unknown) => error)),
    )
    await storage.close()
    expect(results).toHaveLength(2)
    for (const result of results) expect(result).toMatchObject({ code: scenario.code })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: scenario.kind,
      code: scenario.code,
      pendingCount: 2,
      workerState: 'failed',
      outcome: 'unknown',
    })
    expect(events[0]).not.toHaveProperty('storageRequestId')
    expect(events[0]).not.toHaveProperty('method')
  }
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
