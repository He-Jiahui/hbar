import { expect, test } from 'bun:test'
import { DECISION_MAX_STATE_BYTES, decisionQuestionSchema, decisionRequestSchema } from '@hbar/contracts/decision'

const question = {
  type: 'choice',
  instructions: 'Choose the next action',
  criteria: { A: 'Inspect evidence', B: 'Request review' },
}

test('decision requests default to multilingual advisory profiles and support the three question types', () => {
  const value = decisionRequestSchema.parse({
    state: { checks: [{ exitCode: 1 }], summary: '缺少验证证据' },
    questions: {
      action: question,
      complete: { type: 'noul', instructions: 'Is completion verified?' },
      progress: {
        type: 'score',
        instructions: 'Assess progress',
        criteria: ['No progress', 'Some progress', 'Verified'],
      },
    },
  })
  expect(value.checkpoint).toBe('multilingual')
  expect(value.profile).toEqual({ id: 'generic', version: '1' })
  expect(Object.keys(value.questions)).toHaveLength(3)
})

test('decision inputs reject oversized UTF-8 states, unbounded option sets and forged correlation', () => {
  expect(
    decisionRequestSchema.safeParse({ state: '中'.repeat(DECISION_MAX_STATE_BYTES / 2), questions: { q: question } })
      .success,
  ).toBe(false)
  expect(
    decisionQuestionSchema.safeParse({
      ...question,
      criteria: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`o${i}`, 'option'])),
    }).success,
  ).toBe(false)
  expect(decisionQuestionSchema.safeParse({ ...question, criteria: { A: 'Only option' } }).success).toBe(false)
  expect(decisionRequestSchema.safeParse({ state: 'state', questions: {}, sessionId: 'another-session' }).success).toBe(
    false,
  )
  expect(
    decisionRequestSchema.safeParse({ state: 'state', questions: { q: question }, act_probability: 1 }).success,
  ).toBe(false)
})
