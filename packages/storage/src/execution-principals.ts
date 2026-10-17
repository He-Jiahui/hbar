import type { Database } from 'bun:sqlite'
import { z } from 'zod'
import { HbarError, idSchema } from '@hbar/contracts'
import { runCommandRecordSchema } from '@hbar/contracts/commands/run'
import { executionPrincipalSchema, type ExecutionPrincipal } from '@hbar/contracts/execution-principal'

const eventSchema = z.object({
  sessionId: idSchema,
  runId: idSchema.nullable(),
  type: z.string(),
  data: z.string(),
  seq: z.number(),
})
type PrincipalEvent = z.infer<typeof eventSchema>
export const EXECUTION_PRINCIPAL_INDEX = `CREATE INDEX IF NOT EXISTS events_original_run_principal
  ON events(sessionId,type,seq DESC) WHERE type IN ('run.queued','run.recoveryQueued')
  AND json_extract(data,'$.run.input.delegatedDecision') IS NULL;`

/** Indexed journal reads: at most three candidate records, or 32 legacy recovery predecessors. */
export function createExecutionPrincipalStorage(db: Database) {
  const columns = 'sessionId,runId,type,data,seq'
  const runEvent = db.query(
    `SELECT ${columns} FROM events WHERE runId=? AND type IN ('run.queued','run.recoveryQueued') ORDER BY seq LIMIT 1`,
  )
  const latest = db.query(`SELECT ${columns} FROM events WHERE sessionId=? AND type=? ORDER BY seq DESC LIMIT 1`)
  const original = db.query(`SELECT ${columns} FROM events WHERE sessionId=? AND type=?
    AND type IN ('run.queued','run.recoveryQueued') AND json_extract(data,'$.run.input.delegatedDecision') IS NULL
    ORDER BY seq DESC LIMIT 1`)
  const owner = db.query<{ sessionId: string }, [string]>('SELECT sessionId FROM runs WHERE id=?')
  function decode(event: PrincipalEvent, visited: Set<string>): ExecutionPrincipal | null {
    const value = z.record(z.string(), z.unknown()).parse(JSON.parse(event.data) as unknown)
    if (value.executionPrincipal !== undefined)
      return value.executionPrincipal === null ? null : executionPrincipalSchema.parse(value.executionPrincipal)
    const manual = z.object({ command: runCommandRecordSchema }).safeParse(value.manual)
    const command = value.command ?? (manual.success ? manual.data.command : undefined)
    if (command !== undefined && event.runId) {
      const parsed = runCommandRecordSchema.parse(command)
      return { version: 1, actorId: parsed.actorId, originSessionId: event.sessionId, originRunId: event.runId }
    }
    if (event.type === 'run.recoveryQueued' && typeof value.predecessorRunId === 'string')
      return readRun(value.predecessorRunId, visited, event.sessionId)
    return null
  }
  function readRun(runId: string, visited: Set<string>, expectedSessionId?: string): ExecutionPrincipal | null {
    idSchema.parse(runId)
    if (visited.has(runId) || visited.size >= 32)
      throw new HbarError('EXECUTION_PRINCIPAL_LINEAGE', 'Execution principal recovery lineage is cyclic or too deep')
    visited.add(runId)
    const run = owner.get(runId)
    if (!run || (expectedSessionId !== undefined && run.sessionId !== expectedSessionId))
      throw new HbarError(
        'EXECUTION_PRINCIPAL_SOURCE',
        'Execution principal source Run is unavailable or belongs to another session',
      )
    const row = runEvent.get(runId)
    if (!row) throw new HbarError('RUN_JOURNAL_MISSING', 'Execution principal requires the canonical Run acceptance')
    const event = eventSchema.parse(row)
    if (event.sessionId !== run.sessionId || event.runId !== runId)
      throw new HbarError(
        'EXECUTION_PRINCIPAL_SOURCE',
        'Run acceptance identity does not match its execution principal',
      )
    return decode(event, visited)
  }
  return {
    run: (runId: string): ExecutionPrincipal | null => readRun(runId, new Set()),
    session(sessionId: string): ExecutionPrincipal | null {
      idSchema.parse(sessionId)
      const rows = ['session.created', 'run.queued', 'run.recoveryQueued']
        .flatMap((type) => {
          const row = (type === 'session.created' ? latest : original).get(sessionId, type)
          return row ? [eventSchema.parse(row)] : []
        })
        .sort((left, right) => right.seq - left.seq)
      const event = rows[0]
      return event ? decode(event, new Set()) : null
    },
  }
}
