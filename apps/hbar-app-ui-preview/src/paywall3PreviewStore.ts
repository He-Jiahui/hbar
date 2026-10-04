import { createStore } from 'zustand/vanilla'

export type Paywall3BillingPeriod = 'monthly' | 'yearly'

export interface Paywall3PreviewStoreSeed {
  readonly initialPeriod: Paywall3BillingPeriod
  readonly currentPlanId: string
  readonly selectablePlanIds: readonly string[]
}

export type Paywall3HostRequest =
  | {
      readonly kind: 'plan-selection-request'
      readonly planId: string
      readonly billingPeriod: Paywall3BillingPeriod
      readonly resultBoundary: 'checkout-result-unverified'
    }
  | {
      readonly kind: 'feature-comparison-request'
      readonly resultBoundary: 'comparison-navigation-unverified'
    }

export interface Paywall3PreviewStoreState {
  readonly billingPeriod: Paywall3BillingPeriod
  readonly setBillingPeriod: (period: Paywall3BillingPeriod) => boolean
  readonly requestPlanSelection: (planId: string) => Paywall3HostRequest | null
  readonly requestFeatureComparison: () => Paywall3HostRequest
}

export function createPaywall3PreviewStore(seed: Paywall3PreviewStoreSeed) {
  const selectablePlanIds = new Set(seed.selectablePlanIds.filter((id) => id.trim().length > 0))
  const currentPlanId = seed.currentPlanId

  return createStore<Paywall3PreviewStoreState>((set, get) => ({
    billingPeriod: seed.initialPeriod,
    setBillingPeriod: (period) => {
      if (period !== 'monthly' && period !== 'yearly') return false
      if (get().billingPeriod === period) return false
      set({ billingPeriod: period })
      return true
    },
    requestPlanSelection: (planId) => {
      if (!selectablePlanIds.has(planId) || planId === currentPlanId) return null
      return {
        kind: 'plan-selection-request',
        planId,
        billingPeriod: get().billingPeriod,
        resultBoundary: 'checkout-result-unverified',
      }
    },
    requestFeatureComparison: () => ({
      kind: 'feature-comparison-request',
      resultBoundary: 'comparison-navigation-unverified',
    }),
  }))
}
