import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { HbarAppUiBillingPaymentMethodsContent } from '../packages/hbar-app-ui/src/index'
import { ReferenceBillingPaymentMethods } from '../hbar-ui/packages/lumen-app-ui/src/billing/ReferenceBillingPaymentMethods'
import { createBillingPaymentMethodsReferenceFixture } from './fixtures/hbar-app-ui-billing-payment-methods-reference-fixtures'

function renderPaymentMethods(content: HbarAppUiBillingPaymentMethodsContent): string {
  return renderToStaticMarkup(
    createElement(ReferenceBillingPaymentMethods, {
      spec: { id: 'billing-methods-preview', variant: 6, profile: {} },
      content,
      layout: content.referenceLayout ?? { ownerId: 'billing:methods:test' },
    }),
  )
}

describe('billing reference payment methods', () => {
  test('renders payment methods, billing contacts, address, and tax information', () => {
    const content = createBillingPaymentMethodsReferenceFixture('en')
    const markup = renderPaymentMethods(content)

    expect(markup).toContain('How Cedar Labs pays for its subscription and usage.')
    expect(markup).toContain('Visa ending 4242')
    expect(markup).toContain('Mastercard ending 8829')
    expect(markup).toContain('ACH · Northwind Trust 1190')
    expect(markup).toContain('Everyone here receives invoices and payment failures.')
    expect(markup).toContain('Tomás Guerrero')
    expect(markup).toContain('14 Warren Street, Suite 620')
    expect(markup).toContain('US-88-2947135')
    expect(markup).toContain('data-hbar-app-ui-list-strategy="content-grown"')
  })

  test('uses the host-selected primary method and places pending/error feedback near the list', () => {
    const content = createBillingPaymentMethodsReferenceFixture('en')
    const flow: NonNullable<HbarAppUiBillingPaymentMethodsContent['referenceFlow']> = {
      primaryMethodId: 'mastercard-8829',
      pending: true,
      error: 'The local preview could not apply that selection.',
      feedback: 'Selection is held in this preview only.',
      onMakePrimary: () => undefined,
    }
    const markup = renderPaymentMethods({ ...content, referenceFlow: flow })
    const mastercardStart = markup.indexOf('data-hbar-app-ui-item-id="mastercard-8829"')
    const achStart = markup.indexOf('data-hbar-app-ui-item-id="ach-northwind-1190"', mastercardStart)
    const mastercardRow = markup.slice(mastercardStart, achStart)

    expect(mastercardRow).toContain('Primary')
    expect(mastercardRow).not.toContain('Make primary')
    expect(markup).toContain('aria-busy="true"')
    expect(markup).toContain('role="alert"')
    expect(markup).toContain('The local preview could not apply that selection.')
    expect(markup).toContain('Selection is held in this preview only.')
  })

  test('handles long localized content, empty lists, duplicate IDs, and pane scrolling without truncation', () => {
    const localized = createBillingPaymentMethodsReferenceFixture('de-long')
    expect(renderPaymentMethods(localized)).toContain('Zahlungsmethoden')
    expect(renderPaymentMethods(localized)).toContain('verbrauchsabhängigen Dienste')

    const base = createBillingPaymentMethodsReferenceFixture('en')
    const duplicateAndOverflow = {
      ...base,
      methods: [
        ...base.methods,
        { ...base.methods[0]!, name: 'Duplicate payment method' },
        ...Array.from({ length: 7 }, (_, index) => ({
          ...base.methods[0]!,
          id: `overflow-method-${index}`,
          name: `Overflow payment method ${index + 1}`,
          primary: false,
        })),
      ],
      contacts: [
        ...base.contacts,
        { ...base.contacts[0]!, name: 'Duplicate billing contact' },
        ...Array.from({ length: 4 }, (_, index) => ({
          ...base.contacts[0]!,
          id: `overflow-contact-${index}`,
          name: `Overflow contact ${index + 1}`,
        })),
      ],
      methodListStrategy: { kind: 'pane-scroll' as const, expectedMaximum: base.methods.length },
      contactListStrategy: { kind: 'pane-scroll' as const, expectedMaximum: base.contacts.length },
    }
    const overflowMarkup = renderPaymentMethods(duplicateAndOverflow)
    expect(overflowMarkup).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(overflowMarkup).not.toContain('Duplicate payment method')
    expect(overflowMarkup).not.toContain('Duplicate billing contact')
    expect(overflowMarkup).toContain('Overflow payment method 7')
    expect(overflowMarkup).toContain('Overflow contact 4')

    const empty = { ...base, methods: [], contacts: [] }
    const emptyMarkup = renderPaymentMethods(empty)
    expect(emptyMarkup).toContain(base.labels.emptyMethods)
    expect(emptyMarkup).toContain(base.labels.emptyContacts)
  })
})
