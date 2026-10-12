import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sessionObservabilityReportSchema } from '@hbar/contracts/session-observability'
import { readObservabilityUsageFacts } from '../packages/storage/src/session-observability-usage'
import { USAGE_FACTS_SQL } from '../packages/storage/src/session-observability-facts'

const legacyFactsSql = USAGE_FACTS_SQL.replaceAll(' AS MATERIALIZED (', ' AS (')

function readLegacy(db: Database, args: [string, number, number], range: { startedAt: number; endedAt: number }) {
  const usage = db
    .query<Record<string, unknown>, [string, number, number]>(
      `${legacyFactsSql}
      SELECT COALESCE(SUM(input),0) input,COALESCE(SUM(output),0) output,
        COALESCE(SUM(cacheRead),0) cacheRead,COALESCE(SUM(cacheWrite),0) cacheWrite,
        COUNT(*) recorded,COUNT(DISTINCT model) models,
        (SELECT COUNT(DISTINCT COALESCE(runId,'')||':'||attemptId) FROM starts WHERE seq>?2 AND seq<=?3) requests,
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
        CASE WHEN COUNT(*)=COUNT(durationMs) THEN 1000.0*SUM(output)/NULLIF(SUM(durationMs),0) END outputPerSecond
      FROM usage`,
    )
    .get(...args)
  if (!usage) throw new Error('Legacy aggregate returned no row')

  const bucketMs = Math.max(1, Math.ceil(Math.max(1, range.endedAt - range.startedAt + 1) / 40))
  const series = db
    .query<Record<string, unknown>, [string, number, number, number, number]>(
      `${legacyFactsSql}
      SELECT ?4+MIN(39,MAX(0,CAST((time-?4)/?5 AS INTEGER)))*?5 start,
        SUM(input) input,SUM(output) output,SUM(cacheRead) cacheRead
      FROM usage GROUP BY start ORDER BY start`,
    )
    .all(...args, range.startedAt, bucketMs)
  return {
    usage: sessionObservabilityReportSchema.shape.usage.parse(usage),
    series: sessionObservabilityReportSchema.shape.series.parse(series),
  }
}

function createDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE events (
      sessionId TEXT NOT NULL, runId TEXT, seq INTEGER NOT NULL, time INTEGER NOT NULL,
      type TEXT NOT NULL, data TEXT NOT NULL, stepId TEXT, eventId TEXT NOT NULL,
      PRIMARY KEY(sessionId,seq)
    );
    CREATE TABLE runs (id TEXT PRIMARY KEY, modelId TEXT, input TEXT NOT NULL);
  `)
  return db
}

function insertEvent(
  db: Database,
  seq: number,
  time: number,
  type: string,
  data: unknown,
  runId: string | null,
  eventId: string,
) {
  db.query('INSERT INTO events(sessionId,runId,seq,time,type,data,eventId) VALUES (?,?,?,?,?,?,?)').run(
    'session',
    runId,
    seq,
    time,
    type,
    JSON.stringify(data),
    eventId,
  )
}

describe('scoped observability usage facts', () => {
  test('matches legacy aggregates and series with cross-boundary ownership and usage deduplication', () => {
    const db = createDb()
    try {
      db.query('INSERT INTO runs(id,modelId,input) VALUES (?,?,?)').run(
        'run',
        'fixture/model',
        JSON.stringify({ source: 'user' }),
      )
      insertEvent(db, 5, 100, 'request.started', { attemptId: 'attempt' }, 'run', 'start')
      insertEvent(
        db,
        10,
        110,
        'message.committed',
        { role: 'user', queueGuidance: { activeRunId: 'active', queuedRunIds: [] } },
        'run',
        'guided-turn',
      )
      const pricedUsage = {
        attemptId: 'attempt',
        usageId: 'once',
        modelSelectionId: 'fixture/model',
        input: 101,
        output: 23,
        cacheRead: 31,
        cacheWrite: 4,
        cacheEligibleInput: 77,
        cost: 0.000000000123456789,
        pricing: { available: true, inputPerMillion: 1 },
      }
      // The request starts outside this turn, but its late usage is owned by the start sequence.
      insertEvent(db, 20, 200, 'usage.recorded', pricedUsage, 'run', 'usage-first')
      insertEvent(db, 21, 210, 'usage.recorded', { ...pricedUsage, input: 999 }, 'run', 'usage-duplicate')
      insertEvent(db, 22, 220, 'request.started', { attemptId: 'inside' }, 'run', 'start-inside')
      insertEvent(
        db,
        23,
        230,
        'usage.recorded',
        { attemptId: 'inside', usageId: 'inside-usage', input: 7, output: 2 },
        'run',
        'usage-inside',
      )

      const range = {
        scope: 'turn' as const,
        anchor: 10,
        ordinal: 2,
        label: '',
        fromSeq: 9,
        throughSeq: 23,
        startedAt: 110,
        endedAt: 240,
        previous: 5,
        next: null,
      }
      const args: [string, number, number] = ['session', range.fromSeq, range.throughSeq]
      const actual = readObservabilityUsageFacts(db, args, range)
      expect(actual).toEqual(readLegacy(db, args, range))
      expect(actual.usage).toMatchObject({ requests: 1, recorded: 1, input: 7, output: 2 })
      const sessionRange = { ...range, scope: 'session' as const, fromSeq: 0, throughSeq: 23, startedAt: 100 }
      const sessionArgs: [string, number, number] = ['session', 0, 23]
      const session = readObservabilityUsageFacts(db, sessionArgs, sessionRange)
      expect(session).toEqual(readLegacy(db, sessionArgs, sessionRange))
      expect(session.usage).toMatchObject({ requests: 2, recorded: 2, input: 108, output: 25 })
    } finally {
      db.close()
    }
  })

  test('matches empty ranges, nullable measurements, and exact scalar number results', () => {
    const db = createDb()
    try {
      db.query('INSERT INTO runs(id,modelId,input) VALUES (?,?,?)').run(
        'run',
        'fixture/model',
        JSON.stringify({ source: 'user' }),
      )
      insertEvent(db, 1, 100, 'request.started', { attemptId: 'attempt' }, 'run', 'start')
      insertEvent(
        db,
        2,
        101,
        'usage.recorded',
        { attemptId: 'attempt', usageId: 'usage', input: 3, output: 1, cost: 0.000000000123456789 },
        'run',
        'usage',
      )
      const cases = [
        { args: ['session', 0, 2] as [string, number, number], startedAt: 100, endedAt: 120 },
        { args: ['session', 20, 30] as [string, number, number], startedAt: 120, endedAt: 130 },
      ]
      for (const item of cases) {
        const range = {
          scope: 'session' as const,
          anchor: 0,
          ordinal: 0,
          label: '',
          fromSeq: item.args[1],
          throughSeq: item.args[2],
          startedAt: item.startedAt,
          endedAt: item.endedAt,
          previous: null,
          next: null,
        }
        expect(readObservabilityUsageFacts(db, item.args, range)).toEqual(readLegacy(db, item.args, range))
      }
      const full = readObservabilityUsageFacts(db, cases[0]!.args, {
        scope: 'session',
        anchor: 0,
        ordinal: 0,
        label: '',
        fromSeq: 0,
        throughSeq: 2,
        startedAt: 100,
        endedAt: 120,
        previous: null,
        next: null,
      })
      expect(full.usage.knownCost).toBe(0.000000000123456789)
      expect(full.usage.timingSamples).toBe(1)
      expect(full.series).toEqual([{ start: 101, input: 3, output: 1, cacheRead: 0 }])
    } finally {
      db.close()
    }
  })
})
