import { createStore } from 'zustand/vanilla'

export const ONBOARDING1_TIMEZONE_IDS = ['lisbon', 'berlin', 'new-york', 'singapore'] as const

export type Onboarding1TimezoneId = (typeof ONBOARDING1_TIMEZONE_IDS)[number]

export interface Onboarding1ProfileDraft {
  readonly fullName: string
  readonly jobTitle: string
  readonly timezoneId: Onboarding1TimezoneId | null
  readonly productUpdatesOptIn: boolean
}

export type Onboarding1HostRequest =
  | { readonly kind: 'request-photo-selection' }
  | { readonly kind: 'continue-profile'; readonly draft: Onboarding1ProfileDraft }

export interface Onboarding1PreviewStoreState {
  readonly draft: Onboarding1ProfileDraft
  readonly setFullName: (fullName: string) => boolean
  readonly setJobTitle: (jobTitle: string) => boolean
  readonly setTimezoneId: (timezoneId: string | null) => boolean
  readonly setProductUpdatesOptIn: (enabled: boolean) => boolean
  readonly requestPhotoSelection: () => Onboarding1HostRequest
  readonly requestContinue: () => Onboarding1HostRequest
}

function isTimezoneId(value: string): value is Onboarding1TimezoneId {
  return ONBOARDING1_TIMEZONE_IDS.some((timezoneId) => timezoneId === value)
}

function cloneDraft(draft: Onboarding1ProfileDraft): Onboarding1ProfileDraft {
  return { ...draft }
}

export function createOnboarding1PreviewStore(initialDraft: Onboarding1ProfileDraft) {
  return createStore<Onboarding1PreviewStoreState>((set, get) => ({
    draft: cloneDraft(initialDraft),
    setFullName: (fullName) => {
      const current = get().draft
      if (current.fullName === fullName) return false
      set({ draft: { ...current, fullName } })
      return true
    },
    setJobTitle: (jobTitle) => {
      const current = get().draft
      if (current.jobTitle === jobTitle) return false
      set({ draft: { ...current, jobTitle } })
      return true
    },
    setTimezoneId: (timezoneId) => {
      const nextTimezoneId = timezoneId === '' ? null : timezoneId
      if (nextTimezoneId !== null && !isTimezoneId(nextTimezoneId)) return false

      const current = get().draft
      if (current.timezoneId === nextTimezoneId) return false
      set({ draft: { ...current, timezoneId: nextTimezoneId } })
      return true
    },
    setProductUpdatesOptIn: (enabled) => {
      const current = get().draft
      if (current.productUpdatesOptIn === enabled) return false
      set({ draft: { ...current, productUpdatesOptIn: enabled } })
      return true
    },
    requestPhotoSelection: () => ({ kind: 'request-photo-selection' }),
    requestContinue: () => ({ kind: 'continue-profile', draft: cloneDraft(get().draft) }),
  }))
}
