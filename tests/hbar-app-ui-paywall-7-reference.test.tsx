import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenPaywall07, LumenPaywallProvider, LumenPaywall7Reference, useLumenPaywallContent, type LumenPaywall7ReferenceViewModel, type LumenPaywallContent } from '@lumen/app-ui/catalog'
import { Paywall7PreviewHost } from '../apps/hbar-app-ui-preview/src/Paywall7PreviewHost'
import { createPaywall7PreviewFixture } from '../apps/hbar-app-ui-preview/src/paywall7PreviewFixtures'
import { createPaywall7PreviewStore } from '../apps/hbar-app-ui-preview/src/paywall7PreviewStore'
import { getHbarAppUiVariant } from '../packages/hbar-app-ui/src/index'
import { HBAR_APP_UI_PAYWALL_FIXTURES } from './fixtures/hbar-app-ui-paywall-fixtures'

function referenceModel(
  locale: 'en' | 'de' | 'de-long' = 'en',
  capacity: 'source' | 'empty' | 'one' | 'boundary' | 'overflow' = 'source',
): LumenPaywall7ReferenceViewModel {
  const fixture = createPaywall7PreviewFixture(locale, capacity)
  const state = createPaywall7PreviewStore(fixture.seed).getState()
  const preview = fixture.contentFor(state)
  return {
    content: {
      labels: preview.labels,
      recipients: preview.recipients,
      draft: preview.draft,
      listStrategy: preview.listStrategy,
    },
    onDraftChange: () => undefined,
    onComparePlansRequest: () => undefined,
    onSendRequest: () => undefined,
  }
}

function render(viewModel = referenceModel()) {
  return renderToStaticMarkup(
    createElement(LumenPaywall7Reference, {
      variantId: 'hbar-app-ui-paywall-7',
      viewModel,
    }),
  )
}

describe('Paywall 7 admin upgrade request reference', () => {
  test('renders the observed semantic flow without invented landmarks or a form', () => {
    const html = render()
    expect(html).toContain('data-hbar-app-ui-component="hbar-app-ui-paywall-7"')
    expect(html).toContain('Audit log needs a Scale plan')
    expect(html).toContain('Northwind is on Pro · you do not manage billing')
    expect(html).not.toContain('<header')
    expect(html).not.toContain('<footer')
    expect(html).not.toContain('<form')
    expect(html).not.toContain('role="dialog"')
    expect(html.match(/data-paywall7-recipient-id=/g)).toHaveLength(2)
    expect(html).toContain('Priya Nandakumar')
    expect(html).toContain('Workspace owner')
    expect(html).toContain('Marcus Bell')
    expect(html).toContain('Billing admin')
    expect(html).toContain('data-tier="md"')
    expect(html).toContain('data-tier="sm"')
    expect(html).toContain('Compare plans')
    expect(html).toContain('Send request')
    expect(html.indexOf('Ask an admin to upgrade')).toBeLessThan(html.indexOf('Why do you need it?'))
    expect(html.indexOf('Why do you need it?')).toBeLessThan(html.indexOf('Compare plans'))
  })

  test('keeps textarea labels unique across instances and preserves the host-controlled draft', () => {
    const model = referenceModel()
    const html = renderToStaticMarkup(
      createElement(
        'div',
        null,
        createElement(LumenPaywall7Reference, { variantId: 'first', viewModel: model }),
        createElement(LumenPaywall7Reference, { variantId: 'second', viewModel: model }),
      ),
    )
    const labelIds = [...html.matchAll(/<label[^>]+for="([^"]+)"/g)].map((match) => match[1])
    const textareaIds = [...html.matchAll(/<textarea[^>]+id="([^"]+)"/g)].map((match) => match[1])
    expect(labelIds).toHaveLength(2)
    expect(textareaIds).toHaveLength(2)
    expect(new Set(labelIds).size).toBe(2)
    expect(labelIds).toEqual(textareaIds)
    expect(html).toContain('I need audit log access to close out the SOC 2 evidence request.')
    expect(html).toContain('rows="2"')
    expect(html).not.toContain('required=""')
    expect(html).not.toContain('aria-describedby')
  })

  test('applies host list capacity and overflow behavior without inventing a source maximum', () => {
    expect(render(referenceModel('de'))).toContain('Admin um ein Upgrade bitten')
    const empty = render(referenceModel('de-long', 'empty'))
    expect(empty).toContain('data-paywall7-recipients')
    expect(empty).toContain('keine zuständigen Administratoren verfügbar')
    expect(empty).not.toContain('data-paywall7-recipient-id=')
    expect(render(referenceModel('en', 'one')).match(/data-paywall7-recipient-id=/g)).toHaveLength(1)
    expect(render(referenceModel('en', 'boundary')).match(/data-paywall7-recipient-id=/g)).toHaveLength(6)

    const overflow = render(referenceModel('en', 'overflow'))
    expect(overflow.match(/data-paywall7-recipient-id=/g)).toHaveLength(16)
    expect(overflow).toContain('role="region"')
    expect(overflow).toContain('aria-label="Workspace administrators"')
    expect(overflow).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(overflow).not.toContain('sourceMaximum')
  })

  test('the public host composes its reference model with parent content and preserves children', () => {
    const variant = getHbarAppUiVariant('paywall', 7)
    const parentContent: LumenPaywallContent = {
      ...HBAR_APP_UI_PAYWALL_FIXTURES,
      article: {
        ...HBAR_APP_UI_PAYWALL_FIXTURES.article!,
        labels: {
          ...HBAR_APP_UI_PAYWALL_FIXTURES.article!.labels,
          title: 'Parent article remains available',
        },
      },
    }
    const rendered = renderToStaticMarkup(
      createElement(LumenPaywallProvider, {
        content: parentContent,
        children: createElement(Paywall7PreviewHost, {
          content: HBAR_APP_UI_PAYWALL_FIXTURES,
          spec: variant.spec,
          referenceFixture: createPaywall7PreviewFixture(),
          children: createElement(
            'div',
            null,
            createElement('output', null, 'existing child'),
            createElement(LumenPaywall07),
          ),
        }),
      }),
    )
    expect(rendered).toContain('existing child')
    expect(rendered).toContain('Audit log needs a Scale plan')
    expect(rendered).toContain('data-hbar-app-ui-component="hbar-app-ui-paywall-7"')

    function ContentProbe() {
      const content = useLumenPaywallContent()
      return createElement(
        'output',
        null,
        content?.article?.labels.title,
        '|',
        content?.adminReference?.content.labels.title,
      )
    }
    const inherited = renderToStaticMarkup(
      createElement(LumenPaywallProvider, {
        content: parentContent,
        children: createElement(Paywall7PreviewHost, {
          content: HBAR_APP_UI_PAYWALL_FIXTURES,
          spec: variant.spec,
          referenceFixture: createPaywall7PreviewFixture(),
          children: createElement(ContentProbe),
        }),
      }),
    )
    expect(inherited).toContain('Parent article remains available|Audit log needs a Scale plan')
  })

  test('leaves unrelated variants and generic public behavior untouched', () => {
    const other = getHbarAppUiVariant('paywall', 6)
    const rendered = renderToStaticMarkup(
      createElement(LumenPaywallProvider, {
        content: HBAR_APP_UI_PAYWALL_FIXTURES,
        children: createElement(Paywall7PreviewHost, {
          content: HBAR_APP_UI_PAYWALL_FIXTURES,
          spec: other.spec,
          referenceFixture: createPaywall7PreviewFixture(),
          children: createElement(LumenPaywall07),
        }),
      }),
    )
    expect(rendered).not.toContain('lumen-paywall7-reference')
    expect(rendered).not.toContain('data-paywall7-note')
  })
})
