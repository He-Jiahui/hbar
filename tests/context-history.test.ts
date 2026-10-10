import { afterEach, expect, test } from 'bun:test'
import { basename, dirname, join } from 'node:path'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { Storage } from '@hbar/storage'
import {
  parseContextCompactionEvent,
  contextHistoryPageSchema,
  type ContextCompactionRecord,
} from '@hbar/contracts/context-history'

const resources: { root: string; storage: Storage }[] = []
afterEach(async () => {
  for (const { root, storage } of resources.splice(0)) {
    await storage.close()
    const owned = await realpath(root)
    if (dirname(owned) !== (await realpath(tmpdir())) || !basename(owned).startsWith('hbar-context-history-'))
      throw new Error('Non-owned fixture')
    await rm(owned, { recursive: true, force: true })
  }
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-context-history-'))
  const storage = new Storage(join(root, 'test.sqlite'))
  resources.push({ root, storage })
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', root, 'Context history')
  const session = await storage.call('createSession', workspace.id)
  return { root, storage, session }
}
async function start(storage: Storage, sessionId: string, runId: string | null = null) {
  const event = await storage.call('compactionStart', {
    id: crypto.randomUUID(),
    sessionId,
    runId,
    modelId: 'fixture/model',
    contextWindow: 10000,
    beforeTokens: 8000,
  })
  const record = parseContextCompactionEvent(event)
  if (!record) throw new Error('Missing compaction start')
  return record
}
async function complete(storage: Storage, record: ContextCompactionRecord) {
  return storage.call('compact', record.sessionId, 1, 'Saved summary', record.modelId, {
    record,
    durationMs: 250,
    afterTokens: 1000,
    summaryTokens: 100,
    retainedMessages: 3,
    chunks: 2,
  })
}
const failed = {
  status: 'failed' as const,
  durationMs: 125,
  afterTokens: null,
  summaryTokens: null,
  retainedMessages: null,
  chunks: 0,
  errorCode: 'COMPACTION_FAILED',
}

test('window history records actual accounting, duration, tool outcomes and successful file paths', async () => {
  const { storage, session } = await fixture()
  const run = await storage.call('enqueue', session.id, 'first', { text: 'Inspect', images: [] }, 'fixture/model')
  await storage.call('claim', session.id)
  await storage.call('commit', session.id, run.id, 'user', [{ type: 'text', text: 'Inspect' }])
  await storage.call('append', session.id, 'request.started', { attemptId: 'first' }, run.id)
  await storage.call(
    'append',
    session.id,
    'usage.recorded',
    { usageId: 'usage-1', input: 100, output: 20, cacheRead: 40, cacheWrite: 10, cost: 0.1, source: 'model' },
    run.id,
  )
  // A duplicate usage identity is not billed twice in this window.
  await storage.call(
    'append',
    session.id,
    'usage.recorded',
    { usageId: 'usage-1', input: 100, output: 20, cacheRead: 40, cacheWrite: 10, cost: 0.1, source: 'model' },
    run.id,
  )
  const kinds = ['succeeded', 'succeeded', 'succeeded', 'failed', 'denied', 'cancelled', 'unknown'] as const
  for (const [index, kind] of kinds.entries()) {
    const name = index < 2 ? 'read' : 'write'
    await storage.call('commit', session.id, run.id, 'assistant', [
      {
        type: 'tool_call',
        callId: `call-${index}`,
        name,
        args: { path: index < 2 ? 'same.txt' : 'output.txt' },
        presentation: { version: 1, kind: name === 'read' ? 'file-read' : 'file-write', pathField: 'path' },
      },
    ])
    await storage.call('commit', session.id, run.id, 'tool', [
      {
        type: 'tool_result',
        callId: `call-${index}`,
        name,
        text: 'x'.repeat(100000),
        isError: kind !== 'succeeded',
        outcome: { kind, executionStarted: kind !== 'denied' },
      },
    ])
  }
  await storage.call(
    'append',
    session.id,
    'tool.sequence_call',
    { parentCallId: 'call-2', callId: 'nested', name: 'read', arguments: { path: 'nested.txt' } },
    run.id,
  )
  await storage.call(
    'toolStart',
    session.id,
    run.id,
    'nested',
    'read',
    { path: 'nested.txt' },
    { version: 1, kind: 'file-read', pathField: 'path' },
  )
  await storage.call(
    'append',
    session.id,
    'tool.sequence_result',
    {
      parentCallId: 'call-2',
      content: [
        {
          type: 'tool_result',
          callId: 'nested',
          name: 'read',
          text: 'result',
          isError: false,
          outcome: { kind: 'succeeded', executionStarted: true },
        },
      ],
    },
    run.id,
  )
  await storage.call('setRun', run.id, 'completed')
  const record = await start(storage, session.id, run.id)
  expect(record.stats.usage).toMatchObject({
    input: 100,
    output: 20,
    cacheRead: 40,
    cacheWrite: 10,
    recorded: 1,
    requests: 1,
  })
  expect(record.stats.tools).toEqual({
    total: 8,
    succeeded: 4,
    failed: 1,
    denied: 1,
    cancelled: 1,
    interrupted: 0,
    unknown: 1,
    pending: 0,
    successRate: 0.8,
  })
  expect(record.stats.files).toEqual({ reads: 3, writes: 1, readPaths: 2, writtenPaths: 1 })
  expect(record.stats.turns).toBe(1)
  expect(record.stats.executionMs).toBeGreaterThanOrEqual(0)
  await storage.call('append', session.id, 'compaction.request', { attemptId: 'summary' }, run.id)
  await storage.call(
    'append',
    session.id,
    'usage.recorded',
    { usageId: 'summary-usage', input: 50, output: 5, cacheRead: 0, cacheWrite: 0, cost: 0.01, source: 'compaction' },
    run.id,
  )
  const event = await complete(storage, record)
  const result = parseContextCompactionEvent(event)
  if (!result) throw new Error('Missing completed record')
  expect(result).toMatchObject({
    status: 'completed',
    durationMs: 250,
    beforeTokens: 8000,
    afterTokens: 1000,
    contextWindow: 10000,
    summaryTokens: 100,
    retainedMessages: 3,
    chunks: 2,
  })
  expect(result?.stats.usage.input).toBe(150)
  expect(result?.stats.usage.output).toBe(25)
  expect(result?.compactionUsage).toMatchObject({ input: 50, output: 5, recorded: 1, requests: 1 })
  expect((await storage.call('context', session.id)).summary).toBe('Saved summary')
  const snapshot = await storage.call('snapshot', session.id)
  expect(contextHistoryPageSchema.parse(snapshot.contextHistory).records[0]).toEqual(result)
  expect(snapshot.contextHistory?.current.usage.input).toBe(0)
  // A lost acknowledgement after summary persistence cannot downgrade completed telemetry.
  expect(await storage.call('compactionFinish', record, failed)).toBeNull()
})

test('failure does not advance the context window and retry closes it with disjoint accounting', async () => {
  const { storage, session } = await fixture()
  const first = await start(storage, session.id)
  await storage.call('append', session.id, 'usage.recorded', {
    input: 40,
    output: 10,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    source: 'compaction',
  })
  await storage.call('compactionFinish', first, failed)
  const retry = await start(storage, session.id)
  expect(retry.window).toBe(1)
  expect(retry.stats.usage.input).toBe(40)
  await complete(storage, retry)
  const next = await start(storage, session.id)
  expect(next.window).toBe(2)
  expect(next.stats.usage.input).toBe(0)
  expect(next.stats.fromSeq).toBeGreaterThan(retry.seq)
  await storage.call('compactionFinish', next, { ...failed, status: 'cancelled', errorCode: 'CANCELLED' })
  expect((await storage.call('contextHistory', { sessionId: session.id })).records.map((item) => item.status)).toEqual([
    'cancelled',
    'completed',
    'failed',
  ])
})

test('Host recovery settles an orphaned compression without fabricating a duration or carry length', async () => {
  const { storage, session } = await fixture()
  const record = await start(storage, session.id)
  await storage.call('recover')
  const restored = (await storage.call('contextHistory', { sessionId: session.id })).records[0]
  expect(restored).toMatchObject({
    id: record.id,
    status: 'interrupted',
    durationMs: null,
    afterTokens: null,
    errorCode: 'HOST_INTERRUPTED',
  })
  await storage.call('recover')
  expect((await storage.call('contextHistory', { sessionId: session.id })).records).toHaveLength(1)
})

test('history is bounded, cursor ordered and isolated from other sessions and message pagination', async () => {
  const { storage, session } = await fixture()
  for (let i = 0; i < 21; i++) await complete(storage, await start(storage, session.id))
  const page = await storage.call('contextHistory', { sessionId: session.id, limit: 20 })
  expect(page.records).toHaveLength(20)
  expect(page.hasOlder).toBe(true)
  const oldest = await storage.call('contextHistory', {
    sessionId: session.id,
    before: page.before ?? undefined,
    limit: 20,
  })
  expect(oldest.records).toHaveLength(1)
  expect(oldest.hasOlder).toBe(false)
  expect(oldest.records[0]?.window).toBe(1)
  const other = await storage.call('createSession', session.workspaceId)
  expect((await storage.call('contextHistory', { sessionId: other.id })).records).toHaveLength(0)
  expect((await storage.call('snapshot', session.id, 1, 1)).contextHistory?.records[0]?.window).toBe(21)
  const invalid = await storage.call('contextHistory', { sessionId: session.id, limit: 21 }).then(
    () => null,
    (error: unknown) => error,
  )
  expect(invalid).toBeInstanceOf(Error)
})

test('legacy result success is unknown, while unexecuted calls remain pending', async () => {
  const { storage, session } = await fixture()
  await storage.call('commit', session.id, 'run', 'assistant', [
    { type: 'tool_call', name: 'read', callId: 'legacy', args: { path: 'legacy.txt' } },
    { type: 'tool_call', name: 'write', callId: 'pending', args: { path: 'pending.txt' } },
  ])
  await storage.call('commit', session.id, 'run', 'tool', [
    { type: 'tool_result', name: 'read', callId: 'legacy', text: 'Success', isError: false },
  ])
  const { current } = await storage.call('contextHistory', { sessionId: session.id })
  expect(current.tools).toMatchObject({ total: 2, unknown: 1, pending: 1, succeeded: 0, successRate: null })
  expect(current.files.reads).toBe(0)
})

test('a Run continuing across a compaction belongs to both context windows without a new user turn', async () => {
  const { storage, session } = await fixture()
  const run = await storage.call('enqueue', session.id, 'long-run', { text: 'Continue', images: [] }, 'fixture/model')
  await storage.call('claim', session.id)
  await storage.call('append', session.id, 'request.started', { attemptId: 'first' }, run.id)
  const first = await start(storage, session.id, run.id)
  await complete(storage, first)
  await storage.call('append', session.id, 'request.started', { attemptId: 'next' }, run.id)
  const next = await start(storage, session.id, run.id)
  expect(next.window).toBe(2)
  expect(next.stats.runs).toBe(1)
  expect(next.stats.turns).toBe(0)
  expect(next.stats.usage.requests).toBe(1)
})
