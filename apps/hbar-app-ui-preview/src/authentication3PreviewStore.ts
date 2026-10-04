import { createStore, type StoreApi } from 'zustand/vanilla'

export type Authentication3NavigationAction = 'forgot-password' | 'create-account'

export interface Authentication3PreviewStoreSeed {
  /** Changes only when the preview scenario should start with fresh drafts. */
  readonly scenarioKey: string
  readonly email: string
  readonly initialQuoteId: string | null
  readonly quoteIds: readonly string[]
  readonly providerIds: readonly string[]
}

export interface Authentication3SignInRequestInput {
  readonly email: string
  readonly quoteId: string | null
}

export type Authentication3HostRequest =
  | (Authentication3SignInRequestInput & {
      readonly kind: 'sign-in-request'
      readonly outcome: 'authentication-and-navigation-unverified'
    })
  | {
      readonly kind: 'provider-request'
      readonly providerId: string
      readonly outcome: 'authentication-and-navigation-unverified'
    }
  | {
      readonly kind: 'navigation-request'
      readonly action: Authentication3NavigationAction
      readonly outcome: 'authentication-and-navigation-unverified'
    }

export interface Authentication3PreviewStoreState {
  readonly email: string
  /** Kept in memory for the controlled preview only; never included in a seed or request. */
  readonly password: string
  readonly passwordVisible: boolean
  readonly quoteId: string | null
  readonly quoteIds: readonly string[]
  readonly providerIds: readonly string[]
  readonly updateEmail: (value: string) => void
  readonly updatePassword: (value: string) => void
  readonly setPasswordVisible: (visible: boolean) => void
  readonly selectQuote: (quoteId: string) => boolean
  readonly replaceQuoteIds: (quoteIds: readonly string[]) => boolean
  readonly replaceProviderIds: (providerIds: readonly string[]) => boolean
  readonly advanceQuote: (direction?: 1 | -1) => string | null
  readonly requestSignIn: (input: Authentication3SignInRequestInput) => Authentication3HostRequest | null
  readonly requestProvider: (providerId: string) => Authentication3HostRequest | null
  readonly requestNavigation: (action: Authentication3NavigationAction) => Authentication3HostRequest
}

export function normalizeAuthentication3Id(id: string): string | null {
  const normalized = id.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeIds(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const id of ids) {
    const value = normalizeAuthentication3Id(id)
    if (value === null || seen.has(value)) continue
    seen.add(value)
    normalized.push(value)
  }
  return normalized
}

function equalIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

function isNavigationAction(value: string): value is Authentication3NavigationAction {
  return value === 'forgot-password' || value === 'create-account'
}

/** Host-owned carousel resource. The returned disposer is used by React effect cleanup. */
export function startAuthentication3QuoteInterval(
  advanceQuote: () => void,
  quoteCount: number,
  intervalMs: number,
): () => void {
  if (
    !Number.isFinite(quoteCount) ||
    quoteCount < 2 ||
    !Number.isFinite(intervalMs) ||
    intervalMs <= 0 ||
    intervalMs > 2_147_483_647
  )
    return () => undefined
  const interval = setInterval(advanceQuote, intervalMs)
  return () => clearInterval(interval)
}

export type Authentication3PreviewStoreApi = StoreApi<Authentication3PreviewStoreState>

export function createAuthentication3PreviewStore(
  seed: Authentication3PreviewStoreSeed,
): Authentication3PreviewStoreApi {
  const quoteIds = normalizeIds(seed.quoteIds)
  const providerIds = normalizeIds(seed.providerIds)
  const initialQuoteId = seed.initialQuoteId === null ? null : normalizeAuthentication3Id(seed.initialQuoteId)
  const quoteId = initialQuoteId !== null && quoteIds.includes(initialQuoteId) ? initialQuoteId : (quoteIds[0] ?? null)

  return createStore<Authentication3PreviewStoreState>((set, get) => ({
    email: seed.email,
    password: '',
    passwordVisible: false,
    quoteId,
    quoteIds,
    providerIds,
    updateEmail: (email) => set({ email }),
    updatePassword: (password) => set({ password }),
    setPasswordVisible: (passwordVisible) => set({ passwordVisible }),
    selectQuote: (requestedId) => {
      const id = normalizeAuthentication3Id(requestedId)
      if (id === null || !get().quoteIds.includes(id) || get().quoteId === id) return false
      set({ quoteId: id })
      return true
    },
    replaceQuoteIds: (requestedIds) => {
      const nextIds = normalizeIds(requestedIds)
      const state = get()
      const nextQuoteId =
        state.quoteId !== null && nextIds.includes(state.quoteId) ? state.quoteId : (nextIds[0] ?? null)
      if (equalIds(state.quoteIds, nextIds) && state.quoteId === nextQuoteId) return false
      set({ quoteIds: nextIds, quoteId: nextQuoteId })
      return true
    },
    replaceProviderIds: (requestedIds) => {
      const nextIds = normalizeIds(requestedIds)
      if (equalIds(get().providerIds, nextIds)) return false
      set({ providerIds: nextIds })
      return true
    },
    advanceQuote: (direction = 1) => {
      const state = get()
      if (state.quoteIds.length === 0) return null
      const currentIndex = state.quoteId === null ? -1 : state.quoteIds.indexOf(state.quoteId)
      const nextIndex =
        currentIndex < 0 ? 0 : (currentIndex + direction + state.quoteIds.length) % state.quoteIds.length
      const nextId = state.quoteIds[nextIndex] ?? null
      if (nextId !== null && nextId !== state.quoteId) set({ quoteId: nextId })
      return nextId
    },
    requestSignIn: (input) => {
      const state = get()
      const requestedQuoteId = input.quoteId === null ? null : normalizeAuthentication3Id(input.quoteId)
      if (
        input.email !== state.email ||
        requestedQuoteId !== state.quoteId ||
        (requestedQuoteId !== null && !state.quoteIds.includes(requestedQuoteId))
      )
        return null
      return {
        kind: 'sign-in-request',
        email: state.email,
        quoteId: state.quoteId,
        outcome: 'authentication-and-navigation-unverified',
      }
    },
    requestProvider: (requestedId) => {
      const providerId = normalizeAuthentication3Id(requestedId)
      if (providerId === null || !get().providerIds.includes(providerId)) return null
      return {
        kind: 'provider-request',
        providerId,
        outcome: 'authentication-and-navigation-unverified',
      }
    },
    requestNavigation: (action) => {
      if (!isNavigationAction(action)) throw new Error('Unsupported authentication navigation action')
      return {
        kind: 'navigation-request',
        action,
        outcome: 'authentication-and-navigation-unverified',
      }
    },
  }))
}
