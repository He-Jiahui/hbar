import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiBillingProvider,
  type HbarAppUiBillingContent,
} from '../packages/hbar-app-ui/src/index'
import { createBillingStatementReferenceFixture } from './fixtures/hbar-app-ui-billing-statement-reference-fixtures'

type StatementContent = NonNullable<HbarAppUiBillingContent['statement']>

function render(content: StatementContent): string {
  return renderToStaticMarkup(
    createElement(HbarAppUiBillingProvider, {
      content: { statement: content },
      children: createElement(getHbarAppUiVariant('billing', 1).component, {}),
    }),
  )
}

function invoice(id: string): StatementContent['invoices'][number] {
  return {
    id,
    customer: `Customer ${id}`,
    customerMeta: `ACC-${id}`,
    invoice: `INV-${id}`,
    invoiceMeta: 'Monthly usage',
    plan: 'Growth',
    amount: '$120',
    paymentMethod: 'ACH transfer',
    dueDate: 'Jul 1',
    dueDetail: 'Due in 20 days',
    status: 'Open',
    statusTone: 'neutral',
  }
}

describe('billing statement reference view', () => {
  test('renders the localized host-owned summary, metrics and semantic invoice table', () => {
    const content = createBillingStatementReferenceFixture()
    const markup = render(content)

    expect(markup).toContain('Billing')
    expect(markup).toContain('Invoice ledger')
    expect(markup).toContain('<table')
    expect(markup).toContain('Outstanding invoices</caption>')
    expect(markup).toContain('data-hbar-app-ui-region="invoice-ledger"')
    expect(markup).toContain('data-hbar-app-ui-action="billing-statement:search"')
    expect(markup).toContain('data-hbar-app-ui-field="invoice-search"')
    expect(markup).toContain('INV-20418')
    expect(markup).toContain('INV-20396')
    expect((markup.match(/<tr data-hbar-app-ui-item-id=/g) ?? []).length).toBe(8)
    expect((markup.match(/<dt>/g) ?? []).length).toBe(4)
  })

  test('projects the host query and keeps only the first record for duplicate ids', () => {
    const content = createBillingStatementReferenceFixture()
    const firstInvoice = content.invoices[0]
    if (!firstInvoice) throw new Error('The statement fixture needs an invoice.')
    const query = 'Halcyon'
    const markup = render({
      ...content,
      invoices: [...content.invoices, { ...firstInvoice, customer: 'Duplicate customer' }],
      referenceFlow: { query, onQueryChange: () => {} },
    })

    expect(markup).toContain('value="Halcyon"')
    expect(markup).toContain('Halcyon Pay')
    expect(markup).not.toContain('Duplicate customer')
    expect((markup.match(/<tr data-hbar-app-ui-item-id=/g) ?? []).length).toBe(1)
  })

  test('renders empty, one-row, boundary and over-bound collections without truncation', () => {
    const content = createBillingStatementReferenceFixture()
    const emptyMarkup = render({ ...content, invoices: [] })
    const singleMarkup = render({ ...content, invoices: content.invoices.slice(0, 1) })
    const expectedMaximum = content.listStrategy.expectedMaximum
    const boundaryInvoices = Array.from({ length: expectedMaximum }, (_, index) => invoice(`boundary-${index}`))
    const overflowInvoices = [...boundaryInvoices, invoice('over-bound')]

    expect(emptyMarkup).toContain(content.labels.emptyLedger)
    expect(singleMarkup).toContain('INV-20418')
    expect(
      (render({ ...content, invoices: boundaryInvoices }).match(/<tr data-hbar-app-ui-item-id=/g) ?? []).length,
    ).toBe(expectedMaximum)
    const overflowMarkup = render({ ...content, invoices: overflowInvoices })
    expect((overflowMarkup.match(/<tr data-hbar-app-ui-item-id=/g) ?? []).length).toBe(expectedMaximum + 1)
    expect(overflowMarkup).toContain('INV-over-bound')
    expect(overflowMarkup).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
  })

  test('keeps long German copy in the host fixture', () => {
    const content = createBillingStatementReferenceFixture('de-long')
    const markup = render(content)

    expect(markup).toContain('Abrechnung und offene Rechnungen')
    expect(markup).toContain('Nach Kundennamen oder Rechnungsnummer suchen')
    expect(markup).toContain('Ausstehende Kundenrechnungen')
    expect(markup).toContain('Zahlungsstatus')
  })
})
