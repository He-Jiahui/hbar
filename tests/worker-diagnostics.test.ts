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
