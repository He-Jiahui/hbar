import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, realpath } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { Storage } from '@hbar/storage'
import type { ToolActivity } from '@hbar/contracts/tool-activity'
import { sessionObservabilityReportSchema } from '@hbar/contracts/session-observability'
import { parseContextCompactionEvent } from '@hbar/contracts/context-history'

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
      cacheHitRate: 0.5,
      cacheInputShare: 0.4,
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
