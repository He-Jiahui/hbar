import { describe, expect, test } from 'bun:test'
import type { Run } from '@hbar/contracts'
import { currentSessionRunFailure, sessionRunFailures } from '../packages/app-react/src/session-run-failure-model'

function run(id: string, sessionId: string, status: Run['status']): Run {
  return {
    id,
    sessionId,
    requestId: `request-${id}`,
    input: { text: 'prompt', images: [], source: 'user' },
    modelId: 'provider/model',
    status,
    createdAt: 1,
    startedAt: 1,
    endedAt: 2,
    error: status === 'failed' ? 'INVALID_MODEL_OVERRIDE' : null,
  }
}

describe('session run failure feedback projection', () => {
  test('keeps failed and interrupted runs for the visible session only', () => {
    const failures = sessionRunFailures(
      [
        run('failed-current', 'session-current', 'failed'),
        run('interrupted-current', 'session-current', 'interrupted'),
        run('completed-current', 'session-current', 'completed'),
        run('failed-other', 'session-other', 'failed'),
      ],
      'session-current',
    )

    expect(failures.map((item) => item.id)).toEqual(['failed-current', 'interrupted-current'])
  })

  test('does not expose a failure while the session target is absent', () => {
    expect(sessionRunFailures([run('failed', 'session-current', 'failed')], null)).toEqual([])
  })

  test('only the newest unsuperseded failure becomes current, independent of input order', () => {
    const older = { ...run('old-error', 'session-current', 'failed'), createdAt: 1 }
    const latest = { ...run('latest-error', 'session-current', 'interrupted'), createdAt: 3 }
    const success = { ...run('success', 'session-current', 'completed'), createdAt: 2 }
    expect(currentSessionRunFailure([older, success, latest], 'session-current')).toBe(latest)
    expect(currentSessionRunFailure([latest, older, success], 'session-current')).toBe(latest)
    expect(currentSessionRunFailure([older, success], 'session-current')).toBeNull()
    expect(sessionRunFailures([older, success, latest], 'session-current')).toEqual([older, latest])
  })

  for (const status of ['queued', 'running', 'waiting_approval', 'completed', 'cancelled', 'guided'] as const)
    test(`a ${status} attempt supersedes the previous failure without deleting it`, () => {
      const failure = run('old-error', 'session-current', 'failed')
      const next = { ...run('next', 'session-current', status), createdAt: 3 }
      expect(currentSessionRunFailure([failure, next], 'session-current')).toBeNull()
      expect(sessionRunFailures([failure, next], 'session-current')).toEqual([failure])
    })

  test('foreign runs and absent targets never borrow or supersede another session failure', () => {
    const failure = run('original', 'session-current', 'failed')
    const other = { ...run('foreign', 'session-other', 'running'), createdAt: 4 }
    expect(currentSessionRunFailure([other, failure], 'session-current')).toBe(failure)
    expect(currentSessionRunFailure([failure], 'session-other')).toBeNull()
    expect(currentSessionRunFailure([failure], null)).toBeNull()
    expect(currentSessionRunFailure([], 'session-current')).toBeNull()
  })
})
