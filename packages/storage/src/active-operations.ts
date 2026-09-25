import type { Database } from 'bun:sqlite'
import { HbarError } from '@hbar/contracts'
import {
  activeOperationsInputSchema,
  activeOperationsPageSchema,
  type ActiveOperationsInput,
  type ActiveOperationsPage,
} from '@hbar/contracts/commands/run'

/** One Worker transaction: the count, lightweight rows and revision describe the same read. */
export function readActiveOperations(db: Database, value: ActiveOperationsInput): ActiveOperationsPage {
  const parsed = activeOperationsInputSchema.safeParse(value)
  if (!parsed.success) throw new HbarError('INVALID_INPUT', 'Invalid active operation query')
  const { sessionId, cursor, limit } = parsed.data
  return db.transaction(() => {
    const session = db.query<{ seq: number }, [string]>('SELECT seq FROM sessions WHERE id=?').get(sessionId)
    if (!session) throw new HbarError('NOT_FOUND', 'Session not found')
    if (cursor && cursor.sessionSeq !== session.seq)
      throw new HbarError('ACTIVITY_CHANGED', 'Session activity changed; restart from the first page')
    const anchor = cursor
      ? db
          .query<{ createdAt: number; sessionId: string }, [string]>('SELECT createdAt,sessionId FROM runs WHERE id=?')
          .get(cursor.afterOperationId)
      : null
    if (cursor && (!anchor || anchor.sessionId !== sessionId))
      throw new HbarError('INVALID_CURSOR', 'Activity cursor does not belong to this session')
    const total = db
      .query<{ count: number }, [string]>(
        "SELECT COUNT(*) AS count FROM runs WHERE sessionId=? AND status IN ('queued','running','waiting_approval')",
      )
      .get(sessionId)
    const rows = db
      .query<
        { operationId: string; status: string; createdAt: number; startedAt: number | null },
        [string, number, number, string, number]
      >(
        `SELECT r.id AS operationId,r.createdAt,r.startedAt,
          CASE WHEN EXISTS(SELECT 1 FROM events e WHERE e.sessionId=r.sessionId AND e.runId=r.id AND e.type='run.cancelRequested')
            THEN 'cancelRequested' ELSE r.status END AS status
         FROM runs r WHERE r.sessionId=? AND r.status IN ('queued','running','waiting_approval')
           AND (r.createdAt>? OR (r.createdAt=? AND r.id>?))
         ORDER BY r.createdAt,r.id LIMIT ?`,
      )
      .all(sessionId, anchor?.createdAt ?? -1, anchor?.createdAt ?? -1, cursor?.afterOperationId ?? '', limit + 1)
    const items = rows.slice(0, limit)
    const last = items.at(-1)
    return activeOperationsPageSchema.parse({
      sessionId,
      sessionSeq: session.seq,
      totalActive: total?.count ?? 0,
      items,
      nextCursor: rows.length > limit && last ? { afterOperationId: last.operationId, sessionSeq: session.seq } : null,
    })
  })()
}
