import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sessionReadFactsInputSchema, sessionReadFactsSchema } from '@hbar/contracts'
import { Storage } from '@hbar/storage'
import { removeOwnedTestDirectory } from './owned-temp-directory'

const prefix = 'hbar-session-read-facts-'
const fixtures: { root: string; storage: Storage }[] = []

afterEach(async () => {
  for (const { root, storage } of fixtures.splice(0).reverse()) {
    try {
      await storage.close()
    } finally {
      await removeOwnedTestDirectory(root, prefix)
    }
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), prefix))
  const path = join(root, 'fixture.sqlite')
  const storage = new Storage(path)
  fixtures.push({ root, storage })
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', root, 'Bounded facts fixture')
  const session = await storage.call('createSession', workspace.id)
  return { storage, path, workspace, session }
}

test('public facts preserve the first hundred rows across sparse imported sequences without unrelated payloads', async () => {
  const { storage, path, session } = await fixture()
  const payload = 'unrelated-body-'.repeat(4_096)
  for (let index = 0; index < 103; index++)
    await storage.call('append', session.id, 'fixture.padding', { index, ...(index < 32 ? { payload } : {}) })
  const headers = await storage.call('readEventPage', {
    sessionId: session.id,
    afterSeq: 0,
    types: ['session.created', 'fixture.padding'],
    headerOnlyTypes: ['session.created', 'fixture.padding'],
    limit: 100,
    maxReplyBytes: 1_048_576,
  })
  const hundredth = headers.items.at(99)
  const first = headers.items[0]
  if (!hundredth || !first) throw new Error('Missing the fixture event window')
  expect(headers.items).toHaveLength(100)

  // Fixture-only import shape: no Storage call is in flight. All assertions use
  // the public default Worker; no application path writes through this handle.
  const imported = new Database(path)
  try {
    imported.transaction(() => {
      imported.query('UPDATE events SET seq=seq+1000000 WHERE sessionId=?').run(session.id)
      imported.query('UPDATE events SET seq=(seq-1000000)*3 WHERE sessionId=?').run(session.id)
      imported.query('UPDATE sessions SET seq=seq*3 WHERE id=?').run(session.id)
    })()
  } finally {
    imported.close()
  }

  const facts = await storage.call('readSessionFacts', { sessionId: session.id, eventLimit: 100, includeRuns: false })
  expect(facts.eventThroughSeq).toBe(hundredth.event.seq * 3)
  expect(facts.eventThroughSeq).toBeGreaterThan(100)
  expect(facts.cursor).toBeGreaterThan(facts.eventThroughSeq)
  expect(facts.runs).toEqual([])
  expect(facts.resultSummary).toBe('')
  expect(JSON.stringify(facts)).not.toContain('unrelated-body-')
  expect(new TextEncoder().encode(JSON.stringify(facts)).byteLength).toBeLessThan(512)
  expect(
    (await storage.call('readSessionFacts', { sessionId: session.id, eventLimit: 1, includeRuns: false }))
      .eventThroughSeq,
  ).toBe(first.event.seq * 3)
})

test('facts cap shallow Runs and Unicode summaries and release truncated statements for repeated adjacent reads', async () => {
  const { storage, workspace, session } = await fixture()
  for (let index = 0; index < 41; index++)
    await storage.call(
      'enqueue',
      session.id,
      `facts-run-${index}`,
      {
        text: index === 40 ? 'admitted-text-'.repeat(14_000) : `input-${index}`,
        images: [],
        thinking: 'high',
        approval: 'deny',
      },
      'fixture',
    )
  const shallow = await storage.call('readSessionFacts', { sessionId: session.id })
  expect(shallow.runs).toHaveLength(40)
  expect(new Set(shallow.runs.map((run) => run.id)).size).toBe(40)
  expect(shallow.runs.every((run) => run.sessionId === session.id)).toBe(true)
  expect(shallow.runs.every((run) => Object.keys(run.input).sort().join(',') === 'approval,thinking')).toBe(true)
  expect(
    shallow.runs.every((run, index) => index === 0 || run.createdAt <= (shallow.runs[index - 1]?.createdAt ?? -1)),
  ).toBe(true)
  expect(JSON.stringify(shallow)).not.toContain('admitted-text-')
  const selected = shallow.runs[0]
  if (!selected) throw new Error('Missing selected fixture Run')
  const error = 'bounded-error-'.repeat(500)
  await storage.call('setRun', selected.id, 'failed', error)
  const text = '😀'.repeat(3_000)
  await storage.call('commit', session.id, selected.id, 'assistant', [
    { type: 'text', text },
    { type: 'text', text: 'later block' },
  ])
  const neighbor = await storage.call('createSession', workspace.id)
  const neighborRun = await storage.call(
    'enqueue',
    neighbor.id,
    'neighbor-request',
    { text: 'neighbor', images: [] },
    'fixture',
  )
  await storage.call('commit', neighbor.id, neighborRun.id, 'assistant', [{ type: 'text', text: 'neighbor summary' }])
  for (let iteration = 0; iteration < 4; iteration++) {
    const current = await storage.call('readSessionFacts', { sessionId: session.id, requestId: selected.requestId })
    expect(current.resultSummary).toBe(text.slice(0, 4_000))
    expect(current.resultSummary.length).toBe(4_000)
    expect(current.runs.find((run) => run.id === selected.id)?.error).toBe(error.slice(0, 4_001))
    const adjacent = await storage.call('readSessionFacts', {
      sessionId: neighbor.id,
      requestId: neighborRun.requestId,
    })
    expect(adjacent.resultSummary).toBe('neighbor summary')
    expect(adjacent.runs.map((run) => run.id)).toEqual([neighborRun.id])
  }
  const headersOnly = await storage.call('readSessionFacts', {
    sessionId: session.id,
    requestId: selected.requestId,
    includeRuns: false,
  })
  expect(headersOnly.runs).toEqual([])
  expect(headersOnly.resultSummary).toBe('')
})

test('result facts retain the latest sixty message window and exact selected request', async () => {
  const { storage, session } = await fixture()
  const old = await storage.call('enqueue', session.id, 'old-request', { text: 'old', images: [] }, 'fixture')
  await storage.call('commit', session.id, old.id, 'assistant', [{ type: 'text', text: 'outside latest sixty' }])
  const current = await storage.call(
    'enqueue',
    session.id,
    'current-request',
    { text: 'current', images: [] },
    'fixture',
  )
  for (let index = 0; index < 60; index++)
    await storage.call('commit', session.id, current.id, index === 59 ? 'assistant' : 'user', [
      { type: 'text', text: index === 59 ? 'selected summary' : `padding-${index}` },
    ])
  expect(
    (await storage.call('readSessionFacts', { sessionId: session.id, requestId: old.requestId })).resultSummary,
  ).toBe('')
  expect(
    (await storage.call('readSessionFacts', { sessionId: session.id, requestId: current.requestId })).resultSummary,
  ).toBe('selected summary')
  expect(
    (await storage.call('readSessionFacts', { sessionId: session.id, requestId: 'foreign-request' })).resultSummary,
  ).toBe('')
})

test('facts reject invalid horizons and missing sessions and validate response identity and bounds', async () => {
  const { storage, session } = await fixture()
  for (const eventLimit of [0, 100_001, 1.5]) {
    let rejected: unknown
    try {
      await storage.call('readSessionFacts', { sessionId: session.id, eventLimit })
    } catch (error) {
      rejected = error
    }
    expect(rejected).toBeDefined()
  }
  let missing: unknown
  try {
    await storage.call('readSessionFacts', { sessionId: 'missing-facts-session' })
  } catch (error) {
    missing = error
  }
  expect(missing).toMatchObject({ code: 'SESSION_NOT_FOUND' })
  const facts = await storage.call('readSessionFacts', { sessionId: session.id })
  expect(sessionReadFactsInputSchema.safeParse({ sessionId: session.id, unexpected: true }).success).toBe(false)
  expect(sessionReadFactsSchema.safeParse({ ...facts, eventThroughSeq: facts.cursor + 1 }).success).toBe(false)
  expect(sessionReadFactsSchema.safeParse({ ...facts, resultSummary: 'x'.repeat(4_001) }).success).toBe(false)
  const run = await storage.call('enqueue', session.id, 'identity-request', { text: 'identity', images: [] }, 'fixture')
  const valid = await storage.call('readSessionFacts', { sessionId: session.id })
  const fact = valid.runs.find((candidate) => candidate.id === run.id)
  if (!fact) throw new Error('Missing shallow Run fact')
  expect(
    sessionReadFactsSchema.safeParse({ ...valid, runs: [{ ...fact, sessionId: 'foreign-session' }] }).success,
  ).toBe(false)
  expect(sessionReadFactsSchema.safeParse({ ...valid, runs: Array.from({ length: 41 }, () => fact) }).success).toBe(
    false,
  )
})
