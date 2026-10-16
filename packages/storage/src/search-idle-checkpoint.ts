import { createHash } from 'node:crypto'
import type { Database } from 'bun:sqlite'
import { z } from 'zod'

const count = z.number().int().nonnegative().safe()
export const searchIdleCheckpointSchema = z.strictObject({
  schemaVersion: z.literal(1),
  databaseId: z.string().regex(/^[a-f0-9]{64}$/),
  sourceRevision: z.string().regex(/^[a-f0-9]{64}$/),
  lastMessageRowid: count,
  sourceHighwater: count,
  queued: z.boolean(),
  firstQueued: z.strictObject({ messageId: z.string().max(4000), nextOffset: count, segmentIndex: count }).nullable(),
  complete: z.boolean(),
})
export type SearchIdleCheckpoint = z.output<typeof searchIdleCheckpointSchema>

/** Read-only bounded facts. Never queue a message, advance offset or read a body/prompt. */
export function readSearchIdleCheckpoint(db: Database, databaseId: string): SearchIdleCheckpoint {
  return db.transaction(() => readSearchIdleFacts(db, databaseId))()
}

/** Also used inside the existing Schedule atomic read transaction; does not open another transaction. */
export function readSearchIdleFacts(db: Database, databaseId: string): SearchIdleCheckpoint {
  const progress = z
    .object({ lastMessageRowid: count })
    .parse(db.query('SELECT lastMessageRowid FROM session_search_progress WHERE id=1').get())
  const high = z
    .object({ highwater: count })
    .parse(db.query('SELECT COALESCE(MAX(rowid),0) AS highwater FROM messages').get())
  const firstQueued = z
    .object({ messageId: z.string().max(4000), nextOffset: count, segmentIndex: count })
    .nullable()
    .parse(
      db.query('SELECT messageId,nextOffset,segmentIndex FROM session_search_queue ORDER BY messageId LIMIT 1').get(),
    )
  const facts = {
    schemaVersion: 1,
    databaseId,
    lastMessageRowid: progress.lastMessageRowid,
    sourceHighwater: high.highwater,
    queued: firstQueued !== null,
    firstQueued,
    complete: progress.lastMessageRowid >= high.highwater && firstQueued === null,
  }
  // This revision binds bounded continuation coordinates, NOT all messages or a global generation.
  return searchIdleCheckpointSchema.parse({
    ...facts,
    sourceRevision: createHash('sha256').update(JSON.stringify(facts)).digest('hex'),
  })
}
