import type { Database } from 'bun:sqlite'
import { HbarError } from '@hbar/contracts'
import {
  contextHistoryInputSchema,
  contextCompactionRecordSchema,
  type ContextWindowStats,
  type ContextHistoryInput,
  type ContextHistoryPage,
  type ContextCompactionRecord,
} from '@hbar/contracts/context-history'
import { toolCallPresentationSchema, toolOutcomeSchema } from '@hbar/contracts'

function windowBoundary(db: Database, sessionId: string) {
  return db
    .query<{ seq: number; time: number }, [string]>(
      "SELECT seq,time FROM events WHERE sessionId=? AND type='context.compacted' ORDER BY seq DESC LIMIT 1",
    )
    .get(sessionId)
}

export function readWindowUsage(
  db: Database,
  sessionId: string,
  fromSeq: number,
  throughSeq: number,
  source?: string,
): ContextWindowStats['usage'] {
  const usage = db
    .query<ContextWindowStats['usage'], [string, number, number, string | null]>(
      `
    WITH facts AS (
      SELECT data, ROW_NUMBER() OVER (PARTITION BY COALESCE(json_extract(data,'$.usageId'),eventId) ORDER BY seq) AS ordinal
      FROM events WHERE sessionId=?1 AND seq>?2 AND seq<=?3 AND type='usage.recorded'
    )
    SELECT COALESCE(SUM(json_extract(data,'$.input')),0) AS input,
      COALESCE(SUM(json_extract(data,'$.output')),0) AS output,
      COALESCE(SUM(json_extract(data,'$.cacheRead')),0) AS cacheRead,
      COALESCE(SUM(json_extract(data,'$.cacheWrite')),0) AS cacheWrite,
      COALESCE(SUM(json_extract(data,'$.cost')),0) AS cost, COUNT(*) AS recorded, 0 AS requests
    FROM facts WHERE ordinal=1 AND (?4 IS NULL OR json_extract(data,'$.source')=?4)
  `,
    )
    .get(sessionId, fromSeq, throughSeq, source ?? null)
  // Request markers include failed attempts for which the provider returned no token accounting.
  const requests =
    db
      .query<{ count: number }, [string, number, number, string, string]>(
        `
    SELECT COUNT(*) AS count FROM events WHERE sessionId=? AND seq>? AND seq<=?
      AND type IN (?,?)
  `,
      )
      .get(
        sessionId,
        fromSeq,
        throughSeq,
        source === 'compaction' ? 'compaction.request' : 'request.started',
        'compaction.request',
      )?.count ?? 0
  return {
    input: usage?.input ?? 0,
    output: usage?.output ?? 0,
    cacheRead: usage?.cacheRead ?? 0,
    cacheWrite: usage?.cacheWrite ?? 0,
    cost: usage?.cost ?? 0,
    recorded: usage?.recorded ?? 0,
    requests,
  }
}

interface ToolRow {
  runId: string
  callId: string
  name: string
  args: string | null
  presentation: string | null
  outcome: string | null
  seq: number
}
/** Only small typed metadata crosses SQLite; large tool output bodies are never copied into this query. */
function readTools(db: Database, sessionId: string, fromSeq: number, throughSeq: number) {
  const rows = db
    .query<ToolRow, [string, number, number]>(
      `
    WITH facts AS (
      SELECT runId,seq,json_extract(block.value,'$.callId') AS callId,json_extract(block.value,'$.name') AS name,
        json_extract(block.value,'$.args') AS args,json_extract(block.value,'$.presentation') AS presentation,
        json_extract(block.value,'$.outcome') AS outcome
      FROM events,json_each(events.data,'$.content') AS block
      WHERE sessionId=?1 AND seq>?2 AND seq<=?3 AND events.type IN ('message.committed','tool.sequence_result')
        AND json_extract(block.value,'$.type') IN ('tool_call','tool_result')
      UNION ALL
      SELECT runId,seq,json_extract(data,'$.callId'),json_extract(data,'$.name'),
        COALESCE(json_extract(data,'$.args'),json_extract(data,'$.arguments')),json_extract(data,'$.presentation'),NULL
      FROM events WHERE sessionId=?1 AND seq>?2 AND seq<=?3 AND type IN ('tool.started','tool.sequence_call')
    ) SELECT * FROM facts WHERE runId IS NOT NULL AND callId IS NOT NULL ORDER BY seq
  `,
    )
    .all(sessionId, fromSeq, throughSeq)
  const calls = new Map<
    string,
    { name: string; args: unknown; presentation: unknown; outcome: unknown; result: boolean }
  >()
  for (const row of rows) {
    const key = `${row.runId}:${row.callId}:${row.name}`
    const previous = calls.get(key)
    calls.set(key, {
      name: row.name,
      args: row.args ? (JSON.parse(row.args) as unknown) : previous?.args,
      presentation: row.presentation ? (JSON.parse(row.presentation) as unknown) : previous?.presentation,
      outcome: row.outcome ? (JSON.parse(row.outcome) as unknown) : previous?.outcome,
      result: Boolean(row.outcome || previous?.result),
    })
  }
  // Legacy results have no Host outcome. Keep them unknown, never infer success from display text.
  const results = db
    .query<{ runId: string; callId: string; name: string }, [string, number, number]>(
      `
    SELECT runId,json_extract(block.value,'$.callId') AS callId,json_extract(block.value,'$.name') AS name
    FROM events,json_each(events.data,'$.content') AS block
    WHERE sessionId=? AND seq>? AND seq<=? AND events.type IN ('message.committed','tool.sequence_result')
      AND json_extract(block.value,'$.type')='tool_result'
  `,
    )
    .all(sessionId, fromSeq, throughSeq)
  for (const row of results) {
    const call = calls.get(`${row.runId}:${row.callId}:${row.name}`)
    if (call) call.result = true
  }
  const tools: ContextWindowStats['tools'] = {
    total: calls.size,
    succeeded: 0,
    failed: 0,
    denied: 0,
    cancelled: 0,
    interrupted: 0,
    unknown: 0,
    pending: 0,
    successRate: null,
  }
  const files = { reads: 0, writes: 0, readPaths: 0, writtenPaths: 0 }
  const readPaths = new Set<string>(),
    writtenPaths = new Set<string>()
  for (const call of calls.values()) {
    const outcome = toolOutcomeSchema.safeParse(call.outcome)
    if (outcome.success) tools[outcome.data.kind]++
    else tools[call.result ? 'unknown' : 'pending']++
    if (!outcome.success || outcome.data.kind !== 'succeeded') continue
    const presentation = toolCallPresentationSchema.safeParse(call.presentation)
    if (!presentation.success || !['file-read', 'file-write', 'file-edit'].includes(presentation.data.kind)) continue
    if (
      !('pathField' in presentation.data) ||
      !presentation.data.pathField ||
      !call.args ||
      typeof call.args !== 'object' ||
      Array.isArray(call.args)
    )
      continue
    const path = (call.args as Record<string, unknown>)[presentation.data.pathField]
    if (typeof path !== 'string' || !path.trim()) continue
    // Requested paths are counted, not filesystem inode identities; edits count as writes.
    const normalized = path.replaceAll('\\', '/').replace(/^\.\//, '')
    if (presentation.data.kind === 'file-read') {
      files.reads++
      readPaths.add(normalized)
    } else {
      files.writes++
      writtenPaths.add(normalized)
    }
  }
  files.readPaths = readPaths.size
  files.writtenPaths = writtenPaths.size
  const denominator = tools.succeeded + tools.failed
  tools.successRate = denominator ? tools.succeeded / denominator : null
  return { tools, files }
}

export function readContextWindowStats(
  db: Database,
  sessionId: string,
  fromSeq: number,
  throughSeq: number,
  startedAt: number,
  endedAt: number,
): ContextWindowStats {
  const totals = db
    .query<{ turns: number; runs: number }, [string, number, number]>(
      `
    SELECT COUNT(DISTINCT CASE WHEN type='message.committed' AND json_extract(data,'$.role')='user' THEN seq END) AS turns,
      COUNT(DISTINCT CASE WHEN type IN ('run.status','run.settled','request.started','compaction.request','message.committed','tool.started') THEN runId END) AS runs
    FROM events WHERE sessionId=? AND seq>? AND seq<=?
  `,
    )
    .get(sessionId, fromSeq, throughSeq)
  const execution =
    db
      .query<{ duration: number }, [number, number, string, number, number]>(
        `
    SELECT COALESCE(SUM(MAX(0,MIN(COALESCE(endedAt,?1),?1)-MAX(startedAt,?2))),0) AS duration
    FROM runs WHERE sessionId=?3 AND startedAt IS NOT NULL AND startedAt<=?4 AND COALESCE(endedAt,?4)>=?5
  `,
      )
      .get(endedAt, startedAt, sessionId, endedAt, startedAt)?.duration ?? 0
  return {
    fromSeq,
    throughSeq,
    startedAt,
    endedAt,
    wallDurationMs: Math.max(0, endedAt - startedAt),
    executionMs: execution,
    turns: totals?.turns ?? 0,
    runs: totals?.runs ?? 0,
    usage: readWindowUsage(db, sessionId, fromSeq, throughSeq),
    ...readTools(db, sessionId, fromSeq, throughSeq),
  }
}

export function readContextHistory(db: Database, value: ContextHistoryInput): ContextHistoryPage {
  const parsedInput = contextHistoryInputSchema.safeParse(value)
  if (!parsedInput.success) throw new HbarError('INVALID_INPUT', 'Invalid context history cursor or page size')
  const input = parsedInput.data
  const session = db
    .query<{ seq: number; createdAt: number }, [string]>('SELECT seq,createdAt FROM sessions WHERE id=?')
    .get(input.sessionId)
  if (!session) throw new HbarError('SESSION_NOT_FOUND', 'Session not found')
  const rows = db
    .query<{ data: string }, [string, number, number]>(
      `
    WITH facts AS (
      SELECT data,seq,ROW_NUMBER() OVER (PARTITION BY json_extract(data,'$.compaction.id') ORDER BY seq DESC) AS ordinal
      FROM events WHERE sessionId=? AND type IN ('context.compaction.started','context.compacted','context.compaction.settled')
        AND json_extract(data,'$.compaction.id') IS NOT NULL
    ) SELECT data FROM facts WHERE ordinal=1 AND json_extract(data,'$.compaction.seq')<?
      ORDER BY json_extract(data,'$.compaction.seq') DESC LIMIT ?
  `,
    )
    .all(input.sessionId, input.before ?? Number.MAX_SAFE_INTEGER, input.limit + 1)
  const records = rows.slice(0, input.limit).flatMap((row) => {
    const data: unknown = JSON.parse(row.data)
    if (!data || typeof data !== 'object' || !('compaction' in data)) return []
    const parsed = contextCompactionRecordSchema.safeParse(data.compaction)
    return parsed.success && parsed.data.sessionId === input.sessionId ? [parsed.data] : []
  })
  const boundary = windowBoundary(db, input.sessionId)
  return {
    sessionId: input.sessionId,
    records,
    before: records.at(-1)?.seq ?? null,
    hasOlder: rows.length > input.limit,
    current: readContextWindowStats(
      db,
      input.sessionId,
      boundary?.seq ?? 0,
      session.seq,
      boundary?.time ?? session.createdAt,
      Date.now(),
    ),
  }
}

export function beginContextCompaction(
  db: Database,
  input: Pick<ContextCompactionRecord, 'id' | 'sessionId' | 'runId' | 'modelId' | 'contextWindow' | 'beforeTokens'>,
): ContextCompactionRecord {
  const session = db
    .query<{ seq: number; createdAt: number }, [string]>('SELECT seq,createdAt FROM sessions WHERE id=?')
    .get(input.sessionId)
  if (!session) throw new HbarError('SESSION_NOT_FOUND', 'Session not found')
  const boundary = windowBoundary(db, input.sessionId)
  const window =
    (db
      .query<{ count: number }, [string]>('SELECT COUNT(*) AS count FROM compactions WHERE sessionId=?')
      .get(input.sessionId)?.count ?? 0) + 1
  const startedAt = Date.now()
  return {
    ...input,
    seq: session.seq + 1,
    window,
    status: 'running',
    startedAt,
    endedAt: null,
    durationMs: null,
    estimated: true,
    afterTokens: null,
    summaryTokens: null,
    retainedMessages: null,
    chunks: 0,
    errorCode: null,
    stats: readContextWindowStats(
      db,
      input.sessionId,
      boundary?.seq ?? 0,
      session.seq,
      boundary?.time ?? session.createdAt,
      startedAt,
    ),
    compactionUsage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, requests: 0, recorded: 0 },
  }
}

export function finishContextCompaction(
  db: Database,
  record: ContextCompactionRecord,
  completion: Pick<
    ContextCompactionRecord,
    'status' | 'durationMs' | 'afterTokens' | 'summaryTokens' | 'retainedMessages' | 'chunks' | 'errorCode'
  >,
): ContextCompactionRecord {
  const seq =
    db.query<{ seq: number }, [string]>('SELECT seq FROM sessions WHERE id=?').get(record.sessionId)?.seq ?? record.seq
  const compactionUsage = readWindowUsage(db, record.sessionId, record.seq, seq, 'compaction')
  const usage = readWindowUsage(db, record.sessionId, record.stats.fromSeq, seq)
  return {
    ...record,
    ...completion,
    endedAt: Date.now(),
    compactionUsage,
    stats: { ...record.stats, throughSeq: seq, usage },
  }
}
