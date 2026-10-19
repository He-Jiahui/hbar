import { parentPort, workerData } from 'node:worker_threads'
import { Database } from 'bun:sqlite'
import { existsSync } from 'node:fs'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { STORAGE_SCHEMA_VERSION } from './rpc-catalog'

// This private entry only decides whether installation migration is needed.
// Managed Storage still checks full integrity in both prepare and activate before opening its writer.
const input = z
  .strictObject({
    mode: z.literal('preflight'),
    path: z.string().min(1).max(4_000),
    sessionsRoot: z.string().min(1).max(4_000),
    operationId: z.string().min(1).max(160),
    flags: z.instanceof(SharedArrayBuffer).refine((value) => value.byteLength === 8),
    allowMigration: z.literal(false).optional(),
  })
  .parse(workerData)

try {
  if (existsSync(input.path)) {
    const database = new Database(input.path, { readonly: true, strict: true })
    try {
      database.exec('PRAGMA busy_timeout=5000')
      const version = z
        .object({ user_version: z.number().int().min(0).max(STORAGE_SCHEMA_VERSION) })
        .safeParse(database.query('PRAGMA user_version').get())
      if (!version.success || version.data.user_version !== STORAGE_SCHEMA_VERSION)
        throw new HbarError('RUNTIME_RESTART_REQUIRED', 'Startup schema requires the existing migration preflight')
    } finally {
      database.close()
    }
  }
  parentPort?.postMessage({ ok: true, prepared: true, schemaRevision: STORAGE_SCHEMA_VERSION })
} catch (reason) {
  parentPort?.postMessage({
    ok: false,
    code: reason instanceof HbarError ? reason.code : 'MAINTENANCE_PREFLIGHT_FAILED',
    error: reason instanceof Error ? reason.message : String(reason),
  })
} finally {
  parentPort?.close()
}
