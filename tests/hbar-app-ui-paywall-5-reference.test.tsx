import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenPaywall05, LumenPaywallProvider } from '@lumen/app-ui/catalog'
import { getHbarAppUiVariant } from '../packages/hbar-app-ui/src/index'
import { Paywall5PreviewHost } from '../apps/hbar-app-ui-preview/src/Paywall5PreviewHost'
import { createPaywall5PreviewFixture, type Paywall5PreviewCapacity, type Paywall5PreviewLocale } from '../apps/hbar-app-ui-preview/src/paywall5PreviewFixtures'
import { HBAR_APP_UI_PAYWALL_FIXTURES } from './fixtures/hbar-app-ui-paywall-fixtures'

function renderHost(locale: Paywall5PreviewLocale = 'en', capacity: Paywall5PreviewCapacity = 'source') {
  const referenceFixture = createPaywall5PreviewFixture(locale, capacity)
  const variant = getHbarAppUiVariant('paywall', 5)
  return renderToStaticMarkup(createElement(Paywall5PreviewHost, {
    content: HBAR_APP_UI_PAYWALL_FIXTURES, spec: variant.spec, referenceFixture, onAction: undefined,
    children: createElement(variant.component, {}),
  }))
}

describe('Paywall 5 source trial card', () => {
  test('renders four passive retained pairs, decorative payment icon and independent requests', () => {
    const html = renderHost()
    expect(html).toContain('data-hbar-app-ui-component="hbar-app-ui-paywall-5"')
    expect(html).toContain('Your 14 days with Pro are up')
    expect(html.match(/data-paywall5-row-id=/g)).toHaveLength(4)
    expect(html).toContain('4 kept, read-only')
    expect(html).toContain('26 kept')
    expect(html).toContain('Card ending 4471')
    expect(html).toContain('data-tier="md"')
    expect(html).toContain('aria-hidden="true"')
    expect(html.match(/<button/g)).toHaveLength(2)
    expect(html).toContain('data-paywall5-change')
    expect(html).toContain('data-paywall5-reactivate')
    expect(html.indexOf('Team members')).toBeLessThan(html.indexOf('Card ending 4471'))
    expect(html.indexOf('Card ending 4471')).toBeLessThan(html.indexOf('Reactivate Pro: $168 / yr'))
    expect(html.indexOf('Reactivate Pro: $168 / yr')).toBeLessThan(html.indexOf('Renews yearly.'))
  })
  test('preserves localized copy and empty/one/eight/overflow row boundaries', () => {
    expect(renderHost('de')).toContain('Deine 14 Tage mit Pro sind vorbei')
    expect(renderHost('de-long')).toContain('vollständig erhaltene Ansichten')
    const empty = renderHost('en', 'empty')
    expect(empty).toContain('No retained-data summary is available.')
    expect(empty).not.toContain('data-paywall5-row-id=')
    expect(renderHost('en', 'one').match(/data-paywall5-row-id=/g)).toHaveLength(1)
    expect(renderHost('en', 'boundary').match(/data-paywall5-row-id=/g)).toHaveLength(8)
    const overflow = renderHost('en', 'overflow')
    expect(overflow.match(/data-paywall5-row-id=/g)).toHaveLength(18)
    expect(overflow).toContain('role="region" aria-label="Retained workspace data" tabindex="0"')
    expect(overflow).toContain('data-paywall5-row-id="additional-14"')
  })
  test('keeps generic trial rendering without reference viewmodel', () => {
    const html = renderToStaticMarkup(createElement(LumenPaywallProvider, {
      content: HBAR_APP_UI_PAYWALL_FIXTURES, children: createElement(LumenPaywall05, {}),
    }))
    expect(html).not.toContain('data-paywall5-row-id=')
    expect(html).toContain('data-lumen-variant="5"')
  })
})
