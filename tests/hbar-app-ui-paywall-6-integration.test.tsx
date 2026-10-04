import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenPaywall06, LumenPaywallProvider, useLumenPaywallContent } from '@lumen/app-ui'
import { Paywall6PreviewHost } from '../apps/hbar-app-ui-preview/src/Paywall6PreviewHost'
import { createPaywall6PreviewFixture } from '../apps/hbar-app-ui-preview/src/paywall6PreviewFixtures'
import { getHbarAppUiVariant } from '../packages/hbar-app-ui/src/index'
import { HBAR_APP_UI_PAYWALL_FIXTURES } from './fixtures/hbar-app-ui-paywall-fixtures'

describe('Paywall 6 public host integration', () => {
  test('passes the reader model through the registered public variant without replacing children', () => {
    const variant = getHbarAppUiVariant('paywall', 6)
    const html = renderToStaticMarkup(
      createElement(Paywall6PreviewHost, {
        content: HBAR_APP_UI_PAYWALL_FIXTURES,
        spec: variant.spec,
        referenceFixture: createPaywall6PreviewFixture(),
        children: createElement(
          'div',
          null,
          createElement('output', null, 'existing child'),
          createElement(variant.component, {}),
        ),
      }),
    )
    expect(html).toContain('existing child')
    expect(html).toContain('data-hbar-app-ui-component="hbar-app-ui-paywall-6"')
    expect(html).toContain(`hbar-app-ui-density-${variant.spec.density}`)
    expect(html).toContain('role="img" aria-label="3 of 3 free articles read this month"')
    expect(html).toContain('type="email"')
    expect(html).toContain('data-paywall6-email-form')
    expect(html).not.toContain('required=""')
    expect(html.match(/data-paywall6-assurance-id=/g)).toHaveLength(3)
  })

  test('retains parent content and bypasses reader injection for other variants', () => {
    function ContentProbe() {
      const content = useLumenPaywallContent()
      return createElement(
        'output',
        null,
        content?.featureGate?.labels.title,
        '|',
        content?.readsReference?.content.labels.keepReading,
      )
    }
    const inherited = renderToStaticMarkup(
      createElement(LumenPaywallProvider, {
        content: HBAR_APP_UI_PAYWALL_FIXTURES,
        children: createElement(Paywall6PreviewHost, {
          content: {},
          spec: getHbarAppUiVariant('paywall', 6).spec,
          referenceFixture: createPaywall6PreviewFixture(),
          children: createElement(ContentProbe),
        }),
      }),
    )
    expect(inherited).toContain(HBAR_APP_UI_PAYWALL_FIXTURES.featureGate!.labels.title)
    expect(inherited).toContain('|Keep reading')
    const unrelated = renderToStaticMarkup(
      createElement(Paywall6PreviewHost, {
        content: HBAR_APP_UI_PAYWALL_FIXTURES,
        spec: getHbarAppUiVariant('paywall', 5).spec,
        referenceFixture: createPaywall6PreviewFixture(),
        children: createElement('output', null, 'existing child'),
      }),
    )
    expect(unrelated).toContain('existing child')
    expect(unrelated).not.toContain('data-paywall6-email-form')
  })

  test('preserves generic reader behavior when no reference model is supplied', () => {
    const html = renderToStaticMarkup(
      createElement(LumenPaywallProvider, {
        content: HBAR_APP_UI_PAYWALL_FIXTURES,
        children: createElement(LumenPaywall06, {}),
      }),
    )
    expect(html).toContain('data-lumen-variant="6"')
    expect(html).not.toContain('data-paywall6-counter')
  })
})
