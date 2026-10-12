import type { Database } from 'bun:sqlite'
import type { SessionObservabilityReport } from '@hbar/contracts/session-observability'
import { TOOL_FACTS_SQL } from './session-observability-facts'

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
  latency: SessionObservabilityReport['latency'],
  requestConcurrency: number | null,
): Pick<SessionObservabilityReport, 'latency' | 'execution'> {
  const fullArgs: QueryArguments = [...args, range.startedAt, range.endedAt]
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
  const toolConcurrency = peak(
    db,
    fullArgs,
    TOOL_FACTS_SQL,
    `SELECT t.startedAt start,COALESCE(t.endedAt,r.endedAt,?5) end FROM tools t LEFT JOIN runs r ON r.id=t.runId`,
  )
  return {
    latency,
    execution: {
      requestConcurrency,
      toolConcurrency,
      totalRunDurationMs: runs?.totalRunDurationMs ?? null,
      runP95Ms: runs?.runP95Ms ?? null,
      runTimingSamples: runs?.runTimingSamples ?? 0,
    },
  }
}
