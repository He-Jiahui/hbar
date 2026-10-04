import { createStore, type StoreApi } from 'zustand/vanilla'

export type Authentication4Phase = 'email' | 'email-pending' | 'password' | 'sign-in-pending'

export type Authentication4InitialPhase = 'email' | 'password'

export type Authentication4NavigationIntent = 'magic-link' | 'forgot-password' | 'create-account'

export type Authentication4Outcome = 'authentication-and-navigation-unverified'

export interface Authentication4PreviewStoreSeed {
  readonly scenarioKey: string
  readonly email: string
  readonly initialPhase: Authentication4InitialPhase
}

interface Authentication4HostRequestBase {
  readonly requestId: string
  readonly scenarioKey: string
  readonly outcome: Authentication4Outcome
}

export interface Authentication4ContinueRequest extends Authentication4HostRequestBase {
  readonly kind: 'continue-request'
  readonly email: string
}

export interface Authentication4SignInRequest extends Authentication4HostRequestBase {
  readonly kind: 'sign-in-request'
  readonly email: string
}

export interface Authentication4NavigationRequest extends Authentication4HostRequestBase {
  readonly kind: 'navigation-request'
  readonly intent: Authentication4NavigationIntent
}

export type Authentication4PendingRequest = Authentication4ContinueRequest | Authentication4SignInRequest

export type Authentication4HostRequest = Authentication4PendingRequest | Authentication4NavigationRequest

export interface Authentication4PreviewStoreState {
  readonly scenarioKey: string
  readonly phase: Authentication4Phase
  readonly email: string
  /** Secret draft held only in this in-memory store; never included in a seed or request. */
  readonly password: string
  readonly passwordVisible: boolean
  readonly invalidEmail: boolean
  readonly pendingRequest: Authentication4PendingRequest | null
  readonly setEmail: (value: string) => void
  readonly setPassword: (value: string) => void
  readonly setPasswordVisible: (visible: boolean) => void
  readonly resetInvalidEmail: () => void
  readonly startContinue: () => Authentication4ContinueRequest | null
  readonly startSignIn: () => Authentication4SignInRequest | null
  readonly back: () => boolean
  readonly completePending: (requestId: string) => boolean
  readonly requestNavigation: (intent: Authentication4NavigationIntent) => Authentication4NavigationRequest
  /** Reusable owner cleanup; the Host owns any permanent active lease or disposal guard. */
  readonly clearOwner: () => void
}

export type Authentication4PreviewStoreApi = StoreApi<Authentication4PreviewStoreState>

const AUTHENTICATION4_OUTCOME: Authentication4Outcome = 'authentication-and-navigation-unverified'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
let nextStoreSequence = 0

function isNavigationIntent(value: string): value is Authentication4NavigationIntent {
  return value === 'magic-link' || value === 'forgot-password' || value === 'create-account'
}

export function createAuthentication4PreviewStore(
  seed: Authentication4PreviewStoreSeed,
): Authentication4PreviewStoreApi {
  const storeId = ++nextStoreSequence
  let requestSequence = 0

  function nextRequestId(): string {
    requestSequence += 1
    return `authentication4:${storeId}:${requestSequence}`
  }

  return createStore<Authentication4PreviewStoreState>((set, get) => ({
    scenarioKey: seed.scenarioKey,
    phase: seed.initialPhase,
    email: seed.email,
    password: '',
    passwordVisible: false,
    invalidEmail: false,
    pendingRequest: null,
    setEmail: (email) => set({ email, invalidEmail: false }),
    setPassword: (password) => set({ password }),
    setPasswordVisible: (passwordVisible) => set({ passwordVisible }),
    resetInvalidEmail: () => set({ invalidEmail: false }),
    startContinue: () => {
      const state = get()
      if (state.phase !== 'email' || state.pendingRequest !== null) return null

      const email = state.email.trim()
      if (!EMAIL_PATTERN.test(email)) {
        set({ invalidEmail: true })
        return null
      }

      const request: Authentication4ContinueRequest = {
        kind: 'continue-request',
        requestId: nextRequestId(),
        scenarioKey: state.scenarioKey,
        email,
        outcome: AUTHENTICATION4_OUTCOME,
      }
      set({ phase: 'email-pending', invalidEmail: false, pendingRequest: request })
      return request
    },
    startSignIn: () => {
      const state = get()
      if (state.phase !== 'password' || state.pendingRequest !== null) return null

      const request: Authentication4SignInRequest = {
        kind: 'sign-in-request',
        requestId: nextRequestId(),
        scenarioKey: state.scenarioKey,
        email: state.email.trim(),
        outcome: AUTHENTICATION4_OUTCOME,
      }
      set({ phase: 'sign-in-pending', pendingRequest: request })
      return request
    },
    back: () => {
      const state = get()
      if (state.phase === 'email') return false
      set({ phase: 'email', invalidEmail: false, pendingRequest: null })
      return true
    },
    completePending: (requestId) => {
      const pendingRequest = get().pendingRequest
      if (pendingRequest === null || pendingRequest.requestId !== requestId) return false

      set({ phase: 'password', pendingRequest: null })
      return true
    },
    requestNavigation: (intent) => {
      if (!isNavigationIntent(intent)) throw new Error('Unsupported authentication navigation intent')
      const state = get()
      return {
        kind: 'navigation-request',
        requestId: nextRequestId(),
        scenarioKey: state.scenarioKey,
        intent,
        outcome: AUTHENTICATION4_OUTCOME,
      }
    },
    clearOwner: () => {
      const state = get()
      const phase =
        state.phase === 'email-pending' ? 'email' : state.phase === 'sign-in-pending' ? 'password' : state.phase
      set({ phase, password: '', passwordVisible: false, invalidEmail: false, pendingRequest: null })
    },
  }))
}
