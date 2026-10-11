import type { Database } from 'bun:sqlite'
import {
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
    .query<{ id: string; seq: number; time: number; trigger: string | null }, [string, number, number, number]>(
      `
    SELECT COALESCE(json_extract(data,'$.compaction.id'),eventId) AS id,seq,time,
      json_extract(data,'$.compaction.trigger') AS trigger
    FROM events WHERE sessionId=? AND type='context.compacted' AND seq>=? AND seq<?
      AND (json_type(data,'$.compaction') IS NULL OR json_extract(data,'$.compaction.status')='completed')
    ORDER BY seq DESC LIMIT ?
  `,
    )
    .all(sessionId, fromSeq, beforeSeq, MAX_CONTEXT_COMPACTION_MARKERS)
  return rows.reverse().flatMap((row) => {
    const marker = contextCompactionMarkerSchema.safeParse({ ...row, sessionId })
    return marker.success ? [marker.data] : []
  })
}
