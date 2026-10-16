import type { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { scheduleDefinitionSchema, type ScheduleDefinition } from '@hbar/contracts/commands/schedules'
import { scheduleExecutionSchema } from '@hbar/contracts/schedule-execution'

const authorizationSchema = scheduleExecutionSchema.shape.authorization
const referenceSchema = z.object({
  scheduleId: z.string(),
  revision: z.number().int().nonnegative(),
  resultHash: z.string().regex(/^[a-f0-9]{64}$/),
  actorId: z.string().nullable(),
  idempotencyKey: z.string().nullable(),
  commandId: z.string().nullable(),
})
const fingerprint = (schedule: ScheduleDefinition) =>
  createHash('sha256')
    .update(JSON.stringify(scheduleDefinitionSchema.parse(schedule)))
    .digest('hex')
/** Pin only a small reference. The existing immutable receipt owns the full original task parameters. */
export function createScheduleExecutionStorage(db: Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS schedule_execution_receipts(
    occurrenceId TEXT PRIMARY KEY REFERENCES schedule_occurrences(id) ON DELETE CASCADE,
    scheduleId TEXT NOT NULL, revision INTEGER NOT NULL, resultHash TEXT NOT NULL, actorId TEXT, idempotencyKey TEXT, commandId TEXT,
    CHECK((actorId IS NULL AND idempotencyKey IS NULL AND commandId IS NULL) OR
      (actorId IS NOT NULL AND idempotencyKey IS NOT NULL AND commandId IS NOT NULL)));
    CREATE INDEX IF NOT EXISTS entity_schedule_revision_receipt ON entity_command_receipts(
      json_extract(resultJson,'$.id'),json_extract(resultJson,'$.revision'))
      WHERE commandId IN ('schedule.create','schedule.update');`)
  const candidates = db.query<
    { actorId: string; idempotencyKey: string; commandId: string; resultJson: string },
    [string, number]
  >(
    `SELECT actorId,idempotencyKey,commandId,resultJson FROM entity_command_receipts
      WHERE commandId IN ('schedule.create','schedule.update') AND json_extract(resultJson,'$.id')=?
      AND json_extract(resultJson,'$.revision')=? LIMIT 2`,
  )
  return {
    capture(occurrenceId: string, schedule: ScheduleDefinition): void {
      const occurrence = db
        .query<{ scheduleId: string }, [string]>('SELECT scheduleId FROM schedule_occurrences WHERE id=?')
        .get(occurrenceId)
      if (!occurrence || occurrence.scheduleId !== schedule.id)
        throw new HbarError(
          'SCHEDULE_EXECUTION_CORRUPTED',
          'The execution receipt must belong to its original occurrence',
        )
      const saved = db.query('SELECT 1 FROM schedule_execution_receipts WHERE occurrenceId=?').get(occurrenceId)
      if (saved) return
      const matches = candidates.all(schedule.id, schedule.revision)
      if (matches.length > 1)
        throw new HbarError('SCHEDULE_EXECUTION_CORRUPTED', 'This schedule revision has ambiguous authorization')
      const row = matches[0]
      let authorization: z.output<typeof authorizationSchema> | null = null
      if (row) {
        const original = scheduleDefinitionSchema.parse(JSON.parse(row.resultJson) as unknown)
        if (JSON.stringify(original) !== JSON.stringify(scheduleDefinitionSchema.parse(schedule)))
          throw new HbarError(
            'SCHEDULE_EXECUTION_CORRUPTED',
            'The schedule differs from its original management receipt',
          )
        authorization = authorizationSchema.parse({
          actorId: row.actorId,
          idempotencyKey: row.idempotencyKey,
          commandId: row.commandId,
        })
      }
      // An unattributed revision stays unattributed even if the schedule is subsequently edited.
      db.query('INSERT INTO schedule_execution_receipts VALUES(?,?,?,?,?,?,?)').run(
        occurrenceId,
        schedule.id,
        schedule.revision,
        fingerprint(schedule),
        authorization?.actorId ?? null,
        authorization?.idempotencyKey ?? null,
        authorization?.commandId ?? null,
      )
    },
    read(occurrenceId: string) {
      const raw = db.query('SELECT * FROM schedule_execution_receipts WHERE occurrenceId=?').get(occurrenceId)
      if (!raw) return null
      const reference = referenceSchema.parse(raw)
      const occurrence = db
        .query<{ scheduleId: string }, [string]>('SELECT scheduleId FROM schedule_occurrences WHERE id=?')
        .get(occurrenceId)
      if (!occurrence || occurrence.scheduleId !== reference.scheduleId)
        throw new HbarError('SCHEDULE_EXECUTION_CORRUPTED', 'The frozen authorization belongs to another occurrence')
      if (!reference.actorId || !reference.idempotencyKey || !reference.commandId) return null
      const row = db
        .query<{ resultJson: string; commandId: string }, [string, string]>(
          'SELECT resultJson,commandId FROM entity_command_receipts WHERE actorId=? AND idempotencyKey=?',
        )
        .get(reference.actorId, reference.idempotencyKey)
      if (!row || row.commandId !== reference.commandId)
        throw new HbarError(
          'SCHEDULE_EXECUTION_CORRUPTED',
          'The original schedule authorization receipt is unavailable',
        )
      const schedule = scheduleDefinitionSchema.parse(JSON.parse(row.resultJson) as unknown)
      if (
        schedule.id !== reference.scheduleId ||
        schedule.revision !== reference.revision ||
        fingerprint(schedule) !== reference.resultHash
      )
        throw new HbarError('SCHEDULE_EXECUTION_CORRUPTED', 'The frozen schedule revision differs from its receipt')
      return scheduleExecutionSchema.parse({
        occurrenceId,
        authorization: {
          actorId: reference.actorId,
          idempotencyKey: reference.idempotencyKey,
          commandId: reference.commandId,
        },
        schedule,
      })
    },
  }
}
