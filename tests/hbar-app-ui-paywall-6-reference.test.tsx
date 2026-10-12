import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenPaywall6Reference, type LumenPaywall6ReferenceContent, type LumenPaywall6ReferenceViewModel } from '@lumen/app-ui/catalog'
import {
  createPaywall6PreviewFixture,
  type Paywall6PreviewCapacity,
  type Paywall6PreviewLocale,
} from '../apps/hbar-app-ui-preview/src/paywall6PreviewFixtures'
import { createPaywall6PreviewStore } from '../apps/hbar-app-ui-preview/src/paywall6PreviewStore'

function referenceModel(
  locale: Paywall6PreviewLocale = 'en',
  capacity: Paywall6PreviewCapacity = 'source',
): LumenPaywall6ReferenceViewModel {
  const fixture = createPaywall6PreviewFixture(locale, capacity)
  const preview = fixture.contentFor(createPaywall6PreviewStore(fixture.seed).getState())
  const content: LumenPaywall6ReferenceContent = {
    labels: preview.labels,
    emailDraft: preview.emailDraft,
    segments: preview.segments,
    assurances: preview.assurances,
    listStrategy: preview.listStrategy,
  }
  return {
    content,
    onEmailDraftChange: () => undefined,
    onKeepReadingRequest: () => undefined,
    onSignInRequest: () => undefined,
  }
}

function render(viewModel = referenceModel()) {
  return renderToStaticMarkup(
    createElement(LumenPaywall6Reference, {
      variantId: 'hbar-app-ui-paywall-6',
      viewModel,
    }),
  )
}

describe('Paywall 6 source email gate', () => {
  test('renders the passive counter, native optional email form, sign-in request and assurances in source order', () => {
    const html = render()
    expect(html).toContain('data-hbar-app-ui-component="hbar-app-ui-paywall-6"')
    expect(html).toContain('role="img" aria-label="3 of 3 free articles read this month"')
    expect(html.match(/data-paywall6-segment-id=/g)).toHaveLength(3)
    expect(html).toContain('That was your last free article this month')
    expect(html).toContain('Your counter resets on 1 April.')
    expect(html).toContain('type="email"')
    expect(html).toContain('placeholder="you@company.com"')
    expect(html).toMatch(/<label class="lumen-paywall6-email-label" for="[^"]+">Email address<\/label>/)
    expect(html).not.toContain('required=""')
    expect(html).toContain('type="submit"')
    expect(html).toContain('data-paywall6-keep-reading')
    expect(html).toContain('Already subscribed?')
    expect(html).toContain('type="button"')
    expect(html).toContain('data-paywall6-sign-in')
    expect(html.match(/data-paywall6-assurance-id=/g)).toHaveLength(3)
    expect(html.indexOf('data-paywall6-counter')).toBeLessThan(html.indexOf('3 of 3 free reads used'))
    expect(html.indexOf('That was your last free article')).toBeLessThan(html.indexOf('data-paywall6-email-form'))
    expect(html.indexOf('data-paywall6-email-form')).toBeLessThan(html.indexOf('Already subscribed?'))
    expect(html.indexOf('Already subscribed?')).toBeLessThan(html.indexOf('data-paywall6-assurance-list'))
    expect(html).not.toContain('<svg')
  })

  test('renders translated long copy, empty/one/six/17 assurance boundaries and only scrolls by host contract', () => {
    expect(render(referenceModel('de'))).toContain('Das war dein letzter kostenloser Artikel in diesem Monat')
    expect(render(referenceModel('de-long'))).toContain('ausführlichen Artikel per E-Mail weiterlesen')

    const empty = render(referenceModel('de-long', 'empty'))
    expect(empty).toContain(
      'Für die Zustellung ausführlicher Artikel per E-Mail sind derzeit keine zusätzlichen Hinweise verfügbar.',
    )
    expect(empty).not.toContain('data-paywall6-assurance-id=')

    expect(render(referenceModel('en', 'one')).match(/data-paywall6-assurance-id=/g)).toHaveLength(1)
    expect(render(referenceModel('en', 'boundary')).match(/data-paywall6-assurance-id=/g)).toHaveLength(6)

    const overflow = render(referenceModel('de-long', 'overflow'))
    expect(overflow.match(/data-paywall6-assurance-id=/g)).toHaveLength(17)
    expect(overflow).toContain(
      'role="region" aria-label="Vollständige Hinweise zur Zustellung und zum Lesen ausführlicher Artikel per E-Mail" tabindex="0"',
    )
    expect(overflow).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(overflow).toContain('data-paywall6-assurance-id="additional-14"')

    const contentGrown = render()
    expect(contentGrown).toContain('data-hbar-app-ui-list-strategy="content-grown"')
    expect(contentGrown).not.toContain('role="region"')
  })

  test('filters invalid and duplicate record IDs while keeping input labels unique across instances', () => {
    const model = referenceModel()
    const reference: LumenPaywall6ReferenceViewModel = {
      ...model,
      content: {
        ...model.content,
        segments: [
          { id: '', used: true },
          { id: 'read', used: true },
          { id: 'read', used: false },
        ],
        assurances: [
          { id: ' ', text: 'invalid' },
          { id: 'assurance', text: 'kept assurance' },
          { id: 'assurance', text: 'duplicate' },
        ],
      },
    }
    const html = renderToStaticMarkup(
      createElement(
        'div',
        null,
        createElement(LumenPaywall6Reference, { variantId: 'hbar-app-ui-paywall-6', viewModel: reference }),
        createElement(LumenPaywall6Reference, { variantId: 'hbar-app-ui-paywall-6', viewModel: reference }),
      ),
    )
    expect(html.match(/data-paywall6-segment-id=/g)).toHaveLength(2)
    expect(html.match(/data-paywall6-assurance-id=/g)).toHaveLength(2)
    expect(html).not.toContain('invalid')
    expect(html).not.toContain('duplicate')
    const labelIds = [...html.matchAll(/<label[^>]+for="([^"]+)"/g)].map((match) => match[1])
    expect(labelIds).toHaveLength(2)
    expect(new Set(labelIds).size).toBe(2)
    for (const id of labelIds) expect(html).toContain(`<input id="${id}"`)
  })
})
