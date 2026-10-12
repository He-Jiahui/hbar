import { expect, test } from 'bun:test'
import { diagnosticEventSchema } from '@hbar/contracts'
import {
  createStorageWorkerDiagnostics,
  type StorageWorkerDiagnosticMessage,
} from '../packages/storage/src/worker-diagnostics.ts'

test('SQLite worker diagnostics emit bounded operation facts and redact payloads', () => {
  const messages: StorageWorkerDiagnosticMessage[] = []
  const diagnostics = createStorageWorkerDiagnostics({
    fullCoverage: true,
    instanceId: 'worker-fixture',
    port: { postMessage: (message) => messages.push(message) },
  })
  diagnostics.emit({
    event: 'sqlite.configured',
    phase: 'configure',
    level: 'info',
    outcome: 'success',
    workerState: 'starting',
    sqliteVersion: '3.53.2',
    runtimeVersion: '1.4.0',
    databaseSchemaVersion: 23,
    userVersion: 23,
    journalMode: 'wal',
    synchronous: 2,
    busyTimeoutMs: 5_000,
    foreignKeys: true,
    pageSize: 4_096,
  })
  diagnostics.operation(7, 'ready', performance.now(), 'success')
  diagnostics.operation(8, 'setSecret', performance.now(), 'failure', {
    code: 'SQLITE_BUSY',
    message: 'secret and SQL must stay out',
  })

  expect(messages).toHaveLength(3)
  for (const message of messages) expect(diagnosticEventSchema.parse(message.event)).toEqual(message.event)
  expect(JSON.stringify(messages)).not.toContain('secret')
  expect(JSON.stringify(messages)).not.toContain('secret and SQL must stay out')
  expect(messages[2]?.event).toMatchObject({
    event: 'sqlite.request_failed',
    errorCode: 'SQLITE_BUSY',
    storageRequestId: 8,
  })
})

test('fast success sampling is bounded while failures are always retained', () => {
  const messages: StorageWorkerDiagnosticMessage[] = []
  const diagnostics = createStorageWorkerDiagnostics({
    port: { postMessage: (message) => messages.push(message) },
  })
  for (let id = 0; id < 32; id++) diagnostics.operation(id, 'read', performance.now(), 'success')
  diagnostics.operation(99, 'write', performance.now(), 'failure', new Error('private detail'))

  expect(messages).toHaveLength(3)
  expect(messages.map((message) => message.event.storageRequestId)).toEqual([15, 31, 99])
  expect(messages[2]?.event.errorCode).toBe('STORAGE_ERROR')
})

test('a failing diagnostic sink never changes the storage diagnostic path', () => {
  const diagnostics = createStorageWorkerDiagnostics({
    fullCoverage: true,
    port: {
      postMessage: () => {
        throw new Error('sink failed')
      },
    },
  })
  expect(() => diagnostics.operation(1, 'ready', performance.now(), 'failure', { code: 'SQLITE_IOERR' })).not.toThrow()
  expect(diagnostics.getDroppedCount()).toBe(1)
})

test('slow successes are retained and throwing error getters are isolated', () => {
  const messages: StorageWorkerDiagnosticMessage[] = []
  const diagnostics = createStorageWorkerDiagnostics({ port: { postMessage: (message) => messages.push(message) } })
  diagnostics.operation(1, 'slowRead', performance.now() - 101, 'success')
  const throwingError = Object.defineProperty({}, 'code', {
    get() {
      throw new Error('getter must not escape')
    },
  })
  expect(() => diagnostics.operation(2, 'failedRead', performance.now(), 'failure', throwingError)).not.toThrow()
  expect(messages).toHaveLength(2)
  expect(messages[0]?.event).toMatchObject({ event: 'sqlite.request_completed', level: 'warn', storageRequestId: 1 })
  expect(messages[1]?.event).toMatchObject({
    event: 'sqlite.request_failed',
    errorCode: 'STORAGE_ERROR',
    storageRequestId: 2,
  })
})

test('read phases retain their request owner, preserve results and expose the last started phase', () => {
  const messages: StorageWorkerDiagnosticMessage[] = []
  const diagnostics = createStorageWorkerDiagnostics({
    fullCoverage: true,
    port: { postMessage: (message) => messages.push(message) },
  })
  const value = { payload: 'private canary must not enter diagnostics' }
  expect(diagnostics.withOperation(41, 'snapshot', () => diagnostics.readPhase('messages', () => value))).toBe(value)
  expect(messages.map((message) => [message.event.event, message.event.phase, message.operationId])).toEqual([
    ['sqlite.read_phase_started', 'messages', 41],
    ['sqlite.read_phase_completed', 'messages', 41],
  ])
  for (const message of messages) {
    expect(diagnosticEventSchema.parse(message.event)).toEqual(message.event)
    expect(message.event).toMatchObject({ method: 'snapshot', storageRequestId: 41 })
  }
  expect(JSON.stringify(messages)).not.toContain(value.payload)
  expect(diagnostics.readPhase('usage', () => value)).toBe(value)
  expect(messages).toHaveLength(2)
})

test('bounded event-page diagnostics correlate selection/decode counts without payload content', () => {
  const messages: StorageWorkerDiagnosticMessage[] = []
  const diagnostics = createStorageWorkerDiagnostics({
    fullCoverage: true,
    port: { postMessage: (message) => messages.push(message) },
  })
  diagnostics.withOperation(52, 'readEventPage', () =>
    diagnostics.measuredReadPhase('event-page-decode', {
      sessionId: 'session-safe-id',
      anchorSeq: 400,
      cursorSeq: 120,
      durationMs: 2,
      recordsIn: 5,
      recordsOut: 3,
      bytesIn: 80,
      bytesOut: 240,
      memoryBytes: 32_000_000,
    }),
  )
  expect(messages).toHaveLength(1)
  expect(diagnosticEventSchema.parse(messages[0]?.event)).toMatchObject({
    event: 'sqlite.read_phase_completed',
    phase: 'event-page-decode',
    method: 'readEventPage',
    storageRequestId: 52,
    sessionId: 'session-safe-id',
    anchorSeq: 400,
    cursorSeq: 120,
    recordsIn: 5,
    recordsOut: 3,
    bytesIn: 80,
    bytesOut: 240,
    memoryBytes: 32_000_000,
  })
  expect(JSON.stringify(messages)).not.toContain('payload')
})

test('failed nested phases restore the outer owner without changing the thrown error', () => {
  const messages: StorageWorkerDiagnosticMessage[] = []
  const diagnostics = createStorageWorkerDiagnostics({
    fullCoverage: true,
    port: { postMessage: (message) => messages.push(message) },
  })
  const failure = Object.assign(new Error('private SQL and credentials'), { code: 'SQLITE_BUSY' })
  diagnostics.withOperation(42, 'snapshot', () => {
    expect(() =>
      diagnostics.withOperation(43, 'snapshot', () =>
        diagnostics.readPhase('context-history', () => {
          throw failure
        }),
      ),
    ).toThrow(failure)
    diagnostics.readPhase('runs', () => [])
  })
  expect(messages.map((message) => message.operationId)).toEqual([43, 43, 42, 42])
  expect(messages[1]?.event).toMatchObject({
    event: 'sqlite.read_phase_failed',
    errorCode: 'SQLITE_BUSY',
    outcome: 'failure',
  })
  expect(JSON.stringify(messages)).not.toContain('private SQL')
  const before = messages.length
  expect(diagnostics.readPhase('messages', () => 1)).toBe(1)
  expect(messages).toHaveLength(before)
})

test('phase diagnostics isolate a throwing sink and preserve failure identity', () => {
  const diagnostics = createStorageWorkerDiagnostics({
    fullCoverage: true,
    port: {
      postMessage: () => {
        throw new Error('sink failed')
      },
    },
  })
  const failure = new Error('original failure')
  expect(diagnostics.withOperation(44, 'snapshot', () => diagnostics.readPhase('usage', () => 7))).toBe(7)
  let caught: unknown
  try {
    diagnostics.withOperation(45, 'snapshot', () =>
      diagnostics.readPhase('messages', () => {
        throw failure
      }),
    )
  } catch (error) {
    caught = error
  }
  expect(caught).toBe(failure)
  expect(diagnostics.getDroppedCount()).toBe(4)
})
