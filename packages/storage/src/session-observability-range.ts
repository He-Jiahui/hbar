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
  const boundaryRows =
    input.scope === 'window'
      ? `SELECT seq,time FROM events WHERE sessionId=?1 AND type='context.compacted'`
      : `SELECT e.seq,e.time
       FROM events e LEFT JOIN runs r ON r.id=e.runId WHERE e.sessionId=?1 AND e.type='message.committed'
        AND json_extract(e.data,'$.role')='user' AND (json_extract(e.data,'$.queueGuidance') IS NOT NULL OR COALESCE(json_extract(r.input,'$.source'),'user')='user')`
  const boundary = db
    .query<
      {
        anchor: number
        anchorTime: number | null
        previous: number | null
        next: number | null
        ordinal: number | null
      },
      [string, number | null]
    >(
      `WITH boundaries AS MATERIALIZED (
        SELECT seq,time,COALESCE(?2,MAX(seq) OVER (),0) anchor FROM (${boundaryRows})
      ) SELECT COALESCE(MAX(anchor),COALESCE(?2,0)) anchor,
        MAX(CASE WHEN seq=anchor THEN time END) anchorTime,
        MAX(CASE WHEN seq<anchor THEN seq END) previous,
        MIN(CASE WHEN seq>anchor THEN seq END) next,
        SUM(CASE WHEN seq<=anchor THEN 1 ELSE 0 END) ordinal FROM boundaries`,
    )
    .get(input.sessionId, input.anchor ?? null)
  if (!boundary) throw new HbarError('INVALID_INPUT', 'Unable to resolve statistics scope boundary')
  const { anchor, anchorTime, previous, next } = boundary
  if (anchor !== 0 && anchorTime === null)
    throw new HbarError('INVALID_INPUT', 'Statistics scope boundary does not belong to this Session')
  const nextTime =
    next === null
      ? null
      : db
          .query<{ time: number }, [string, number]>('SELECT time FROM events WHERE sessionId=? AND seq=?')
          .get(input.sessionId, next)?.time
  return {
    ...base,
    anchor,
    ordinal: (boundary.ordinal ?? 0) + Number(input.scope === 'window'),
    label:
      input.scope === 'turn' && anchor > 0
        ? (db
            .query<{ label: string }, [string, number]>(
              `SELECT SUBSTR(COALESCE(json_extract(data,'$.content[0].text'),''),1,100) label
              FROM events WHERE sessionId=?1 AND seq=?2`,
            )
            .get(input.sessionId, anchor)?.label ?? '')
        : '',
    fromSeq: input.scope === 'turn' && anchor > 0 ? anchor - 1 : anchor,
    throughSeq: next === null ? session.seq : next - Number(input.scope === 'turn'),
    startedAt: anchorTime ?? session.createdAt,
    endedAt: nextTime ?? base.endedAt,
    previous: anchor > 0 ? (previous ?? 0) : null,
    next,
  }
}
