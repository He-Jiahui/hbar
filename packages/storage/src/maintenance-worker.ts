import { parentPort, workerData } from 'node:worker_threads'
import { z } from 'zod'
import { runChatDatabaseVacuum } from './chat-database-vacuum'

const input = z
  .strictObject({
    path: z.string(),
    sessionsRoot: z.string(),
    operationId: z.string(),
    mode: z.enum(['run', 'verify']),
    flags: z.instanceof(SharedArrayBuffer),
  })
  .parse(workerData)
void runChatDatabaseVacuum(input).then(
  (record) => {
    parentPort?.postMessage({ ok: true, record })
    parentPort?.close()
  },
  (reason: unknown) => {
    parentPort?.postMessage({
      ok: false,
      code: 'DATABASE_WORKER_FAILED',
      error: reason instanceof Error ? reason.message : String(reason),
    })
    parentPort?.close()
  },
)
