import { describe, expect, test } from 'bun:test'
import type { Run } from '@hbar/contracts'
import { sessionRunFailures } from '../packages/app-react/src/session-run-failure-model'

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
})
