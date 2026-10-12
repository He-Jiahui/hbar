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
import { TOOL_FACTS_SQL, COMPACTION_FACTS_SQL } from './session-observability-facts'
import { readObservabilityPerformance } from './session-observability-performance'
import { readObservabilityUsageFacts } from './session-observability-usage'

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
    const usageFacts = readObservabilityUsageFacts(db, args, range)
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
    const revision =
      db.query<{ seq: number }, [string]>('SELECT seq FROM sessions WHERE id=?').get(input.sessionId)?.seq ??
      range.throughSeq
    return sessionObservabilityReportSchema.parse({
      sessionId: input.sessionId,
      revision,
      observedAt: Date.now(),
      range,
      usage: usageFacts.usage,
      ...readObservabilityPerformance(db, args, range, usageFacts.latency, usageFacts.requestConcurrency),
      tools: activity(db, args, false),
      terminal: activity(db, args, true),
      skills,
      files,
      compactions,
      series: usageFacts.series,
      detail: input.detail,
      ...observabilityDetails(db, ...args, input.detail, input.after, input.limit),
    })
  })()
}
