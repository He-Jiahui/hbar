import type { DiagnosticEvent } from '@hbar/contracts'
import { parentPort, workerData } from 'node:worker_threads'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createPartitionLayout, partitionDatabasePath, assertPartitionPathSafe } from './partition-layout'
import { createStorageDatabase, type StorageDatabase } from './worker-database'
import { createStorageWorkerDiagnostics } from './worker-diagnostics'
import {
  poolRequestSchema,
  poolWorkerOptionsSchema,
  validatedStorageCall,
  type PoolResponse,
} from './partition-pool-protocol'

const options = poolWorkerOptionsSchema.parse(workerData)
const layout = createPartitionLayout(options.root)
function requireParentPort() {
  if (!parentPort) throw new Error('PARTITION_POOL_PARENT_REQUIRED')
  return parentPort
}
const port = requireParentPort()
const cache = new Map<string, { database: StorageDatabase; pins: number; used: number }>()
let clock = 0
let closing = false
let currentDiagnostics: ReturnType<typeof createStorageWorkerDiagnostics> | undefined
async function handle(raw: unknown): Promise<void> {
  const request = poolRequestSchema.parse(raw)
  const diagnostics: DiagnosticEvent[] = []
  let droppedDiagnostics = 0
  const sink = createStorageWorkerDiagnostics({
    enabled: options.diagnostics,
    fullCoverage: options.fullCoverage,
    port: {
      postMessage: (message) => {
        if (diagnostics.length < 32) diagnostics.push(message.event)
        else droppedDiagnostics++
      },
    },
  })
  const phase = (event: string): void =>
    sink.emit({
      event,
      phase: 'partition',
      level: 'debug',
      storageRequestId: request.id,
      method: request.kind === 'call' ? request.call.method : request.kind,
    })
  currentDiagnostics = sink
  phase('sqlite.pool_request_started')
  let response: { id: number; ok: true; result: unknown } | { id: number; ok: false; code: string }
  try {
    if (closing) throw new Error('PARTITION_POOL_CLOSED')
    if (request.kind === 'stats') {
      response = {
        id: request.id,
        ok: true,
        result: { connections: cache.size, pins: [...cache.values()].reduce((sum, entry) => sum + entry.pins, 0) },
      }
    } else if (request.kind === 'close') {
      closing = true
      for (const [key, entry] of cache) {
        entry.database.close()
        phase('sqlite.pool_connection_closed')
        cache.delete(key)
      }
      response = { id: request.id, ok: true, result: undefined }
    } else {
      const path = partitionDatabasePath(layout, options.generation, request.owner)
      let entry = cache.get(path)
      if (!entry) {
        if (request.kind === 'open' && request.pin < 0) throw new Error('PARTITION_POOL_NOT_PINNED')
        if (cache.size >= options.connections) {
          const oldest = [...cache]
            .filter(([, item]) => item.pins === 0)
            .sort((left, right) => left[1].used - right[1].used)
            .at(0)
          if (!oldest) throw new Error('PARTITION_POOL_CONNECTION_CAPACITY')
          oldest[1].database.close()
          phase('sqlite.pool_connection_evicted')
          cache.delete(oldest[0])
        }
        await assertPartitionPathSafe(layout, path, true)
        await mkdir(dirname(path), { recursive: true })
        await assertPartitionPathSafe(layout, path, true)
        const sessions = join(dirname(path), `${request.owner.kind}-${path.split(/[\\/]/).at(-1)}-sessions`)
        await assertPartitionPathSafe(layout, sessions, true)
        const database = createStorageDatabase(
          {
            path,
            sessions,
            settings: join(sessions, 'settings'),
            artifacts: join(sessions, 'artifacts'),
            cache: join(sessions, 'cache'),
            diagnostics: join(sessions, 'diagnostics'),
          },
          {
            diagnostics: createStorageWorkerDiagnostics({
              enabled: options.diagnostics,
              fullCoverage: options.fullCoverage,
              port: {
                postMessage: (message) => {
                  const { instanceId, ...event } = message.event
                  currentDiagnostics?.emit({ ...event, ...(instanceId === undefined ? {} : { instanceId }) })
                },
              },
            }),
          },
        )
        entry = { database, pins: 0, used: ++clock }
        cache.set(path, entry)
        phase('sqlite.pool_connection_opened')
      }
      entry.used = ++clock
      if (request.kind === 'open') {
        if (entry.pins + request.pin < 0) throw new Error('PARTITION_POOL_NOT_PINNED')
        entry.pins += request.pin
        response = { id: request.id, ok: true, result: undefined }
      } else {
        if (request.call.method === 'close') throw new Error('PARTITION_POOL_CLOSE_RESERVED')
        const result = entry.database.handle(validatedStorageCall(request.call))
        response = { id: request.id, ok: true, result }
      }
    }
  } catch (error: unknown) {
    const code =
      error instanceof Error && /^PARTITION_POOL_[A-Z_]+$/.test(error.message)
        ? error.message
        : 'PARTITION_POOL_OPERATION_FAILED'
    response = { id: request.id, ok: false, code }
  }
  phase(response.ok ? 'sqlite.pool_request_completed' : 'sqlite.pool_request_failed')
  currentDiagnostics = undefined
  port.postMessage({ ...response, diagnostics, droppedDiagnostics } satisfies PoolResponse)
  if (request.kind === 'close') port.close()
}
let tail = Promise.resolve()
port.on('message', (raw: unknown) => {
  tail = tail.then(() => handle(raw))
  tail.catch(() => {
    process.exitCode = 76
    port.close()
  })
})
