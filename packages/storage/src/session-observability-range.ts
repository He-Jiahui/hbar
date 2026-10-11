import type { Database } from 'bun:sqlite'
import { HbarError } from '@hbar/contracts'
import type { SessionObservabilityReport, SessionObservabilityInput } from '@hbar/contracts/session-observability'

export function observabilityRange(
  db: Database,
  input: SessionObservabilityInput,
): SessionObservabilityReport['range'] {
  const session = db
    .query<{ seq: number; createdAt: number }, [string]>('SELECT seq,createdAt FROM sessions WHERE id=?')
    .get(input.sessionId)
  if (!session) throw new HbarError('SESSION_NOT_FOUND', 'Session not found')
  const base = {
    scope: input.scope ?? 'session',
    anchor: 0,
    ordinal: 0,
    label: '',
    fromSeq: 0,
    throughSeq: session.seq,
    startedAt: session.createdAt,
    endedAt: Date.now(),
    previous: null,
    next: null,
  } satisfies SessionObservabilityReport['range']
  if (!input.scope || input.scope === 'session') return base
  // Successful compaction closes the old window. A user message starts a new turn, including steering.
  const boundaries =
    input.scope === 'window'
      ? `SELECT seq,time,'' label FROM events WHERE sessionId=?1 AND type='context.compacted'`
      : `SELECT e.seq,e.time,SUBSTR(COALESCE(json_extract(e.data,'$.content[0].text'),''),1,100) label
       FROM events e LEFT JOIN runs r ON r.id=e.runId WHERE e.sessionId=?1 AND e.type='message.committed'
        AND json_extract(e.data,'$.role')='user' AND (json_extract(e.data,'$.queueGuidance') IS NOT NULL OR COALESCE(json_extract(r.input,'$.source'),'user')='user')`
  const latest = db
    .query<{ seq: number }, [string]>(`SELECT seq FROM (${boundaries}) ORDER BY seq DESC LIMIT 1`)
    .get(input.sessionId)
  const anchor = input.anchor ?? latest?.seq ?? 0
  const row =
    anchor === 0
      ? null
      : db
          .query<{ seq: number; time: number; label: string }, [string, number]>(
            `SELECT * FROM (${boundaries}) WHERE seq=?2`,
          )
          .get(input.sessionId, anchor)
  if (anchor !== 0 && !row)
    throw new HbarError('INVALID_INPUT', 'Statistics scope boundary does not belong to this Session')
  const adjacent = db
    .query<{ previous: number | null; next: number | null; ordinal: number }, [string, number]>(
      `SELECT MAX(CASE WHEN seq<?2 THEN seq END) previous,MIN(CASE WHEN seq>?2 THEN seq END) next,
      SUM(CASE WHEN seq<=?2 THEN 1 ELSE 0 END) ordinal FROM (${boundaries})`,
    )
    .get(input.sessionId, anchor)
  const next = adjacent?.next ?? null
  const nextTime =
    next === null
      ? null
      : db
          .query<{ time: number }, [string, number]>('SELECT time FROM events WHERE sessionId=? AND seq=?')
          .get(input.sessionId, next)?.time
  return {
    ...base,
    anchor,
    ordinal: (adjacent?.ordinal ?? 0) + Number(input.scope === 'window'),
    label: row?.label ?? '',
    fromSeq: input.scope === 'turn' && anchor > 0 ? anchor - 1 : anchor,
    throughSeq: next === null ? session.seq : next - Number(input.scope === 'turn'),
    startedAt: row?.time ?? session.createdAt,
    endedAt: nextTime ?? base.endedAt,
    previous: anchor > 0 ? (adjacent?.previous ?? 0) : null,
    next,
  }
}
