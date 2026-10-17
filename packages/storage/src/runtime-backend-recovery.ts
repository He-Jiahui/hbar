import type { Database } from 'bun:sqlite'
import { z } from 'zod'

const identity = z.string().min(1).max(160)
const cursorSchema = z.strictObject({ after: identity, through: identity })
const itemSchema = z.strictObject({ recoveryId: identity, predecessorRunId: identity })

export const runtimeBackendRecoveryPageInputSchema = z.strictObject({
  cursor: cursorSchema.optional(),
  limit: z.number().int().min(1).max(64).default(32),
})
export const runtimeBackendRecoveryPageSchema = z.strictObject({
  items: z.array(itemSchema).max(64),
  nextCursor: cursorSchema.nullable(),
})
export type RuntimeBackendRecoveryCursor = z.infer<typeof cursorSchema>
export type RuntimeBackendRecoveryPageInput = z.input<typeof runtimeBackendRecoveryPageInputSchema>
export type RuntimeBackendRecoveryPage = z.infer<typeof runtimeBackendRecoveryPageSchema>

/** Scan a bounded identity window first; filtering must not turn LIMIT into an unbounded search. */
export function createRuntimeBackendRecoveryPage(db: Database) {
  return (value: RuntimeBackendRecoveryPageInput): RuntimeBackendRecoveryPage => {
    const { cursor, limit } = runtimeBackendRecoveryPageInputSchema.parse(value)
    return db.transaction(() => {
      let through = cursor?.through
      if (through === undefined) {
        const ceiling = db.prepare<{ predecessorRunId: string }, []>(
          'SELECT predecessorRunId FROM runtime_recovery ORDER BY predecessorRunId DESC LIMIT 1',
        )
        try {
          through = ceiling.get()?.predecessorRunId
        } finally {
          ceiling.finalize()
        }
      }
      if (through === undefined) return { items: [], nextCursor: null }
      const after = cursor?.after ?? ''
      const window = db.prepare<{ predecessorRunId: string }, [string, string, number]>(
        `SELECT predecessorRunId FROM runtime_recovery
         WHERE predecessorRunId>? AND predecessorRunId<=? ORDER BY predecessorRunId LIMIT ?`,
      )
      try {
        const rows = window.all(after, through, limit + 1)
        const scanned = rows.slice(0, limit)
        const last = scanned.at(-1)?.predecessorRunId
        if (last === undefined) return { items: [], nextCursor: null }
        const eligible = db.prepare<{ recoveryId: string; predecessorRunId: string }, [string, string, number]>(
          `SELECT recoveryId,predecessorRunId FROM runtime_recovery
           WHERE predecessorRunId>? AND predecessorRunId<=?
             AND json_extract(recordJson,'$.chain.status')='waiting'
             AND json_extract(recordJson,'$.chain.reasonCode')='BACKEND_AUTOMATION_DISABLED'
             AND json_type(recordJson,'$.run')='null'
             AND json_type(recordJson,'$.manual') IS NULL
           ORDER BY predecessorRunId LIMIT ?`,
        )
        try {
          return runtimeBackendRecoveryPageSchema.parse({
            items: eligible.all(after, last, limit),
            nextCursor: rows.length > limit ? { after: last, through } : null,
          })
        } finally {
          eligible.finalize()
        }
      } finally {
        window.finalize()
      }
    })()
  }
}
