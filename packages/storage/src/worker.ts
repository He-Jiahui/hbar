import { workerData, parentPort } from 'node:worker_threads'
import { createStorageWorkerDiagnostics } from './worker-diagnostics'
import {
  createStorageDatabase,
  storageDatabaseOptionsSchema,
  type StorageDatabaseStartupPhase,
} from './worker-database'
import type { StorageCall } from './types'

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
const database = createStorageDatabase(options, {
  diagnostics,
  onStartupPhase: (phase) => {
    startupPhase = phase
  },
})
port.on('message', (call: StorageCall) => port.postMessage(database.handle(call)))
