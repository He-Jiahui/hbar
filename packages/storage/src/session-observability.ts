import type { Database } from 'bun:sqlite'
import {
  sessionObservabilityInputSchema,
  sessionObservabilityReportSchema,
  type SessionObservabilityInput,
  type SessionObservabilityReport,
} from '@hbar/contracts/session-observability'
import { HbarError } from '@hbar/contracts'
import { observabilityRange } from './session-observability-range'
import { observabilityDetails } from './session-observability-details'
import { TOOL_FACTS_SQL, USAGE_FACTS_SQL, COMPACTION_FACTS_SQL } from './session-observability-facts'

function activity(db: Database, args: [string, number, number], terminal: boolean) {
  return db
    .query<Record<string, unknown>, [string, number, number]>(
      `${TOOL_FACTS_SQL},selected AS (
    SELECT *,ROW_NUMBER() OVER(ORDER BY durationMs) timingOrdinal,COUNT(durationMs) OVER() timingCount
    FROM tools ${terminal ? "WHERE kind='command'" : ''}
  ) SELECT COUNT(*) total,COALESCE(SUM(outcome='succeeded'),0) succeeded,COALESCE(SUM(outcome='failed'),0) failed,
    COALESCE(SUM(outcome='denied'),0) denied,COALESCE(SUM(outcome='cancelled'),0) cancelled,
    COALESCE(SUM(outcome='interrupted'),0) interrupted,COALESCE(SUM(outcome='unknown'),0) unknown,COALESCE(SUM(outcome='pending'),0) pending,
    1.0*SUM(outcome='succeeded')/NULLIF(SUM(outcome IN ('succeeded','failed')),0) successRate,
    SUM(durationMs) durationMs,AVG(durationMs) averageMs,MAX(durationMs) maximumMs,COUNT(durationMs) timingSamples,
    MAX(CASE WHEN timingOrdinal=(SELECT COUNT(*) FROM selected WHERE durationMs IS NULL)+MAX(1,CAST((timingCount*95+99)/100 AS INTEGER)) THEN durationMs END) p95Ms
    FROM selected`,
    )
    .get(...args)
}

export function readSessionObservability(db: Database, value: SessionObservabilityInput): SessionObservabilityReport {
  const parsed = sessionObservabilityInputSchema.safeParse(value)
  if (!parsed.success) throw new HbarError('INVALID_INPUT', 'Invalid Session statistics query')
  const input = parsed.data
  // One SQLite read transaction keeps scope boundaries, totals and paged details at the same revision.
  return db.transaction(() => {
    const range = observabilityRange(db, input)
    const args: [string, number, number] = [input.sessionId, range.fromSeq, range.throughSeq]
    const usage = db
      .query<Record<string, unknown>, [string, number, number]>(
        `${USAGE_FACTS_SQL}
      SELECT COALESCE(SUM(input),0) input,COALESCE(SUM(output),0) output,COALESCE(SUM(cacheRead),0) cacheRead,
        COALESCE(SUM(cacheWrite),0) cacheWrite,COUNT(*) recorded,COUNT(DISTINCT model) models,
        (SELECT COUNT(DISTINCT COALESCE(runId,'')||':'||attemptId) FROM starts WHERE seq>?2 AND seq<=?3) requests,
        (SELECT COUNT(DISTINCT runId) FROM events WHERE sessionId=?1 AND seq>?2 AND seq<=?3 AND type IN ('run.status','run.settled','message.committed','request.started','compaction.request','tool.started')) runs,
        (SELECT COUNT(*) FROM events e LEFT JOIN runs r ON r.id=e.runId WHERE e.sessionId=?1 AND e.seq>?2 AND e.seq<=?3
          AND e.type='message.committed' AND json_extract(e.data,'$.role')='user'
          AND (json_extract(e.data,'$.queueGuidance') IS NOT NULL OR COALESCE(json_extract(r.input,'$.source'),'user')='user')) turns,
        CASE WHEN COUNT(*)=COUNT(cost) THEN COALESCE(SUM(cost),0) END cost,COALESCE(SUM(cost),0) knownCost,COUNT(cost) pricedRequests,
        CASE WHEN COUNT(*)=COUNT(eligibleInput) THEN 1.0*SUM(cacheRead)/NULLIF(SUM(eligibleInput),0) END cacheHitRate,
        1.0*SUM(cacheRead)/NULLIF(SUM(input),0) cacheInputShare,SUM(durationMs) durationMs,COUNT(durationMs) timingSamples,
        CASE WHEN COUNT(*)=COUNT(durationMs) THEN 1000.0*SUM(input+output)/NULLIF(SUM(durationMs),0) END tokensPerSecond,
        CASE WHEN COUNT(*)=COUNT(durationMs) THEN 1000.0*SUM(output)/NULLIF(SUM(durationMs),0) END outputPerSecond
      FROM usage`,
      )
      .get(...args)
    const skills = db
      .query<Record<string, unknown>, [string, number, number]>(
        `${TOOL_FACTS_SQL}
      SELECT (SELECT COUNT(DISTINCT CASE WHEN used THEN skillId END) FROM skill_uses) used,
        (SELECT COALESCE(SUM(used),0) FROM skill_uses) uses,
        COALESCE(SUM(instruction AND offset=0),0) loads,COALESCE(SUM(NOT instruction),0) resourceReads FROM skills`,
      )
      .get(...args)
    const files = db
      .query<Record<string, unknown>, [string, number, number]>(
        `${TOOL_FACTS_SQL}
      SELECT COALESCE(SUM(operation='read'),0) reads,COALESCE(SUM(operation!='read'),0) writes,
        COUNT(DISTINCT CASE WHEN operation='read' THEN path END) readPaths,COUNT(DISTINCT CASE WHEN operation!='read' THEN path END) writtenPaths,
        COUNT(linesRead) measuredReads,COUNT(patches) measuredWrites,
        CASE WHEN COUNT(CASE WHEN operation='read' THEN 1 END)=COUNT(linesRead) THEN COALESCE(SUM(linesRead),0) END linesRead,
        CASE WHEN COUNT(CASE WHEN operation!='read' THEN 1 END)=COUNT(patches) THEN COALESCE(SUM(patches),0) END patches,
        CASE WHEN COUNT(CASE WHEN operation!='read' THEN 1 END)=COUNT(addedLines) THEN COALESCE(SUM(addedLines),0) END addedLines,
        CASE WHEN COUNT(CASE WHEN operation!='read' THEN 1 END)=COUNT(removedLines) THEN COALESCE(SUM(removedLines),0) END removedLines FROM files`,
      )
      .get(...args)
    const compactions = db
      .query<Record<string, unknown>, [string, number, number]>(
        `${COMPACTION_FACTS_SQL}
      SELECT COUNT(*) total,COALESCE(SUM(status='completed'),0) completed,COALESCE(SUM(status='failed'),0) failed,
        COALESCE(SUM(status='running'),0) running,SUM(durationMs) durationMs,AVG(durationMs) averageMs,
        SUM(CASE WHEN status='completed' AND afterTokens IS NOT NULL THEN beforeTokens END) beforeTokens,
        SUM(CASE WHEN status='completed' THEN afterTokens END) afterTokens,
        SUM(CASE WHEN status='completed' THEN beforeTokens-afterTokens END) removedTokens,
        1.0*SUM(CASE WHEN status='completed' THEN beforeTokens-afterTokens END)/NULLIF(SUM(CASE WHEN status='completed' AND afterTokens IS NOT NULL THEN beforeTokens END),0) reductionRate,
        COUNT(CASE WHEN status='completed' AND afterTokens IS NOT NULL THEN 1 END) measured FROM compactions`,
      )
      .get(...args)
    const bucketMs = Math.max(1, Math.ceil(Math.max(1, range.endedAt - range.startedAt + 1) / 40))
    const series = db
      .query<Record<string, unknown>, [string, number, number, number, number]>(
        `${USAGE_FACTS_SQL}
      SELECT ?4+MIN(39,MAX(0,CAST((time-?4)/?5 AS INTEGER)))*?5 start,SUM(input) input,SUM(output) output,SUM(cacheRead) cacheRead
      FROM usage GROUP BY start ORDER BY start`,
      )
      .all(...args, range.startedAt, bucketMs)
    const revision =
      db.query<{ seq: number }, [string]>('SELECT seq FROM sessions WHERE id=?').get(input.sessionId)?.seq ??
      range.throughSeq
    return sessionObservabilityReportSchema.parse({
      sessionId: input.sessionId,
      revision,
      observedAt: Date.now(),
      range,
      usage,
      tools: activity(db, args, false),
      terminal: activity(db, args, true),
      skills,
      files,
      compactions,
      series,
      detail: input.detail,
      ...observabilityDetails(db, ...args, input.detail, input.after, input.limit),
    })
  })()
}
