import { describe, expect, test } from 'bun:test'
import {
  AUTHENTICATION3_HOST_CAPACITY_POLICY,
  AUTHENTICATION3_SOURCE_EVIDENCE,
  createAuthentication3PreviewFixture,
  type Authentication3PreviewCapacity,
} from '../apps/hbar-app-ui-preview/src/authentication3PreviewFixtures'
import {
  createAuthentication3PreviewStore,
  startAuthentication3QuoteInterval,
} from '../apps/hbar-app-ui-preview/src/authentication3PreviewStore'

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

describe('Authentication 3 preview store', () => {
  test('starts with an email draft, blank in-memory password, and a valid stable quote ID', () => {
    const fixture = createAuthentication3PreviewFixture()
    const store = createAuthentication3PreviewStore(fixture.seed)

    expect(store.getState().email).toBe(fixture.seed.email)
    expect(store.getState().password).toBe('')
    expect(store.getState().passwordVisible).toBe(false)
    expect(store.getState().quoteId).toBe('mina')
    expect(store.getState().quoteIds).toEqual(['mina', 'daniel', 'rachel'])
    expect(Object.keys(fixture.seed)).not.toContain('password')
    expect(AUTHENTICATION3_SOURCE_EVIDENCE.historicalCache.role).toContain('not current source')
  })

  test('normalizes blank and duplicate IDs and immediately reconciles missing quote selection', () => {
    const fixture = createAuthentication3PreviewFixture()
    const store = createAuthentication3PreviewStore({
      ...fixture.seed,
      initialQuoteId: ' stale ',
      quoteIds: ['', 'mina', ' mina ', ' daniel ', '   ', 'rachel'],
    })

    expect(store.getState().quoteIds).toEqual(['mina', 'daniel', 'rachel'])
    expect(store.getState().quoteId).toBe('mina')
    expect(store.getState().selectQuote(' daniel ')).toBe(true)
    expect(store.getState().quoteId).toBe('daniel')
    expect(store.getState().selectQuote('missing')).toBe(false)
    expect(store.getState().quoteId).toBe('daniel')

    expect(store.getState().replaceQuoteIds(['new-story', 'new-story', '  ', 'later-story'])).toBe(true)
    expect(store.getState().quoteIds).toEqual(['new-story', 'later-story'])
    expect(store.getState().quoteId).toBe('new-story')
    expect(store.getState().replaceQuoteIds([])).toBe(true)
    expect(store.getState().quoteId).toBeNull()
    expect(store.getState().advanceQuote()).toBeNull()
  })

  test('does not revive an old selected quote after the list becomes empty and later returns', () => {
    const fixture = createAuthentication3PreviewFixture()
    const store = createAuthentication3PreviewStore(fixture.seed)

    expect(store.getState().selectQuote('daniel')).toBe(true)
    expect(store.getState().replaceQuoteIds([])).toBe(true)
    expect(store.getState().quoteId).toBeNull()
    expect(store.getState().replaceQuoteIds(['mina', 'daniel'])).toBe(true)
    expect(store.getState().quoteId).toBe('mina')
  })

  test('keeps manual and automatic carousel movement bound to valid quote IDs', () => {
    const fixture = createAuthentication3PreviewFixture()
    const store = createAuthentication3PreviewStore(fixture.seed)

    expect(store.getState().advanceQuote()).toBe('daniel')
    expect(store.getState().advanceQuote(-1)).toBe('mina')
    expect(store.getState().advanceQuote(-1)).toBe('rachel')
    expect(store.getState().replaceQuoteIds(['only-story'])).toBe(true)
    expect(store.getState().quoteId).toBe('only-story')
    expect(store.getState().advanceQuote()).toBe('only-story')
  })

  test('starts the host timer only for a finite multi-quote interval and disposes it cleanly', async () => {
    let advances = 0
    const dispose = startAuthentication3QuoteInterval(() => advances++, 2, 8)
    await delay(28)
    dispose()
    const disposedAt = advances
    await delay(24)

    expect(disposedAt).toBeGreaterThan(0)
    expect(advances).toBe(disposedAt)

    let invalidIntervalAdvances = 0
    const emptyDisposer = startAuthentication3QuoteInterval(() => invalidIntervalAdvances++, 1, 8)
    const nonFiniteDisposer = startAuthentication3QuoteInterval(
      () => invalidIntervalAdvances++,
      2,
      Number.POSITIVE_INFINITY,
    )
    const oversizedDisposer = startAuthentication3QuoteInterval(() => invalidIntervalAdvances++, 2, 2_147_483_648)
    const invalidCountDisposer = startAuthentication3QuoteInterval(
      () => invalidIntervalAdvances++,
      Number.POSITIVE_INFINITY,
      8,
    )
    await delay(20)
    emptyDisposer()
    nonFiniteDisposer()
    oversizedDisposer()
    invalidCountDisposer()
    expect(invalidIntervalAdvances).toBe(0)
  })

  test('emits only request data, rejects stale provider or quote IDs, and never simulates authentication success', () => {
    const fixture = createAuthentication3PreviewFixture()
    const store = createAuthentication3PreviewStore(fixture.seed)
    const password = 'NeverLogThis-9!'
    store.getState().updateEmail('audit@example.invalid')
    store.getState().updatePassword(password)
    store.getState().setPasswordVisible(true)
    store.getState().selectQuote('daniel')

    const signInRequest = store.getState().requestSignIn({ email: store.getState().email, quoteId: 'daniel' })
    expect(signInRequest).toEqual({
      kind: 'sign-in-request',
      email: 'audit@example.invalid',
      quoteId: 'daniel',
      outcome: 'authentication-and-navigation-unverified',
    })
    expect(JSON.stringify(signInRequest)).not.toContain(password)
    expect(signInRequest && Object.hasOwn(signInRequest, 'password')).toBe(false)
    expect(store.getState().password).toBe(password)
    expect(store.getState().passwordVisible).toBe(true)
    expect(store.getState().requestSignIn({ email: 'old@example.invalid', quoteId: 'daniel' })).toBeNull()
    expect(store.getState().requestSignIn({ email: 'audit@example.invalid', quoteId: 'mina' })).toBeNull()

    expect(store.getState().requestProvider('github')).toEqual({
      kind: 'provider-request',
      providerId: 'github',
      outcome: 'authentication-and-navigation-unverified',
    })
    expect(store.getState().requestNavigation('forgot-password')).toEqual({
      kind: 'navigation-request',
      action: 'forgot-password',
      outcome: 'authentication-and-navigation-unverified',
    })
    expect(store.getState().requestNavigation('create-account')).toMatchObject({
      kind: 'navigation-request',
      action: 'create-account',
    })

    store.getState().replaceQuoteIds(['mina'])
    store.getState().replaceProviderIds(['apple'])
    expect(store.getState().requestSignIn({ email: 'audit@example.invalid', quoteId: 'daniel' })).toBeNull()
    expect(store.getState().requestProvider('github')).toBeNull()
    expect(store.getState().requestProvider('unknown')).toBeNull()
    expect(store.getState().password).toBe(password)
  })

  test('does not revive a removed quote selection when the old ID later reappears', () => {
    const fixture = createAuthentication3PreviewFixture()
    const store = createAuthentication3PreviewStore(fixture.seed)

    store.getState().selectQuote('daniel')
    store.getState().replaceQuoteIds([])
    expect(store.getState().quoteId).toBeNull()
    store.getState().replaceQuoteIds(['mina', 'daniel'])
    expect(store.getState().quoteId).toBe('mina')
  })

  test('allows a safe request in the empty-quote state without inventing an active quote', () => {
    const fixture = createAuthentication3PreviewFixture('en', 'empty')
    const store = createAuthentication3PreviewStore(fixture.seed)

    expect(store.getState().quoteId).toBeNull()
    expect(store.getState().requestSignIn({ email: store.getState().email, quoteId: null })).toEqual({
      kind: 'sign-in-request',
      email: store.getState().email,
      quoteId: null,
      outcome: 'authentication-and-navigation-unverified',
    })
  })

  test('keeps localized copy out of the reset key and retains bounded and overflow host content', () => {
    const english = createAuthentication3PreviewFixture('en', 'source')
    const german = createAuthentication3PreviewFixture('de', 'source')
    const longGerman = createAuthentication3PreviewFixture('de-long', 'source')

    expect(german.content.labels.title).toBe('Anmelden')
    expect(german.content.providers[0]?.label).toBe('Google')
    expect(longGerman.content.labels.description.length).toBeGreaterThan(english.content.labels.description.length)
    expect(longGerman.content.providers[0]?.label.length).toBeGreaterThan(
      german.content.providers[0]?.label.length ?? 0,
    )
    expect(german.seed).toEqual(english.seed)
    expect(longGerman.seed).toEqual(english.seed)

    const cases: readonly [Authentication3PreviewCapacity, number, number][] = [
      ['empty', 0, 0],
      ['one', 1, 1],
      ['source', 3, 3],
      ['boundary', 6, 6],
      ['overflow', 17, 17],
    ]
    for (const [capacity, providerCount, quoteCount] of cases) {
      const fixture = createAuthentication3PreviewFixture('en', capacity)
      expect(fixture.content.providers).toHaveLength(providerCount)
      expect(fixture.content.quotes).toHaveLength(quoteCount)
      expect(fixture.content.quotes[0]?.metrics.length ?? 0).toBe(capacity === 'empty' ? 0 : 3)
      expect(fixture.content.providerListStrategy.expectedMaximum).toBe(6)
      expect(fixture.content.providerListStrategy.kind).toBe('content-grown')
      expect(fixture.content.quoteListStrategy).toEqual({ kind: 'content-grown', expectedMaximum: 6 })
      expect(fixture.seed.quoteIds).toEqual(fixture.content.quotes.map((quote) => quote.id))
      expect(fixture.seed.providerIds).toEqual(fixture.content.providers.map((provider) => provider.id))
    }
    const metricOverflow = createAuthentication3PreviewFixture('en', 'source', 'overflow')
    expect(metricOverflow.content.providers).toHaveLength(3)
    expect(metricOverflow.content.quotes).toHaveLength(3)
    expect(metricOverflow.content.quotes[0]?.metrics).toHaveLength(
      AUTHENTICATION3_HOST_CAPACITY_POLICY.metricOverflowFixtureCount,
    )
    expect(metricOverflow.seed.scenarioKey).not.toBe(english.seed.scenarioKey)
    expect(createAuthentication3PreviewFixture('en', 'overflow').content.quotes.at(-1)?.id).toBe('host-story-17')
    expect(createAuthentication3PreviewFixture('en', 'overflow').content.providers.at(-1)?.id).toBe('host-provider-17')
    expect(AUTHENTICATION3_HOST_CAPACITY_POLICY.sourceMaximum).toBe('not-tested')
  })
})
