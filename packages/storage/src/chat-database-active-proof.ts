import type { Database } from 'bun:sqlite'
import { z } from 'zod'

export const chatDatabaseActiveJournalProofSchema = z.strictObject({
  version: z.literal(1),
  coverage: z.literal('complete-single-database'),
  databaseId: z.string().regex(/^[a-f0-9]{64}$/),
  counts: z.strictObject({
    accepted: z.number().int().nonnegative(),
    running: z.number().int().nonnegative(),
    cancelRequested: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
    invalid: z.number().int().nonnegative(),
  }),
  firstActiveId: z.string().max(160).nullable(),
  empty: z.boolean(),
})
export type ChatDatabaseActiveJournalProof = z.infer<typeof chatDatabaseActiveJournalProofSchema>

/** One read-only SELECT: no operation bodies decoded, no pending launch and no unknown=>zero. */
export function readChatDatabaseActiveJournalProof(db: Database, databaseId: string): ChatDatabaseActiveJournalProof {
  const row = z
    .strictObject({
      accepted: z.number().int().nonnegative(),
      running: z.number().int().nonnegative(),
      cancelRequested: z.number().int().nonnegative(),
      unknown: z.number().int().nonnegative(),
      invalid: z.number().int().nonnegative(),
      firstActiveId: z.string().max(160).nullable(),
    })
    .parse(
      db
        .query(
          `WITH statuses AS (
    SELECT id, CASE WHEN json_valid(dataJson) THEN json_extract(dataJson,'$.status') ELSE NULL END AS status
    FROM chat_database_operations
  ) SELECT
    COALESCE(SUM(status='accepted'),0) AS accepted,
    COALESCE(SUM(status='running'),0) AS running,
    COALESCE(SUM(status='cancelRequested'),0) AS cancelRequested,
    COALESCE(SUM(status='unknown'),0) AS unknown,
    COALESCE(SUM(status IS NULL OR status NOT IN ('accepted','running','cancelRequested','unknown','completed','cancelled','failed')),0) AS invalid,
    MIN(CASE WHEN status IN ('accepted','running','cancelRequested','unknown') THEN id ELSE NULL END) AS firstActiveId
    FROM statuses`,
        )
        .get(),
    )
  const counts = {
    accepted: row.accepted,
    running: row.running,
    cancelRequested: row.cancelRequested,
    unknown: row.unknown,
    invalid: row.invalid,
  }
  return chatDatabaseActiveJournalProofSchema.parse({
    version: 1,
    coverage: 'complete-single-database',
    databaseId,
    counts,
    firstActiveId: row.firstActiveId,
    empty: Object.values(counts).every((count) => count === 0),
  })
}
