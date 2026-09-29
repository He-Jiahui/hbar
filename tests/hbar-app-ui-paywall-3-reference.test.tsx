import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  LumenPaywall3Reference,
  type LumenPaywall3ReferenceContent,
  type LumenPaywall3ReferenceViewModel,
} from '../hbar-ui/packages/lumen-app-ui/src/paywall-3-reference'
import { Paywall3PreviewHost } from '../apps/hbar-app-ui-preview/src/Paywall3PreviewHost'
import { createPaywall3PreviewFixture } from '../apps/hbar-app-ui-preview/src/paywall3PreviewFixtures'
import { createPaywall3PreviewStore } from '../apps/hbar-app-ui-preview/src/paywall3PreviewStore'
import { getHbarAppUiVariant } from '../packages/hbar-app-ui/src/index'

function referenceModel(
  period: 'monthly' | 'yearly' = 'yearly',
  locale: 'en' | 'de' | 'de-long' = 'en',
  capacity: 'source' | 'empty' | 'one' | 'boundary' | 'overflow' = 'source',
) {
  const fixture = createPaywall3PreviewFixture(locale, capacity)
  const store = createPaywall3PreviewStore(fixture.seed)
  store.getState().setBillingPeriod(period)
  const preview = fixture.contentFor(store.getState())
  const content: LumenPaywall3ReferenceContent = {
    labels: {
      title: preview.labels.title,
      description: preview.labels.description,
      billingPeriod: preview.labels.billingPeriod,
      monthly: preview.labels.monthly,
      yearly: preview.labels.yearly,
      compare: preview.labels.compare,
      priceNote: preview.labels.priceNote,
      emptyPlans: preview.labels.emptyPlans,
    },
    period: preview.period,
    periodNote: preview.periodNote,
    plans: preview.plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      amount: plan.prices[period].amount,
      priceSuffix: plan.prices[period].suffix,
      features: plan.features,
      isCurrent: plan.isCurrent,
      badge:
        plan.badge === 'current'
          ? preview.labels.currentBadge
          : plan.badge === 'recommended'
            ? preview.labels.recommended
            : null,
      actionLabel: plan.actionLabel,
      canRequestSelection: plan.canRequestSelection,
    })),
    listStrategy: preview.listStrategy,
  }
  const viewModel: LumenPaywall3ReferenceViewModel = {
    content,
    onPeriodChange: () => undefined,
    onPlanSelectionRequest: () => undefined,
    onFeatureComparisonRequest: () => undefined,
  }
  return viewModel
}

function render(viewModel = referenceModel()) {
  return renderToStaticMarkup(
    createElement(LumenPaywall3Reference, {
      variantId: 'hbar-app-ui-paywall-3',
      viewModel,
    }),
  )
}

describe('Paywall 3 source reference', () => {
  test('renders title, billing tabs, three plan cards and footer in reading order', () => {
    const html = render()
    expect(html).toContain('data-hbar-app-ui-component="hbar-app-ui-paywall-3"')
    expect(html).toContain('<h2')
    expect(html).toContain('Choose a plan to continue')
    expect(html).toContain('role="tablist" aria-label="Billing period"')
    expect(html).toContain('role="tab" aria-selected="true" tabindex="0" data-paywall3-period="yearly"')
    expect(html).toContain('role="tab" aria-selected="false" tabindex="0" data-paywall3-period="monthly"')
    expect(html.match(/data-paywall3-plan-id=/g)).toHaveLength(3)
    expect(html).toContain('data-paywall3-plan-id="starter"')
    expect(html).toContain('data-paywall3-plan-id="pro"')
    expect(html).toContain('data-paywall3-plan-id="scale"')
    expect(html).toContain('$19')
    expect(html).toContain('$54')
    expect(html).toContain('data-paywall3-compare')
    expect(html.indexOf('Choose a plan to continue')).toBeLessThan(html.indexOf('Yearly billing saves 20 percent'))
    expect(html.indexOf('Yearly billing saves 20 percent')).toBeLessThan(
      html.indexOf('data-paywall3-plan-id="starter"'),
    )
    expect(html.indexOf('Starter')).toBeLessThan(html.indexOf('Current'))
    expect(html.indexOf('Current')).toBeLessThan(html.indexOf('$0'))
    expect(html.indexOf('$0')).toBeLessThan(html.indexOf('For a single project'))
    expect(html).toContain('Your current plan')
    expect(html).toContain('Choose Pro')
    expect(html).toContain('Choose Scale')
    expect(html).not.toContain('lumen-paywall3-period-label')
    expect(html).toContain('data-badge-kind="current"')
    expect(html).toContain('data-badge-kind="recommended"')
    const proPlanIndex = html.indexOf('data-paywall3-plan-id="pro"')
    expect(html.indexOf('Pro', proPlanIndex)).toBeLessThan(html.indexOf('Recommended', proPlanIndex))
    expect(html.indexOf('Recommended', proPlanIndex)).toBeLessThan(html.indexOf('$19', proPlanIndex))
    expect(html.indexOf('$19', proPlanIndex)).toBeLessThan(html.indexOf('For teams that need exports', proPlanIndex))
    expect(html.indexOf('For teams that need exports', proPlanIndex)).toBeLessThan(
      html.indexOf('Unlimited workspaces', proPlanIndex),
    )
    expect(html.indexOf('Role-based access', proPlanIndex)).toBeLessThan(html.indexOf('Choose Pro', proPlanIndex))
    expect(html.indexOf('data-paywall3-plan-id="scale"')).toBeLessThan(html.indexOf('Prices in USD'))
  })

  test('projects the live-observed monthly prices and note without faking selection outcomes', () => {
    const html = render(referenceModel('monthly'))
    expect(html).toContain('role="tab" aria-selected="true" tabindex="0" data-paywall3-period="monthly"')
    expect(html).toContain('Monthly billing, cancel before the next renewal.')
    expect(html).toContain('$24')
    expect(html).toContain('$68')
    expect(html).not.toContain('$54')
  })

  test('marks current plan action disabled and renders source checks as decorative icons', () => {
    const html = render()
    expect(html).toContain('data-paywall3-plan-action="starter"')
    expect(html).toContain('disabled=""')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('lumen-paywall3-feature-check')
  })

  test('preserves localized long copy and renders empty, boundary and scroll-list cases', () => {
    expect(render(referenceModel('yearly', 'de'))).toContain('Wähle einen Plan, um fortzufahren')
    expect(render(referenceModel('yearly', 'de-long'))).toContain('sämtliche Arbeitsbereiche deines Teams')

    const empty = render(referenceModel('yearly', 'en', 'empty'))
    expect(empty).toContain('No plans are available.')
    expect(empty).not.toContain('data-paywall3-plan-id=')
    expect(render(referenceModel('yearly', 'en', 'one')).match(/data-paywall3-plan-id=/g)).toHaveLength(1)
    expect(render(referenceModel('yearly', 'en', 'boundary')).match(/data-paywall3-plan-id=/g)).toHaveLength(6)

    const overflow = render(referenceModel('yearly', 'en', 'overflow'))
    expect(overflow.match(/data-paywall3-plan-id=/g)).toHaveLength(15)
    expect(overflow).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(overflow).toContain('role="region"')
    expect(overflow).toContain('Additional plan 12')
  })

  test('host swaps only Paywall 3 and leaves other variants to the existing child', () => {
    const paywall3 = getHbarAppUiVariant('paywall', 3)
    const children = createElement('output', null, 'existing child')
    const rendered = renderToStaticMarkup(
      createElement(Paywall3PreviewHost, {
        spec: paywall3.spec,
        referenceFixture: createPaywall3PreviewFixture(),
        children,
      }),
    )
    expect(rendered).toContain('data-hbar-app-ui-component="hbar-app-ui-paywall-3"')
    expect(rendered).toContain(`hbar-app-ui-density-${paywall3.spec.density}`)
    expect(rendered).toContain(`hbar-app-ui-surface-${paywall3.spec.profile.surface}`)
    expect(rendered).not.toContain('existing child')

    const other = getHbarAppUiVariant('paywall', 2)
    const fallback = renderToStaticMarkup(
      createElement(Paywall3PreviewHost, {
        spec: other.spec,
        referenceFixture: createPaywall3PreviewFixture(),
        children,
      }),
    )
    expect(fallback).toContain('existing child')
    expect(fallback).not.toContain('data-hbar-app-ui-component="hbar-app-ui-paywall-3"')
  })
})
