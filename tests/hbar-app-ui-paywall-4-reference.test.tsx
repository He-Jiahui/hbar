import { describe, expect, test } from 'bun:test'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenPaywall04, LumenPaywallProvider, useLumenPaywallContent } from '@lumen/app-ui/catalog'
import { getHbarAppUiVariant } from '../packages/hbar-app-ui/src/index'
import { Paywall4PreviewHost } from '../apps/hbar-app-ui-preview/src/Paywall4PreviewHost'
import { createPaywall4PreviewFixture, type Paywall4PreviewCapacity, type Paywall4PreviewLocale } from '../apps/hbar-app-ui-preview/src/paywall4PreviewFixtures'
import { HBAR_APP_UI_PAYWALL_FIXTURES } from './fixtures/hbar-app-ui-paywall-fixtures'

function ParentContentProbe() {
  const content = useLumenPaywallContent()
  return createElement('output', { 'data-paywall4-parent-gate': true }, content?.featureGate?.labels.title)
}

function renderHost(locale: Paywall4PreviewLocale = 'en', capacity: Paywall4PreviewCapacity = 'source') {
  const referenceFixture = createPaywall4PreviewFixture(locale, capacity)
  const variant = getHbarAppUiVariant('paywall', 4)
  const host = createElement(Paywall4PreviewHost, {
    content: HBAR_APP_UI_PAYWALL_FIXTURES,
    spec: variant.spec,
    referenceFixture,
    onAction: undefined,
    children: createElement(Fragment, null, createElement(variant.component, {}), createElement(ParentContentProbe)),
  })
  return renderToStaticMarkup(createElement(LumenPaywallProvider, { content: HBAR_APP_UI_PAYWALL_FIXTURES, children: host }))
}

describe('Paywall 4 source usage notice', () => {
  test('renders three passive quota paragraphs and decorative bars with two independent requests', () => {
    const html = renderHost()
    expect(html).toContain('data-hbar-app-ui-component="hbar-app-ui-paywall-4"')
    expect(html).toContain('You have hit the Starter limit')
    expect(html).toContain('data-tier="md"')
    expect(html.match(/data-paywall4-meter-id=/g)).toHaveLength(3)
    expect(html).toContain('<span>1.84M</span> / 2.00M')
    expect(html).toContain('inline-size:92%')
    expect(html).toContain('class="lumen-paywall4-track" aria-hidden="true"')
    expect(html).not.toContain('role="progressbar"')
    expect(html.match(/<button/g)).toHaveLength(2)
    expect(html).toContain('data-paywall4-top-up')
    expect(html).toContain('data-paywall4-upgrade')
    expect(html).toContain('data-paywall4-parent-gate="true">Scheduled exports are a Pro feature')
  })

  test('keeps localized long copy, empty state, boundary and full overflow data', () => {
    expect(renderHost('de')).toContain('Du hast das Starter-Limit erreicht')
    expect(renderHost('de-long')).toContain('gespeicherte Datenzeilen')
    const empty = renderHost('en', 'empty')
    expect(empty).toContain('No usage quotas are available.')
    expect(empty).not.toContain('data-paywall4-meter-id=')
    expect(renderHost('en', 'one').match(/data-paywall4-meter-id=/g)).toHaveLength(1)
    expect(renderHost('en', 'boundary').match(/data-paywall4-meter-id=/g)).toHaveLength(6)
    const overflow = renderHost('en', 'overflow')
    expect(overflow.match(/data-paywall4-meter-id=/g)).toHaveLength(17)
    expect(overflow).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(overflow).toContain('role="region" aria-label="Workspace usage quotas" tabindex="0"')
    expect(overflow).toContain('data-paywall4-meter-id="additional-14"')
  })

  test('retains generic usage renderer without reference viewmodel', () => {
    const html = renderToStaticMarkup(createElement(LumenPaywallProvider, {
      content: HBAR_APP_UI_PAYWALL_FIXTURES,
      children: createElement(LumenPaywall04, {}),
    }))
    expect(html).not.toContain('data-paywall4-meter-id=')
    expect(html).toContain('role="progressbar"')
  })
})
