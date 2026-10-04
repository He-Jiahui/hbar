import { describe, expect, test } from 'bun:test'
import { canContinueLumenProviderFirst } from '@lumen/app-ui'
import {
  AUTHENTICATION2_HOST_CAPACITY_POLICY,
  AUTHENTICATION2_SOURCE_EVIDENCE,
  createAuthentication2PreviewFixture,
} from '../apps/hbar-app-ui-preview/src/authentication2PreviewFixtures'
import { createAuthentication2PreviewStore } from '../apps/hbar-app-ui-preview/src/authentication2PreviewStore'

describe('Authentication 2 host-owned draft model', () => {
  test('starts in email mode with blank drafts and host-projected provider content', () => {
    const fixture = createAuthentication2PreviewFixture()
    const store = createAuthentication2PreviewStore(fixture.seed)
    const content = fixture.contentFor(store.getState())

    expect(store.getState().mode).toBe('email')
    expect(store.getState().email).toBe('')
    expect(store.getState().domain).toBe('')
    expect(canContinueLumenProviderFirst(store.getState().email, false)).toBe(false)
    expect(content.initialProviderId).toBe('email')
    expect(content.socialProviders.map((provider) => provider.id)).toEqual(['google', 'github', 'apple'])
    expect(content.socialProviders.map((provider) => provider.label)).toEqual([
      'Continue with Google',
      'Continue with GitHub',
      'Continue with Apple',
    ])
    expect(content.providerListStrategy).toEqual({ kind: 'content-grown', expectedMaximum: 6 })
    expect(AUTHENTICATION2_SOURCE_EVIDENCE.liveObservation.initialContinueDisabled).toBe(true)
    expect(AUTHENTICATION2_SOURCE_EVIDENCE.liveObservation.acceptance).toContain('sampled-visible-observation-only')
  })

  test('keeps independent email and SSO drafts across mode changes and uses the shared continuation gate', () => {
    const fixture = createAuthentication2PreviewFixture()
    const store = createAuthentication2PreviewStore(fixture.seed)

    store.getState().updateEmail('audit@example.invalid')
    expect(canContinueLumenProviderFirst(store.getState().email, false)).toBe(true)
    expect(store.getState().setMode('sso')).toBe(true)
    expect(store.getState().domain).toBe('')
    expect(canContinueLumenProviderFirst(store.getState().domain, true)).toBe(false)

    store.getState().updateDomain('audit-team')
    expect(canContinueLumenProviderFirst(store.getState().domain, true)).toBe(true)
    expect(fixture.contentFor(store.getState()).initialProviderId).toBe('sso')
    expect(fixture.contentFor(store.getState()).labels.ssoSuffix).toBe('.northwind.app')

    store.getState().setMode('email')
    expect(store.getState().email).toBe('audit@example.invalid')
    expect(store.getState().domain).toBe('audit-team')
    expect(fixture.contentFor(store.getState()).initialProviderId).toBe('email')
    expect(store.getState().setMode('email')).toBe(false)
  })

  test('captures the explicit continuation scope and draft without changing store state', () => {
    const fixture = createAuthentication2PreviewFixture()
    const store = createAuthentication2PreviewStore(fixture.seed)
    const captured = { mode: 'email', providerId: 'email', draft: 'audit@example.invalid' } as const

    store.getState().updateEmail('edited-after-capture@example.invalid')
    store.getState().setMode('sso')

    expect(store.getState().requestContinuation(captured)).toEqual({
      kind: 'continue-request',
      ...captured,
      outcome: 'authentication-and-navigation-unverified',
    })
    expect(store.getState().email).toBe('edited-after-capture@example.invalid')
    expect(store.getState().mode).toBe('sso')
    expect(
      store.getState().requestContinuation({ mode: 'email', providerId: 'sso', draft: 'audit@example.invalid' }),
    ).toBeNull()
    expect(
      store.getState().requestContinuation({ mode: 'email', providerId: 'email', draft: 'not an email' }),
    ).toBeNull()
    expect(store.getState().requestContinuation({ mode: 'sso', providerId: 'sso', draft: '   ' })).toBeNull()
    expect(store.getState().requestContinuation({ mode: 'sso', providerId: 'sso', draft: 'audit-team' })).toEqual({
      kind: 'continue-request',
      mode: 'sso',
      providerId: 'sso',
      draft: 'audit-team',
      outcome: 'authentication-and-navigation-unverified',
    })
    expect(store.getState().email).toBe('edited-after-capture@example.invalid')
    expect(store.getState().domain).toBe('')
  })

  test('filters invalid and duplicate IDs, and keeps provider requests bound to their stable IDs after list mutation', () => {
    const fixture = createAuthentication2PreviewFixture()
    const store = createAuthentication2PreviewStore({
      ...fixture.seed,
      socialProviders: [
        { id: ' google ', icon: 'google' },
        { id: '', icon: 'apple' },
        { id: 'github', icon: 'github' },
        { id: 'github', icon: 'apple' },
        { id: '   ', icon: 'key' },
      ],
    })

    expect(store.getState().socialProviders).toEqual([
      { id: 'google', icon: 'google' },
      { id: 'github', icon: 'github' },
    ])
    expect(store.getState().requestProvider('missing')).toBeNull()

    const capturedProviderId = 'github'
    store.getState().replaceSocialProviders([
      { id: 'apple', icon: 'apple' },
      { id: 'github', icon: 'github' },
    ])
    expect(store.getState().requestProvider(capturedProviderId)).toEqual({
      kind: 'provider-request',
      providerId: 'github',
      outcome: 'authentication-and-navigation-unverified',
    })

    store.getState().replaceSocialProviders([{ id: 'apple', icon: 'apple' }])
    expect(store.getState().requestProvider(capturedProviderId)).toBeNull()
    expect(store.getState().requestProvider('unknown')).toBeNull()
  })

  test('falls back to email mode for stale initial provider IDs', () => {
    const fixture = createAuthentication2PreviewFixture()
    const staleStore = createAuthentication2PreviewStore({ ...fixture.seed, initialProviderId: 'removed-provider' })
    const ssoStore = createAuthentication2PreviewStore({ ...fixture.seed, initialProviderId: 'sso' })
    const duplicateBranchStore = createAuthentication2PreviewStore({
      ...fixture.seed,
      emailProviderId: 'same',
      ssoProviderId: 'same',
      initialProviderId: 'same',
    })

    expect(staleStore.getState().mode).toBe('email')
    expect(ssoStore.getState().mode).toBe('sso')
    expect(duplicateBranchStore.getState().mode).toBe('email')
    expect(
      duplicateBranchStore
        .getState()
        .requestContinuation({ mode: 'email', providerId: 'same', draft: 'audit@example.invalid' }),
    ).toBeNull()
  })

  test('returns only navigation requests and leaves drafts untouched', () => {
    const fixture = createAuthentication2PreviewFixture()
    const store = createAuthentication2PreviewStore(fixture.seed)
    store.getState().updateEmail('audit@example.invalid')
    store.getState().updateDomain('audit-team')

    for (const action of ['create-account', 'terms', 'privacy'] as const) {
      expect(store.getState().requestNavigation(action)).toEqual({
        kind: 'navigation-request',
        action,
        outcome: 'authentication-and-navigation-unverified',
      })
    }
    expect(store.getState().mode).toBe('email')
    expect(store.getState().email).toBe('audit@example.invalid')
    expect(store.getState().domain).toBe('audit-team')
  })

  test('projects empty, one, boundary and overflow provider lists under the host capacity policy', () => {
    const cases = [
      { capacity: 'empty', count: 0, kind: 'content-grown' },
      { capacity: 'one', count: 1, kind: 'content-grown' },
      { capacity: 'boundary', count: 6, kind: 'content-grown' },
      { capacity: 'overflow', count: 17, kind: 'pane-scroll' },
    ] as const

    for (const { capacity, count, kind } of cases) {
      const fixture = createAuthentication2PreviewFixture('en', capacity)
      const state = createAuthentication2PreviewStore(fixture.seed).getState()
      const content = fixture.contentFor(state)
      expect(content.socialProviders).toHaveLength(count)
      expect(content.providerListStrategy).toEqual({ kind, expectedMaximum: 6 })
    }

    expect(AUTHENTICATION2_HOST_CAPACITY_POLICY).toEqual({
      observedSocialProviderCount: 3,
      sourceMaximum: 'not-tested',
      hostExpectedMaximum: 6,
      overflowFixtureCount: 17,
    })
    expect(AUTHENTICATION2_SOURCE_EVIDENCE.historicalCapture).toMatchObject({
      artifact: 'authentication-2-final-v4',
      protocol: 14,
      evidenceCount: 33,
      currentProtocol: 16,
      currentEvidenceCount: 37,
      role: 'historical only; not strict proof',
    })
  })

  test('projects German and deliberately long German copy and provider labels from the locale, not store state', () => {
    const english = createAuthentication2PreviewFixture('en')
    const german = createAuthentication2PreviewFixture('de')
    const longGerman = createAuthentication2PreviewFixture('de-long')
    const state = createAuthentication2PreviewStore(english.seed).getState()
    const englishContent = english.contentFor(state)
    const germanContent = german.contentFor(state)
    const longGermanContent = longGerman.contentFor(state)

    expect(germanContent.labels.title).toBe('Willkommen zurück')
    expect(germanContent.socialProviders[0]?.label).toBe('Mit Google fortfahren')
    expect(longGermanContent.labels.description.length).toBeGreaterThan(englishContent.labels.description.length)
    expect(longGermanContent.labels.terms.length).toBeGreaterThan(germanContent.labels.terms.length)
    expect(longGermanContent.socialProviders[0]?.label.length).toBeGreaterThan(
      germanContent.socialProviders[0]?.label.length ?? 0,
    )
    expect(state.socialProviders).toEqual([
      { id: 'google', icon: 'google' },
      { id: 'github', icon: 'github' },
      { id: 'apple', icon: 'apple' },
    ])
  })
})
