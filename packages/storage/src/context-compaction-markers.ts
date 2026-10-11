import type { Database } from 'bun:sqlite'
import {
  contextCompactionDetailsSchema,
  contextCompactionMarkerSchema,
  MAX_CONTEXT_COMPACTION_MARKERS,
  type ContextCompactionMarker,
} from '@hbar/contracts/context-history'

/** Message pagination owns the sequence range; detailed history has its own complete cursor API. */
export function readContextCompactionMarkers(
  db: Database,
  sessionId: string,
  fromSeq: number,
  beforeSeq: number,
): ContextCompactionMarker[] {
  const rows = db
    .query<
      {
        id: string
        seq: number
        time: number
        trigger: string | null
        startedAt: number | null
        durationMs: number | null
        contextWindow: number | null
        beforeTokens: number | null
        afterTokens: number | null
      },
      [string, number, number, number]
    >(
      `
    SELECT COALESCE(json_extract(data,'$.compaction.id'),eventId) AS id,seq,time,
      json_extract(data,'$.compaction.trigger') AS trigger,
      json_extract(data,'$.compaction.startedAt') AS startedAt,
      json_extract(data,'$.compaction.durationMs') AS durationMs,
      json_extract(data,'$.compaction.contextWindow') AS contextWindow,
      json_extract(data,'$.compaction.beforeTokens') AS beforeTokens,
      json_extract(data,'$.compaction.afterTokens') AS afterTokens
    FROM events WHERE sessionId=? AND type='context.compacted' AND seq>=? AND seq<?
      AND (json_type(data,'$.compaction') IS NULL OR json_extract(data,'$.compaction.status')='completed')
    ORDER BY seq DESC LIMIT ?
  `,
    )
    .all(sessionId, fromSeq, beforeSeq, MAX_CONTEXT_COMPACTION_MARKERS)
  return rows.reverse().flatMap((row) => {
    const { id, seq, time, trigger, ...measurements } = row
    const details = contextCompactionDetailsSchema.safeParse(measurements)
    const marker = contextCompactionMarkerSchema.safeParse({
      id,
      seq,
      time,
      trigger,
      sessionId,
      ...(details.success ? { details: details.data } : {}),
    })
    return marker.success ? [marker.data] : []
  })
}
