import { createStore } from 'zustand/vanilla'

export interface Paywall4PreviewMeter {
  readonly id: string
  readonly label: string
  readonly usedText: string
  readonly limitText: string
  readonly fraction: number
}

export interface Paywall4PreviewStoreSeed {
  readonly meters: readonly Paywall4PreviewMeter[]
}

export type Paywall4HostRequest =
  | { readonly kind: 'top-up-request'; readonly resultBehavior: 'checkout-and-quota-update-unverified' }
  | { readonly kind: 'upgrade-request'; readonly resultBehavior: 'billing-and-ingestion-resume-unverified' }

export interface Paywall4PreviewStoreState extends Paywall4PreviewStoreSeed {
  readonly requestTopUp: () => Paywall4HostRequest
  readonly requestUpgrade: () => Paywall4HostRequest
}

export function createPaywall4PreviewStore(seed: Paywall4PreviewStoreSeed) {
  const seen = new Set<string>()
  const meters = seed.meters.filter((meter) => {
    if (!meter.id.trim() || seen.has(meter.id)) return false
    seen.add(meter.id)
    return true
  }).map((meter) => ({
    ...meter,
    fraction: Number.isFinite(meter.fraction) ? Math.max(0, Math.min(1, meter.fraction)) : 0,
  }))

  return createStore<Paywall4PreviewStoreState>(() => ({
    meters,
    requestTopUp: () => ({ kind: 'top-up-request', resultBehavior: 'checkout-and-quota-update-unverified' }),
    requestUpgrade: () => ({ kind: 'upgrade-request', resultBehavior: 'billing-and-ingestion-resume-unverified' }),
  }))
}
