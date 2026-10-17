import { createHash } from 'node:crypto'
import type { Database } from 'bun:sqlite'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { scheduleDefinitionSchema, scheduleOccurrenceSchema } from '@hbar/contracts/commands/schedules'
import { readSearchIdleFacts, searchIdleCheckpointSchema } from './search-idle-checkpoint'

const time = z.number().int().nonnegative().safe()
const id = z.string().min(1).max(160)
const digest = z.string().regex(/^[a-f0-9]{64}$/)
export const scheduleIdleCheckpointInputSchema = z.strictObject({
  maxItems: z.number().int().min(1).max(512).default(128),
  maxBytes: z.number().int().min(8192).max(262144).default(131072),
})
export type ScheduleIdleCheckpointInput = z.input<typeof scheduleIdleCheckpointInputSchema>
const definitionSchema = scheduleDefinitionSchema
  .pick({
    id: true,
    workspaceId: true,
    revision: true,
    createdAt: true,
    updatedAt: true,
    timezone: true,
    spec: true,
  })
  .extend({
    runtime: z.strictObject({ lastDueAt: time.nullable(), pendingDueAt: time.nullable(), updatedAt: time }).nullable(),
  })
const commandSchema = z.strictObject({
  actorId: id,
  idempotencyKey: z.string().min(1).max(200),
  requestId: z.string().min(1).max(200),
  inputHash: digest,
})
const activeSchema = scheduleOccurrenceSchema.omit({ error: true }).extend({
  // A reference is not proof of absence/commit. Existing runner.getReceipt remains authoritative.
  receipt: z.strictObject({
    runRequestId: z.string().max(200).nullable(),
    runStatus: z.string().max(40).nullable(),
    acceptedCommand: commandSchema.nullable(),
    acceptedSeq: time.nullable(),
  }),
})
const activeCursor = z.strictObject({ dueAt: time, id })
export const scheduleIdleCheckpointSchema = z.strictObject({
  schemaVersion: z.literal(1),
  database: z.strictObject({ id: digest, schemaVersion: time, sourceRevision: digest }),
  coverage: z.enum(['complete', 'incomplete']),
  cursors: z.strictObject({
    enabledComplete: z.boolean(),
    enabledAfter: id.nullable(),
    activeComplete: z.boolean(),
    activeAfter: activeCursor.nullable(),
  }),
  definitions: z.array(definitionSchema).max(512),
  activeOccurrences: z.array(activeSchema).max(512),
  search: searchIdleCheckpointSchema,
  itemCount: time,
  replyBytes: time,
})
export type ScheduleIdleCheckpoint = z.output<typeof scheduleIdleCheckpointSchema>

interface DefinitionRow {
  id: string
  workspaceId: string
  revision: number
  createdAt: number
  updatedAt: number
  timezone: string
  spec: string
  runtimeUpdatedAt: number | null
  lastDueAt: number | null
  pendingDueAt: number | null
}
interface ActiveRow {
  id: string
  scheduleId: string
  dueAt: number
  status: string
  sessionId: string | null
  runId: string | null
  attempt: number
  idempotencyKey: string
  createdAt: number
  updatedAt: number
}

/** Single-connection, synchronous read transaction. No cursor is held beyond it. No writes or cron decisions. */
export function readScheduleIdleCheckpoint(
  db: Database,
  databaseId: string,
  value: ScheduleIdleCheckpointInput = {},
): ScheduleIdleCheckpoint {
  digest.parse(databaseId)
  const input = scheduleIdleCheckpointInputSchema.parse(value)
  return db.transaction(() => {
    const definitions: ScheduleIdleCheckpoint['definitions'] = []
    const activeOccurrences: ScheduleIdleCheckpoint['activeOccurrences'] = []
    const search = readSearchIdleFacts(db, databaseId)
    let used = Buffer.byteLength(JSON.stringify(search), 'utf8')
    const fits = (item: unknown): boolean => {
      const bytes = Buffer.byteLength(JSON.stringify(item), 'utf8')
      if (definitions.length + activeOccurrences.length >= input.maxItems || used + bytes > input.maxBytes - 4096)
        return false
      used += bytes
      return true
    }
    // Explicit small SQL projection: never fetch data/input/name/model/target/error blobs.
    const rows = db
      .query<DefinitionRow, [number]>(
        `
      SELECT s.id,s.workspaceId,s.revision,s.createdAt,s.updatedAt,
        substr(json_extract(s.data,'$.timezone'),1,81) AS timezone,
        substr(json_extract(s.data,'$.spec'),1,513) AS spec,
        r.updatedAt AS runtimeUpdatedAt,r.lastDueAt,r.pendingDueAt
      FROM schedules s LEFT JOIN schedule_runtime r ON r.scheduleId=s.id
      WHERE json_extract(s.data,'$.enabled')=1 ORDER BY s.id LIMIT ?
    `,
      )
      .all(input.maxItems + 1)
    let enabledComplete = true
    let enabledAfter: string | null = null
    for (const row of rows) {
      const item = definitionSchema.parse({
        id: row.id,
        workspaceId: row.workspaceId,
        revision: row.revision,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        timezone: row.timezone,
        spec: JSON.parse(row.spec) as unknown,
        runtime:
          row.runtimeUpdatedAt === null
            ? null
            : {
                updatedAt: row.runtimeUpdatedAt,
                lastDueAt: row.lastDueAt,
                pendingDueAt: row.pendingDueAt,
              },
      })
      if (!fits(item)) {
        enabledComplete = false
        break
      }
      definitions.push(item)
      enabledAfter = item.id
    }
    const activeRows = db
      .query<ActiveRow, [number]>(
        `
      SELECT id,scheduleId,dueAt,status,sessionId,runId,attempt,idempotencyKey,createdAt,updatedAt
      FROM schedule_occurrences WHERE status IN ('pending','running','unknown')
      ORDER BY dueAt,id LIMIT ?
    `,
      )
      .all(Math.max(1, input.maxItems - definitions.length + 1))
    let activeComplete = true
    let activeAfter: { dueAt: number; id: string } | null = null
    for (const row of activeRows) {
      const run =
        row.runId === null || row.sessionId === null
          ? null
          : db
              .query<{ requestId: string; status: string }, [string, string]>(
                'SELECT requestId,status FROM runs WHERE id=? AND sessionId=?',
              )
              .get(row.runId, row.sessionId)
      const acceptance =
        run === null || row.runId === null
          ? null
          : db
              .query<
                {
                  seq: number
                  actorId: string | null
                  idempotencyKey: string | null
                  requestId: string | null
                  inputHash: string | null
                },
                [string, string]
              >(
                `SELECT seq,
        substr(json_extract(data,'$.command.actorId'),1,161) AS actorId,
        substr(json_extract(data,'$.command.idempotencyKey'),1,201) AS idempotencyKey,
        substr(json_extract(data,'$.command.requestId'),1,201) AS requestId,
        substr(json_extract(data,'$.command.inputHash'),1,65) AS inputHash
        FROM events WHERE runId=? AND sessionId=? AND type IN ('run.queued','run.recoveryQueued') ORDER BY seq LIMIT 1
      `,
              )
              .get(row.runId, row.sessionId ?? '')
      const acceptedCommand =
        acceptance?.actorId === null || !acceptance
          ? null
          : commandSchema.parse({
              actorId: acceptance.actorId,
              idempotencyKey: acceptance.idempotencyKey,
              requestId: acceptance.requestId,
              inputHash: acceptance.inputHash,
            })
      const item = activeSchema.parse({
        ...row,
        receipt: {
          runRequestId: run?.requestId ?? null,
          runStatus: run?.status ?? null,
          acceptedCommand,
          acceptedSeq: acceptance?.seq ?? null,
        },
      })
      if (!fits(item)) {
        activeComplete = false
        break
      }
      activeOccurrences.push(item)
      activeAfter = { dueAt: item.dueAt, id: item.id }
    }
    const cursors = { enabledComplete, enabledAfter, activeComplete, activeAfter }
    const coverage = enabledComplete && activeComplete ? 'complete' : 'incomplete'
    const schemaVersion = db.query<{ user_version: number }, []>('PRAGMA user_version').get()?.user_version
    if (schemaVersion === undefined) throw new HbarError('STORAGE_ERROR', 'Schedule snapshot schema is unavailable')
    // This is a per-database content revision of facts read in THIS transaction, not a cross-DB sequence.
    const sourceRevision = createHash('sha256')
      .update(
        JSON.stringify({
          databaseId,
          schemaVersion,
          coverage,
          cursors,
          definitions,
          activeOccurrences,
          search,
        }),
      )
      .digest('hex')
    const result: ScheduleIdleCheckpoint = {
      schemaVersion: 1,
      database: { id: databaseId, schemaVersion, sourceRevision },
      coverage,
      cursors,
      definitions,
      activeOccurrences,
      search,
      itemCount: definitions.length + activeOccurrences.length,
      replyBytes: 0,
    }
    // The digit count of replyBytes may change its own encoding length; settle it before checking the bound.
    for (let pass = 0; pass < 4; pass++) {
      const bytes = Buffer.byteLength(JSON.stringify(result), 'utf8')
      if (bytes === result.replyBytes) break
      result.replyBytes = bytes
    }
    if (result.replyBytes > input.maxBytes)
      throw new HbarError('STORAGE_ERROR', 'Schedule checkpoint exceeds its byte budget')
    return scheduleIdleCheckpointSchema.parse(result)
  })()
}
