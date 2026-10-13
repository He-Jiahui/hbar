import { Database } from 'bun:sqlite'
import { parentPort, workerData } from 'node:worker_threads'
import { z } from 'zod'

const input = z.strictObject({ path: z.string().min(1) }).parse(workerData)
const port = parentPort
if (!port) throw new Error('SQLite lock fixture requires a parent port')

let release: (() => void) | undefined
const released = new Promise<void>((resolve) => {
  release = resolve
})
port.on('message', (value: unknown) => {
  const message = z.strictObject({ type: z.literal('release') }).safeParse(value)
  if (message.success) release?.()
})

let database: Database | undefined
let transactionOpen = false
try {
  database = new Database(input.path, { create: false, strict: true })
  database.exec('PRAGMA busy_timeout=5000;')
  database.exec('BEGIN IMMEDIATE;')
  transactionOpen = true
  port.postMessage({ type: 'lock-acquired', atUtc: new Date().toISOString() })
  await released
  database.exec('COMMIT;')
  transactionOpen = false
  port.postMessage({ type: 'lock-released', atUtc: new Date().toISOString() })
} catch (error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code.replace(/[^A-Z0-9_]/gi, '_').slice(0, 64)
      : 'LOCK_FIXTURE_FAILED'
  port.postMessage({ type: 'lock-failed', code })
} finally {
  if (transactionOpen) {
    try {
      database?.exec('ROLLBACK;')
    } catch {
      // The fixture reports the original failure; its owner observes Worker exit.
    }
  }
  database?.close()
  port.close()
}
