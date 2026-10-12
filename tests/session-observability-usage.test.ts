import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sessionObservabilityReportSchema } from '@hbar/contracts/session-observability'
import { readObservabilityUsageFacts } from '../packages/storage/src/session-observability-usage'
import { USAGE_FACTS_SQL } from '../packages/storage/src/session-observability-facts'

// Restore the pre-fix, non-materialized CTE prefix for the legacy equivalence oracle.
const LEGACY_USAGE_FACTS_SQL = USAGE_FACTS_SQL.replaceAll(' AS MATERIALIZED (', ' AS (')

type Range = {
  startedAt: number
  endedAt: number
}

function readLegacyUsageFacts(db: Database, args: [string, number, number], range: Range) {
  const usage = db
    .query<Record<string, unknown>, [string, number, number]>(
      `${LEGACY_USAGE_FACTS_SQL}
      SELECT COALESCE(SUM(input),0) input,COALESCE(SUM(output),0) output,COALESCE(SUM(cacheRead),0) cacheRead,
        COALESCE(SUM(cacheWrite),0) cacheWrite,COALESCE(SUM(MAX(0,input-cacheRead)+output),0) billableTokens,
        COUNT(*) recorded,COUNT(DISTINCT model) models,
        (SELECT COUNT(*) FROM (
          SELECT runId,attemptId FROM starts WHERE seq>?2 AND seq<=?3
          UNION SELECT runId,attemptId FROM usage
        )) requests,
        (SELECT COUNT(DISTINCT runId) FROM events WHERE sessionId=?1 AND seq>?2 AND seq<=?3
          AND type IN ('run.status','run.settled','message.committed','request.started','compaction.request','tool.started')) runs,
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
  const firstText = db
    .query<{ p95Ms: number | null; samples: number }, [string, number, number]>(
      `${LEGACY_USAGE_FACTS_SQL},markers AS (
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
      `${LEGACY_USAGE_FACTS_SQL},ranked AS (
       SELECT durationMs,ROW_NUMBER() OVER(ORDER BY durationMs) ordinal,COUNT(*) OVER() total
       FROM usage WHERE durationMs IS NOT NULL
      ) SELECT MAX(CASE WHEN ordinal=CAST((total*95+99)/100 AS INTEGER) THEN durationMs END) p95Ms,COUNT(*) samples FROM ranked`,
    )
    .get(...args)
  const bucketMs = Math.max(1, Math.ceil(Math.max(1, range.endedAt - range.startedAt + 1) / 40))
  const series = db
    .query<Record<string, unknown>, [string, number, number, number, number]>(
      `${LEGACY_USAGE_FACTS_SQL}
       SELECT ?4+MIN(39,MAX(0,CAST((time-?4)/?5 AS INTEGER)))*?5 start,
        SUM(input) input,SUM(output) output,SUM(cacheRead) cacheRead
       FROM usage GROUP BY start ORDER BY start`,
    )
    .all(...args, range.startedAt, bucketMs)
  const requestConcurrency =
    db
      .query<{ maximum: number | null }, [string, number, number, number, number]>(
        `${LEGACY_USAGE_FACTS_SQL},intervals AS (
        SELECT startedAt start,time end FROM usage WHERE startedAt IS NOT NULL
       ),clipped AS (
        SELECT MAX(?4,start) start,MIN(?5,MAX(start+1,end)) end FROM intervals WHERE start IS NOT NULL AND end>=start
       ),points AS (
        SELECT start time,1 change FROM clipped WHERE end>start
        UNION ALL SELECT end,-1 FROM clipped WHERE end>start
       ),running AS (
        SELECT SUM(change) OVER(ORDER BY time,change ROWS UNBOUNDED PRECEDING) active FROM points
       ) SELECT MAX(active) maximum FROM running`,
      )
      .get(...args, range.startedAt, range.endedAt)?.maximum ?? null
  if (usage === null || usage === undefined || !firstText || !response)
    throw new Error('Legacy usage baseline returned no aggregate row')
  return {
    usage: sessionObservabilityReportSchema.shape.usage.parse(usage),
    latency: sessionObservabilityReportSchema.shape.latency.parse({ firstText, response }),
    requestConcurrency,
    series: sessionObservabilityReportSchema.shape.series.parse(series),
  }
}

describe('scoped observability usage facts', () => {
  test('shares materialized facts while retaining cross-boundary ownership and deduplication', () => {
    const db = new Database(':memory:')
    try {
      db.exec(`
        CREATE TABLE events (
          sessionId TEXT NOT NULL, runId TEXT, seq INTEGER NOT NULL, time INTEGER NOT NULL,
          type TEXT NOT NULL, data TEXT NOT NULL, stepId TEXT, eventId TEXT NOT NULL,
          PRIMARY KEY(sessionId,seq)
        );
        CREATE TABLE runs (id TEXT PRIMARY KEY, modelId TEXT, input TEXT NOT NULL);
        CREATE INDEX events_session_type_seq ON events(sessionId,type,seq);
      `)
      const insertRun = db.query('INSERT INTO runs(id,modelId,input) VALUES (?,?,?)')
      insertRun.run('run-inside', 'gpt-6.1-sol', JSON.stringify({ source: 'user' }))
      insertRun.run('run-outside', 'gpt-6.1-sol', JSON.stringify({ source: 'user' }))
      insertRun.run('guided-run', 'gpt-6.1-sol', JSON.stringify({ source: 'system' }))
      const insert = db.query(
        'INSERT INTO events(sessionId,runId,seq,time,type,data,stepId,eventId) VALUES (?,?,?,?,?,?,?,?)',
      )
      const add = (seq: number, time: number, type: string, data: unknown, runId: string | null, eventId: string) =>
        insert.run('session', runId, seq, time, type, JSON.stringify(data), null, eventId)
      const pricing = {
        available: true,
        inputPerMillion: 1,
        outputPerMillion: 2,
        cacheReadPerMillion: 0.5,
        cacheWritePerMillion: 0.75,
      }

      add(5, 1050, 'request.started', { attemptId: 'before-turn' }, 'run-outside', 'start-before')
      add(
        10,
        1100,
        'message.committed',
        { role: 'user', queueGuidance: { activeRunId: 'active', queuedRunIds: [] } },
        'guided-run',
        'guided-message',
      )
      add(
        11,
        1110,
        'request.started',
        { attemptId: 'inside-turn', modelSelectionId: 'selection-A', pricing },
        'run-inside',
        'start-inside',
      )
      add(12, 1120, 'attempt.firstText', { attemptId: 'inside-turn' }, 'run-inside', 'first-text')
      add(
        15,
        1150,
        'usage.recorded',
        { attemptId: 'before-turn', usageId: 'usage-before', input: 900, output: 90, cost: 9 },
        'run-outside',
        'usage-before',
      )
      add(
        25,
        1250,
        'usage.recorded',
        {
          attemptId: 'inside-turn',
          usageId: 'usage-inside',
          modelSelectionId: 'selection-A',
          pricing,
          input: 100,
          output: 20,
          cacheRead: 30,
          cacheWrite: 5,
          cacheEligibleInput: 100,
          cost: 0.04,
        },
        'run-inside',
        'usage-inside-first',
      )
      add(
        26,
        1260,
        'usage.recorded',
        { attemptId: 'inside-turn', usageId: 'usage-inside', input: 999, output: 999, cost: 99 },
        'run-inside',
        'usage-inside-duplicate',
      )

      const facts = readObservabilityUsageFacts(db, ['session', 9, 19], {
        scope: 'turn',
        anchor: 10,
        ordinal: 1,
        label: 'queued guidance',
        fromSeq: 9,
        throughSeq: 19,
        startedAt: 1100,
        endedAt: 1200,
        previous: 5,
        next: 20,
      })
      expect(facts).toEqual(readLegacyUsageFacts(db, ['session', 9, 19], { startedAt: 1100, endedAt: 1200 }))

      expect(facts.usage).toMatchObject({
        input: 100,
        output: 20,
        cacheRead: 30,
        cacheWrite: 5,
        billableTokens: 90,
        requests: 1,
        runs: 2,
        turns: 1,
        recorded: 1,
        models: 1,
        cost: 0.04,
        knownCost: 0.04,
        pricedRequests: 1,
        durationMs: 140,
        timingSamples: 1,
      })
      expect(facts.latency).toEqual({
        firstText: { p95Ms: 10, samples: 1 },
        response: { p95Ms: 140, samples: 1 },
      })
      expect(facts.requestConcurrency).toBe(1)
      expect(facts.series).toEqual([{ start: 1217, input: 100, output: 20, cacheRead: 30 }])
    } finally {
      db.close()
    }
  })

  test('matches legacy results for session, turn, window, missing facts and an empty range', () => {
    const db = new Database(':memory:')
    try {
      db.exec(`
        CREATE TABLE events (
          sessionId TEXT NOT NULL, runId TEXT, seq INTEGER NOT NULL, time INTEGER NOT NULL,
          type TEXT NOT NULL, data TEXT NOT NULL, stepId TEXT, eventId TEXT NOT NULL,
          PRIMARY KEY(sessionId,seq)
        );
        CREATE TABLE runs (id TEXT PRIMARY KEY, modelId TEXT, input TEXT NOT NULL);
      `)
      const insertRun = db.query('INSERT INTO runs(id,modelId,input) VALUES (?,?,?)')
      for (const id of ['one', 'two', 'three'])
        insertRun.run(`run-${id}`, 'gpt-6.1-sol', JSON.stringify({ source: 'user' }))
      const insert = db.query(
        'INSERT INTO events(sessionId,runId,seq,time,type,data,stepId,eventId) VALUES (?,?,?,?,?,?,?,?)',
      )
      const add = (seq: number, time: number, type: string, data: unknown, id: string) =>
        insert.run('session', `run-${id}`, seq, time, type, JSON.stringify(data), null, `${type}-${id}`)
      add(1, 100, 'request.started', { attemptId: 'one' }, 'one')
      add(2, 200, 'request.started', { attemptId: 'two' }, 'two')
      add(3, 250, 'request.started', { attemptId: 'three' }, 'three')
      add(
        4,
        90,
        'usage.recorded',
        {
          attemptId: 'one',
          usageId: 'usage-one',
          modelSelectionId: 'selection-one',
          pricing: { available: true },
          input: 50,
          output: 5,
          cacheRead: 5,
          cacheWrite: 0,
          cacheEligibleInput: 50,
          cost: 10,
        },
        'one',
      )
      add(
        5,
        250,
        'usage.recorded',
        {
          attemptId: 'two',
          usageId: 'usage-two',
          input: 10,
          output: 2,
          cacheRead: 1,
          cacheEligibleInput: 3,
          cost: 0.1,
        },
        'two',
      )
      add(
        6,
        260,
        'usage.recorded',
        {
          attemptId: 'three',
          usageId: 'usage-three',
          input: 20,
          output: 3,
          cacheRead: 2,
          cacheEligibleInput: 7,
          cost: 0.2,
        },
        'three',
      )

      const cases = [
        {
          scope: 'session' as const,
          args: ['session', 0, 10] as [string, number, number],
          startedAt: 100,
          endedAt: 300,
        },
        { scope: 'turn' as const, args: ['session', 1, 2] as [string, number, number], startedAt: 200, endedAt: 250 },
        { scope: 'window' as const, args: ['session', 1, 3] as [string, number, number], startedAt: 200, endedAt: 300 },
        { scope: 'turn' as const, args: ['session', 50, 60] as [string, number, number], startedAt: 300, endedAt: 310 },
      ]
      for (const scenario of cases) {
        const range = {
          scope: scenario.scope,
          anchor: 0,
          ordinal: 0,
          label: '',
          fromSeq: scenario.args[1],
          throughSeq: scenario.args[2],
          startedAt: scenario.startedAt,
          endedAt: scenario.endedAt,
          previous: null,
          next: null,
        }
        const actual = readObservabilityUsageFacts(db, scenario.args, range)
        const expected = readLegacyUsageFacts(db, scenario.args, range)
        expect(actual).toEqual(expected)
        if (scenario.scope === 'session') {
          expect(actual.usage).toMatchObject({
            recorded: 3,
            durationMs: 60,
            timingSamples: 2,
            cost: null,
            knownCost: 0.30000000000000004,
            pricedRequests: 2,
            cacheHitRate: 8 / 60,
          })
        }
        if (scenario.args[1] === 50) {
          expect(actual.latency.firstText).toEqual({ p95Ms: null, samples: 0 })
          expect(actual.usage).toMatchObject({ cost: 0, knownCost: 0, pricedRequests: 0 })
          expect(actual.requestConcurrency).toBeNull()
          expect(actual.series).toEqual([])
        }
      }
      const adjacent = readObservabilityUsageFacts(db, ['session', 1, 3], {
        scope: 'window',
        anchor: 1,
        ordinal: 1,
        label: '',
        fromSeq: 1,
        throughSeq: 3,
        startedAt: 200,
        endedAt: 300,
        previous: 0,
        next: null,
      })
      expect(adjacent.requestConcurrency).toBe(1)
      expect(adjacent.latency).toEqual({
        firstText: { p95Ms: null, samples: 0 },
        response: { p95Ms: 50, samples: 2 },
      })
    } finally {
      db.close()
    }
  })
})
