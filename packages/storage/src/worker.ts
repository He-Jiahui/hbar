import { workerData, parentPort } from 'node:worker_threads'
import { createStorageWorkerDiagnostics } from './worker-diagnostics'
import {
  createStorageDatabaseAsync,
  storageDatabaseOptionsSchema,
  type StorageDatabaseStartupPhase,
} from './worker-database'
import type { StorageCall, StorageReply } from './types'

const options = storageDatabaseOptionsSchema.parse(workerData)
const port = parentPort
if (!port) throw new Error('Storage Worker requires a parent transport')
const diagnostics = createStorageWorkerDiagnostics({
  enabled: options.diagnosticsEnabled ?? options.diagnostics !== undefined,
  ...(options.diagnosticsFullCoverage === undefined ? {} : { fullCoverage: options.diagnosticsFullCoverage }),
  ...(options.instanceId === undefined ? {} : { instanceId: options.instanceId }),
  port,
})
let startupPhase: StorageDatabaseStartupPhase = 'open'
// Observe fatal initialization/runtime failures once per Worker, never per connection.
process.on('uncaughtExceptionMonitor', () => {
  diagnostics.emit({
    event: 'sqlite.worker_uncaught',
    phase: startupPhase,
    level: 'fatal',
    outcome: 'failure',
    errorCode: 'SQLITE_WORKER_UNCAUGHT',
    workerState: 'failed',
  })
})
const cancellation = new AbortController()
let closing = false
const initialization = createStorageDatabaseAsync(
  options,
  {
    diagnostics,
    onStartupPhase: (phase) => {
      startupPhase = phase
    },
  },
  cancellation.signal,
)
// The parent already bounds pending RPC requests. During bootstrap each request waits for the same owner.
port.on('message', (call: StorageCall) => {
  if (call.method === 'close') {
    closing = true
    cancellation.abort()
  }
  initialization
    .then(
      (database) =>
        port.postMessage(
          closing && call.method !== 'close'
            ? ({ id: call.id, ok: false, error: 'Storage is closed', code: 'STORAGE_CLOSED' } satisfies StorageReply)
            : database.handle(call),
        ),
      () => {
        if (!closing) return // The top-level await preserves the original fatal initialization error.
        port.postMessage(
          call.method === 'close'
            ? ({ id: call.id, ok: true, result: undefined } satisfies StorageReply)
            : ({ id: call.id, ok: false, error: 'Storage is closed', code: 'STORAGE_CLOSED' } satisfies StorageReply),
        )
      },
    )
    .catch((error: unknown) => {
      queueMicrotask(() => {
        throw error
      })
    })
})
try {
  await initialization
} catch (error) {
  if (!closing) throw error
  // The rejected initialization has joined its scan Workers and closed the SQLite connection before close ACK.
  diagnostics.emit({
    event: 'sqlite.startup_cancelled',
    phase: 'close',
    level: 'info',
    outcome: 'success',
    workerState: 'closed',
  })
}
