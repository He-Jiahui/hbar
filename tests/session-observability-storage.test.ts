import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, realpath } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { Storage } from '@hbar/storage'
import type { ToolActivity } from '@hbar/contracts/tool-activity'
import { sessionObservabilityReportSchema } from '@hbar/contracts/session-observability'
import { parseContextCompactionEvent } from '@hbar/contracts/context-history'
import { observabilityRange } from '../packages/storage/src/session-observability-range'
import { Database } from 'bun:sqlite'

const resources: { root: string; storage: Storage }[] = []
afterEach(async () => {
  for (const { root, storage } of resources.splice(0)) {
    await storage.close()
    const target = await realpath(root)
    if (dirname(target) !== (await realpath(tmpdir())) || !basename(target).startsWith('hbar-observability-'))
      throw new Error('Non-owned fixture')
    await rm(target, { recursive: true, force: true })
  }
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-observability-'))
  const storage = new Storage(join(root, 'session.sqlite'))
  resources.push({ root, storage })
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', root, 'Observability')
  const session = await storage.call('createSession', workspace.id)
  const run = await storage.call('enqueue', session.id, 'human', { text: 'first task', images: [] }, 'fixture/model')
  await storage.call('claim', session.id)
  const turn = await storage.call('commit', session.id, run.id, 'user', [{ type: 'text', text: 'first task' }])
  return { root, storage, session, run, turn }
}
async function tool(
  f: Awaited<ReturnType<typeof fixture>>,
  id: string,
  kind: 'command' | 'file-read' | 'file-write',
  outcome: 'succeeded' | 'failed' | 'cancelled',
  duration: number | null,
  activity?: ToolActivity,
) {
  const presentation =
    kind === 'command'
      ? { version: 1 as const, kind, commandField: 'command' }
      : { version: 1 as const, kind, pathField: 'path' }
  await f.storage.call('commit', f.session.id, f.run.id, 'assistant', [
    { type: 'tool_call', callId: id, name: kind, args: { path: 'a.txt', command: `echo ${id}` }, presentation },
  ])
  return f.storage.call('commit', f.session.id, f.run.id, 'tool', [
    {
      type: 'tool_result',
      callId: id,
      name: kind,
      text: 'private tool output',
      isError: outcome !== 'succeeded',
      outcome: { kind: outcome, executionStarted: true },
      ...(duration === null ? {} : { execution: { startedAt: 10, endedAt: 11, elapsedMs: duration } }),
      ...(activity ? { activity } : {}),
    },
  ])
}
async function compact(f: Awaited<ReturnType<typeof fixture>>, completed: boolean) {
  const event = await f.storage.call('compactionStart', {
    id: crypto.randomUUID(),
    sessionId: f.session.id,
    runId: f.run.id,
    trigger: 'automatic',
    modelId: 'fixture/model',
    contextWindow: 10000,
    beforeTokens: 8000,
  })
  const record = parseContextCompactionEvent(event)
  if (!record) throw new Error('Missing record')
  return completed
    ? f.storage.call('compact', f.session.id, f.turn.message.seq, 'private summary', 'fixture/model', {
        record,
        durationMs: 250,
        afterTokens: 2000,
        summaryTokens: 1000,
        retainedMessages: 1,
        chunks: 1,
      })
    : f.storage.call('compactionFinish', record, {
        status: 'failed',
        durationMs: 100,
        afterTokens: null,
        summaryTokens: null,
        retainedMessages: null,
        chunks: 0,
        errorCode: 'COMPACTION_FAILED',
      })
}

describe('Session SQLite observability', () => {
  test('skill details use the latest instruction revision and never substitute a resource hash', async () => {
    const f = await fixture()
    const base = {
      id: 'versioned-skill',
      resource: 'SKILL.md',
      instruction: true,
      completed: true,
      offset: 0,
      characters: 3,
      totalCharacters: 3,
    }
    await tool(f, 'old-version', 'file-read', 'succeeded', 1, { skill: { ...base, name: 'Zulu', revision: 'z' } })
    await tool(f, 'new-version', 'file-read', 'succeeded', 1, { skill: { ...base, name: 'Alpha', revision: 'a' } })
    await tool(f, 'reference', 'file-read', 'succeeded', 1, {
      skill: {
        ...base,
        name: 'Alpha',
        revision: 'resource-hash',
        instruction: false,
        completed: false,
        resource: 'references/guide.md',
      },
    })
    const report = await f.storage.call('sessionObservability', { sessionId: f.session.id, detail: 'skills' })
    expect(report.records[0]).toMatchObject({
      id: 'versioned-skill',
      label: 'Alpha',
      secondary: 'a',
      count: 2,
      failed: 1,
    })
  })
  test('keeps scoped model shares, measured latency and concurrency, with clipped Run durations', async () => {
    const f = await fixture()
    const origin = Date.now() - 10_000
    const timedEvents: { eventId: string; time: number }[] = []
    const append = async (type: string, data: unknown, time: number) => {
      const event = await f.storage.call('append', f.session.id, type, data, f.run.id)
      timedEvents.push({ eventId: event.eventId, time: origin + time })
    }
    const pricing = {
      available: true,
      currency: 'USD',
      inputPerMillion: 2,
      outputPerMillion: 8,
      cacheReadPerMillion: 0.5,
      cacheWritePerMillion: null,
      source: 'provider-config',
      version: 'original',
      effectiveAt: null,
    }
    await append('request.started', { attemptId: 'a' }, 100)
    await append('request.started', { attemptId: 'b' }, 150)
    await append('request.started', { attemptId: 'c' }, 200)
    for (const [attemptId, time] of [
      ['a', 140],
      ['b', 230],
      ['c', 250],
      ['c', 280],
    ] as const)
      await append('attempt.firstText', { attemptId }, time)
    for (const [attemptId, modelSelectionId, time, cost, output, cacheRead, available] of [
      ['a', 'original/model', 200, 0.125, 20, 40, true],
      ['b', 'other/model', 350, 0, 20, 0, false],
      ['c', 'original/model', 300, 0.25, 10, 0, true],
    ] as const)
      await append(
        'usage.recorded',
        {
          usageId: attemptId,
          attemptId,
          modelSelectionId,
          input: 100,
          output,
          cacheRead,
          cacheWrite: 0,
          cost,
          pricing: { ...pricing, available },
        },
        time,
      )
    await append('request.started', { attemptId: 'untimed' }, 500)
    await append('attempt.firstText', { attemptId: 'untimed' }, 480)
    const toolResults: { eventId: string; start: number; end: number }[] = []
    for (const [id, start, end] of [
      ['one', 100, 200],
      ['two', 150, 350],
      ['three', 200, 300],
    ] as const) {
      const result = await tool(f, id, 'command', 'succeeded', end - start)
      toolResults.push({ eventId: result.event.eventId, start: origin + start, end: origin + end })
    }
    const compacted = await compact(f, true)
    if (!compacted) throw new Error('Missing successful compaction event')
    timedEvents.push({ eventId: compacted.eventId, time: origin + 800 })
    const secondTurn = await f.storage.call('commit', f.session.id, f.run.id, 'user', [
      { type: 'text', text: 'second task' },
    ])
    timedEvents.push({ eventId: secondTurn.event.eventId, time: origin + 850 })
    await append('request.started', { attemptId: 'new-window' }, 900)
    await append('attempt.firstText', { attemptId: 'new-window' }, 960)
    await append(
      'usage.recorded',
      {
        usageId: 'new-window',
        attemptId: 'new-window',
        modelSelectionId: 'fresh/model',
        input: 500,
        output: 50,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0.75,
        pricing,
      },
      1300,
    )
    await f.storage.call('setRun', f.run.id, 'completed')
    const db = new Database(join(f.root, 'session.sqlite'))
    try {
      db.transaction(() => {
        db.query('UPDATE sessions SET createdAt=? WHERE id=?').run(origin, f.session.id)
        db.query('UPDATE events SET time=? WHERE eventId=?').run(origin + 50, f.turn.event.eventId)
        db.query('UPDATE runs SET startedAt=?,endedAt=? WHERE id=?').run(origin + 50, origin + 1400, f.run.id)
        for (const event of timedEvents)
          db.query('UPDATE events SET time=? WHERE eventId=?').run(event.time, event.eventId)
        for (const result of toolResults)
          db.query(
            "UPDATE events SET data=json_set(data,'$.content[0].execution.startedAt',?,'$.content[0].execution.endedAt',?) WHERE eventId=?",
          ).run(result.start, result.end, result.eventId)
      })()
    } finally {
      db.close()
    }
    const all = await f.storage.call('sessionObservability', { sessionId: f.session.id, detail: 'models' })
    expect(all.latency).toEqual({ firstText: { p95Ms: 80, samples: 4 }, response: { p95Ms: 400, samples: 4 } })
    expect(all.execution).toMatchObject({
      requestConcurrency: 2,
      toolConcurrency: 2,
      totalRunDurationMs: 1350,
      runP95Ms: 1350,
    })
    expect(all.usage.billableTokens).toBe(860)
    const original = all.records.find((record) => record.id === 'original/model')
    expect(original).toMatchObject({ count: 2, input: 200, output: 30, cost: 0.375 })
    expect(all.records.find((record) => record.id === 'other/model')?.cost).toBeNull()
    const first = await f.storage.call('sessionObservability', {
      sessionId: f.session.id,
      scope: 'window',
      anchor: 0,
      detail: 'models',
    })
    expect(first.latency.response).toEqual({ p95Ms: 200, samples: 3 })
    expect(first.execution).toMatchObject({ totalRunDurationMs: 750, runP95Ms: 750 })
    expect(first.records).toHaveLength(2)
    const window = await f.storage.call('sessionObservability', {
      sessionId: f.session.id,
      scope: 'window',
      detail: 'models',
    })
    expect(window.latency.firstText).toEqual({ p95Ms: 60, samples: 1 })
    expect(window.execution).toMatchObject({ totalRunDurationMs: 600, runP95Ms: 600 })
    expect(window.records.map((record) => record.id)).toEqual(['fresh/model'])
    expect(
      (await f.storage.call('sessionObservability', { sessionId: f.session.id, scope: 'turn' })).execution
        .totalRunDurationMs,
    ).toBe(550)
  })
  test('legacy calls without a Run still pair with their result and do not duplicate measured files', async () => {
    const f = await fixture()
    await f.storage.call('append', f.session.id, 'message.committed', {
      content: [
        {
          type: 'tool_call',
          name: 'read_file',
          callId: 'legacy-call',
          args: { path: 'legacy.txt' },
          presentation: { version: 1, kind: 'file-read', pathField: 'path' },
        },
      ],
    })
    await f.storage.call('append', f.session.id, 'tool.sequence_result', {
      content: [
        {
          type: 'tool_result',
          name: 'read_file',
          callId: 'legacy-call',
          text: 'private',
          isError: false,
          outcome: { kind: 'succeeded', executionStarted: true },
          activity: {
            files: [
              {
                path: 'legacy.txt',
                operation: 'read',
                linesRead: 2,
                patches: null,
                addedLines: null,
                removedLines: null,
              },
            ],
          },
        },
      ],
    })
    const report = await f.storage.call('sessionObservability', { sessionId: f.session.id })
    expect(report.tools).toMatchObject({ total: 1, succeeded: 1, pending: 0 })
    expect(report.files).toMatchObject({ reads: 1, readPaths: 1, linesRead: 2 })
  })
  test('skill coverage is deduplicated within each context window and requires every page', async () => {
    const f = await fixture()
    const base = {
      id: 'paged-skill',
      name: 'Paged skill',
      resource: 'SKILL.md',
      revision: 'r',
      instruction: true,
      completed: false,
      totalCharacters: 9,
    }
    for (const [id, offset, characters] of [
      ['start', 0, 3],
      ['end', 6, 3],
    ] as const)
      await tool(f, id, 'file-read', 'succeeded', 1, { skill: { ...base, offset, characters } })
    expect((await f.storage.call('sessionObservability', { sessionId: f.session.id })).skills.uses).toBe(0)
    await tool(f, 'middle', 'file-read', 'succeeded', 1, { skill: { ...base, offset: 3, characters: 3 } })
    await tool(f, 'duplicate', 'file-read', 'succeeded', 1, { skill: { ...base, offset: 0, characters: 9 } })
    expect((await f.storage.call('sessionObservability', { sessionId: f.session.id })).skills.uses).toBe(1)
    await compact(f, true)
    await tool(f, 'new-context', 'file-read', 'succeeded', 1, { skill: { ...base, offset: 0, characters: 9 } })
    expect(
      (await f.storage.call('sessionObservability', { sessionId: f.session.id, scope: 'window' })).skills.uses,
    ).toBe(1)
    expect((await f.storage.call('sessionObservability', { sessionId: f.session.id })).skills).toMatchObject({
      used: 1,
      uses: 2,
    })
  })
  test('preserves usable legacy skill evidence and failed requests without invented measurements', async () => {
    const f = await fixture()
    await f.storage.call('commit', f.session.id, f.run.id, 'tool', [
      {
        type: 'tool_result',
        name: 'skill',
        callId: 'legacy',
        text: 'old instructions',
        isError: false,
        outcome: { kind: 'succeeded', executionStarted: true },
        details: { kind: 'skill-read', name: 'Legacy skill', path: 'SKILL.md', revision: 'old', endOfFile: true },
      },
    ])
    await f.storage.call('append', f.session.id, 'request.started', { attemptId: 'failed-request' }, f.run.id)
    await f.storage.call('setRun', f.run.id, 'failed', 'Provider unavailable')
    const report = await f.storage.call('sessionObservability', { sessionId: f.session.id, detail: 'requests' })
    expect(report.skills).toMatchObject({ used: 1, uses: 1, loads: 1 })
    expect(report.records).toHaveLength(1)
    expect(report.records[0]).toMatchObject({ status: 'failed', input: null, output: null, cost: null })
  })
  test('uses historical price snapshots, deduplicates usage and attributes late accounting to the original turn', async () => {
    const f = await fixture()
    await f.storage.call('append', f.session.id, 'request.started', { attemptId: 'attempt' }, f.run.id)
    await f.storage.call('commit', f.session.id, f.run.id, 'user', [{ type: 'text', text: 'next user instruction' }])
    const fact = {
      usageId: 'usage-once',
      attemptId: 'attempt',
      input: 100,
      output: 20,
      cacheRead: 40,
      cacheWrite: 0,
      cost: 0.125,
      source: 'model',
      cacheEligibleInput: 80,
      modelSelectionId: 'original/model',
      pricing: {
        available: true,
        currency: 'USD',
        inputPerMillion: 2,
        outputPerMillion: 8,
        cacheReadPerMillion: 0.5,
        cacheWritePerMillion: null,
        source: 'provider-config',
        version: 'historical-price',
        effectiveAt: null,
      },
    }
    for (let i = 0; i < 2; i++) await f.storage.call('append', f.session.id, 'usage.recorded', fact, f.run.id)
    const all = await f.storage.call('sessionObservability', { sessionId: f.session.id, detail: 'requests' })
    expect(all.usage).toMatchObject({
      input: 100,
      output: 20,
      recorded: 1,
      requests: 1,
      cost: 0.125,
      knownCost: 0.125,
      pricedRequests: 1,
      cacheHitRate: 0.4,
      cacheInputShare: 0.4,
      cacheQuality: { status: 'insufficient', sampleCount: 1, recentMinimum: 0.4 },
    })
    expect(all.records[0]?.pricing?.version).toBe('historical-price')
    expect(
      (await f.storage.call('sessionObservability', { sessionId: f.session.id, scope: 'turn' })).usage.recorded,
    ).toBe(0)
    expect(
      (
        await f.storage.call('sessionObservability', {
          sessionId: f.session.id,
          scope: 'turn',
          anchor: f.turn.event.seq,
        })
      ).usage.cost,
    ).toBe(0.125)
    await f.storage.call(
      'append',
      f.session.id,
      'usage.recorded',
      {
        ...fact,
        usageId: 'unknown-price',
        attemptId: 'unknown-attempt',
        pricing: { ...fact.pricing, available: false },
      },
      f.run.id,
    )
    const partial = await f.storage.call('sessionObservability', { sessionId: f.session.id })
    expect(partial.usage.cost).toBeNull()
    expect(partial.usage.knownCost).toBe(0.125)
    expect(partial.usage.pricedRequests).toBe(1)
    expect(partial.usage).toMatchObject({ requests: 2, recorded: 2 })
  })
  test('all scopes are valid when empty, bounded details never include private bodies', async () => {
    const f = await fixture()
    for (const scope of ['session', 'turn', 'window'] as const) {
      const report = await f.storage.call('sessionObservability', { sessionId: f.session.id, scope })
      expect(sessionObservabilityReportSchema.safeParse(report).success).toBe(true)
      expect(report.tools.total).toBe(0)
      expect(report.usage.input).toBe(0)
      expect(report.range.scope).toBe(scope)
    }
  })
  test('continuous emoji text stays within the UTF-16 label contract', async () => {
    const f = await fixture()
    await f.storage.call('commit', f.session.id, f.run.id, 'user', [{ type: 'text', text: '🧭'.repeat(300) }])
    const report = await f.storage.call('sessionObservability', { sessionId: f.session.id, scope: 'turn' })
    expect(report.range.label.length).toBeLessThanOrEqual(200)
    expect(report.range.label).not.toContain('\uFFFD')
  })
  test('turn/window boundaries retain Goal and queued-guidance behavior in a Worker-free SQLite fixture', () => {
    const db = new Database(':memory:')
    try {
      db.exec(`
        CREATE TABLE sessions (id TEXT PRIMARY KEY, seq INTEGER NOT NULL, createdAt INTEGER NOT NULL);
        CREATE TABLE runs (id TEXT PRIMARY KEY, input TEXT NOT NULL);
        CREATE TABLE events (sessionId TEXT NOT NULL, runId TEXT, seq INTEGER NOT NULL, type TEXT NOT NULL, time INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(sessionId,seq));
        CREATE INDEX events_session_type_seq ON events(sessionId,type,seq);
      `)
      db.query('INSERT INTO sessions(id,seq,createdAt) VALUES(?,?,?)').run('session', 18, 1000)
      db.query('INSERT INTO runs(id,input) VALUES(?,?)').run('goal-run', JSON.stringify({ source: 'goal' }))
      db.query('INSERT INTO runs(id,input) VALUES(?,?)').run('system-run', JSON.stringify({ source: 'system' }))
      const insert = db.query('INSERT INTO events(sessionId,runId,seq,type,time,data) VALUES(?,?,?,?,?,?)')
      const message = (text: string, queueGuidance?: { activeRunId: string; queuedRunIds: string[] }) => ({
        role: 'user',
        content: [{ type: 'text', text }],
        ...(queueGuidance ? { queueGuidance } : {}),
      })
      const add = (seq: number, time: number, type: string, data: unknown, runId: string | null = null) =>
        insert.run('session', runId, seq, type, time, JSON.stringify(data))
      add(3, 1030, 'message.committed', message('first user instruction'))
      add(5, 1050, 'context.compacted', {})
      add(7, 1070, 'message.committed', message('automatic Goal continuation'), 'goal-run')
      add(
        12,
        1120,
        'message.committed',
        message('queued steering', { activeRunId: 'active-run', queuedRunIds: [] }),
        'system-run',
      )
      add(15, 1150, 'context.compacted', {})
      add(18, 1180, 'message.committed', message('next human instruction'))

      const latest = observabilityRange(db, { sessionId: 'session', scope: 'turn' })
      expect(latest).toMatchObject({
        anchor: 18,
        ordinal: 3,
        label: 'next human instruction',
        previous: 12,
        next: null,
        fromSeq: 17,
        throughSeq: 18,
        startedAt: 1180,
      })
      const guided = observabilityRange(db, { sessionId: 'session', scope: 'turn', anchor: 12 })
      expect(guided).toMatchObject({
        anchor: 12,
        ordinal: 2,
        label: 'queued steering',
        previous: 3,
        next: 18,
        fromSeq: 11,
        throughSeq: 17,
        startedAt: 1120,
        endedAt: 1180,
      })
      expect(() => observabilityRange(db, { sessionId: 'session', scope: 'turn', anchor: 7 })).toThrow(
        'Statistics scope boundary does not belong to this Session',
      )
      const window = observabilityRange(db, { sessionId: 'session', scope: 'window', anchor: 5 })
      expect(window).toMatchObject({
        anchor: 5,
        ordinal: 2,
        label: '',
        previous: 0,
        next: 15,
        fromSeq: 5,
        throughSeq: 15,
        startedAt: 1050,
        endedAt: 1150,
      })
    } finally {
      db.close()
    }
  })
  test('deduplicates tools, usage and nested results and measures real outcome/timing samples', async () => {
    const f = await fixture()
    const first = await tool(f, 'one', 'command', 'succeeded', 100)
    await f.storage.call(
      'append',
      f.session.id,
      'tool.sequence_result',
      { parentCallId: 'parent', content: first.message.content },
      f.run.id,
    )
    await tool(f, 'two', 'command', 'failed', 300)
    await tool(f, 'three', 'command', 'cancelled', null)
    const report = await f.storage.call('sessionObservability', {
      sessionId: f.session.id,
      detail: 'terminal',
      limit: 1,
    })
    expect(report.terminal).toMatchObject({
      total: 3,
      succeeded: 1,
      failed: 1,
      cancelled: 1,
      durationMs: 400,
      averageMs: 200,
      maximumMs: 300,
      p95Ms: 300,
      successRate: 0.5,
      timingSamples: 2,
    })
    expect(report.records).toHaveLength(1)
    expect(report.nextCursor).not.toBeNull()
    expect(JSON.stringify(report)).not.toContain('private tool output')
    const next = await f.storage.call('sessionObservability', {
      sessionId: f.session.id,
      detail: 'terminal',
      limit: 1,
      after: report.nextCursor ?? undefined,
    })
    expect(next.records[0]?.id).not.toBe(report.records[0]?.id)
    expect(next.terminal.total).toBe(3)
  })
  test('counts skill completion, reference reads and file measurements; legacy missing data stays null', async () => {
    const f = await fixture()
    const skill = {
      id: 'skill-id',
      name: '自动技能',
      resource: 'SKILL.md',
      revision: 'r',
      instruction: true,
      completed: true,
      offset: 0,
      characters: 100,
    }
    await tool(f, 'skill', 'file-read', 'succeeded', 5, { skill })
    await tool(f, 'resource', 'file-read', 'succeeded', 5, {
      skill: { ...skill, instruction: false, resource: 'recipe.md', completed: false },
    })
    await tool(f, 'read', 'file-read', 'succeeded', 5, {
      files: [{ path: 'a.txt', operation: 'read', linesRead: 20, patches: null, addedLines: null, removedLines: null }],
    })
    await tool(f, 'write', 'file-write', 'succeeded', 8, {
      files: [{ path: 'a.txt', operation: 'write', linesRead: null, patches: 2, addedLines: 4, removedLines: 2 }],
    })
    const report = await f.storage.call('sessionObservability', { sessionId: f.session.id })
    expect(report.skills).toEqual({ used: 1, uses: 1, loads: 1, resourceReads: 1 })
    expect(report.files).toMatchObject({
      measuredReads: 1,
      linesRead: null,
      patches: 2,
      addedLines: 4,
      removedLines: 2,
    })
    expect(report.records[0]).toMatchObject({ label: '自动技能', count: 1, succeeded: 1, failed: 1 })
  })
  test('successful compaction alone opens a window; human turns include automatic Runs and survive reopen', async () => {
    const f = await fixture()
    await tool(f, 'old', 'command', 'succeeded', 50)
    await compact(f, false)
    const before = await f.storage.call('sessionObservability', { sessionId: f.session.id, scope: 'window' })
    expect(before.range.anchor).toBe(0)
    expect(before.compactions.failed).toBe(1)
    const success = await compact(f, true)
    if (!success) throw new Error('Missing compaction completion')
    await f.storage.call('setRun', f.run.id, 'completed')
    const auto = await f.storage.call(
      'enqueue',
      f.session.id,
      'automatic',
      { text: 'continue goal', images: [], source: 'goal' },
      'fixture/model',
    )
    await f.storage.call('claim', f.session.id)
    await f.storage.call('commit', f.session.id, auto.id, 'user', [{ type: 'text', text: 'continue goal' }])
    const continuation = { ...f, run: auto }
    await tool(continuation, 'new', 'command', 'succeeded', 75)
    const turn = await f.storage.call('sessionObservability', { sessionId: f.session.id, scope: 'turn' })
    expect(turn.range.anchor).toBe(f.turn.event.seq)
    expect(turn.terminal.total).toBe(2)
    const current = await f.storage.call('sessionObservability', { sessionId: f.session.id, scope: 'window' })
    expect(current.range.anchor).toBe(success.seq)
    expect(current.tools.total).toBe(1)
    const previous = await f.storage.call('sessionObservability', {
      sessionId: f.session.id,
      scope: 'window',
      anchor: 0,
    })
    expect(previous.compactions).toMatchObject({
      completed: 1,
      beforeTokens: 8000,
      afterTokens: 2000,
      removedTokens: 6000,
      reductionRate: 0.75,
    })
    const resource = resources.find((item) => item.storage === f.storage)
    if (!resource) throw new Error('Missing fixture')
    await f.storage.close()
    resource.storage = new Storage(join(f.root, 'session.sqlite'))
    await resource.storage.call('ready')
    expect(
      (await resource.storage.call('sessionObservability', { sessionId: f.session.id, scope: 'turn' })).tools,
    ).toEqual(turn.tools)
    let failure: unknown
    try {
      await resource.storage.call('sessionObservability', {
        sessionId: f.session.id,
        scope: 'window',
        anchor: f.turn.event.seq,
      })
    } catch (error) {
      failure = error
    }
    expect(failure).toMatchObject({ code: 'INVALID_INPUT' })
  })
})
