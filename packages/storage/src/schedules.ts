import type { Database } from 'bun:sqlite'
import { HbarError } from '@hbar/contracts'
import {
  scheduleCommands,
  scheduleDefinitionSchema,
  scheduleOccurrenceSchema,
} from '@hbar/contracts/commands/schedules'
import { createFeatureCommandReceipts, type FeatureWriteIdentity } from './feature-command-receipts'
import type {
  ScheduleCreateInput,
  ScheduleDefinition,
  ScheduleOccurrence,
  ScheduleUpdateInput,
} from '@hbar/contracts/commands/schedules'

export const SCHEDULES_SQL = `
CREATE TABLE IF NOT EXISTS schedules(id TEXT PRIMARY KEY, workspaceId TEXT NOT NULL REFERENCES workspaces(id), data TEXT NOT NULL, revision INTEGER NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS schedules_workspace_id ON schedules(workspaceId,id);
CREATE TABLE IF NOT EXISTS schedule_occurrences(id TEXT PRIMARY KEY, scheduleId TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE, dueAt INTEGER NOT NULL, status TEXT NOT NULL, sessionId TEXT, runId TEXT, attempt INTEGER NOT NULL, idempotencyKey TEXT NOT NULL UNIQUE, error TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS schedule_occurrences_schedule_due ON schedule_occurrences(scheduleId,dueAt,id);
CREATE TABLE IF NOT EXISTS schedule_runtime(scheduleId TEXT PRIMARY KEY REFERENCES schedules(id) ON DELETE CASCADE, lastDueAt INTEGER, pendingDueAt INTEGER, updatedAt INTEGER NOT NULL);
`

/** Apply this SQL inside the Worker's schema migration transaction. Existing installations need the
 * schedule_occurrences.sessionId column added before the new row mapper is enabled. */
export const SCHEDULES_MIGRATION_SQL = `ALTER TABLE schedule_occurrences ADD COLUMN sessionId TEXT;`

export function createScheduleStorage(db: Database) {
  db.exec(SCHEDULES_SQL)
  const receipts = createFeatureCommandReceipts(db)
  const read = (row: unknown): ScheduleDefinition =>
    scheduleDefinitionSchema.parse(JSON.parse(String((row as { data: string }).data)))
  return {
    enabledSchedules(after: string | null, limit: number) {
      const rows = db
        .query(
          "SELECT data FROM schedules WHERE json_extract(data,'$.enabled')=1 AND (? IS NULL OR id>?) ORDER BY id LIMIT ?",
        )
        .all(after, after, Math.min(100, Math.max(1, limit)) + 1) as unknown[]
      const items = rows.slice(0, limit).map(read)
      return { items, next: rows.length > limit ? (items.at(-1)?.id ?? null) : null }
    },
    activeScheduleOccurrences(limit: number, after: { dueAt: number; id: string } | null = null) {
      const rows = db
        .query(
          "SELECT * FROM schedule_occurrences WHERE status IN ('pending','running','unknown') AND (? IS NULL OR dueAt>? OR (dueAt=? AND id>?)) ORDER BY dueAt,id LIMIT ?",
        )
        .all(after?.dueAt ?? null, after?.dueAt ?? null, after?.dueAt ?? null, after?.id ?? null, Math.min(100, Math.max(1, limit))) as Record<string, unknown>[]
      const items = rows.map((row) =>
        scheduleOccurrenceSchema.parse({
          ...row,
          error: row.error ?? null,
          sessionId: row.sessionId ?? null,
          runId: row.runId ?? null,
        }),
      )
      const last = items.at(-1)
      return { items, next: items.length >= Math.min(100, Math.max(1, limit)) && last ? { dueAt: last.dueAt, id: last.id } : null }
    },
    scheduleRuntime(scheduleId: string) {
      return db
        .query('SELECT scheduleId,lastDueAt,pendingDueAt,updatedAt FROM schedule_runtime WHERE scheduleId=?')
        .get(scheduleId) as {
        scheduleId: string
        lastDueAt: number | null
        pendingDueAt: number | null
        updatedAt: number
      } | null
    },
    recordCandidate(scheduleId: string, dueAt: number, now: number) {
      db.query(
        'INSERT INTO schedule_runtime(scheduleId,lastDueAt,pendingDueAt,updatedAt) VALUES(?,?,?,?) ON CONFLICT(scheduleId) DO UPDATE SET pendingDueAt=MAX(COALESCE(schedule_runtime.pendingDueAt,0),excluded.pendingDueAt),updatedAt=excluded.updatedAt',
      ).run(scheduleId, null, dueAt, now)
      return this.scheduleRuntime(scheduleId)
    },
    list(workspaceId: string, after: string | null, limit: number) {
      const rows = db
        .query('SELECT data FROM schedules WHERE workspaceId=? AND (? IS NULL OR id>?) ORDER BY id LIMIT ?')
        .all(workspaceId, after, after, limit + 1) as unknown[]
      const items = rows.slice(0, limit).map(read)
      return {
        items,
        next: rows.length > limit ? (items.at(-1)?.id ?? null) : null,
        revision: items.reduce((max, item) => Math.max(max, item.revision), 0),
      }
    },
    get(scheduleId: string) {
      const row = db.query('SELECT data FROM schedules WHERE id=?').get(scheduleId)
      return row ? read(row) : null
    },
    receipt(
      commandId: 'schedule.create' | 'schedule.update' | 'schedule.delete',
      input: ScheduleCreateInput | ScheduleUpdateInput | { scheduleId: string; expectedRevision: number },
      identity: FeatureWriteIdentity,
    ) {
      return receipts.lookup({ commandId, input, ...identity })
    },
    create(input: ScheduleCreateInput, identity?: FeatureWriteIdentity) {
      return receipts.run('schedule.create', input, identity, scheduleDefinitionSchema, () => {
        const now = Date.now(),
          value = scheduleDefinitionSchema.parse({
            ...input,
            id: crypto.randomUUID(),
            enabled: true,
            revision: 0,
            createdAt: now,
            updatedAt: now,
          })
        db.query('INSERT INTO schedules VALUES(?,?,?,?,?,?)').run(
          value.id,
          value.workspaceId,
          JSON.stringify(value),
          value.revision,
          now,
          now,
        )
        return value
      })
    },
    update(input: ScheduleUpdateInput, identity?: FeatureWriteIdentity) {
      return receipts.run('schedule.update', input, identity, scheduleDefinitionSchema, () => {
        const current = this.get(input.scheduleId)
        if (!current) throw new HbarError('NOT_FOUND', 'Schedule not found')
        if (current.workspaceId !== input.workspaceId)
          throw new HbarError('FORBIDDEN', 'Schedule belongs to another workspace')
        if (current.revision !== input.expectedRevision)
          throw new HbarError('COMMAND_CONFLICT', 'Schedule revision is stale')
        const now = Date.now(),
          value = scheduleDefinitionSchema.parse({
            workspaceId: input.workspaceId,
            name: input.name,
            input: input.input,
            modelId: input.modelId,
            timezone: input.timezone,
            target: input.target,
            spec: input.spec,
            id: current.id,
            enabled: input.enabled ?? current.enabled,
            revision: current.revision + 1,
            createdAt: current.createdAt,
            updatedAt: now,
          })
        db.query('UPDATE schedules SET data=?,revision=?,updatedAt=? WHERE id=? AND revision=?').run(
          JSON.stringify(value),
          value.revision,
          now,
          value.id,
          input.expectedRevision,
        )
        if (
          current.timezone !== value.timezone ||
          JSON.stringify(current.spec) !== JSON.stringify(value.spec) ||
          current.enabled !== value.enabled
        ) {
          // An edited timing or a resumed schedule starts from this revision's clock.
          db.query(
            'INSERT INTO schedule_runtime(scheduleId,lastDueAt,pendingDueAt,updatedAt) VALUES(?,?,NULL,?) ON CONFLICT(scheduleId) DO UPDATE SET lastDueAt=excluded.lastDueAt,pendingDueAt=NULL,updatedAt=excluded.updatedAt',
          ).run(value.id, now, now)
        }
        return value
      })
    },
    delete(scheduleId: string, expectedRevision: number, identity?: FeatureWriteIdentity) {
      return receipts.run(
        'schedule.delete',
        { scheduleId, expectedRevision },
        identity,
        scheduleCommands['schedule.delete'].output,
        () => {
          const current = this.get(scheduleId)
          if (!current) throw new HbarError('NOT_FOUND', 'Schedule not found')
          if (current.revision !== expectedRevision)
            throw new HbarError('COMMAND_CONFLICT', 'Schedule revision is stale')
          if (
            db
              .query(
                "SELECT id FROM schedule_occurrences WHERE scheduleId=? AND status IN ('pending','running','unknown') LIMIT 1",
              )
              .get(scheduleId)
          )
            throw new HbarError(
              'COMMAND_CONFLICT',
              'Cancel or resolve the active execution before deleting this schedule',
            )
          db.query('DELETE FROM schedules WHERE id=?').run(scheduleId)
          return { scheduleId, revision: expectedRevision + 1 }
        },
      )
    },
    occurrences(scheduleId: string, after: string | null, limit: number) {
      const rows = db
        .query('SELECT * FROM schedule_occurrences WHERE scheduleId=? AND (? IS NULL OR id>?) ORDER BY id LIMIT ?')
        .all(scheduleId, after, after, limit + 1) as Record<string, unknown>[]
      const items = rows
        .slice(0, limit)
        .map((row) => scheduleOccurrenceSchema.parse({ ...row, error: row.error ?? null }))
      return { items, next: rows.length > limit ? (items.at(-1)?.id ?? null) : null }
    },
    claim(scheduleId: string, dueAt: number, now: number) {
      return db.transaction(() => {
        const schedule = this.get(scheduleId)
        if (!schedule || !schedule.enabled) return null
        const existing = db
          .query('SELECT * FROM schedule_occurrences WHERE idempotencyKey=?')
          .get(`schedule:${scheduleId}:${dueAt}`) as Record<string, unknown> | null
        if (existing)
          return scheduleOccurrenceSchema.parse({
            ...existing,
            error: existing.error ?? null,
            sessionId: existing.sessionId ?? null,
            runId: existing.runId ?? null,
          })
        const active = db
          .query(
            "SELECT id FROM schedule_occurrences WHERE scheduleId=? AND status IN ('pending','running','unknown') LIMIT 1",
          )
          .get(scheduleId)
        if (active) return null
        const occurrence = scheduleOccurrenceSchema.parse({
          id: crypto.randomUUID(),
          scheduleId,
          dueAt,
          status: 'pending',
          sessionId: null,
          runId: null,
          attempt: 0,
          idempotencyKey: `schedule:${scheduleId}:${dueAt}`,
          createdAt: now,
          updatedAt: now,
          error: null,
        })
        db.query('INSERT INTO schedule_occurrences VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(
          occurrence.id,
          scheduleId,
          dueAt,
          occurrence.status,
          null,
          null,
          0,
          occurrence.idempotencyKey,
          null,
          now,
          now,
        )
        db.query(
          'INSERT INTO schedule_runtime(scheduleId,lastDueAt,pendingDueAt,updatedAt) VALUES(?,?,NULL,?) ON CONFLICT(scheduleId) DO UPDATE SET lastDueAt=excluded.lastDueAt,pendingDueAt=CASE WHEN schedule_runtime.pendingDueAt<=excluded.lastDueAt THEN NULL ELSE schedule_runtime.pendingDueAt END,updatedAt=excluded.updatedAt',
        ).run(scheduleId, dueAt, now)
        return occurrence
      })()
    },
    transition(
      occurrenceId: string,
      status: ScheduleOccurrence['status'],
      runId?: string,
      error?: string,
      sessionId?: string,
    ) {
      const raw = db.query('SELECT * FROM schedule_occurrences WHERE id=?').get(occurrenceId) as Record<
        string,
        unknown
      > | null
      if (!raw) throw new HbarError('NOT_FOUND', 'Occurrence not found')
      const row = scheduleOccurrenceSchema.parse({
        ...raw,
        error: raw.error ?? null,
        sessionId: raw.sessionId ?? null,
        runId: raw.runId ?? null,
      })
      if (row.status === 'completed' || row.status === 'failed' || row.status === 'cancelled') return row
      const now = Date.now()
      const next = {
        ...row,
        status,
        runId: runId ?? row.runId,
        sessionId: sessionId ?? row.sessionId,
        error: error ?? null,
        updatedAt: now,
        attempt: row.attempt + 1,
      }
      db.query(
        'UPDATE schedule_occurrences SET status=?,runId=?,sessionId=?,error=?,updatedAt=?,attempt=? WHERE id=?',
      ).run(next.status, next.runId, next.sessionId, next.error, now, next.attempt, occurrenceId)
      return scheduleOccurrenceSchema.parse(next)
    },
  }
}
