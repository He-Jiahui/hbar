import type { Database } from 'bun:sqlite'
import { HbarError, inputSchema } from '@hbar/contracts'
import {
  queuedUserRunsInputSchema,
  queuedUserRunsPageSchema,
  type QueuedUserRunsInput,
  type QueuedUserRunsPage,
} from '@hbar/contracts/commands/run'

const PREVIEW_CODE_POINTS = 240

/** Read a bounded, revision-consistent page in the same FIFO order used by claim(). */
export function readQueuedUserRuns(db: Database, value: QueuedUserRunsInput): QueuedUserRunsPage {
  const parsed = queuedUserRunsInputSchema.safeParse(value)
  if (!parsed.success) throw new HbarError('INVALID_INPUT', 'Invalid queued run query')
  const { sessionId, cursor, limit } = parsed.data
  return db.transaction(() => {
    const session = db.query<{ seq: number }, [string]>('SELECT seq FROM sessions WHERE id=?').get(sessionId)
    if (!session) throw new HbarError('NOT_FOUND', 'Session not found')
    const sourceFilter = "(json_extract(input,'$.source')='user' OR json_extract(input,'$.source') IS NULL)"
    const total =
      db
        .query<{ count: number }, [string]>(
          `SELECT COUNT(*) AS count FROM runs WHERE sessionId=? AND status='queued' AND ${sourceFilter}`,
        )
        .get(sessionId)?.count ?? 0
    // claim() changes queued→running before its status event advances session.seq.
    // The count catches that gap; every other queue mutation appends an event.
    if (cursor && (cursor.sessionSeq !== session.seq || cursor.totalQueued !== total))
      throw new HbarError('ACTIVITY_CHANGED', 'Session queue changed; restart from the first page')
    const anchor = cursor
      ? db
          .query<
            { rowid: number; sessionId: string; createdAt: number; status: string; source: string | null },
            [string]
          >("SELECT rowid,sessionId,createdAt,status,json_extract(input,'$.source') AS source FROM runs WHERE id=?")
          .get(cursor.afterOperationId)
      : null
    if (
      cursor &&
      (!anchor ||
        anchor.sessionId !== sessionId ||
        anchor.status !== 'queued' ||
        (anchor.source !== null && anchor.source !== 'user'))
    )
      throw new HbarError('INVALID_CURSOR', 'Queue cursor does not belong to this session')
    const rows = db
      .query<
        { id: string; createdAt: number; input: string; revision: number | null },
        [string, number, number, number, number]
      >(
        `SELECT r.id,r.createdAt,r.input,
          (SELECT MAX(e.seq) FROM events e WHERE e.runId=r.id AND e.type IN ('run.queued','run.inputEdited')) AS revision
         FROM runs r WHERE r.sessionId=? AND r.status='queued' AND ${sourceFilter}
          AND (r.createdAt>? OR (r.createdAt=? AND r.rowid>?))
          ORDER BY r.createdAt,r.rowid LIMIT ?`,
      )
      .all(sessionId, anchor?.createdAt ?? -1, anchor?.createdAt ?? -1, anchor?.rowid ?? -1, limit + 1)
    const items = rows.slice(0, limit).map((row) => {
      const input = inputSchema.parse(JSON.parse(row.input))
      if (row.revision === null) throw new HbarError('RUN_JOURNAL_MISSING', 'Queued Run has no revision event')
      const points = Array.from(input.text)
      return {
        operationId: row.id,
        revision: row.revision,
        createdAt: row.createdAt,
        textPreview: points.slice(0, PREVIEW_CODE_POINTS).join(''),
        truncated: points.length > PREVIEW_CODE_POINTS,
        attachmentCount: input.images.length + (input.files?.length ?? 0),
      }
    })
    const last = items.at(-1)
    return queuedUserRunsPageSchema.parse({
      sessionId,
      sessionSeq: session.seq,
      totalQueued: total,
      items,
      nextCursor:
        rows.length > limit && last
          ? { afterOperationId: last.operationId, sessionSeq: session.seq, totalQueued: total }
          : null,
    })
  })()
}
