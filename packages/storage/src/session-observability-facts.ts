/** Small projections only: never transfer request prompts or tool output bodies into the statistics reader. */
export const TOOL_FACTS_SQL = `
WITH call_events AS (
 SELECT e.runId,e.seq,e.time,json_extract(b.value,'$.callId') callId,json_extract(b.value,'$.name') name,
  json_extract(b.value,'$.args') args,json_extract(b.value,'$.presentation') presentation,0 executed
 FROM events e,json_each(e.data,'$.content') b WHERE e.sessionId=?1
  AND e.type='message.committed' AND json_extract(b.value,'$.type')='tool_call'
 UNION ALL
 SELECT runId,seq,time,json_extract(data,'$.callId'),json_extract(data,'$.name'),
  COALESCE(json_extract(data,'$.args'),json_extract(data,'$.arguments')),json_extract(data,'$.presentation'),
  CASE WHEN type='tool.started' THEN 1 ELSE 0 END
 FROM events WHERE sessionId=?1 AND type IN ('tool.started','tool.sequence_call')
), calls AS (
 SELECT *,MIN(seq) OVER(PARTITION BY runId,callId,name) ownerSeq,
  ROW_NUMBER() OVER(PARTITION BY runId,callId,name ORDER BY executed DESC,seq DESC) ordinal FROM call_events
), result_events AS (
 SELECT e.runId,e.seq,e.time,json_extract(b.value,'$.callId') callId,json_extract(b.value,'$.name') name,
  json_extract(b.value,'$.outcome.kind') outcome,json_extract(b.value,'$.execution.elapsedMs') elapsedMs,
  json_extract(b.value,'$.execution.endedAt') endedAt,json_extract(b.value,'$.activity') activity
 FROM events e,json_each(e.data,'$.content') b WHERE e.sessionId=?1
  AND e.type IN ('message.committed','tool.sequence_result') AND json_extract(b.value,'$.type')='tool_result'
), results AS (
 SELECT *,ROW_NUMBER() OVER(PARTITION BY runId,callId,name ORDER BY (outcome IS NOT NULL) DESC,seq DESC) ordinal FROM result_events
), all_tools AS (
 SELECT c.runId,c.callId,c.name,c.ownerSeq seq,c.time,
  COALESCE(json_extract(c.presentation,'$.kind'),'tool') kind,
  CASE WHEN c.presentation IS NOT NULL THEN json_extract(c.args,'$.'||COALESCE(json_extract(c.presentation,'$.pathField'),json_extract(c.presentation,'$.commandField'))) END label,
  COALESCE(r.outcome,CASE WHEN r.callId IS NOT NULL THEN 'unknown'
   WHEN state.status IN ('completed','failed','cancelled','interrupted','guided') THEN CASE WHEN c.executed=1 THEN 'unknown' ELSE 'cancelled' END ELSE 'pending' END) outcome,
  CASE WHEN r.endedAt IS NOT NULL THEN r.elapsedMs END durationMs,r.activity
 FROM calls c LEFT JOIN results r ON r.runId=c.runId AND r.callId=c.callId AND r.name=c.name AND r.ordinal=1
 LEFT JOIN runs state ON state.id=c.runId
 WHERE c.ordinal=1
 UNION ALL
 SELECT r.runId,r.callId,r.name,r.seq,r.time,'tool',NULL,COALESCE(r.outcome,'unknown'),
  CASE WHEN r.endedAt IS NOT NULL THEN r.elapsedMs END,r.activity
 FROM results r WHERE r.ordinal=1 AND NOT EXISTS(SELECT 1 FROM calls c WHERE c.runId=r.runId AND c.callId=r.callId AND c.name=r.name)
), tools AS (
 SELECT * FROM all_tools WHERE seq>?2 AND seq<=?3
), measured_files AS (
 SELECT t.*,REPLACE(json_extract(f.value,'$.path'),'\\','/') path,
  json_extract(f.value,'$.operation') operation,json_extract(f.value,'$.linesRead') linesRead,
  json_extract(f.value,'$.patches') patches,json_extract(f.value,'$.addedLines') addedLines,
  json_extract(f.value,'$.removedLines') removedLines
 FROM tools t,json_each(t.activity,'$.files') f WHERE t.outcome='succeeded'
), files AS (
 SELECT * FROM measured_files
 UNION ALL
 SELECT t.*,REPLACE(t.label,'\\','/'),CASE WHEN t.kind='file-read' THEN 'read' ELSE 'write' END,NULL,NULL,NULL,NULL
 FROM tools t WHERE t.outcome='succeeded' AND t.kind IN ('file-read','file-write','file-edit')
  AND t.label IS NOT NULL AND NOT EXISTS(SELECT 1 FROM measured_files f WHERE f.runId=t.runId AND f.callId=t.callId AND f.name=t.name)
), skills AS (
 SELECT *,json_extract(activity,'$.skill.id') skillId,json_extract(activity,'$.skill.name') skillName,
  json_extract(activity,'$.skill.completed') completed,json_extract(activity,'$.skill.instruction') instruction,
  json_extract(activity,'$.skill.offset') offset,json_extract(activity,'$.skill.resource') resource,
  json_extract(activity,'$.skill.revision') revision
 FROM tools WHERE outcome='succeeded' AND json_extract(activity,'$.skill.id') IS NOT NULL
)
`

export const USAGE_FACTS_SQL = `
WITH starts AS (
 SELECT runId,MIN(seq) seq,MIN(time) time,COALESCE(json_extract(data,'$.attemptId'),stepId,eventId) attemptId
 FROM events WHERE sessionId=?1 AND type IN ('request.started','compaction.request')
 GROUP BY runId,attemptId
), usage_events AS (
 SELECT *,COALESCE(json_extract(data,'$.attemptId'),stepId,eventId) attemptId,
 ROW_NUMBER() OVER(PARTITION BY COALESCE(json_extract(data,'$.usageId'),eventId) ORDER BY seq) ordinal
 FROM events WHERE sessionId=?1 AND type='usage.recorded'
), usage AS (
 SELECT e.seq,e.time,e.runId,e.attemptId,COALESCE(s.seq,e.seq) ownerSeq,s.time startedAt,
  CASE WHEN s.time IS NOT NULL AND e.time>=s.time THEN e.time-s.time END durationMs,
  COALESCE(json_extract(e.data,'$.input'),0) input,COALESCE(json_extract(e.data,'$.output'),0) output,
  COALESCE(json_extract(e.data,'$.cacheRead'),0) cacheRead,COALESCE(json_extract(e.data,'$.cacheWrite'),0) cacheWrite,
  json_extract(e.data,'$.cacheEligibleInput') eligibleInput,COALESCE(json_extract(e.data,'$.cost'),0) recordedCost,
  CASE WHEN json_extract(e.data,'$.pricing.available')=1
    AND (COALESCE(json_extract(e.data,'$.cacheRead'),0)=0 OR json_extract(e.data,'$.pricing.cacheReadPerMillion') IS NOT NULL)
    AND (COALESCE(json_extract(e.data,'$.cacheWrite'),0)=0 OR json_extract(e.data,'$.pricing.cacheWritePerMillion') IS NOT NULL)
   THEN json_extract(e.data,'$.cost')
   WHEN json_extract(e.data,'$.pricing') IS NULL AND json_extract(e.data,'$.cost')>0 THEN json_extract(e.data,'$.cost') END cost,
  COALESCE(json_extract(e.data,'$.modelSelectionId'),r.modelId,'unknown') model,
  json_extract(e.data,'$.pricing') pricing,COALESCE(json_extract(e.data,'$.source'),'model') source
 FROM usage_events e LEFT JOIN starts s ON s.attemptId=e.attemptId AND (s.runId=e.runId OR s.runId IS NULL AND e.runId IS NULL)
 LEFT JOIN runs r ON r.id=e.runId
 WHERE e.ordinal=1 AND COALESCE(s.seq,e.seq)>?2 AND COALESCE(s.seq,e.seq)<=?3
)
`

export const COMPACTION_FACTS_SQL = `
WITH compaction_events AS (
 SELECT COALESCE(json_extract(data,'$.compaction'),json_object('id',eventId,'seq',seq,'status','completed','startedAt',time,'modelId',COALESCE(json_extract(data,'$.modelId'),'unknown'))) record,seq,
 ROW_NUMBER() OVER(PARTITION BY COALESCE(json_extract(data,'$.compaction.id'),eventId) ORDER BY seq DESC) ordinal
 FROM events WHERE sessionId=?1 AND type IN ('context.compaction.started','context.compacted','context.compaction.settled')
  AND (json_extract(data,'$.compaction.id') IS NOT NULL OR type='context.compacted')
), compactions AS (
 SELECT json_extract(record,'$.id') id,json_extract(record,'$.seq') seq,
  json_extract(record,'$.status') status,json_extract(record,'$.startedAt') time,
  json_extract(record,'$.durationMs') durationMs,json_extract(record,'$.beforeTokens') beforeTokens,
  json_extract(record,'$.afterTokens') afterTokens,json_extract(record,'$.modelId') model,
  json_extract(record,'$.errorCode') errorCode,json_extract(record,'$.trigger') trigger
 FROM compaction_events WHERE ordinal=1 AND json_extract(record,'$.seq')>?2 AND json_extract(record,'$.seq')<=?3
)
`
