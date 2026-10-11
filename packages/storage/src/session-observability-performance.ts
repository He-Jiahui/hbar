import type { Database } from 'bun:sqlite'
import type { SessionObservabilityReport } from '@hbar/contracts/session-observability'
import { TOOL_FACTS_SQL, USAGE_FACTS_SQL } from './session-observability-facts'

type QueryArguments = [string, number, number, number, number]

/** Half-open measured intervals; equal end/start instants do not overlap. */
function peak(db: Database, args: QueryArguments, prefix: string, intervals: string): number | null {
  return (
    db
      .query<{ maximum: number | null }, QueryArguments>(
        `${prefix},intervals AS (${intervals}),clipped AS (
        SELECT MAX(?4,start) start,MIN(?5,MAX(start+1,end)) end FROM intervals WHERE start IS NOT NULL AND end>=start
      ),points AS (
        SELECT start time,1 change FROM clipped WHERE end>start
        UNION ALL SELECT end,-1 FROM clipped WHERE end>start
      ),running AS (
        SELECT SUM(change) OVER(ORDER BY time,change ROWS UNBOUNDED PRECEDING) active FROM points
      ) SELECT MAX(active) maximum FROM running`,
      )
      .get(...args)?.maximum ?? null
  )
}

export function readObservabilityPerformance(
  db: Database,
  args: [string, number, number],
  range: SessionObservabilityReport['range'],
): Pick<SessionObservabilityReport, 'latency' | 'execution'> {
  const fullArgs: QueryArguments = [...args, range.startedAt, range.endedAt]
  const firstText = db
    .query<{ p95Ms: number | null; samples: number }, [string, number, number]>(
      `${USAGE_FACTS_SQL},markers AS (
      SELECT runId,COALESCE(json_extract(data,'$.attemptId'),stepId,eventId) attemptId,MIN(time) time
      FROM events WHERE sessionId=?1 AND type='attempt.firstText' GROUP BY runId,attemptId
    ),samples AS (
      SELECT m.time-s.time value FROM starts s JOIN markers m ON m.runId IS s.runId AND m.attemptId=s.attemptId
      WHERE s.seq>?2 AND s.seq<=?3 AND m.time>=s.time
    ),ranked AS (
      SELECT value,ROW_NUMBER() OVER(ORDER BY value) ordinal,COUNT(*) OVER() total FROM samples
    ) SELECT MAX(CASE WHEN ordinal=CAST((total*95+99)/100 AS INTEGER) THEN value END) p95Ms,COUNT(*) samples FROM ranked`,
    )
    .get(...args)
  const response = db
    .query<{ p95Ms: number | null; samples: number }, [string, number, number]>(
      `${USAGE_FACTS_SQL},ranked AS (
      SELECT durationMs,ROW_NUMBER() OVER(ORDER BY durationMs) ordinal,COUNT(*) OVER() total FROM usage WHERE durationMs IS NOT NULL
    ) SELECT MAX(CASE WHEN ordinal=CAST((total*95+99)/100 AS INTEGER) THEN durationMs END) p95Ms,COUNT(*) samples FROM ranked`,
    )
    .get(...args)
  const runs = db
    .query<{ totalRunDurationMs: number | null; runP95Ms: number | null; runTimingSamples: number }, QueryArguments>(
      `WITH selected AS (
      SELECT r.*,MAX(0,MIN(COALESCE(r.endedAt,?5),?5)-MAX(r.startedAt,?4)) elapsed
      FROM runs r WHERE r.sessionId=?1 AND r.startedAt IS NOT NULL AND EXISTS(
        SELECT 1 FROM events e WHERE e.sessionId=?1 AND e.runId=r.id AND e.seq>?2 AND e.seq<=?3
      )
    ),ranked AS (
      SELECT elapsed,ROW_NUMBER() OVER(ORDER BY elapsed) ordinal,COUNT(*) OVER() total FROM selected WHERE endedAt IS NOT NULL
    ) SELECT (SELECT SUM(elapsed) FROM selected) totalRunDurationMs,
      MAX(CASE WHEN ordinal=CAST((total*95+99)/100 AS INTEGER) THEN elapsed END) runP95Ms,COUNT(*) runTimingSamples FROM ranked`,
    )
    .get(...fullArgs)
  const requestConcurrency = peak(
    db,
    fullArgs,
    USAGE_FACTS_SQL,
    `SELECT startedAt start,time end FROM usage WHERE startedAt IS NOT NULL`,
  )
  const toolConcurrency = peak(
    db,
    fullArgs,
    TOOL_FACTS_SQL,
    `SELECT t.startedAt start,COALESCE(t.endedAt,r.endedAt,?5) end FROM tools t LEFT JOIN runs r ON r.id=t.runId`,
  )
  return {
    latency: {
      firstText: firstText ?? { p95Ms: null, samples: 0 },
      response: response ?? { p95Ms: null, samples: 0 },
    },
    execution: {
      requestConcurrency,
      toolConcurrency,
      totalRunDurationMs: runs?.totalRunDurationMs ?? null,
      runP95Ms: runs?.runP95Ms ?? null,
      runTimingSamples: runs?.runTimingSamples ?? 0,
    },
  }
}
