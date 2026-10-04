import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage } from '@hbar/storage'
import { GOAL_HISTORY_PAGE_SQL } from '../packages/storage/src/goal-history'
import type { GoalHistoryInput } from '@hbar/contracts/commands/goal-history'

const resources: { root: string; store: Storage }[] = []
async function expectCode(operation: Promise<unknown>, code: string): Promise<void> {
  let failure: unknown
  try {
    await operation
  } catch (error) {
    failure = error
  }
  expect(failure).toMatchObject({ code })
}
afterEach(async () => {
  for (const { root, store } of resources.splice(0)) {
    await store.close()
    await rm(root, { recursive: true, force: true })
  }
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-goal-history-'))
  const path = join(root, 'data.sqlite')
  const store = new Storage(path)
  resources.push({ root, store })
  await store.call('ready')
  const workspace = await store.call('createWorkspace', root, 'Goal history fixture')
  const session = await store.call('createSession', workspace.id)
  const goal = (id = 'goal-a', change: Record<string, unknown> = {}) => ({
    threadId: session.id,
    goalId: id,
    objective: `${id} original objective`,
    status: 'active',
    tokenBudget: null,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    createdAt: 1,
    updatedAt: 2,
    ...change,
  })
  return {
    root,
    path,
    store,
    workspace,
    session,
    goal,
    history: (input: Omit<GoalHistoryInput, 'sessionId'> = {}) =>
      store.call('goalHistory', { sessionId: session.id, ...input }),
  }
}

test('real Storage reverse pages include clear-first preceding, replacement and immutable old objective', async () => {
  const { store, session, goal, history } = await fixture()
  const created = await store.call('append', session.id, 'goal.created', { goal: goal() }, 'run-old')
  const complete = await store.call('append', session.id, 'goal.updated', {
    goal: goal('goal-a', { status: 'complete', tokensUsed: 10 }),
  })
  const replacement = await store.call('append', session.id, 'goal.created', {
    goal: goal('goal-b', { objective: 'New objective', tokenBudget: 500 }),
  })
  const clear = await store.call('append', session.id, 'goal.cleared', { sessionId: session.id })
  const current = await history({ limit: 1 })
  expect(current.anchorSeq).toBe(clear.seq)
  expect(current.items).toMatchObject([{ eventId: clear.eventId, type: 'goal.cleared', goal: null }])
  expect(current.preceding).toMatchObject({
    seq: replacement.seq,
    goal: { goalId: 'goal-b', objective: 'New objective' },
  })
  expect(current.nextBeforeSeq).toBe(clear.seq)
  const older = await history({ anchorSeq: current.anchorSeq, beforeSeq: current.nextBeforeSeq ?? undefined, limit: 1 })
  expect(older.items[0]?.goal?.goalId).toBe('goal-b')
  expect(older.preceding).toMatchObject({
    seq: complete.seq,
    goal: { goalId: 'goal-a', objective: 'goal-a original objective', status: 'complete', tokensUsed: 10 },
  })
  const first = await history({ anchorSeq: current.anchorSeq, beforeSeq: older.nextBeforeSeq ?? undefined, limit: 100 })
  expect(first.items.map((item) => item.eventId)).toEqual([created.eventId, complete.eventId])
  expect(first.preceding).toEqual({ seq: 0, goal: null })
  expect(first.nextBeforeSeq).toBeNull()
})

test('preceding a new goal after clear remains null, never resurrecting an older objective; fork has no inherited Goal history', async () => {
  const { store, session, goal, history } = await fixture()
  await store.call('append', session.id, 'goal.created', { goal: goal() })
  const clear = await store.call('append', session.id, 'goal.cleared', { sessionId: session.id })
  await store.call('append', session.id, 'goal.updated', { goal: goal('goal-b') })
  const page = await history({ limit: 1 })
  expect(page.preceding).toEqual({ seq: clear.seq, goal: null })
  const child = await store.call('fork', session.id)
  expect(await store.call('goalHistory', { sessionId: child.id })).toMatchObject({
    sessionId: child.id,
    items: [],
    preceding: { seq: 0, goal: null },
    nextBeforeSeq: null,
  })
})

test('fixed anchor survives concurrent new facts and invalid/future cursors are explicit stable errors', async () => {
  const { store, session, goal, history } = await fixture()
  const created = await store.call('append', session.id, 'goal.created', { goal: goal() })
  const anchor = (await history()).anchorSeq
  await store.call('append', session.id, 'goal.updated', { goal: goal('goal-new') })
  await store.call('append', session.id, 'goal.cleared', { sessionId: session.id })
  expect((await history({ anchorSeq: anchor })).items.map((item) => item.eventId)).toEqual([created.eventId])
  expect((await history({ anchorSeq: 0 })).items).toEqual([])
  for (const input of [{ anchorSeq: 1000 }, { anchorSeq: anchor, beforeSeq: anchor + 2 }])
    await expectCode(history(input), 'INVALID_CURSOR')
  for (const limit of [0, 101]) await expectCode(history({ limit }), 'INVALID_INPUT')
  await expectCode(store.call('goalHistory', { sessionId: 'missing' }), 'NOT_FOUND')
})

test('sparse Goal facts beyond2000 ordinary events use the partial seq index and bounded queries, not a forward log replay', async () => {
  const { store, session, goal, history, path } = await fixture()
  const earliest = await store.call('append', session.id, 'goal.updated', { goal: goal() })
  for (let index = 0; index < 2005; index++)
    await store.call('append', session.id, 'ordinary.fixture', { private: `not-history-${index}` })
  const latest = await store.call('append', session.id, 'goal.accounted', {
    goal: goal('goal-a', { tokensUsed: 22 }),
    accounting: { private: 'ledger-not-public' },
  })
  const page = await history({ limit: 1 })
  expect(page.items[0]?.seq).toBe(latest.seq)
  expect(page.preceding.seq).toBe(earliest.seq)
  expect(page.nextBeforeSeq).toBe(latest.seq)
  expect((await history({ anchorSeq: page.anchorSeq, beforeSeq: latest.seq, limit: 1 })).items[0]?.seq).toBe(
    earliest.seq,
  )
  expect(JSON.stringify(page)).not.toContain('private')
  const db = new Database(path, { readonly: true })
  try {
    const plan = db
      .query<{ detail: string }, [string, number, number, number]>(`EXPLAIN QUERY PLAN ${GOAL_HISTORY_PAGE_SQL}`)
      .all(session.id, page.anchorSeq, page.anchorSeq + 1, 2)
      .map((row) => row.detail)
      .join('\n')
    expect(plan).toContain('events_goal_history')
    expect(plan).not.toContain('SCAN events')
    expect(plan).not.toContain('TEMP B-TREE')
  } finally {
    db.close()
  }
  const elapsed: number[] = []
  for (let index = 0; index < 20; index++) {
    const start = performance.now()
    await history({ limit: 1 })
    elapsed.push(performance.now() - start)
  }
  elapsed.sort((a, b) => a - b)
  console.info('Goal history: 2005 ordinary events between2 Goal facts, 2 indexed candidates, 20 Worker reads', {
    p95Ms: elapsed[18],
    maxMs: elapsed[19],
  })
}, 30_000)

test('100 rows plus one inverse cursor remain paged even for accounting-only facts and private values never leak', async () => {
  const { store, session, goal, history } = await fixture()
  const identities: string[] = []
  for (let index = 0; index < 102; index++)
    identities.push(
      (
        await store.call('append', session.id, 'goal.accounted', {
          goal: goal('goal-a', {
            tokensUsed: index,
            accountedRuns: ['private-accounting'],
            repairKey: 'private-repair',
          }),
        })
      ).eventId,
    )
  const page = await history({ limit: 100 })
  expect(page.items).toHaveLength(100)
  const oldest = page.items[0]
  if (!oldest) throw new Error('Expected bounded history page')
  expect(page.nextBeforeSeq).toBe(oldest.seq)
  expect(JSON.stringify(page)).not.toContain('private')
  const older = await history({ anchorSeq: page.anchorSeq, beforeSeq: page.nextBeforeSeq ?? undefined, limit: 100 })
  expect(older.items).toHaveLength(2)
  expect([...older.items, ...page.items].map((item) => item.eventId)).toEqual(identities)
})

test('bad canonical data in an item or preceding row rejects with a sanitized error, never silently skipping corruption', async () => {
  const { store, session, goal, history } = await fixture()
  await store.call('append', session.id, 'goal.created', {
    goal: goal('goal-a', { threadId: 'wrong', objective: 'secret-invalid-objective' }),
  })
  await store.call('append', session.id, 'goal.cleared', { sessionId: session.id })
  try {
    await history({ limit: 1 })
    throw new Error('Expected malformed predecessor rejection')
  } catch (error) {
    expect(error).toMatchObject({ code: 'INVALID_OUTPUT' })
    expect(String(error)).not.toContain('secret-invalid-objective')
  }
  const other = await store.call('createSession', (await store.call('workspaces'))[0]!.id)
  await store.call('append', other.id, 'goal.cleared', { sessionId: session.id })
  await expectCode(store.call('goalHistory', { sessionId: other.id }), 'INVALID_OUTPUT')
})
