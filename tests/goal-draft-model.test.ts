import { expect, test } from 'bun:test'
import { MAX_GOAL_OBJECTIVE_LENGTH, type ThreadGoal } from '@hbar/contracts'
import { createGoalDraftModel } from '../apps/web/src/goal-draft-model'

const initial: ThreadGoal = {
  threadId: 'session',
  goalId: 'first',
  objective: 'Original',
  status: 'active',
  tokenBudget: 1000,
  tokensUsed: 0,
  timeUsedSeconds: 0,
  createdAt: 1,
  updatedAt: 1,
}

test('a newer remote goal arriving during save preserves the submitted draft for review', async () => {
  const source = {},
    latest = { ...initial, objective: 'New remote objective' }
  let goal = initial
  const model = createGoalDraftModel({
    identity: () => source,
    snapshot: () => goal,
    async save() {
      goal = latest
    },
    async setPaused() {},
    async clear() {},
  })
  model.sync('session')
  model.edit('session', 'objective', 'Local objective')
  await model.save('session')
  expect(model.store.getState().drafts.session).toMatchObject({
    objective: 'Local objective',
    stale: true,
    busy: false,
  })
})
test('usage and pause updates preserve unsaved goal fields; changed objectives require review', async () => {
  const source = {}
  let goal: ThreadGoal | null = initial,
    saves = 0,
    clears = 0
  const model = createGoalDraftModel({
    identity: () => source,
    snapshot: () => goal,
    async save() {
      saves++
    },
    async setPaused(_id, _goal, paused) {
      goal = { ...initial, status: paused ? 'paused' : 'active' }
    },
    async clear() {
      clears++
      goal = null
    },
  })
  model.sync('session')
  model.edit('session', 'objective', 'Still typing')
  goal = { ...initial, tokensUsed: 100, updatedAt: 2 }
  model.sync('session')
  expect(model.store.getState().drafts.session).toMatchObject({ objective: 'Still typing', stale: false })
  await model.togglePaused('session')
  expect(model.store.getState().drafts.session).toMatchObject({ objective: 'Still typing', dirty: true })
  goal = { ...initial, objective: 'Remote', updatedAt: 3 }
  model.sync('session')
  await model.save('session')
  expect(saves).toBe(0)
  expect(model.store.getState().drafts.session).toMatchObject({ objective: 'Still typing', stale: true })
  model.reset('session')
  expect(model.store.getState().drafts.session?.objective).toBe('Remote')
  await model.clear('session')
  expect(clears).toBe(0)
  model.confirmClear('session', true)
  goal = { ...initial, goalId: 'replacement' }
  await model.clear('session')
  expect(clears).toBe(0)
  expect(model.store.getState().drafts.session?.stale).toBe(true)
})
test('goal validation uses protocol limits, failures retain input and duplicate requests cannot write a new connection', async () => {
  let source: object = {},
    calls = 0,
    failing = true,
    resolve!: () => void
  const model = createGoalDraftModel({
    identity: () => source,
    snapshot: () => initial,
    async save() {
      calls++
      if (failing) throw new Error('offline')
      await new Promise<void>((done) => {
        resolve = done
      })
    },
    async setPaused() {},
    async clear() {},
  })
  model.sync('session')
  model.edit('session', 'objective', 'x'.repeat(MAX_GOAL_OBJECTIVE_LENGTH + 1))
  await model.save('session')
  expect(model.store.getState().drafts.session?.error).toBe('objective')
  expect(calls).toBe(0)
  model.edit('session', 'objective', 'x'.repeat(MAX_GOAL_OBJECTIVE_LENGTH))
  model.edit('session', 'budget', '0')
  await model.save('session')
  expect(model.store.getState().drafts.session?.error).toBe('budget')
  model.edit('session', 'budget', '2000')
  await model.save('session')
  expect(calls).toBe(1)
  expect(model.store.getState().drafts.session).toMatchObject({ budget: '2000', error: 'failed', busy: false })
  failing = false
  const pending = model.save('session')
  await model.save('session')
  expect(calls).toBe(2)
  source = {}
  model.sync('session')
  model.edit('session', 'objective', 'New connection draft')
  resolve()
  await pending
  expect(model.store.getState().drafts.session).toMatchObject({ objective: 'New connection draft', busy: false })
})
