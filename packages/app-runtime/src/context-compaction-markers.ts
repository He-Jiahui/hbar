import {
  contextCompactionMarkerSchema,
  MAX_CONTEXT_COMPACTION_MARKERS,
  type ContextCompactionMarker,
} from '@hbar/contracts/context-history'

/** Immutable completion facts share message pagination and cannot cross sessions or exceed its memory bound. */
export function mergeContextCompactionMarkers(
  sessionId: string,
  first: readonly ContextCompactionMarker[] = [],
  second: readonly ContextCompactionMarker[] = [],
  fromSeq = 0,
  throughSeq = Infinity,
): readonly ContextCompactionMarker[] {
  const records = new Map<string, ContextCompactionMarker>()
  for (const candidate of [...first, ...second]) {
    const parsed = contextCompactionMarkerSchema.safeParse(candidate)
    if (!parsed.success) continue
    const record = parsed.data
    if (record.sessionId !== sessionId || record.seq < fromSeq || record.seq > throughSeq) continue
    const previous = records.get(record.id)
    if (!previous || previous.seq < record.seq) records.set(record.id, record)
  }
  return [...records.values()].sort((a, b) => a.seq - b.seq).slice(-MAX_CONTEXT_COMPACTION_MARKERS)
}
