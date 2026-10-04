import { describe, expect, test } from 'bun:test'
import { createForms6PreviewFixture } from '../apps/hbar-app-ui-preview/src/forms6PreviewFixtures'
import {
  createForms6PreviewStore,
  deriveForms6OrderSummary,
  formatForms6CardNumber,
} from '../apps/hbar-app-ui-preview/src/forms6PreviewStore'

function itemAt<Item>(items: readonly Item[], index: number): Item {
  const item = items[index]
  if (item === undefined) throw new RangeError(`Missing test item at index ${index}.`)
  return item
}

describe('Forms 6 preview store', () => {
  test('projects the observed checkout baseline and keeps payment disabled', () => {
    const fixture = createForms6PreviewFixture()
    const store = createForms6PreviewStore(fixture.storeSeed)
    const content = fixture.contentFor(store.getState())

    expect(content.copy.pageTitle).toBe('Checkout')
    expect(content.delivery.selectedCountryId).toBe('us')
    expect(content.delivery.region).toMatchObject({
      kind: 'select',
      label: 'State',
      placeholder: 'Select state',
      value: '',
    })
    expect(content.billingMatchesDelivery).toBe(true)
    expect(content.payment).toEqual({ cardNumber: '', expiry: '', cvc: '' })
    expect(content.cartLines).toHaveLength(3)
    expect(content.cartLines.map((line) => line.formattedLineTotal)).toEqual(['$128.00', '$92.00', '$34.00'])
    expect(content.summary).toMatchObject({
      subtotalCents: 25400,
      subtotalLabel: '$254.00',
      shippingCents: 0,
      shippingValue: 'Free',
      taxCents: 2159,
      taxValue: '$21.59',
      totalCents: 27559,
      totalValue: '$275.59',
    })
    expect(content.shipping.selectedId).toBe('standard')
    expect(content.payButtonLabel).toBe('Pay $275.59')
    expect(content.payDisabled).toBe(true)
    expect(store.getState().requestPay()).toBeNull()
    expect(store.getState().requestBackToCart()).toEqual({ kind: 'back-to-cart' })
    expect(content.listStrategy).toEqual({ kind: 'content-grown', sourceItemCount: 3 })
  })

  test('changes region control type, label, options, and current value with the country', () => {
    const fixture = createForms6PreviewFixture()
    const store = createForms6PreviewStore(fixture.storeSeed)

    expect(store.getState().setAddressRegion('delivery', 'california')).toBe(true)
    expect(store.getState().setAddressCountry('delivery', 'ca')).toBe(true)
    let delivery = fixture.contentFor(store.getState()).delivery
    expect(delivery.region).toMatchObject({
      kind: 'select',
      label: 'Province',
      placeholder: 'Select province',
      value: '',
    })
    expect(delivery.region.kind === 'select' ? delivery.region.options.length : -1).toBe(5)
    expect(store.getState().setAddressRegion('delivery', 'california')).toBe(false)
    expect(store.getState().setAddressRegion('delivery', 'british-columbia')).toBe(true)
    expect(fixture.contentFor(store.getState()).delivery.region.value).toBe('british-columbia')

    expect(store.getState().setAddressCountry('delivery', 'ie')).toBe(true)
    delivery = fixture.contentFor(store.getState()).delivery
    expect(delivery.region).toMatchObject({
      kind: 'select',
      label: 'County',
      placeholder: 'Select county',
      value: '',
    })
    expect(delivery.region.kind === 'select' ? delivery.region.options.map((option) => option.label) : []).toEqual([
      'Dublin',
      'Cork',
      'Galway',
      'Limerick',
      'Kerry',
      'Mayo',
    ])

    expect(store.getState().setAddressCountry('delivery', 'sg')).toBe(true)
    delivery = fixture.contentFor(store.getState()).delivery
    expect(delivery.region).toEqual({
      kind: 'text',
      label: 'Region',
      placeholder: 'District or area',
      value: '',
    })
    expect(store.getState().setAddressRegion('delivery', 'Downtown Core')).toBe(true)
    expect(fixture.contentFor(store.getState()).delivery.region.value).toBe('Downtown Core')
    expect(store.getState().setAddressCountry('delivery', 'unknown-country')).toBe(false)
  })

  test('keeps both address drafts intact when the matching checkbox changes', () => {
    const fixture = createForms6PreviewFixture()
    const store = createForms6PreviewStore(fixture.storeSeed)
    const state = store.getState()

    expect(state.setAddressField('delivery', 'fullName', 'Delivery Recipient')).toBe(true)
    expect(state.setAddressField('billing', 'fullName', 'Billing Recipient')).toBe(true)
    expect(state.setBillingMatchesDelivery(false)).toBe(true)
    let content = fixture.contentFor(store.getState())
    expect(content.billingMatchesDelivery).toBe(false)
    expect(content.delivery.fields.fullName).toBe('Delivery Recipient')
    expect(content.billing.fields.fullName).toBe('Billing Recipient')

    expect(state.setBillingMatchesDelivery(true)).toBe(true)
    content = fixture.contentFor(store.getState())
    expect(content.billingMatchesDelivery).toBe(true)
    expect(content.delivery.fields.fullName).toBe('Delivery Recipient')
    expect(content.billing.fields.fullName).toBe('Billing Recipient')
    expect(state.setAddressField('billing', 'fullName', 'Billing Recipient')).toBe(false)
  })

  test('recalculates shipping and totals from the selected rate while preserving observed tax', () => {
    const fixture = createForms6PreviewFixture()
    const store = createForms6PreviewStore(fixture.storeSeed)
    const actions = store.getState()

    expect(actions.selectShipping('express')).toBe(true)
    let content = fixture.contentFor(store.getState())
    expect(content.summary).toMatchObject({
      shippingCents: 1400,
      shippingValue: '$14.00',
      taxCents: 2159,
      totalCents: 28959,
      totalValue: '$289.59',
    })
    expect(content.shipping.selectedId).toBe('express')

    expect(actions.selectShipping('priority')).toBe(true)
    content = fixture.contentFor(store.getState())
    expect(content.summary).toMatchObject({ shippingCents: 2800, totalCents: 30359 })
    expect(actions.selectShipping('unknown-shipping')).toBe(false)
    expect(actions.selectShipping('priority')).toBe(false)
    expect(actions.selectShipping('standard')).toBe(true)
    expect(fixture.contentFor(store.getState()).summary.totalCents).toBe(27559)
  })

  test('formats only the observed card-number grouping and keeps payment as local draft data', () => {
    const fixture = createForms6PreviewFixture()
    const store = createForms6PreviewStore(fixture.storeSeed)

    expect(formatForms6CardNumber('12345678')).toBe('1234 5678')
    expect(store.getState().setPaymentField('cardNumber', '12345678')).toBe(true)
    expect(store.getState().setPaymentField('expiry', '12 / 28')).toBe(true)
    expect(store.getState().setPaymentField('cvc', '123')).toBe(true)
    expect(fixture.contentFor(store.getState()).payment).toEqual({
      cardNumber: '1234 5678',
      expiry: '12 / 28',
      cvc: '123',
    })
    expect(store.getState().requestPay()).toBeNull()
  })

  test('supports empty, one-line, source-sized, and larger content-grown summaries', () => {
    const fixture = createForms6PreviewFixture()
    const base = fixture.storeSeed
    const emptyStore = createForms6PreviewStore({ ...base, items: [] })
    const emptyContent = fixture.contentFor(emptyStore.getState())
    expect(emptyContent.cartLines).toHaveLength(0)
    expect(emptyContent.copy.emptyCartLabel).toBe('There are no items in this order summary.')
    expect(emptyContent.summary).toMatchObject({ subtotalCents: 0, taxCents: 0, totalCents: 0 })

    const oneStore = createForms6PreviewStore({ ...base, items: [itemAt(base.items, 0)] })
    expect(fixture.contentFor(oneStore.getState()).cartLines).toHaveLength(1)

    const sourceSize = deriveForms6OrderSummary(base.items, base.shippingOptions, 'standard', 850)
    expect(sourceSize.lines).toHaveLength(3)
    expect(sourceSize.totalCents).toBe(27559)

    const fourItems = [
      ...base.items,
      { id: 'extra-tea-towel', name: 'Extra linen tea towel', quantity: 1, unitPriceCents: 1500 },
    ]
    const largerStore = createForms6PreviewStore({ ...base, items: fourItems })
    const largerContent = fixture.contentFor(largerStore.getState())
    expect(largerContent.cartLines).toHaveLength(4)
    expect(largerContent.summary.subtotalCents).toBe(26900)
    expect(largerContent.summary.totalCents).toBe(29187)
    expect(largerContent.listStrategy.kind).toBe('content-grown')
  })

  test('keeps copy, formatting, and long content host-owned for a non-default locale', () => {
    const fixture = createForms6PreviewFixture('de')
    const store = createForms6PreviewStore(fixture.storeSeed)
    const content = fixture.contentFor(store.getState())

    expect(content.copy.pageTitle).toBe('Kasse')
    expect(content.copy.deliveryHeading).toBe('Lieferadresse')
    expect(content.copy.formatMoney(27559)).toContain('275,59')
    expect(content.payButtonLabel).toContain('275,59')
    expect(itemAt(content.cartLines, 2).name).toBe('Leinentücher für empfindliche Küchenoberflächen, 4er-Set')
    expect(content.delivery.countries.map((country) => country.label)).toEqual([
      'Vereinigte Staaten',
      'Kanada',
      'Irland',
      'Singapur',
    ])
    expect(content.shipping.options.map((option) => option.description)).toEqual([
      '5 bis 7 Werktage',
      '2 bis 3 Werktage',
      'Nächster Werktag',
    ])
  })

  test('rejects duplicate catalogs, missing countries, and invalid initial choices', () => {
    const fixture = createForms6PreviewFixture()
    const seed = fixture.storeSeed
    const firstCountry = itemAt(seed.countries, 0)
    const firstItem = itemAt(seed.items, 0)
    const firstShipping = itemAt(seed.shippingOptions, 0)

    expect(() => createForms6PreviewStore({ ...seed, countries: [firstCountry, firstCountry] })).toThrow(
      'Country IDs must be unique.',
    )
    expect(() => createForms6PreviewStore({ ...seed, items: [firstItem, firstItem] })).toThrow(
      'Cart item IDs must be unique.',
    )
    expect(() => createForms6PreviewStore({ ...seed, shippingOptions: [firstShipping, firstShipping] })).toThrow(
      'Shipping option IDs must be unique.',
    )
    expect(() =>
      createForms6PreviewStore({
        ...seed,
        initialDraft: {
          ...seed.initialDraft,
          delivery: { ...seed.initialDraft.delivery, countryId: 'not-catalogued' },
        },
      }),
    ).toThrow('Unknown country ID: not-catalogued')
    expect(() =>
      createForms6PreviewStore({
        ...seed,
        initialDraft: { ...seed.initialDraft, shippingId: 'not-catalogued' },
      }),
    ).toThrow('The initial shipping choice must reference an available option.')
  })
})
