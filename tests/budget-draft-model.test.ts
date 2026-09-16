import { expect, test } from 'bun:test'
import type { SessionBudget } from '@hbar/contracts'
import { createBudgetDraftModel } from '../apps/web/src/budget-draft-model'
const initial: SessionBudget = {
  sessionId: 'session',
  budgetId: 'budget',
  limit: 1000,
  usedTokens: 0,
  remainingTokens: 1000,
  phase: 'active',
  revision: 1,
  createdAt: 1,
  updatedAt: 1,
}

test('usage notifications do not overwrite a budget draft and remote limit changes require review', async () => {
  const source = {}
  let snapshot: SessionBudget | null = initial,
    calls = 0
  const model = createBudgetDraftModel({
    identity: () => source,
    snapshot: () => snapshot,
    async save(_, limit) {
      calls++
      snapshot = { ...initial, limit }
      return snapshot
    },
    async clear() {
      snapshot = null
    },
  })
  model.sync('session')
  model.setValue('session', '2000')
  snapshot = { ...initial, usedTokens: 20, remainingTokens: 980, revision: 2 }
  model.sync('session')
  expect(model.store.getState().drafts.session?.value).toBe('2000')
  expect(model.store.getState().drafts.session?.stale).toBe(false)
  snapshot = { ...snapshot, limit: 3000 }
  model.sync('session')
  await model.save('session')
  expect(calls).toBe(0)
  expect(model.store.getState().drafts.session?.stale).toBe(true)
  model.reset('session')
  expect(model.store.getState().drafts.session?.value).toBe('3000')
})
test('budget errors preserve the edited value and reset connection identity rejects a delayed success', async () => {
  let source: object = {},
    failing = true,
    calls = 0,
    finish!: (value: SessionBudget) => void
  const model = createBudgetDraftModel({
    identity: () => source,
    snapshot: () => initial,
    async save() {
      calls++
      if (failing) throw new Error('Temporary failure')
      return new Promise((resolve) => {
        finish = resolve
      })
    },
    async clear() {},
  })
  model.sync('session')
  model.setValue('session', '1500')
  await model.save('session')
  expect(model.store.getState().drafts.session?.error).toBe('failed')
  expect(model.store.getState().drafts.session?.value).toBe('1500')
  failing = false
  const pending = model.save('session')
  await model.save('session')
  expect(calls).toBe(2)
  source = {}
  model.sync('session')
  finish({ ...initial, limit: 1500 })
  await pending
  expect(model.store.getState().drafts.session?.value).toBe('1000')
})
