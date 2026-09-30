import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ReferenceBillingInvoiceDetail } from '../hbar-ui/packages/lumen-app-ui/src/billing/ReferenceBillingInvoiceDetail'
import { ReferenceBillingUsage } from '../hbar-ui/packages/lumen-app-ui/src/billing/ReferenceBillingUsage'
import { createBillingInvoiceDetailReferenceFixture } from './fixtures/hbar-app-ui-billing-invoice-detail-reference-fixtures'
import { createBillingUsageReferenceFixture } from './fixtures/hbar-app-ui-billing-usage-reference-fixtures'

const usageSpec = {
  id: 'billing-usage-reference',
  variant: 7,
  profile: { surface: 'panel', initialState: 'ready', visualMode: 'light' },
}

const invoiceSpec = {
  id: 'billing-invoice-detail-reference',
  variant: 8,
  profile: { surface: 'panel', initialState: 'ready', visualMode: 'light' },
}

function renderUsage(locale: 'en' | 'de-long' = 'en'): string {
  const content = createBillingUsageReferenceFixture(locale)
  return renderToStaticMarkup(
    createElement(ReferenceBillingUsage, {
      spec: usageSpec,
      content,
      layout: content.referenceLayout,
    }),
  )
}

function renderInvoice(locale: 'en' | 'de-long' = 'en'): string {
  const content = createBillingInvoiceDetailReferenceFixture(locale)
  return renderToStaticMarkup(
    createElement(ReferenceBillingInvoiceDetail, {
      spec: invoiceSpec,
      content,
      layout: content.referenceLayout,
    }),
  )
}

describe('Billing reference variants 7 and 8', () => {
  test('renders controlled Usage periods as a roving tablist and exposes unclipped overage semantics', () => {
    const content = createBillingUsageReferenceFixture('en')
    const controlled = {
      ...content,
      referenceFlow: {
        periodId: 'last-cycle',
        onPeriodChange: content.referenceFlow.onPeriodChange,
      },
    }
    const markup = renderToStaticMarkup(
      createElement(ReferenceBillingUsage, {
        spec: usageSpec,
        content: controlled,
        layout: content.referenceLayout,
      }),
    )

    expect(markup).toContain('role="tablist" aria-label="Billing cycle"')
    expect(markup.match(/role="tab"/g) ?? []).toHaveLength(3)
    expect(markup).toContain('aria-selected="true"')
    expect(markup).toContain('aria-valuenow="100"')
    expect(markup).toContain('aria-valuetext="120%"')
    expect(markup).toContain('>120%</span>')
    expect(markup.match(/role="listitem"/g) ?? []).toHaveLength(4)
    expect(markup).toContain('data-hbar-app-ui-action="set-alert"')
  })

  test('keeps Usage host copy localized and renders empty, duplicate, and over-bound content without truncation', () => {
    const localized = renderUsage('de-long')
    expect(localized).toContain('Nutzungsübersicht und verbrauchsabhängige Mehrkosten')
    expect(localized).toContain('Nutzungswarnung konfigurieren')

    const content = createBillingUsageReferenceFixture('en')
    const empty = renderToStaticMarkup(
      createElement(ReferenceBillingUsage, {
        spec: usageSpec,
        content: { ...content, meters: [] },
        layout: content.referenceLayout,
      }),
    )
    expect(empty).toContain(content.labels.emptyMeters)

    const firstMeter = content.meters[0]
    if (!firstMeter) throw new Error('Usage reference fixture requires at least one meter.')
    const duplicated = renderToStaticMarkup(
      createElement(ReferenceBillingUsage, {
        spec: usageSpec,
        content: {
          ...content,
          periods: [...content.periods, content.periods[0] ?? { id: 'fallback', label: 'Fallback' }],
          meters: [...content.meters, { ...firstMeter, label: 'Duplicate seat meter' }],
        },
        layout: content.referenceLayout,
      }),
    )
    expect(duplicated.match(/role="tab"/g) ?? []).toHaveLength(3)
    expect(duplicated.match(/role="listitem"/g) ?? []).toHaveLength(4)
    expect(duplicated).not.toContain('Duplicate seat meter')

    const overBoundMeters = Array.from({ length: content.listStrategy.expectedMaximum + 1 }, (_, index) => ({
      ...firstMeter,
      id: 'meter-' + index,
    }))
    const overBound = renderToStaticMarkup(
      createElement(ReferenceBillingUsage, {
        spec: usageSpec,
        content: { ...content, meters: overBoundMeters },
        layout: content.referenceLayout,
      }),
    )
    expect(overBound.match(/role="listitem"/g) ?? []).toHaveLength(overBoundMeters.length)
    expect(overBound).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
  })

  test('renders invoice detail as a native table with complete billing, activity, and collection data', () => {
    const markup = renderInvoice()
    expect(markup).toContain('<table aria-label="Invoice line items">')
    expect(markup.match(/<th scope="col">/g) ?? []).toHaveLength(4)
    expect(markup.match(/<tr data-hbar-app-ui-item-id=/g) ?? []).toHaveLength(4)
    expect(markup).toContain('Cedar Labs Inc.')
    expect(markup).toContain('PO-4471')
    expect(markup).toContain('$2,141.33')
    expect(markup).toContain('Activity')
    expect(markup).toContain('Collection')
    expect(markup).toContain('data-hbar-app-ui-action="charge-now"')
    expect(markup).not.toContain('Print invoice')
    expect(markup).not.toContain('Download PDF')
    expect(markup).not.toContain('Send reminder')
    expect(markup).not.toContain('<h1')
  })

  test('localizes invoice detail, preserves empty states, deduplicates identities, and keeps over-bound rows', () => {
    const localized = renderInvoice('de-long')
    expect(localized).toContain('Rechnungsempfänger')
    expect(localized).toContain('Einzelpositionen dieser Rechnung')
    expect(localized).toContain('Zahlung jetzt einziehen')
    expect(localized).not.toContain('<h1')

    const content = createBillingInvoiceDetailReferenceFixture('en')
    const empty = renderToStaticMarkup(
      createElement(ReferenceBillingInvoiceDetail, {
        spec: invoiceSpec,
        content: { ...content, lines: [] },
        layout: content.referenceLayout,
      }),
    )
    expect(empty).toContain(content.labels.emptyLines)
    expect(empty).not.toContain('<table')

    const firstLine = content.lines[0]
    if (!firstLine) throw new Error('Invoice detail reference fixture requires at least one line.')
    const duplicated = renderToStaticMarkup(
      createElement(ReferenceBillingInvoiceDetail, {
        spec: invoiceSpec,
        content: { ...content, lines: [...content.lines, { ...firstLine, description: 'Duplicate invoice line' }] },
        layout: content.referenceLayout,
      }),
    )
    expect(duplicated.match(/<tr data-hbar-app-ui-item-id=/g) ?? []).toHaveLength(4)
    expect(duplicated).not.toContain('Duplicate invoice line')

    const overBoundLines = Array.from({ length: content.listStrategy.expectedMaximum + 1 }, (_, index) => ({
      ...firstLine,
      id: 'line-' + index,
    }))
    const overBound = renderToStaticMarkup(
      createElement(ReferenceBillingInvoiceDetail, {
        spec: invoiceSpec,
        content: { ...content, lines: overBoundLines },
        layout: content.referenceLayout,
      }),
    )
    expect(overBound.match(/<tr data-hbar-app-ui-item-id=/g) ?? []).toHaveLength(overBoundLines.length)
  })
})
