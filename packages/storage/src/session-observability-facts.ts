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
  json_extract(b.value,'$.execution.endedAt') endedAt,json_extract(b.value,'$.execution.startedAt') startedAt,
  COALESCE(json_extract(b.value,'$.activity'),CASE WHEN json_extract(b.value,'$.name') IN ('skill','skill_read')
   AND json_extract(b.value,'$.details.kind')='skill-read' THEN json_object('skill',json_object(
    'id','legacy:'||json_extract(b.value,'$.details.name'),'name',json_extract(b.value,'$.details.name'),
    'resource',json_extract(b.value,'$.details.path'),'revision',json_extract(b.value,'$.details.revision'),
    'instruction',json_extract(b.value,'$.details.path')='SKILL.md',
    'completed',json_extract(b.value,'$.name')='skill' AND json_extract(b.value,'$.details.path')='SKILL.md' AND json_extract(b.value,'$.details.endOfFile')=1,
    'offset',CASE WHEN json_extract(b.value,'$.name')='skill' THEN 0 END)) END) activity
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
  CASE WHEN r.endedAt IS NOT NULL THEN r.elapsedMs END durationMs,r.activity,
  COALESCE(r.startedAt,CASE WHEN c.executed=1 THEN c.time END) startedAt,r.endedAt
 FROM calls c LEFT JOIN results r ON r.runId IS c.runId AND r.callId=c.callId AND r.name=c.name AND r.ordinal=1
 LEFT JOIN runs state ON state.id=c.runId
 WHERE c.ordinal=1
 UNION ALL
 SELECT r.runId,r.callId,r.name,r.seq,r.time,'tool',NULL,COALESCE(r.outcome,'unknown'),
  CASE WHEN r.endedAt IS NOT NULL THEN r.elapsedMs END,r.activity,r.startedAt,r.endedAt
 FROM results r WHERE r.ordinal=1 AND NOT EXISTS(SELECT 1 FROM calls c WHERE c.runId IS r.runId AND c.callId=r.callId AND c.name=r.name)
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
  AND t.label IS NOT NULL AND NOT EXISTS(SELECT 1 FROM measured_files f WHERE f.runId IS t.runId AND f.callId=t.callId AND f.name=t.name)
), skills AS (
 SELECT *,json_extract(activity,'$.skill.id') skillId,json_extract(activity,'$.skill.name') skillName,
  json_extract(activity,'$.skill.completed') completed,json_extract(activity,'$.skill.instruction') instruction,
  json_extract(activity,'$.skill.offset') offset,json_extract(activity,'$.skill.resource') resource,
  json_extract(activity,'$.skill.revision') revision,json_extract(activity,'$.skill.characters') characters,
  json_extract(activity,'$.skill.totalCharacters') totalCharacters,
  COALESCE((SELECT MAX(e.seq) FROM events e WHERE e.sessionId=?1 AND e.type='context.compacted' AND e.seq<tools.seq),0) windowSeq
 FROM tools WHERE outcome='succeeded' AND json_extract(activity,'$.skill.id') IS NOT NULL
), skill_pages AS (
 SELECT *,MAX(offset+characters) OVER(PARTITION BY runId,skillId,revision,windowSeq ORDER BY offset,seq ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) earlierThrough
 FROM skills WHERE instruction=1
), skill_uses AS (
 SELECT runId,skillId,revision,windowSeq,
 CASE WHEN MAX(totalCharacters) IS NULL THEN MAX(completed)
  ELSE MIN(offset)=0 AND MAX(offset+characters)>=MAX(totalCharacters)
   AND SUM(CASE WHEN offset>COALESCE(earlierThrough,0) THEN 1 ELSE 0 END)=0 END used
 FROM skill_pages GROUP BY runId,skillId,revision,windowSeq
)
`

export const USAGE_FACTS_SQL = `
WITH starts AS MATERIALIZED (
 SELECT runId,MIN(seq) seq,MIN(time) time,COALESCE(json_extract(data,'$.attemptId'),stepId,eventId) attemptId,
  MAX(json_extract(data,'$.modelSelectionId')) model,MAX(json_extract(data,'$.pricing')) pricing,
  CASE WHEN MAX(type='compaction.request') THEN 'compaction' ELSE 'model' END source
 FROM events WHERE sessionId=?1 AND type IN ('request.started','compaction.request')
 GROUP BY runId,attemptId
), usage_events AS MATERIALIZED (
 SELECT *,COALESCE(json_extract(data,'$.attemptId'),stepId,eventId) attemptId,
 ROW_NUMBER() OVER(PARTITION BY COALESCE(json_extract(data,'$.usageId'),eventId) ORDER BY seq) ordinal
 FROM events WHERE sessionId=?1 AND type='usage.recorded'
), usage AS MATERIALIZED (
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

/** One report-scoped statement shares usage identities across totals, series, latency and request concurrency. */
export const USAGE_REPORT_SQL = `${USAGE_FACTS_SQL},markers AS MATERIALIZED (
 SELECT runId,COALESCE(json_extract(data,'$.attemptId'),stepId,eventId) attemptId,MIN(time) time
 FROM events WHERE sessionId=?1 AND type='attempt.firstText' GROUP BY runId,attemptId
),first_text_ranked AS (
 SELECT m.time-s.time value,ROW_NUMBER() OVER(ORDER BY m.time-s.time) ordinal,COUNT(*) OVER() total
 FROM starts s JOIN markers m ON m.runId IS s.runId AND m.attemptId=s.attemptId
 WHERE s.seq>?2 AND s.seq<=?3 AND m.time>=s.time
),first_text AS (
 SELECT MAX(CASE WHEN ordinal=CAST((total*95+99)/100 AS INTEGER) THEN value END) p95Ms,COUNT(*) samples
 FROM first_text_ranked
),response_ranked AS (
 SELECT durationMs,ROW_NUMBER() OVER(ORDER BY durationMs) ordinal,COUNT(*) OVER() total
 FROM usage WHERE durationMs IS NOT NULL
),response AS (
 SELECT MAX(CASE WHEN ordinal=CAST((total*95+99)/100 AS INTEGER) THEN durationMs END) p95Ms,COUNT(*) samples
 FROM response_ranked
),series_rows AS (
 SELECT ?4+MIN(39,MAX(0,CAST((time-?4)/?6 AS INTEGER)))*?6 start,
  SUM(input) input,SUM(output) output,SUM(cacheRead) cacheRead
 FROM usage GROUP BY start
),series AS (
 SELECT COALESCE(json_group_array(json_object('start',start,'input',input,'output',output,'cacheRead',cacheRead)),'[]') value
 FROM (SELECT start,input,output,cacheRead FROM series_rows ORDER BY start)
),request_intervals AS (
 SELECT startedAt start,time end FROM usage WHERE startedAt IS NOT NULL
),request_clipped AS (
 SELECT MAX(?4,start) start,MIN(?5,MAX(start+1,end)) end
 FROM request_intervals WHERE start IS NOT NULL AND end>=start
),request_points AS (
 SELECT start time,1 change FROM request_clipped WHERE end>start
 UNION ALL SELECT end,-1 FROM request_clipped WHERE end>start
),request_running AS (
 SELECT SUM(change) OVER(ORDER BY time,change ROWS UNBOUNDED PRECEDING) active FROM request_points
),request_concurrency AS (
 SELECT MAX(active) value FROM request_running
)
SELECT COALESCE(SUM(input),0) input,COALESCE(SUM(output),0) output,
 COALESCE(SUM(cacheRead),0) cacheRead,COALESCE(SUM(cacheWrite),0) cacheWrite,
 COALESCE(SUM(MAX(0,input-cacheRead)+output),0) billableTokens,COUNT(*) recorded,
 COUNT(DISTINCT model) models,
 (SELECT COUNT(*) FROM (
   SELECT runId,attemptId FROM starts WHERE seq>?2 AND seq<=?3
   UNION SELECT runId,attemptId FROM usage
  )) requests,
 (SELECT COUNT(DISTINCT runId) FROM events WHERE sessionId=?1 AND seq>?2 AND seq<=?3
  AND type IN ('run.status','run.settled','message.committed','request.started','compaction.request','tool.started')) runs,
 (SELECT COUNT(*) FROM events e LEFT JOIN runs r ON r.id=e.runId WHERE e.sessionId=?1 AND e.seq>?2 AND e.seq<=?3
  AND e.type='message.committed' AND json_extract(e.data,'$.role')='user'
  AND (json_extract(e.data,'$.queueGuidance') IS NOT NULL OR COALESCE(json_extract(r.input,'$.source'),'user')='user')) turns,
 CASE WHEN COUNT(*)=COUNT(cost) THEN COALESCE(SUM(cost),0) END cost,
 COALESCE(SUM(cost),0) knownCost,COUNT(cost) pricedRequests,
 CASE WHEN COUNT(*)=COUNT(eligibleInput) THEN 1.0*SUM(cacheRead)/NULLIF(SUM(eligibleInput),0) END cacheHitRate,
 1.0*SUM(cacheRead)/NULLIF(SUM(input),0) cacheInputShare,
 SUM(durationMs) durationMs,COUNT(durationMs) timingSamples,
 CASE WHEN COUNT(*)=COUNT(durationMs) THEN 1000.0*SUM(input+output)/NULLIF(SUM(durationMs),0) END tokensPerSecond,
 CASE WHEN COUNT(*)=COUNT(durationMs) THEN 1000.0*SUM(output)/NULLIF(SUM(durationMs),0) END outputPerSecond,
 (SELECT p95Ms FROM first_text) firstTextP95Ms,
 (SELECT samples FROM first_text) firstTextSamples,
 (SELECT p95Ms FROM response) responseP95Ms,
 (SELECT samples FROM response) responseSamples,
 (SELECT value FROM series) seriesJson,
 (SELECT value FROM request_concurrency) requestConcurrency
FROM usage`

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
