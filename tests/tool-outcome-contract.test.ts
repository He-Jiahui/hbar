import { expect, test } from 'bun:test'
import { contentBlockSchema, HbarError, toolOutcomeSchema, type ContentBlock } from '@hbar/contracts'
import { hostAbortToolOutcome } from '../packages/kernel/src/tool-outcome'

const legacy: Extract<ContentBlock, { type: 'tool_result' }> = {
  type: 'tool_result',
  callId: 'call',
  name: 'tool',
  text: 'unchanged',
  isError: true,
}

test('tool outcome is additive and requires a bounded consistent typed result', () => {
  expect(contentBlockSchema.parse(legacy)).toEqual(legacy)
  for (const kind of ['succeeded', 'failed', 'denied', 'cancelled', 'interrupted', 'unknown'] as const) {
    const result = { ...legacy, isError: kind !== 'succeeded', outcome: { kind, executionStarted: true } }
    expect(contentBlockSchema.parse(result)).toEqual(result)
    expect(contentBlockSchema.safeParse({ ...result, isError: !result.isError }).success).toBe(false)
  }
  expect(toolOutcomeSchema.safeParse({ kind: 'cancelled' }).success).toBe(false)
  expect(toolOutcomeSchema.safeParse({ kind: 'arbitrary', executionStarted: true }).success).toBe(false)
  expect(toolOutcomeSchema.safeParse({ kind: 'unknown', executionStarted: true, secret: 'not accepted' }).success).toBe(
    false,
  )
})

test('actual Host abort reasons remain distinct and are not classified by message text', () => {
  expect(hostAbortToolOutcome(new HbarError('USER_CANCELLED', 'not inspected'), false)).toEqual({
    kind: 'cancelled',
    executionStarted: false,
  })
  expect(hostAbortToolOutcome(new HbarError('HOST_SHUTTING_DOWN', 'not inspected'), true)).toEqual({
    kind: 'interrupted',
    executionStarted: true,
  })
  for (const reason of [
    new HbarError('RUN_TIMEOUT', 'cancelled'),
    new Error('USER_CANCELLED'),
    new DOMException('cancelled', 'AbortError'),
    'cancelled',
  ])
    expect(hostAbortToolOutcome(reason, true)).toEqual({ kind: 'failed', executionStarted: true })
})

test('only an explicitly typed Goal replacement may cancel a call without an error result', () => {
  const redirected = {
    ...legacy,
    isError: false,
    outcome: { kind: 'cancelled', executionStarted: false, reason: 'goal_replaced' },
  } satisfies Extract<ContentBlock, { type: 'tool_result' }>
  expect(contentBlockSchema.parse(redirected)).toEqual(redirected)
  expect(contentBlockSchema.safeParse({ ...redirected, isError: true }).success).toBe(false)
  expect(toolOutcomeSchema.safeParse({ ...redirected.outcome, kind: 'succeeded' }).success).toBe(false)
  expect(toolOutcomeSchema.safeParse({ ...redirected.outcome, reason: 'arbitrary' }).success).toBe(false)
})
