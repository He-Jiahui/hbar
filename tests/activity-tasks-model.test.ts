import { expect, test } from 'bun:test'
import type { ComposerIntentState } from '@hbar/app-runtime'
import { goalPlanSnapshotSchema } from '@hbar/contracts/commands/goals'
import { projectActivityTasks } from '../packages/app-react/src/activity-tasks-model'

function facts(count: number): ComposerIntentState['facts'] {
  return {
    sessionId: 'parent',
    status: 'ready',
    error: null,
    snapshot: goalPlanSnapshotSchema.parse({
      sessionId: 'parent',
      goal: null,
      remainingTokens: null,
      goalSeq: 0,
      planSeq: 1,
      plan: {
        sessionId: 'parent',
        revision: 1,
        turnId: null,
        updatedAt: 1,
        explanation: null,
        plan: Array.from({ length: count }, (_, index) => ({
          step: `任务 ${index}`,
          status: index % 2 ? 'pending' : 'completed',
        })),
      },
    }),
  }
}

test('Activity tasks use the Host 100-step bound and correct completed progress', () => {
  for (const count of [0, 1, 3, 100]) {
    const projected = projectActivityTasks(facts(count), 'parent')
    expect(projected.steps).toHaveLength(count)
    expect(projected.completed).toBe(Math.ceil(count / 2))
    expect(projected.loading).toBe(false)
  }
  expect(() => facts(101)).toThrow()
})
test('loading/error retain only the captured same-Session facts, never another parent plan', () => {
  const current = facts(3)
  expect(projectActivityTasks({ ...current, status: 'loading' }, 'parent')).toMatchObject({
    loading: true,
    completed: 2,
  })
  expect(projectActivityTasks({ ...current, status: 'error', error: 'TIMEOUT' }, 'parent')).toMatchObject({
    failed: true,
    completed: 2,
  })
  expect(projectActivityTasks(current, 'other')).toMatchObject({ loading: true, steps: [], completed: 0 })
  expect(
    projectActivityTasks(
      { ...current, snapshot: current.snapshot ? { ...current.snapshot, sessionId: 'other' } : null },
      'parent',
    ).steps,
  ).toEqual([])
  expect(
    projectActivityTasks(
      { ...current, snapshot: current.snapshot ? { ...current.snapshot, plan: null } : null },
      'parent',
    ).steps,
  ).toEqual([])
})
