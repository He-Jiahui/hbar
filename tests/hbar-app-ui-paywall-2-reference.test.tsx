import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiPaywallProvider,
  type HbarAppUiPaywallContent,
} from '../packages/hbar-app-ui/src/index'
import {
  createHbarAppUiPaywallLocalizedFixtures,
  createHbarAppUiPaywallOverflowFixtures,
  HBAR_APP_UI_PAYWALL_FIXTURES,
} from './fixtures/hbar-app-ui-paywall-fixtures'

function renderFeatureGate(content: HbarAppUiPaywallContent): string {
  const FeatureGate = getHbarAppUiVariant('paywall', 2).component
  return renderToStaticMarkup(
    createElement(HbarAppUiPaywallProvider, {
      content,
      children: createElement(FeatureGate, {}),
    }),
  )
}

describe('Paywall 2 reference feature gate', () => {
  test('keeps the dialog header, three features, price and independent requests in source reading order', () => {
    const html = renderFeatureGate(HBAR_APP_UI_PAYWALL_FIXTURES)

    expect(html).toContain('data-hbar-app-ui-component="hbar-app-ui-paywall-2"')
    expect(html).toContain(
      '<div class="hbar-app-ui-paywall-feature-gate hbar-app-ui-paywall-feature-card" role="dialog"',
    )
    expect(html).toContain('aria-label="Scheduled exports are a Pro feature"')
    expect(html).toContain('<h2')
    expect(html).toContain('Your workspace is on Starter. Upgrading applies immediately and is prorated.')
    expect(html.match(/data-paywall2-feature-id=/g)).toHaveLength(3)
    expect(html).toContain('data-paywall2-feature-id="scheduled-exports"')
    expect(html).toContain('data-paywall2-feature-id="unlimited-history"')
    expect(html).toContain('data-paywall2-feature-id="shared-workspaces"')
    expect(html).toContain('<strong>$24</strong>')
    expect(html).toContain('<span>per seat, per month</span>')
    expect(html).toContain('data-paywall2-action="dismiss"')
    expect(html).toContain('data-paywall2-action="defer"')
    expect(html).toContain('data-paywall2-action="upgrade"')
    expect(html.indexOf('Scheduled exports are a Pro feature')).toBeLessThan(html.indexOf('Scheduled exports</p>'))
    expect(html.indexOf('Shared workspaces')).toBeLessThan(html.indexOf('<strong>$24</strong>'))
    expect(html.indexOf('<strong>$24</strong>')).toBeLessThan(html.indexOf('Not now'))
    expect(html.indexOf('Not now')).toBeLessThan(html.indexOf('Upgrade workspace'))
  })

  test('localizes all visible gate copy and feature data', () => {
    const html = renderFeatureGate(createHbarAppUiPaywallLocalizedFixtures())

    expect(html).toContain('Geplante Exporte sind eine Pro-Funktion')
    expect(html).toContain('Geplante Exporte')
    expect(html).toContain('Unbegrenzter Verlauf')
    expect(html).toContain('Geteilte Arbeitsbereiche')
    expect(html).toContain('24 $')
    expect(html).toContain('pro Sitzplatz und Monat')
    expect(html).toContain('Schließen')
    expect(html).toContain('Später')
    expect(html).toContain('Arbeitsbereich upgraden')
    expect(html).not.toContain('Scheduled exports are a Pro feature')
    expect(html).not.toContain('Unlimited history')
  })

  test('keeps host-provided long titles and feature descriptions intact', () => {
    const base = HBAR_APP_UI_PAYWALL_FIXTURES.featureGate
    if (!base) throw new Error('The preview fixture must include Paywall 2 content.')
    const longTitle = 'Scheduled exports for every workspace with policy-aware delivery controls'
    const longDescription =
      'Send a saved view to a configured destination on a schedule, while preserving the workspace access policy and its retention requirements.'
    const html = renderFeatureGate({
      ...HBAR_APP_UI_PAYWALL_FIXTURES,
      featureGate: {
        ...base,
        labels: { ...base.labels, title: longTitle },
        features: [{ id: 'long-copy', title: longTitle, description: longDescription }],
      },
    })

    expect(html).toContain(longTitle)
    expect(html).toContain(longDescription)
  })

  test('preserves the content-grown boundary, scrolls over-capacity features and renders a typed empty state', () => {
    const source = HBAR_APP_UI_PAYWALL_FIXTURES.featureGate
    if (!source) throw new Error('The preview fixture must include Paywall 2 content.')

    const oneFeature: HbarAppUiPaywallContent = {
      ...HBAR_APP_UI_PAYWALL_FIXTURES,
      featureGate: {
        ...source,
        features: source.features.slice(0, 1),
        listStrategy: { kind: 'content-grown', expectedMaximum: 8 },
      },
    }
    const oneHtml = renderFeatureGate(oneFeature)
    expect(oneHtml.match(/data-paywall2-feature-id=/g)).toHaveLength(1)
    expect(oneHtml).toContain('data-hbar-app-ui-list-strategy="content-grown"')

    const boundary: HbarAppUiPaywallContent = {
      ...HBAR_APP_UI_PAYWALL_FIXTURES,
      featureGate: {
        ...source,
        features: Array.from({ length: 8 }, (_, index) => ({
          id: `boundary-${index}`,
          title: `Boundary feature ${index + 1}`,
          description: 'A host-supplied included capability.',
        })),
      },
    }
    const boundaryHtml = renderFeatureGate(boundary)
    expect(boundaryHtml.match(/data-paywall2-feature-id=/g)).toHaveLength(8)
    expect(boundaryHtml).toContain('data-hbar-app-ui-list-strategy="content-grown"')

    const overflow = createHbarAppUiPaywallOverflowFixtures()
    const overflowHtml = renderFeatureGate(overflow)
    expect(overflow.featureGate?.features).toHaveLength(17)
    expect(overflowHtml.match(/data-paywall2-feature-id=/g)).toHaveLength(17)
    expect(overflowHtml).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(overflowHtml).toContain('tabindex="0"')
    expect(overflowHtml).toContain('Additional feature 14')

    const empty: HbarAppUiPaywallContent = {
      ...HBAR_APP_UI_PAYWALL_FIXTURES,
      featureGate: { ...source, features: [] },
    }
    const emptyHtml = renderFeatureGate(empty)
    expect(emptyHtml).not.toContain('data-paywall2-feature-id=')
    expect(emptyHtml).toContain('No Pro features are available.')
  })
})
