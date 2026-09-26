import { expect, test } from 'bun:test'
import {
  goalHistoryCommands,
  goalHistoryInputSchema,
  goalHistoryPageSchema,
  parseGoalHistoryEvent,
} from '@hbar/contracts/commands/goal-history'
import type { SessionEvent } from '@hbar/contracts'

const goal = {
  goalId: 'goal-original',
  threadId: 'session',
  objective: 'Preserve the original objective',
  status: 'active',
  tokenBudget: null,
  tokensUsed: 0,
  timeUsedSeconds: 0,
  createdAt: 1,
  updatedAt: 2,
}
const event = (type = 'goal.created', data: unknown = { goal }): SessionEvent => ({
  eventId: 'event-original',
  sessionId: 'session',
  seq: 2,
  time: 3,
  runId: null,
  stepId: null,
  type,
  data,
  version: 1,
})
test('goal.history is a bounded read-only session API, with the documented defaults and schema caps', () => {
  expect(goalHistoryCommands['goal.history'].metadata).toMatchObject({
    execution: 'host',
    kind: 'query',
    scope: 'session',
    stateEffect: 'none',
    surfaces: ['api'],
    maxConcurrent: 8,
  })
  expect(goalHistoryInputSchema.parse({ sessionId: 'session' })).toEqual({ sessionId: 'session', limit: 50 })
  for (const limit of [1, 50, 100])
    expect(goalHistoryInputSchema.safeParse({ sessionId: 'session', limit }).success).toBe(true)
  for (const input of [
    { limit: 0 },
    { limit: 101 },
    { beforeSeq: 0 },
    { anchorSeq: -1 },
    { anchorSeq: 1.5 },
    { unrelated: true },
  ])
    expect(goalHistoryInputSchema.safeParse({ sessionId: 'session', ...input }).success).toBe(false)
})
test('canonical normalization preserves event-time public facts but strips every accounting/repair/trigger field', () => {
  const fact = parseGoalHistoryEvent(
    event('goal.accounted', {
      goal: {
        ...goal,
        continuationCount: 7,
        accountedRuns: ['private-run'],
        repairKey: 'private-key',
        progressKeys: ['private-progress'],
        continuationIntent: { text: 'private-input' },
        executionBudget: {
          goalRemainingTokens: null,
          sessionRemainingTokens: 200,
          effectiveRemainingTokens: 200,
          limitingSource: 'session',
          private: 'private-budget',
        },
      },
      accounting: { actorToken: 'private-token' },
    }),
  )
  expect(fact).toEqual({
    eventId: 'event-original',
    sessionId: 'session',
    seq: 2,
    time: 3,
    runId: null,
    type: 'goal.accounted',
    goal: {
      goalId: goal.goalId,
      objective: goal.objective,
      status: 'active',
      tokenBudget: null,
      tokensUsed: 0,
      timeUsedSeconds: 0,
      createdAt: 1,
      updatedAt: 2,
      continuationCount: 7,
      executionBudget: {
        goalRemainingTokens: null,
        sessionRemainingTokens: 200,
        effectiveRemainingTokens: 200,
        limitingSource: 'session',
      },
    },
  })
  expect(JSON.stringify(fact)).not.toContain('private')
  expect(parseGoalHistoryEvent(event())?.goal).not.toHaveProperty('continuationCount')
  expect(parseGoalHistoryEvent(event())?.goal).not.toHaveProperty('executionBudget')
})
test('cleared is a null fact only for its original session; non-lifecycle events are not invented as Goal facts', () => {
  expect(parseGoalHistoryEvent(event('goal.cleared', { sessionId: 'session' }))).toMatchObject({
    type: 'goal.cleared',
    goal: null,
  })
  for (const type of ['goal.run_bound', 'message.committed', 'run.completed'])
    expect(parseGoalHistoryEvent(event(type))).toBeNull()
  for (const data of [{}, { sessionId: 'other' }, { goal }])
    expect(() => parseGoalHistoryEvent(event('goal.cleared', data))).toThrow()
})
test('malformed canonical Goal identity/status/optional history values fail closed instead of silently becoming empty', () => {
  for (const raw of [
    { ...goal, goalId: undefined },
    { ...goal, threadId: 'other' },
    { ...goal, status: 'invented' },
    { ...goal, continuationCount: -1 },
    { ...goal, tokensUsed: -1 },
    { ...goal, objective: '' },
  ]) {
    try {
      parseGoalHistoryEvent(event('goal.updated', { goal: raw, secret: 'do-not-return' }))
      throw new Error('Expected invalid fact')
    } catch (error) {
      expect(error).toMatchObject({ code: 'INVALID_OUTPUT' })
      expect(String(error)).not.toContain('do-not-return')
    }
  }
  expect(() => parseGoalHistoryEvent(event('goal.updated', { goal, goalId: 'wrong' }))).toThrow()
  expect(() => parseGoalHistoryEvent(event('goal.updated', { goal, sessionId: 'wrong' }))).toThrow()
})
test('public page schema enforces ascending identity, preceding boundary and a progressing inverse cursor', () => {
  const first = parseGoalHistoryEvent(event())
  if (!first) throw new Error('Expected canonical Goal')
  const page = {
    sessionId: 'session',
    anchorSeq: 4,
    items: [first],
    preceding: { seq: 0, goal: null },
    nextBeforeSeq: null,
  }
  expect(goalHistoryPageSchema.safeParse(page).success).toBe(true)
  for (const changed of [
    { items: [first, first] },
    { items: [{ ...first, sessionId: 'wrong' }] },
    { anchorSeq: 1 },
    { preceding: { seq: 2, goal: first.goal } },
    { preceding: { seq: 0, goal: first.goal } },
    { nextBeforeSeq: 3 },
    { secret: 'private' },
  ])
    expect(goalHistoryPageSchema.safeParse({ ...page, ...changed }).success).toBe(false)
})
