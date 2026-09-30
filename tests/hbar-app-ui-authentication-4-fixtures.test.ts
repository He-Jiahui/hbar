import { describe, expect, test } from 'bun:test'
import { createAuthentication4PreviewFixture } from '../apps/hbar-app-ui-preview/src/authentication4PreviewFixtures'
import { startAuthentication4PendingTimer } from '../apps/hbar-app-ui-preview/src/authentication4PreviewResources'

describe('Authentication 4 host fixtures and pending resource', () => {
  test('changes copy without replacing the draft owner and projects account data from the email', () => {
    const english = createAuthentication4PreviewFixture()
    const german = createAuthentication4PreviewFixture('de')
    const long = createAuthentication4PreviewFixture('de-long')
    expect(german.seed).toEqual(english.seed)
    expect(long.seed).toEqual(english.seed)
    expect(german.content.labels.emailLabel).toBe('Geschäftliche E-Mail-Adresse')
    expect(long.content.labels.magicLink.length).toBeGreaterThan(german.content.labels.magicLink.length)
    expect(english.accountFor(' DANA.WHITFIELD@NORTHWIND.COM ')).toEqual(english.content.account)
    expect(english.accountFor('audit@example.invalid')).toEqual({
      initials: 'AU',
      name: 'audit@example.invalid',
      organization: 'New to Northwind',
    })
    expect(german.accountFor('audit@example.invalid').organization).toBe('Neu bei Northwind')
    expect(long.accountFor(long.seed.email).name.length).toBeGreaterThan(english.content.account.name.length)
    expect(createAuthentication4PreviewFixture('en', 'password').seed.initialPhase).toBe('password')
    const invalid = createAuthentication4PreviewFixture('en', 'invalid')
    expect(invalid.seed.initialPhase).toBe('email')
    expect(invalid.seed.email).toBe('invalid')
  })

  test('completes a finite local resource once and accepts repeated cleanup', async () => {
    let completed = 0
    const dispose = startAuthentication4PendingTimer(() => {
      completed += 1
    }, 0)
    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 10))
      expect(completed).toBe(1)
      dispose()
      dispose()
      expect(completed).toBe(1)
    } finally {
      dispose()
    }
  })

  test('cancels pending work and refuses invalid or overflowing timer delays', async () => {
    let completed = 0
    const cancelled = startAuthentication4PendingTimer(() => {
      completed += 1
    }, 0)
    cancelled()
    cancelled()
    for (const delay of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 2_147_483_648]) {
      startAuthentication4PendingTimer(() => {
        completed += 1
      }, delay)()
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 10))
    expect(completed).toBe(0)
  })
})
