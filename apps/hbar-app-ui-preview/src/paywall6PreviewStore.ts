import { createStore } from 'zustand/vanilla'

export interface Paywall6ReadSegment {
  readonly id: string
  readonly used: boolean
}

export interface Paywall6Assurance {
  readonly id: string
  readonly text: string
}

export interface Paywall6PreviewStoreSeed {
  readonly emailDraft: string
  readonly segments: readonly Paywall6ReadSegment[]
  readonly assurances: readonly Paywall6Assurance[]
}

export type Paywall6HostRequest =
  | { readonly kind: 'keep-reading-request'; readonly emailDraft: string; readonly resultBehavior: 'delivery-and-subscription-unverified' }
  | { readonly kind: 'sign-in-request'; readonly resultBehavior: 'navigation-and-access-unverified' }

export interface Paywall6PreviewStoreState extends Paywall6PreviewStoreSeed {
  readonly updateEmailDraft: (value: string) => void
  readonly requestKeepReading: () => Paywall6HostRequest
  readonly requestSignIn: () => Paywall6HostRequest
}

function uniqueItems<Item extends { readonly id: string }>(items: readonly Item[]): Item[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id.trim() || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  }).map((item) => ({ ...item }))
}

export function createPaywall6PreviewStore(seed: Paywall6PreviewStoreSeed) {
  return createStore<Paywall6PreviewStoreState>((set, get) => ({
    emailDraft: seed.emailDraft,
    segments: uniqueItems(seed.segments),
    assurances: uniqueItems(seed.assurances),
    updateEmailDraft: (emailDraft) => set({ emailDraft }),
    requestKeepReading: () => ({ kind: 'keep-reading-request', emailDraft: get().emailDraft,
      resultBehavior: 'delivery-and-subscription-unverified' }),
    requestSignIn: () => ({ kind: 'sign-in-request', resultBehavior: 'navigation-and-access-unverified' }),
  }))
}
