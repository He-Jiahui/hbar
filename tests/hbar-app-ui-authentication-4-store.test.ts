import { describe, expect, test } from 'bun:test'
import {
  createAuthentication4PreviewStore,
  type Authentication4PreviewStoreSeed,
} from '../apps/hbar-app-ui-preview/src/authentication4PreviewStore'

const seed: Authentication4PreviewStoreSeed = {
  scenarioKey: 'source',
  email: 'mina@example.invalid',
  initialPhase: 'email',
}

describe('Authentication 4 preview store', () => {
  test('initializes the host-owned scenario and starts with an empty hidden password draft', () => {
    const store = createAuthentication4PreviewStore(seed)

    expect(store.getState().scenarioKey).toBe(seed.scenarioKey)
    expect(store.getState().phase).toBe('email')
    expect(store.getState().email).toBe(seed.email)
    expect(store.getState().password).toBe('')
    expect(store.getState().passwordVisible).toBe(false)
    expect(store.getState().pendingRequest).toBeNull()
    expect(Object.keys(seed)).not.toContain('password')

    const passwordStep = createAuthentication4PreviewStore({ ...seed, initialPhase: 'password' })
    expect(passwordStep.getState().phase).toBe('password')
  })

  test('validates trimmed email locally and emits one explicit continue ticket only when valid', () => {
    const store = createAuthentication4PreviewStore(seed)
    store.getState().setEmail(' not-an-email ')

    expect(store.getState().startContinue()).toBeNull()
    expect(store.getState().phase).toBe('email')
    expect(store.getState().invalidEmail).toBe(true)
    expect(store.getState().pendingRequest).toBeNull()

    store.getState().resetInvalidEmail()
    expect(store.getState().invalidEmail).toBe(false)
    expect(store.getState().startContinue()).toBeNull()
    expect(store.getState().invalidEmail).toBe(true)
    store.getState().setEmail('  mina@example.invalid  ')
    expect(store.getState().invalidEmail).toBe(false)

    const request = store.getState().startContinue()
    expect(request).toMatchObject({
      kind: 'continue-request',
      scenarioKey: 'source',
      email: 'mina@example.invalid',
      outcome: 'authentication-and-navigation-unverified',
    })
    expect(request?.requestId).toMatch(/^authentication4:\d+:\d+$/)
    expect(store.getState().phase).toBe('email-pending')
    expect(store.getState().pendingRequest).toEqual(request)
    expect(store.getState().startContinue()).toBeNull()
  })

  test('completes only the current continue ticket and never accepts another store or replayed ticket', () => {
    const firstStore = createAuthentication4PreviewStore(seed)
    const secondStore = createAuthentication4PreviewStore(seed)
    const firstTicket = firstStore.getState().startContinue()
    const secondTicket = secondStore.getState().startContinue()

    expect(firstTicket).not.toBeNull()
    expect(secondTicket).not.toBeNull()
    expect(firstTicket?.requestId).not.toBe(secondTicket?.requestId)
    expect(secondStore.getState().completePending(firstTicket?.requestId ?? '')).toBe(false)
    expect(firstStore.getState().completePending('expired-ticket')).toBe(false)
    expect(firstStore.getState().phase).toBe('email-pending')

    expect(firstStore.getState().completePending(firstTicket?.requestId ?? '')).toBe(true)
    expect(firstStore.getState().phase).toBe('password')
    expect(firstStore.getState().pendingRequest).toBeNull()
    expect(firstStore.getState().completePending(firstTicket?.requestId ?? '')).toBe(false)
    expect(secondStore.getState().phase).toBe('email-pending')
    expect(secondStore.getState().pendingRequest).toEqual(secondTicket)
  })

  test('allows sign-in without inventing password constraints and excludes the secret from the request', () => {
    const store = createAuthentication4PreviewStore({ ...seed, initialPhase: 'password' })
    const password = 'sensitive-draft'
    store.getState().setPassword(password)
    store.getState().setPasswordVisible(true)

    const request = store.getState().startSignIn()
    expect(request).toMatchObject({
      kind: 'sign-in-request',
      email: 'mina@example.invalid',
      outcome: 'authentication-and-navigation-unverified',
    })
    expect(request && Object.hasOwn(request, 'password')).toBe(false)
    expect(JSON.stringify(request)).not.toContain(password)
    expect(store.getState().password).toBe(password)
    expect(store.getState().passwordVisible).toBe(true)
    expect(store.getState().phase).toBe('sign-in-pending')
    expect(store.getState().startSignIn()).toBeNull()

    const emptyPasswordStore = createAuthentication4PreviewStore({ ...seed, initialPhase: 'password' })
    expect(emptyPasswordStore.getState().startSignIn()).not.toBeNull()
  })

  test('back cancels either pending phase while preserving both independent drafts', () => {
    const continueStore = createAuthentication4PreviewStore(seed)
    const continueTicket = continueStore.getState().startContinue()
    continueStore.getState().setPassword('continue-secret')

    expect(continueStore.getState().back()).toBe(true)
    expect(continueStore.getState().phase).toBe('email')
    expect(continueStore.getState().email).toBe(seed.email)
    expect(continueStore.getState().password).toBe('continue-secret')
    expect(continueStore.getState().pendingRequest).toBeNull()
    expect(continueStore.getState().completePending(continueTicket?.requestId ?? '')).toBe(false)
    expect(continueStore.getState().back()).toBe(false)

    const signInStore = createAuthentication4PreviewStore({ ...seed, initialPhase: 'password' })
    signInStore.getState().setEmail('other@example.invalid')
    signInStore.getState().setPassword('sign-in-secret')
    const signInTicket = signInStore.getState().startSignIn()

    expect(signInStore.getState().back()).toBe(true)
    expect(signInStore.getState().phase).toBe('email')
    expect(signInStore.getState().email).toBe('other@example.invalid')
    expect(signInStore.getState().password).toBe('sign-in-secret')
    expect(signInStore.getState().completePending(signInTicket?.requestId ?? '')).toBe(false)
  })

  test('rejects submissions from the wrong step and ends sign-in waiting without claiming authentication', () => {
    const store = createAuthentication4PreviewStore(seed)
    expect(store.getState().startSignIn()).toBeNull()
    expect(store.getState().pendingRequest).toBeNull()
    const continueTicket = store.getState().startContinue()
    expect(store.getState().startSignIn()).toBeNull()
    expect(store.getState().completePending(continueTicket?.requestId ?? '')).toBe(true)
    expect(store.getState().startContinue()).toBeNull()

    const signInTicket = store.getState().startSignIn()
    expect(store.getState().startContinue()).toBeNull()
    expect(store.getState().completePending(signInTicket?.requestId ?? '')).toBe(true)
    expect(store.getState().phase).toBe('password')
    expect(store.getState().pendingRequest).toBeNull()
    expect(store.getState().completePending(signInTicket?.requestId ?? '')).toBe(false)
    expect(signInTicket?.outcome).toBe('authentication-and-navigation-unverified')
  })

  test('clearOwner cancels current work, clears secrets and reveal state, and remains reusable', () => {
    const store = createAuthentication4PreviewStore({ ...seed, initialPhase: 'password' })
    const password = 'clear-me'
    store.getState().setPassword(password)
    store.getState().setPasswordVisible(true)
    const firstTicket = store.getState().startSignIn()

    store.getState().clearOwner()
    expect(store.getState().phase).toBe('password')
    expect(store.getState().email).toBe(seed.email)
    expect(store.getState().password).toBe('')
    expect(store.getState().passwordVisible).toBe(false)
    expect(store.getState().pendingRequest).toBeNull()
    expect(store.getState().completePending(firstTicket?.requestId ?? '')).toBe(false)

    const nextTicket = store.getState().startSignIn()
    expect(nextTicket).not.toBeNull()
    expect(nextTicket?.requestId).not.toBe(firstTicket?.requestId)
    expect(store.getState().completePending(firstTicket?.requestId ?? '')).toBe(false)

    const emailStore = createAuthentication4PreviewStore(seed)
    const continueTicket = emailStore.getState().startContinue()
    emailStore.getState().setPassword('also-clear-this')
    emailStore.getState().clearOwner()
    emailStore.getState().clearOwner()
    expect(emailStore.getState().phase).toBe('email')
    expect(emailStore.getState().password).toBe('')
    expect(emailStore.getState().completePending(continueTicket?.requestId ?? '')).toBe(false)
  })

  test('issues typed navigation intents with isolated IDs and unverified outcomes only', () => {
    const firstStore = createAuthentication4PreviewStore(seed)
    const secondStore = createAuthentication4PreviewStore(seed)
    const password = 'never-notify-this'
    firstStore.getState().setPassword(password)

    const intents = ['magic-link', 'forgot-password', 'create-account'] as const
    const requests = intents.map((intent) => firstStore.getState().requestNavigation(intent))
    const secondRequest = secondStore.getState().requestNavigation('magic-link')

    expect(requests.map((request) => request.intent)).toEqual([...intents])
    expect(new Set(requests.map((request) => request.requestId)).size).toBe(intents.length)
    expect(requests.every((request) => request.outcome === 'authentication-and-navigation-unverified')).toBe(true)
    expect(requests.every((request) => !JSON.stringify(request).includes(password))).toBe(true)
    expect(secondRequest.requestId).not.toBe(requests[0]?.requestId)
    expect(firstStore.getState().phase).toBe('email')
    expect(firstStore.getState().password).toBe(password)
  })
})
