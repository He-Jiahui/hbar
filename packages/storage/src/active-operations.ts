import type { Database } from 'bun:sqlite'
import { HbarError } from '@hbar/contracts'
import {
  ACTIVE_OPERATION_INTENT_PREVIEW_MAX_CODE_POINTS,
  activeOperationsInputSchema,
  activeOperationsPageSchema,
  type ActiveOperationsInput,
  type ActiveOperationsPage,
} from '@hbar/contracts/commands/run'

function makeIntentPreview(prefix: string | null, hasMore: number): string | null {
  if (!prefix) return null
  const truncated = hasMore !== 0
  const contentLimit = truncated
    ? ACTIVE_OPERATION_INTENT_PREVIEW_MAX_CODE_POINTS - 1
    : ACTIVE_OPERATION_INTENT_PREVIEW_MAX_CODE_POINTS
  let preview = ''
  let visibleCodePoints = 0
  let pendingSpace = false

  for (const character of prefix) {
    if (/\s/u.test(character)) {
      pendingSpace = preview.length > 0
      continue
    }
    if (pendingSpace) {
      if (visibleCodePoints >= contentLimit) return `${preview}…`
      preview += ' '
      visibleCodePoints += 1
      pendingSpace = false
    }
    if (visibleCodePoints >= contentLimit) return `${preview}…`
    preview += character
    visibleCodePoints += 1
  }

  if (!preview) return null
  return truncated ? `${preview}…` : preview
}

/** One Worker transaction: count, exact-session rows, bounded previews and revision share one read. */
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
    const intentPreviewLimit = ACTIVE_OPERATION_INTENT_PREVIEW_MAX_CODE_POINTS
    const rows = db
      .query<
        {
          operationId: string
          status: string
          createdAt: number
          startedAt: number | null
          intentTextPrefix: string | null
          intentTextHasMore: number
        },
        [number, number, string, number, number, string, number]
      >(
        `SELECT r.id AS operationId,r.createdAt,r.startedAt,
          CASE WHEN json_valid(r.input) THEN
            CASE WHEN json_type(r.input,'$.text')='text'
              THEN substr(trim(json_extract(r.input,'$.text')),1,?) END
          END AS intentTextPrefix,
          CASE WHEN json_valid(r.input) THEN
            CASE WHEN json_type(r.input,'$.text')='text'
              THEN length(trim(json_extract(r.input,'$.text'))) > ? ELSE 0 END
            ELSE 0 END AS intentTextHasMore,
          CASE WHEN EXISTS(SELECT 1 FROM events e WHERE e.sessionId=r.sessionId AND e.runId=r.id AND e.type='run.cancelRequested')
            THEN 'cancelRequested' ELSE r.status END AS status
         FROM runs r WHERE r.sessionId=? AND r.status IN ('queued','running','waiting_approval')
           AND (r.createdAt>? OR (r.createdAt=? AND r.id>?))
         ORDER BY r.createdAt,r.id LIMIT ?`,
      )
      .all(
        intentPreviewLimit,
        intentPreviewLimit,
        sessionId,
        anchor?.createdAt ?? -1,
        anchor?.createdAt ?? -1,
        cursor?.afterOperationId ?? '',
        limit + 1,
      )
    const items = rows.slice(0, limit).map(({ intentTextPrefix, intentTextHasMore, ...item }) => ({
      ...item,
      intentPreview: makeIntentPreview(intentTextPrefix, intentTextHasMore),
    }))
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
