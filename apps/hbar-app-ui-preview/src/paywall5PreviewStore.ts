import { createStore } from 'zustand/vanilla'

export interface Paywall5PreviewRow {
  readonly id: string
  readonly label: string
  readonly value: string
}

export interface Paywall5PreviewStoreSeed {
  readonly rows: readonly Paywall5PreviewRow[]
}

export type Paywall5HostRequest =
  | { readonly kind: 'change-payment-request'; readonly resultBehavior: 'payment-editor-and-update-unverified' }
  | { readonly kind: 'reactivate-request'; readonly resultBehavior: 'billing-and-access-restoration-unverified' }

export interface Paywall5PreviewStoreState extends Paywall5PreviewStoreSeed {
  readonly requestPaymentChange: () => Paywall5HostRequest
  readonly requestReactivate: () => Paywall5HostRequest
}

export function createPaywall5PreviewStore(seed: Paywall5PreviewStoreSeed) {
  const seen = new Set<string>()
  const rows = seed.rows.filter((row) => {
    if (!row.id.trim() || seen.has(row.id)) return false
    seen.add(row.id)
    return true
  }).map((row) => ({ ...row }))
  return createStore<Paywall5PreviewStoreState>(() => ({
    rows,
    requestPaymentChange: () => ({ kind: 'change-payment-request', resultBehavior: 'payment-editor-and-update-unverified' }),
    requestReactivate: () => ({ kind: 'reactivate-request', resultBehavior: 'billing-and-access-restoration-unverified' }),
  }))
}
