import { describe, expect, test } from 'bun:test'
import {
  createApprovalDecisionPreviewStore,
  type ApprovalDecisionPreviewSeed,
} from '../apps/hbar-app-ui-preview/src/approvalDecisionPreviewStore'

function seed(overrides: Partial<ApprovalDecisionPreviewSeed> = {}): ApprovalDecisionPreviewSeed {
  return {
    ownerId: 'preview-owner',
    variant: 1,
    requestId: 'request-1',
    state: 'pending',
    busy: false,
    ...overrides,
  }
}

describe('local approval decision preview store', () => {
  test('accepts one matching inline decision and rejects stale, blank, busy, or duplicate actions', () => {
    const store = createApprovalDecisionPreviewStore(seed())
    const initial = store.getState()

    expect(initial.decide('old-request', 'approved')).toBe(false)
    expect(initial.decide(' ', 'approved')).toBe(false)
    expect(store.getState()).toBe(initial)
    expect(store.getState().decide('request-1', 'approved')).toBe(true)
    const confirmed = store.getState()
    expect(confirmed.decision).toBe('approved')
    expect(confirmed.decide('request-1', 'rejected')).toBe(false)
    expect(store.getState()).toBe(confirmed)

    const busyStore = createApprovalDecisionPreviewStore(seed({ busy: true }))
    expect(busyStore.getState().decide('request-1', 'rejected')).toBe(false)
    expect(busyStore.getState().decision).toBe('pending')
  })

  test('preserves exact nonblank request IDs and limits always-allow to the diff variant', () => {
    const inline = createApprovalDecisionPreviewStore(seed({ requestId: ' request-1 ' }))
    expect(inline.getState().decide('request-1', 'approved')).toBe(false)
    expect(inline.getState().decide(' request-1 ', 'always-allow')).toBe(false)
    expect(inline.getState().decide(' request-1 ', 'rejected')).toBe(true)

    const diff = createApprovalDecisionPreviewStore(seed({ variant: 2 }))
    expect(diff.getState().decide('request-1', 'always-allow')).toBe(true)
    expect(diff.getState().decision).toBe('always-allow')
  })

  test('reconciles new requests and host-authoritative state or busy changes', () => {
    const store = createApprovalDecisionPreviewStore(seed())
    store.getState().decide('request-1', 'approved')
    store.getState().reconcile(seed({ requestId: 'request-2' }))
    expect(store.getState().seed.requestId).toBe('request-2')
    expect(store.getState().decision).toBe('pending')

    store.getState().decide('request-2', 'rejected')
    store.getState().reconcile(seed({ requestId: 'request-2', state: 'approved' }))
    expect(store.getState().decision).toBe('approved')

    store.getState().reconcile(seed({ requestId: 'request-2' }))
    expect(store.getState().decision).toBe('pending')
    store.getState().decide('request-2', 'approved')
    store.getState().reconcile(seed({ requestId: 'request-2', busy: true }))
    expect(store.getState().decision).toBe('pending')
    expect(store.getState().seed.busy).toBe(true)
  })

  test('ignores stale owner and variant seeds and keeps instances isolated', () => {
    const first = createApprovalDecisionPreviewStore(seed())
    const second = createApprovalDecisionPreviewStore(seed({ ownerId: 'other-owner' }))
    first.getState().decide('request-1', 'approved')
    const confirmed = first.getState()

    confirmed.reconcile(seed({ ownerId: 'other-owner', requestId: 'other-request' }))
    confirmed.reconcile(seed({ variant: 2, requestId: 'other-request' }))
    expect(first.getState()).toBe(confirmed)
    expect(second.getState().decision).toBe('pending')
  })

  test('starts resolved host content from its authoritative decision', () => {
    expect(createApprovalDecisionPreviewStore(seed({ state: 'rejected' })).getState().decision).toBe('rejected')
  })
})
