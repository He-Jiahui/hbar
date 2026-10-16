import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { runSchema, threadGoalSchema, planStateSchema } from '@hbar/contracts'
import { DELEGATED_CONTEXT_MAX_BYTES, delegatedSourceContextSchema } from '@hbar/contracts/delegated-context'
import { captureDelegatedContext } from '../packages/kernel/src/delegated-context'
import { createContextSummaryReader } from '../packages/storage/src/context-summary'

const source = { sessionId: 'source', runId: 'source-run' }
function fixture() {
  const session = {
    id: source.sessionId,
    workspaceId: 'workspace',
    title: 'Source task',
    parentId: null,
    archived: false,
    seq: 1,
    createdAt: 1,
    updatedAt: 1,
  }
  const run = runSchema.parse({
    id: source.runId,
    sessionId: source.sessionId,
    requestId: 'task',
    modelId: 'model',
    input: { text: '任务'.repeat(10_000), images: [] },
    status: 'running',
    createdAt: 1,
    startedAt: 1,
    endedAt: null,
    error: null,
  })
  const plan = planStateSchema.parse({
    sessionId: source.sessionId,
    revision: 7,
    turnId: source.runId,
    explanation: '说明'.repeat(1000),
    updatedAt: 1,
    plan: Array.from({ length: 100 }, (_, index) => ({
      step: `Step ${index}: ${'内容'.repeat(300)}`,
      status: index === 80 ? 'in_progress' : index < 80 ? 'completed' : 'pending',
    })),
  })
  const goal = threadGoalSchema.parse({
    threadId: source.sessionId,
    goalId: 'original-goal',
    objective: '目标'.repeat(2000),
    status: 'active',
    tokenBudget: null,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    createdAt: 1,
    updatedAt: 1,
  })
  return {
    session,
    run,
    plan,
    goal,
    ports: {
      run: async () => run,
      session: async () => session,
      goal: async () => goal,
      plan: async () => plan,
      summary: async () => ({
        sessionId: source.sessionId,
        eventSeq: 40,
        throughSeq: 30,
        text: '🙂'.repeat(2000),
        truncated: true,
      }),
    },
  }
}

test('delegated context keeps bounded source text, original Goal and the current plan window instead of all history', async () => {
  const f = fixture()
  const context = await captureDelegatedContext(source, f.ports)
  expect(context).toMatchObject({
    ...source,
    version: 1,
    sessionTitle: 'Source task',
    task: { truncated: true },
    goal: { goalId: 'original-goal', objective: { truncated: true } },
    plan: { revision: 7, turnId: source.runId, totalSteps: 100 },
    summary: { eventSeq: 40, throughSeq: 30 },
  })
  expect(context.plan?.steps).toHaveLength(8)
  expect(context.plan?.steps.find((step) => step.status === 'in_progress')).toMatchObject({
    index: 80,
    truncated: true,
  })
  expect(context.plan?.steps.map((step) => step.index)).toEqual([78, 79, 80, 81, 82, 83, 84, 85])
  expect(new TextEncoder().encode(JSON.stringify(context)).byteLength).toBeLessThanOrEqual(DELEGATED_CONTEXT_MAX_BYTES)
  expect(context.summary?.text).toBe('🙂'.repeat(2000))
})

test('an empty source has no invented Goal, plan or summary and refuses cross-Session context', async () => {
  const f = fixture()
  const ports = { ...f.ports, goal: async () => null, plan: async () => null, summary: async () => null }
  expect(await captureDelegatedContext(source, ports)).toMatchObject({ task: { truncated: true } })
  expect((await captureDelegatedContext(source, ports)).plan).toBeUndefined()
  await expect(
    captureDelegatedContext(source, { ...ports, run: async () => ({ ...f.run, sessionId: 'unrelated' }) }),
  ).rejects.toThrow('original source')
  expect(
    delegatedSourceContextSchema.safeParse({
      ...(await captureDelegatedContext(source, ports)),
      summary: { sessionId: 'unrelated', eventSeq: 1, throughSeq: 0, text: 'data', truncated: false },
    }).success,
  ).toBe(false)
})

test('a clipped task retains ending constraints without splitting Unicode characters', async () => {
  const f = fixture()
  f.run.input.text = '🙂'.repeat(3000) + 'Keep the existing authorization'
  const context = await captureDelegatedContext(source, f.ports)
  expect(context.task.text).toEndWith('Keep the existing authorization')
  expect(context.task.truncated).toBe(true)
  expect(new TextDecoder().decode(new TextEncoder().encode(context.task.text))).toBe(context.task.text)
})

test('the summary reader returns only the latest bounded excerpt, including Unicode and embedded NUL truncation', () => {
  const db = new Database(':memory:')
  db.exec(
    'CREATE TABLE compactions(sessionId TEXT,throughSeq INTEGER,summary TEXT,eventSeq INTEGER,PRIMARY KEY(sessionId,eventSeq))',
  )
  const read = createContextSummaryReader(db)
  try {
    expect(read('missing')).toBeNull()
    const insert = db.query('INSERT INTO compactions VALUES(?,?,?,?)')
    insert.run('source', 1, 'older summary', 2)
    insert.run('source', 20, '🙂'.repeat(3000), 30)
    expect(read('source')).toEqual({
      sessionId: 'source',
      eventSeq: 30,
      throughSeq: 20,
      text: '🙂'.repeat(2000),
      truncated: true,
    })
    insert.run('source', 30, 'first\0remaining', 40)
    const nul = read('source')
    expect(nul).toMatchObject({ eventSeq: 40, throughSeq: 30 })
    expect(nul?.truncated).toBe(nul?.text !== 'first\0remaining')
    insert.run('source', 40, 'current summary', 50)
    expect(read('source')).toMatchObject({ text: 'current summary', truncated: false })
  } finally {
    db.close()
  }
})
