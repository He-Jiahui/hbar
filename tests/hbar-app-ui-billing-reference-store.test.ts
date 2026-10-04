import { describe, expect, test } from 'bun:test'
import {
  createBillingReferencePreviewStore,
  type BillingReferencePreviewSeed,
} from '../apps/hbar-app-ui-preview/src/billingReferencePreviewStore'

function seed(patch: Partial<BillingReferencePreviewSeed> = {}): BillingReferencePreviewSeed {
  return {
    ownerId: 'billing-test',
    kind: 'invoice',
    targetIds: [],
    initialSelectionId: null,
    initialExpandedIds: [],
    flags: [],
    initialDirty: false,
    fields: [{ id: 'customer', value: 'Northwind' }],
    valueLimit: 5000,
    ...patch,
  }
}

describe('Billing reference preview domain owner', () => {
  test('captures immutable drafts, rejects duplicate requests, and retains edits through failure/cancellation', () => {
    const store = createBillingReferencePreviewStore(seed())
    const state = () => store.getState()
    expect(state().setField('customer', 'Cedar')).toBe(true)
    const request = state().startRequest('save-invoice')!
    expect(request.values).toEqual({ customer: 'Cedar' })
    expect(request.outcome).toBe('preview-only')
    expect(state().startRequest('save-invoice')).toBeNull()
    expect(state().setField('customer', 'Changed during pending')).toBe(false)
    expect(state().completeRequest('other-owner-ticket', 'confirmed')).toBe(false)
    expect(state().completeRequest(request.requestId, 'failed')).toBe(true)
    expect(state().phase).toBe('failed')
    expect(state().values.customer).toBe('Cedar')
    const retry = state().startRequest('save-invoice')!
    expect(state().cancelPending()).toBe(true)
    expect(state().completeRequest(retry.requestId, 'confirmed')).toBe(false)
    expect(state().values.customer).toBe('Cedar')
    expect(state().phase).toBe('cancelled')
  })

  test('isolates owners and treats composed flag IDs without collisions; discard uses the confirmed baseline', () => {
    const input = seed({
      kind: 'plans',
      fields: [],
      flags: [
        { planId: 'a:b', toggleId: 'c', enabled: true },
        { planId: 'a', toggleId: 'b:c', enabled: true },
      ],
    })
    const first = createBillingReferencePreviewStore(input)
    const second = createBillingReferencePreviewStore(input)
    expect(first.getState().setFlag('a:b', 'c', false)).toBe(true)
    expect(first.getState().flags.map(({ enabled }) => enabled)).toEqual([false, true])
    expect(second.getState().flags.map(({ enabled }) => enabled)).toEqual([true, true])
    const request = first.getState().startRequest('save-plans')!
    expect(second.getState().completeRequest(request.requestId, 'confirmed')).toBe(false)
    expect(first.getState().completeRequest(request.requestId, 'confirmed')).toBe(true)
    expect(first.getState().dirty).toBe(false)
    expect(first.getState().setFlag('a:b', 'c', true)).toBe(true)
    expect(first.getState().discard()).toBe(true)
    expect(first.getState().flags.map(({ enabled }) => enabled)).toEqual([false, true])
    first.getState().reconcile({ ...input, ownerId: 'other-account' })
    expect(first.getState().seed.ownerId).toBe('billing-test')
  })

  test('validates selections and retired IDs without allowing stale primary confirmation', () => {
    const input = seed({
      kind: 'payment-methods',
      fields: [],
      targetIds: ['visa', 'visa', '', 'mastercard'],
      initialSelectionId: 'visa',
      initialExpandedIds: ['visa', 'retired'],
    })
    const store = createBillingReferencePreviewStore(input)
    expect(store.getState().seed.targetIds).toEqual(['visa', 'mastercard'])
    expect(store.getState().expandedIds).toEqual(['visa'])
    expect(store.getState().select('retired')).toBe(false)
    const request = store.getState().startRequest('primary', 'mastercard')!
    expect(store.getState().selectionId).toBe('visa')
    store.getState().reconcile({ ...input, targetIds: ['visa'] })
    expect(store.getState().phase).toBe('cancelled')
    expect(store.getState().completeRequest(request.requestId, 'confirmed')).toBe(false)
    store.getState().reconcile({ ...input, targetIds: [] })
    expect(store.getState().selectionId).toBeNull()
    expect(store.getState().expandedIds).toEqual([])
  })

  test('keeps valid drafts on seed refresh and cancels captured values that violate a changed contract', () => {
    const input = seed({
      fields: [
        { id: 'customer', value: 'Northwind' },
        { id: 'currency', value: 'usd', choices: ['usd', 'eur'] },
      ],
    })
    const store = createBillingReferencePreviewStore(input)
    store.getState().setQuery('keep query')
    expect(store.getState().setField('currency', 'unknown')).toBe(false)
    expect(store.getState().setField('missing', 'value')).toBe(false)
    expect(store.getState().setField('customer', 'x'.repeat(5001))).toBe(false)
    expect(store.getState().setField('customer', 'Cedar Labs')).toBe(true)
    const first = store.getState().startRequest('save-invoice')!
    store.getState().reconcile({ ...input, valueLimit: 5 })
    expect(store.getState().values.customer).toBe('Cedar')
    expect(store.getState().query).toBe('keep query')
    expect(store.getState().phase).toBe('cancelled')
    expect(store.getState().completeRequest(first.requestId, 'confirmed')).toBe(false)
    const second = store.getState().startRequest('save-invoice')!
    store
      .getState()
      .reconcile({ ...input, valueLimit: 5, fields: [{ id: 'currency', value: 'eur', choices: ['eur'] }] })
    expect(store.getState().values).toEqual({ currency: 'eur' })
    expect(store.getState().completeRequest(second.requestId, 'confirmed')).toBe(false)
  })
})
