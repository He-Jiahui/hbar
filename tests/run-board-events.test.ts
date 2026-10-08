import { expect, test } from 'bun:test'
import { isRunBoardInvalidation } from '../apps/web/src/run-board-events'

test('the board follows authoritative run activity and its owned names and plans', () => {
  for (const kind of [
    'session-activity',
    'sessions',
    'workspaces',
    'workspace-display-names',
    'runs',
    'notifications',
    'schedules',
    'resync',
  ])
    expect(isRunBoardInvalidation({ method: 'host.changed', params: { kind } })).toBe(true)
  for (const kind of ['settings', 'models', 'sandbox-profiles'])
    expect(isRunBoardInvalidation({ method: 'host.changed', params: { kind } })).toBe(false)
  expect(
    isRunBoardInvalidation({
      method: 'plan.updated',
      params: { sessionId: 'original-session', revision: 1, turnId: null, explanation: null, plan: [], updatedAt: 1 },
    }),
  ).toBe(true)
  expect(isRunBoardInvalidation({ method: 'plan.cleared', params: { sessionId: 'original-session' } })).toBe(true)
})
