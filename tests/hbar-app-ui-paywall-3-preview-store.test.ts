import { describe, expect, test } from 'bun:test'
import { createPaywall3PreviewFixture } from '../apps/hbar-app-ui-preview/src/paywall3PreviewFixtures'
import { createPaywall3PreviewStore } from '../apps/hbar-app-ui-preview/src/paywall3PreviewStore'

describe('Paywall 3 preview store', () => {
  test('starts yearly and changes the locally projected prices and note for monthly billing', () => {
    const fixture = createPaywall3PreviewFixture()
    const store = createPaywall3PreviewStore(fixture.seed)
    const initial = fixture.contentFor(store.getState())

    expect(initial.period).toBe('yearly')
    expect(initial.periodNote).toBe(initial.labels.yearlyNote)
    expect(initial.plans.find((plan) => plan.id === 'pro')?.prices.yearly.amount).toBe('$19')
    expect(initial.plans.find((plan) => plan.id === 'scale')?.prices.yearly.amount).toBe('$54')

    expect(store.getState().setBillingPeriod('monthly')).toBe(true)
    const monthly = fixture.contentFor(store.getState())
    expect(monthly.period).toBe('monthly')
    expect(monthly.periodNote).toBe(monthly.labels.monthlyNote)
    expect(monthly.plans.find((plan) => plan.id === 'pro')?.prices.monthly.amount).toBe('$24')
    expect(monthly.plans.find((plan) => plan.id === 'scale')?.prices.monthly.amount).toBe('$68')
    expect(store.getState().setBillingPeriod('monthly')).toBe(false)
  })

  test('returns checkout and comparison requests without inventing a result', () => {
    const fixture = createPaywall3PreviewFixture()
    const store = createPaywall3PreviewStore(fixture.seed)
    store.getState().setBillingPeriod('monthly')

    expect(store.getState().requestPlanSelection('pro')).toEqual({
      kind: 'plan-selection-request',
      planId: 'pro',
      billingPeriod: 'monthly',
      resultBoundary: 'checkout-result-unverified',
    })
    expect(store.getState().requestFeatureComparison()).toEqual({
      kind: 'feature-comparison-request',
      resultBoundary: 'comparison-navigation-unverified',
    })
    expect(store.getState().billingPeriod).toBe('monthly')
  })

  test('does not issue selection requests for the current or an unknown plan', () => {
    const store = createPaywall3PreviewStore(createPaywall3PreviewFixture().seed)
    expect(store.getState().requestPlanSelection('starter')).toBeNull()
    expect(store.getState().requestPlanSelection('unknown')).toBeNull()
  })

  test('keeps static, localized, long-copy and capacity projections host-owned', () => {
    const localized = createPaywall3PreviewFixture('de')
    const localizedStore = createPaywall3PreviewStore(localized.seed)
    expect(localized.contentFor(localizedStore.getState()).labels.monthly).toBe('Monatlich')
    expect(localized.contentFor(localizedStore.getState()).plans[2]?.prices.monthly.amount).toBe('68 €')

    const longCopy = createPaywall3PreviewFixture('de-long')
    const longStore = createPaywall3PreviewStore(longCopy.seed)
    expect(longCopy.contentFor(longStore.getState()).labels.description.length).toBeGreaterThan(100)

    for (const [capacity, count, strategy] of [
      ['empty', 0, 'content-grown'],
      ['one', 1, 'content-grown'],
      ['boundary', 6, 'content-grown'],
      ['overflow', 15, 'pane-scroll'],
    ] as const) {
      const fixture = createPaywall3PreviewFixture('en', capacity)
      const state = createPaywall3PreviewStore(fixture.seed).getState()
      const content = fixture.contentFor(state)
      expect(content.plans).toHaveLength(count)
      expect(content.listStrategy.kind).toBe(strategy)
    }
  })
})
