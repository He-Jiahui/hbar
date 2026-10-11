import type { Database } from 'bun:sqlite'
import { observabilityRecordSchema, type ObservabilityDetail } from '@hbar/contracts/session-observability'
import { TOOL_FACTS_SQL, USAGE_FACTS_SQL, COMPACTION_FACTS_SQL } from './session-observability-facts'

const duration = `SUM(durationMs) durationMs,AVG(durationMs) averageMs`
const completed = `SUM(outcome='succeeded') succeeded,SUM(outcome='failed') failed`

/** Each detail kind has its own stable cursor; grouped totals include every matching record. */
export function observabilityDetails(
  db: Database,
  sessionId: string,
  from: number,
  through: number,
  kind: ObservabilityDetail,
  after: string | undefined,
  limit: number,
) {
  const sources: Record<ObservabilityDetail, { prefix: string; select: string; descending: boolean }> = {
    models: {
      prefix: USAGE_FACTS_SQL,
      descending: false,
      select: `SELECT model id,model label,NULL secondary,COUNT(*) count,0 succeeded,0 failed,${duration},
      NULL status,MAX(time) time,NULL linesRead,NULL patches,NULL addedLines,NULL removedLines,
      NULL beforeTokens,NULL afterTokens,SUM(input) input,SUM(output) output,
      CASE WHEN COUNT(*)=COUNT(cost) THEN SUM(cost) END cost,NULL pricing FROM usage GROUP BY model`,
    },
    tools: {
      prefix: TOOL_FACTS_SQL,
      descending: false,
      select: `SELECT name||':'||kind id,name label,kind secondary,COUNT(*) count,${completed},${duration},
      NULL status,MAX(time) time,NULL linesRead,NULL patches,NULL addedLines,NULL removedLines,NULL beforeTokens,NULL afterTokens,NULL input,NULL output,NULL cost,NULL pricing
      FROM tools GROUP BY name,kind`,
    },
    skills: {
      prefix: TOOL_FACTS_SQL,
      descending: false,
      select: `SELECT skillId id,
      (SELECT skillName FROM skills s WHERE s.skillId=skills.skillId ORDER BY time DESC,seq DESC LIMIT 1) label,
      (SELECT revision FROM skills s WHERE s.skillId=skills.skillId AND s.instruction=1 ORDER BY time DESC,seq DESC LIMIT 1) secondary,
      (SELECT COALESCE(SUM(used),0) FROM skill_uses u WHERE u.skillId=skills.skillId) count,SUM(instruction AND offset=0) succeeded,SUM(NOT instruction) failed,${duration},NULL status,MAX(time) time,
      NULL linesRead,NULL patches,NULL addedLines,NULL removedLines,NULL beforeTokens,NULL afterTokens,NULL input,NULL output,NULL cost,NULL pricing
      FROM skills GROUP BY skillId`,
    },
    files: {
      prefix: TOOL_FACTS_SQL,
      descending: false,
      select: `SELECT path id,path label,NULL secondary,COUNT(*) count,SUM(operation='read') succeeded,
      SUM(operation!='read') failed,${duration},NULL status,MAX(time) time,
      CASE WHEN COUNT(CASE WHEN operation='read' THEN 1 END)=COUNT(linesRead) THEN COALESCE(SUM(linesRead),0) END linesRead,
      CASE WHEN COUNT(CASE WHEN operation!='read' THEN 1 END)=COUNT(patches) THEN COALESCE(SUM(patches),0) END patches,
      CASE WHEN COUNT(CASE WHEN operation!='read' THEN 1 END)=COUNT(addedLines) THEN COALESCE(SUM(addedLines),0) END addedLines,
      CASE WHEN COUNT(CASE WHEN operation!='read' THEN 1 END)=COUNT(removedLines) THEN COALESCE(SUM(removedLines),0) END removedLines,
      NULL beforeTokens,NULL afterTokens,NULL input,NULL output,NULL cost,NULL pricing FROM files GROUP BY path`,
    },
    terminal: {
      prefix: TOOL_FACTS_SQL,
      descending: true,
      select: `SELECT printf('%016d',seq)||':'||runId||':'||callId id,
      COALESCE(label,name) label,name secondary,1 count,(outcome='succeeded') succeeded,(outcome='failed') failed,
      durationMs,durationMs averageMs,outcome status,time,NULL linesRead,NULL patches,NULL addedLines,NULL removedLines,
      NULL beforeTokens,NULL afterTokens,NULL input,NULL output,NULL cost,NULL pricing FROM tools WHERE kind='command'`,
    },
    compactions: {
      prefix: COMPACTION_FACTS_SQL,
      descending: true,
      select: `SELECT printf('%016d',seq)||':'||id id,model label,trigger secondary,1 count,
      (status='completed') succeeded,(status='failed') failed,durationMs,durationMs averageMs,status,time,NULL linesRead,
      NULL patches,NULL addedLines,NULL removedLines,beforeTokens,afterTokens,NULL input,NULL output,NULL cost,NULL pricing FROM compactions`,
    },
    requests: {
      prefix: USAGE_FACTS_SQL,
      descending: true,
      select: `SELECT printf('%016d',s.seq)||':'||s.attemptId id,COALESCE(u.model,s.model,r.modelId,'unknown') label,s.source secondary,1 count,
      0 succeeded,0 failed,u.durationMs,u.durationMs averageMs,CASE WHEN u.attemptId IS NULL THEN r.status END status,
      s.time time,NULL linesRead,NULL patches,NULL addedLines,NULL removedLines,
      NULL beforeTokens,NULL afterTokens,u.input,u.output,u.cost,COALESCE(u.pricing,s.pricing) pricing
      FROM starts s LEFT JOIN usage u ON u.attemptId=s.attemptId AND (u.runId=s.runId OR u.runId IS NULL AND s.runId IS NULL)
      LEFT JOIN runs r ON r.id=s.runId WHERE s.seq>?2 AND s.seq<=?3
      UNION ALL SELECT printf('%016d',seq)||':'||attemptId id,model label,source secondary,1 count,
      0 succeeded,0 failed,durationMs,durationMs averageMs,NULL status,time,NULL linesRead,NULL patches,NULL addedLines,NULL removedLines,
      NULL beforeTokens,NULL afterTokens,input,output,cost,pricing FROM usage u WHERE NOT EXISTS(SELECT 1 FROM starts s WHERE s.attemptId=u.attemptId AND (s.runId=u.runId OR s.runId IS NULL AND u.runId IS NULL))`,
    },
  }
  const source = sources[kind]
  const rows = db
    .query<Record<string, unknown>, [string, number, number, string | null, number]>(
      `${source.prefix},details AS (${source.select}) SELECT * FROM details WHERE (?4 IS NULL OR id${source.descending ? '<' : '>'}?4)
     ORDER BY id ${source.descending ? 'DESC' : 'ASC'} LIMIT ?5`,
    )
    .all(sessionId, from, through, after ?? null, limit + 1)
  const records = rows.slice(0, limit).map((row) =>
    observabilityRecordSchema.parse({
      ...row,
      pricing: typeof row.pricing === 'string' ? (JSON.parse(row.pricing) as unknown) : null,
    }),
  )
  return { records, nextCursor: rows.length > limit ? (records.at(-1)?.id ?? null) : null }
}
