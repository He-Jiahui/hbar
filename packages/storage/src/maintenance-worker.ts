import { parentPort, workerData } from 'node:worker_threads'
import { z } from 'zod'
import { runChatDatabaseVacuum } from './chat-database-vacuum'
import { Database } from 'bun:sqlite'
import { existsSync } from 'node:fs'
import { HbarError } from '@hbar/contracts'
import { STORAGE_SCHEMA_VERSION } from './rpc-catalog'
import { startupSettingsLayerSchema } from './startup-settings-contract'

const base = z.strictObject({
  path: z.string().min(1).max(4_000),
  sessionsRoot: z.string().min(1).max(4_000),
  operationId: z.string().min(1).max(160),
  flags: z.instanceof(SharedArrayBuffer).refine((value) => value.byteLength === 8),
})
const input = z
  .discriminatedUnion('mode', [
    base.extend({ mode: z.enum(['run', 'verify']) }),
    base.extend({ mode: z.literal('preflight'), allowMigration: z.boolean().optional() }),
    z.strictObject({ mode: z.literal('startup-settings'), path: z.string().min(1).max(4_000) }),
  ])
  .parse(workerData)
if (input.mode === 'startup-settings') {
  try {
    let layer: z.output<typeof startupSettingsLayerSchema> | null = null
    if (existsSync(input.path)) {
      const database = new Database(input.path, { readonly: true, strict: true })
      try {
        database.exec('PRAGMA busy_timeout=1000')
        const { user_version: version } = z
          .object({ user_version: z.number().int().min(0).max(STORAGE_SCHEMA_VERSION) })
          .parse(database.query('PRAGMA user_version').get())
        if (version >= 3) {
          const row = database
            .query(
              `SELECT id, kind, targetId, schemaVersion, revision,
            CASE WHEN length(CAST(valuesJson AS BLOB)) <= 1048576 THEN valuesJson ELSE NULL END AS valuesJson
            FROM settings_layers WHERE id = ? LIMIT 1`,
            )
            .get('settings:global')
          if (row) {
            const parsed = z
              .object({
                id: z.string(),
                kind: z.string(),
                targetId: z.null(),
                schemaVersion: z.number(),
                revision: z.number(),
                valuesJson: z.string().max(1_048_576),
              })
              .parse(row)
            const { valuesJson, ...metadata } = parsed
            layer = startupSettingsLayerSchema.parse({ ...metadata, values: JSON.parse(valuesJson) as unknown })
          }
        }
      } finally {
        database.close()
      }
    }
    parentPort?.postMessage({ ok: true, layer })
  } catch {
    parentPort?.postMessage({ ok: false, code: 'STARTUP_SETTINGS_INVALID' })
  } finally {
    parentPort?.close()
  }
} else if (input.mode === 'preflight') {
  try {
    if (existsSync(input.path)) {
      const database = new Database(input.path, { readonly: true, strict: true })
      try {
        database.exec('PRAGMA busy_timeout=5000')
        const version = z
          .object({ user_version: z.number().int().min(0).max(STORAGE_SCHEMA_VERSION) })
          .safeParse(database.query('PRAGMA user_version').get())
        if (!version.success || (!input.allowMigration && version.data.user_version !== STORAGE_SCHEMA_VERSION))
          throw new HbarError('RUNTIME_RESTART_REQUIRED', 'Maintenance Worker needs an incompatible schema migration')
        const integrity = z
          .object({ quick_check: z.literal('ok') })
          .safeParse(database.query('PRAGMA quick_check(1)').get())
        if (!integrity.success)
          throw new HbarError('STORAGE_INTEGRITY_UNKNOWN', 'Maintenance Worker cannot confirm database integrity')
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
} else
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
