import { createStore } from 'zustand/vanilla'

export const ONBOARDING6_SUMMARY_IDS = ['workspace', 'members-invited', 'starter-template', 'plan'] as const

export type Onboarding6SummaryId = (typeof ONBOARDING6_SUMMARY_IDS)[number]

export type Onboarding6SummaryValues = Readonly<Record<Onboarding6SummaryId, string>>

export interface Onboarding6PreviewStoreSeed {
  readonly summaryValues: Onboarding6SummaryValues
}

export type Onboarding6HostRequest =
  | {
      readonly kind: 'open-workspace-request'
      readonly resultBehavior: 'workspace-navigation-unverified'
    }
  | {
      readonly kind: 'take-tour-request'
      readonly resultBehavior: 'tour-navigation-unverified'
    }

export interface Onboarding6PreviewStoreState {
  readonly summaryValues: Onboarding6SummaryValues
  readonly requestOpenWorkspace: () => Onboarding6HostRequest
  readonly requestTakeTour: () => Onboarding6HostRequest
}

export function createOnboarding6PreviewStore(seed: Onboarding6PreviewStoreSeed) {
  const summaryValues = { ...seed.summaryValues }

  return createStore<Onboarding6PreviewStoreState>(() => ({
    summaryValues,
    requestOpenWorkspace: () => ({
      kind: 'open-workspace-request',
      resultBehavior: 'workspace-navigation-unverified',
    }),
    requestTakeTour: () => ({
      kind: 'take-tour-request',
      resultBehavior: 'tour-navigation-unverified',
    }),
  }))
}
