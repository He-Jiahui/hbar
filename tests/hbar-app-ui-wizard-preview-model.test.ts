import { describe, expect, test } from 'bun:test'
import {
  createWizardPreviewStore,
  type WizardPreviewFlow,
  type WizardPreviewScope,
} from '../apps/hbar-app-ui-preview/src/wizardPreviewModel'

function setup(variant: WizardPreviewScope['variant'], flow: WizardPreviewFlow) {
  const scope: WizardPreviewScope = { ownerId: 'wizard', variant, fixtureId: 'default' }
  const store = createWizardPreviewStore({ scope, flow })
  return { scope, store }
}
describe('Wizard owned state', () => {
  test('normalizes duplicate fields/steps and validates native choices', () => {
    const { scope, store } = setup(1, {
      kind: 'information',
      stepIds: ['info', 'info', '', 'payment'],
      stepId: 'missing',
      fields: [
        { id: 'name', value: 'Mara' },
        { id: 'name', value: 'Duplicate' },
        { id: 'role', value: 'stale', optionIds: ['finance', 'finance', ''] },
        { id: '', value: 'Bad' },
      ],
    })
    expect(store.getState().flow).toEqual({
      kind: 'information',
      stepIds: ['info', 'payment'],
      stepId: 'info',
      fields: [
        { id: 'name', value: 'Mara' },
        { id: 'role', value: 'finance', optionIds: ['finance'] },
      ],
    })
    expect(store.getState().field(scope, 'name', '')).toBe(true)
    expect(store.getState().field(scope, 'role', 'unknown')).toBe(false)
    expect(store.getState().field(scope, 'missing', 'Ignored')).toBe(false)
    expect(store.getState().step(scope, 'payment')).toBe(true)
    expect(store.getState().step(scope, 'missing')).toBe(false)
    expect(store.getState().plan(scope, 'finance')).toBe(false)
  })
  test('rejects another owner and superseded generation even with identical IDs', () => {
    const { scope, store } = setup(2, { kind: 'invoice', fields: [{ id: 'customer', value: 'Initial' }] })
    expect(store.getState().field({ ...scope }, 'customer', 'Wrong generation')).toBe(false)
    const next: WizardPreviewScope = { ...scope }
    store.getState().refresh({ scope: next, flow: { kind: 'invoice', fields: [{ id: 'number', value: 'New input' }] } })
    expect(store.getState().field(scope, 'customer', 'Old callback')).toBe(false)
    expect(store.getState().field(next, 'customer', 'Deleted field')).toBe(false)
    expect(store.getState().field(next, 'number', 'Current edit')).toBe(true)
  })
  test('empty or mismatched workflows cannot receive actions', () => {
    const { scope, store } = setup(4, { kind: 'migration', progress: 64, step: 2, intervalMs: 1500, ceiling: 98 })
    expect(store.getState().flow).toEqual({ kind: 'empty' })
    expect(store.getState().tick(scope)).toBe(false)
    expect(store.getState().service(scope, 'database')).toBe(false)
    store.getState().refresh({ scope, flow: { kind: 'environment', serviceIds: [], selectedIds: ['stale'] } })
    expect(store.getState().flow).toEqual({ kind: 'environment', serviceIds: [], selectedIds: [] })
  })
  test('upgrade selections and service toggles are owner-local', () => {
    const upgrade = setup(3, {
      kind: 'upgrade',
      stepIds: ['plan', 'review'],
      stepId: 'plan',
      planIds: ['team', 'business'],
      planId: 'stale',
    })
    expect(upgrade.store.getState().plan(upgrade.scope, 'business')).toBe(true)
    expect(upgrade.store.getState().step(upgrade.scope, 'review')).toBe(true)
    expect(upgrade.store.getState().plan(upgrade.scope, 'missing')).toBe(false)
    const env = setup(4, {
      kind: 'environment',
      serviceIds: ['db', 'cache', 'db'],
      selectedIds: ['db', 'db', 'missing'],
    })
    expect(env.store.getState().service(env.scope, 'db')).toBe(true)
    expect(env.store.getState().service(env.scope, 'cache')).toBe(true)
    expect(env.store.getState().service(env.scope, 'missing')).toBe(false)
    expect(env.store.getState().flow).toEqual({
      kind: 'environment',
      serviceIds: ['db', 'cache'],
      selectedIds: ['cache'],
    })
  })
  test('review confirmation toggles without claiming a submitted job', () => {
    const { scope, store } = setup(5, { kind: 'review', confirmed: false })
    expect(store.getState().confirm(scope, true)).toBe(true)
    expect(store.getState().confirm(scope, true)).toBe(false)
    expect(store.getState().flow).toEqual({ kind: 'review', confirmed: true })
    expect(store.getState().confirm(scope, false)).toBe(true)
  })
  test('migration advances finitely to its ceiling and rejects later ticks', () => {
    const { scope, store } = setup(6, { kind: 'migration', progress: 96, step: 2, intervalMs: 1500, ceiling: 98 })
    expect(store.getState().tick(scope)).toBe(true)
    expect(store.getState().flow).toEqual({ kind: 'migration', progress: 98, step: 2, intervalMs: 1500, ceiling: 98 })
    const stopped = store.getState().flow
    expect(store.getState().tick(scope)).toBe(false)
    expect(store.getState().flow).toBe(stopped)
    store.getState().refresh({
      scope,
      flow: { kind: 'migration', progress: Number.NaN, step: Infinity, intervalMs: -1, ceiling: 120 },
    })
    expect(store.getState().flow).toEqual({ kind: 'migration', progress: 0, step: 0, intervalMs: 0, ceiling: 100 })
    expect(store.getState().tick(scope)).toBe(false)
  })
  test('shipping keeps answers by question and rejects stale or invalid option targets', () => {
    const { scope, store } = setup(7, {
      kind: 'shipping',
      questions: [
        { id: 'region', optionIds: ['eu', 'world'] },
        { id: 'handoff', optionIds: ['courier'] },
        { id: 'region', optionIds: ['duplicate'] },
      ],
      questionId: 'stale',
      answers: { region: 'eu', handoff: 'missing', stale: 'eu' },
    })
    expect(store.getState().answer(scope, 'region', 'world')).toBe(true)
    expect(store.getState().question(scope, 'handoff')).toBe(true)
    expect(store.getState().answer(scope, 'region', 'eu')).toBe(false)
    expect(store.getState().answer(scope, 'handoff', 'unknown')).toBe(false)
    expect(store.getState().answer(scope, 'handoff', 'courier')).toBe(true)
    expect(store.getState().question(scope, 'region')).toBe(true)
    const flow = store.getState().flow
    expect(flow.kind === 'shipping' && flow.answers).toEqual({ region: 'world', handoff: 'courier' })
    expect(store.getState().question(scope, 'missing')).toBe(false)
  })
})
