import { expect, test } from 'bun:test'
import { MAX_PLAN_STEPS, type PlanState, type PlanStep } from '@hbar/contracts'
import { createPlanDraftModel } from '../apps/web/src/plan-draft-model'

function setup() {
  let source: object = {},
    snapshot: PlanState | null = {
      sessionId: 's',
      turnId: null,
      updatedAt: 1,
      explanation: null,
      plan: [
        { step: 'First', status: 'pending' },
        { step: 'Second', status: 'in_progress' },
      ],
    }
  let received: readonly PlanStep[] = [],
    failures = false
  const model = createPlanDraftModel({
    identity: () => source,
    snapshot: () => snapshot,
    async save(sessionId, steps, explanation) {
      if (failures) throw new Error('Save failed')
      received = steps
      snapshot = { sessionId, turnId: null, plan: steps, explanation, updatedAt: (snapshot?.updatedAt ?? 0) + 1 }
      return snapshot
    },
    async clear() {
      snapshot = null
    },
  })
  model.sync('s')
  return {
    model,
    draft: () => model.store.getState().drafts.s!,
    received: () => received,
    replace: (next: PlanState | null) => {
      snapshot = next
      model.sync('s')
    },
    disconnect: () => {
      source = {}
    },
    fail: (value: boolean) => {
      failures = value
    },
  }
}

test('stable plan IDs survive typing and reordering; missing row callbacks do not change other steps', async () => {
  const { model, draft, received } = setup()
  const [first, second] = draft().steps
  model.update('s', first!.id, { step: 'Edited' })
  model.move('s', first!.id, 1)
  expect(draft().steps.map((step) => step.id)).toEqual([second!.id, first!.id])
  model.remove('s', second!.id)
  model.update('s', second!.id, { step: 'Wrong target' })
  expect(draft().steps).toEqual([{ ...first!, step: 'Edited' }])
  await model.save('s')
  expect(received()).toEqual([{ step: 'Edited', status: 'pending' }])
  expect(draft().steps[0]?.id).toBe(first!.id)
  expect(draft().dirty).toBe(false)
})

test('new snapshots preserve a dirty draft until explicit review or reload', async () => {
  const { model, draft, replace, received } = setup()
  const id = draft().steps[0]!.id
  model.update('s', id, { step: 'Local work' })
  replace({
    sessionId: 's',
    turnId: null,
    updatedAt: 2,
    explanation: 'Remote',
    plan: [{ step: 'New remote plan', status: 'completed' }],
  })
  expect(draft().stale).toBe(true)
  expect(draft().steps[0]?.step).toBe('Local work')
  await model.save('s')
  expect(received()).toEqual([])
  model.acknowledge('s')
  await model.save('s')
  expect(received()[0]?.step).toBe('Local work')
  expect(draft().stale).toBe(false)
})

test('plan limit is protocol-owned, failures retain the draft, and removed connection drafts are not reused', async () => {
  const { model, draft, fail, disconnect } = setup()
  while (draft().steps.length < MAX_PLAN_STEPS) model.add('s')
  model.add('s')
  expect(draft().steps).toHaveLength(MAX_PLAN_STEPS)
  expect(draft().error).toBe('limit')
  model.reset('s')
  const id = draft().steps[0]!.id
  model.update('s', id, { step: 'Recoverable work' })
  fail(true)
  await model.save('s')
  expect(draft().error).toBe('failed')
  expect(draft().steps[0]?.id).toBe(id)
  fail(false)
  await model.save('s')
  expect(draft().dirty).toBe(false)
  disconnect()
  model.sync('s')
  expect(draft().steps[0]?.id).not.toBe(id)
})

test('old save results and duplicate saves cannot mutate another host draft', async () => {
  let source: object = {},
    finish!: (plan: PlanState) => void,
    calls = 0
  const model = createPlanDraftModel({
    identity: () => source,
    snapshot: () => null,
    clear: async () => {},
    save: () => {
      calls++
      return new Promise((resolve) => {
        finish = resolve
      })
    },
  })
  model.sync('s')
  model.setNewStep('s', 'Draft')
  model.add('s')
  const pending = model.save('s')
  await model.save('s')
  expect(calls).toBe(1)
  source = {}
  model.sync('s')
  finish({
    sessionId: 's',
    turnId: null,
    updatedAt: 1,
    explanation: null,
    plan: [{ step: 'Old host', status: 'pending' }],
  })
  await pending
  expect(model.store.getState().drafts.s?.steps).toEqual([])
})
