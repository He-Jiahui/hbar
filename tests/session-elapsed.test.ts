import { expect, test } from 'bun:test'
import type { Run, ThreadGoal } from '@hbar/contracts'
import { goalElapsedSeconds, runObservedEnd } from '../packages/app-react/src/session-elapsed-model'

const goal: ThreadGoal = {
  threadId: 'session',
  goalId: 'goal',
  objective: 'Verify timing',
  status: 'active',
  tokenBudget: null,
  tokensUsed: 0,
  timeUsedSeconds: 80,
  createdAt: 1,
  updatedAt: 2,
  timing: { observedAt: 5_000_000, elapsedMilliseconds: 83_250, running: true },
}
const run: Run = {
  id: 'run',
  sessionId: 'session',
  requestId: 'request',
  modelId: 'fixture',
  input: { text: '', images: [] },
  status: 'running',
  createdAt: 4_000_000,
  startedAt: 4_000_000,
  endedAt: null,
  error: null,
}

test('Goal elapsed time uses paired local receipt time despite Host clock skew', () => {
  expect(goalElapsedSeconds(goal, 1000, 3750, true)).toBe(86)
  expect(goalElapsedSeconds(goal, 1000, 0, true)).toBe(83)
  expect(goalElapsedSeconds(goal, undefined, 99_999, true)).toBe(83)
})

test('idle, completed, disconnected and legacy Goals never grow from creation or update timestamps', () => {
  expect(goalElapsedSeconds({ ...goal, timing: { ...goal.timing!, running: false } }, 1000, 99_999, true)).toBe(83)
  expect(goalElapsedSeconds(goal, 1000, 99_999, false)).toBe(83)
  expect(goalElapsedSeconds({ ...goal, status: 'complete' }, 1000, 99_999, true)).toBe(83)
  const { timing: _timing, ...legacy } = goal
  expect(goalElapsedSeconds(legacy, 1000, 99_999, true)).toBe(80)
})

test('Run duration advances while executing, freezes at terminal fact and never times queued Runs', () => {
  const clock = { hostTime: 4_000_300, receivedAt: 1000 }
  expect(runObservedEnd(run, clock, 2500, true)).toBe(4_001_800)
  expect(runObservedEnd({ ...run, status: 'waiting_approval' }, clock, 2500, true)).toBe(4_001_800)
  expect(runObservedEnd(run, clock, 99_999, false)).toBe(4_000_300)
  expect(runObservedEnd({ ...run, status: 'completed', endedAt: 4_000_750 }, clock, 99_999, true)).toBe(4_000_750)
  expect(runObservedEnd({ ...run, status: 'queued', startedAt: null }, clock, 99_999, true)).toBeNull()
  expect(runObservedEnd(run, undefined, 99_999, true)).toBeNull()
})
