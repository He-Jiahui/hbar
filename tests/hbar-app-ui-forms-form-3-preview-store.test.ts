import { describe, expect, test } from 'bun:test'
import { createForms3PreviewFixture } from '../apps/hbar-app-ui-preview/src/formsForm3PreviewFixtures'
import { createForms3PreviewStore, deriveForms3Totals } from '../apps/hbar-app-ui-preview/src/formsForm3PreviewStore'

function itemAt<Item>(items: readonly Item[], index: number): Item {
  const item = items[index]
  if (item === undefined) throw new RangeError(`Missing test item at index ${index}.`)
  return item
}

describe('Forms Form 3 preview store', () => {
  test('projects the cached booking baseline and derived line totals', () => {
    const fixture = createForms3PreviewFixture()
    const store = createForms3PreviewStore(fixture.storeSeed)
    const content = fixture.contentFor(store.getState())

    expect(content.copy.pageTitle).toBe('New freight booking')
    expect(content.account.selectedId).toBe('northwind-traders')
    expect(content.bookingReference.value).toBe('SHP-4471')
    expect(content.pickupDate.value).toBe('2026-08-14')
    expect(content.deliveryDate.value).toBe('2026-08-21')
    expect(content.cargo.lines.map((line) => line.amountLabel)).toEqual(['803.25', '860.16', '1,274.40'])
    expect(content.cargo.subtotalLabel).toBe('EUR 2,613.00')
    expect(content.cargo.dutyTotalLabel).toBe('EUR 324.81')
    expect(content.cargo.grandTotalLabel).toBe('EUR 2,937.81')
    expect(content.cargo.bookShipmentDisabled).toBe(true)
    expect(content.listStrategy.kind).toBe('content-grown')
  })

  test('recomputes amounts from quantity, unit rate, and observed duty choices', () => {
    const fixture = createForms3PreviewFixture()
    const store = createForms3PreviewStore(fixture.storeSeed)
    const firstLine = itemAt(store.getState().draft.lines, 0)

    expect(store.getState().setLineText(firstLine.id, 'quantity', '20')).toBe(true)
    expect(store.getState().setLineText(firstLine.id, 'unitRate', '50.00')).toBe(true)
    expect(store.getState().selectLineChoice(firstLine.id, 'dutyRateId', 'standard-12')).toBe(true)

    const updated = fixture.contentFor(store.getState())
    const updatedLine = itemAt(updated.cargo.lines, 0)
    expect(updatedLine.amountLabel).toBe('1,120.00')
    expect(updated.cargo.grandTotalLabel).toBe('EUR 3,254.56')
    expect(store.getState().setLineText('stale-line', 'quantity', '4')).toBe(false)
    expect(store.getState().selectLineChoice(firstLine.id, 'dutyRateId', 'unobserved-rate')).toBe(false)
  })

  test('keeps selected catalogs source-bounded and changing currencies formats totals', () => {
    const fixture = createForms3PreviewFixture()
    const store = createForms3PreviewStore(fixture.storeSeed)

    expect(fixture.catalogs.accounts.map((choice) => choice.label)).toEqual(['Northwind Traders'])
    expect(fixture.catalogs.incoterms.map((choice) => choice.label)).toEqual(['DAP, delivered at place'])
    expect(store.getState().selectChoice('currencyId', 'unknown-currency')).toBe(false)
    expect(store.getState().selectChoice('accountId', 'northwind-traders')).toBe(false)
    expect(store.getState().setTextField('bookingReference', 'SHP-4472')).toBe(true)
    expect(store.getState().setTextField('bookingReference', 'SHP-4472')).toBe(false)
    expect(store.getState().setDateField('pickupDate', '2026-08-15')).toBe(true)
  })

  test('supports content-grown zero, one, source-sized, and extended line collections', () => {
    const fixture = createForms3PreviewFixture()
    const store = createForms3PreviewStore(fixture.storeSeed)

    expect(store.getState().draft.lines).toHaveLength(3)
    expect(store.getState().removeLine('missing-line')).toBe(false)
    expect(store.getState().removeLine('cargo-line-1')).toBe(true)
    expect(store.getState().draft.lines).toHaveLength(2)
    expect(store.getState().removeLine('cargo-line-2')).toBe(true)
    expect(store.getState().removeLine('cargo-line-3')).toBe(true)
    expect(store.getState().draft.lines).toEqual([])
    expect(fixture.contentFor(store.getState()).cargo.grandTotalLabel).toBe('EUR 0.00')

    const addedId = store.getState().addLine()
    expect(addedId).toBe('cargo-line-4')
    expect(store.getState().draft.lines).toHaveLength(1)
    expect(store.getState().removeLine(addedId)).toBe(true)
    expect(store.getState().draft.lines).toHaveLength(0)
    expect(store.getState().addLine()).toBe('cargo-line-5')
  })

  test('localizes host-owned content and rejects malformed choice data', () => {
    const german = createForms3PreviewFixture('de')
    const germanStore = createForms3PreviewStore(german.storeSeed)
    const germanContent = german.contentFor(germanStore.getState())
    const description = itemAt(germanContent.cargo.lines, 0).descriptionChoices

    expect(germanContent.copy.pageTitle).toBe('Neue Frachtbuchung')
    expect(germanContent.copy.lineCountLabel(2)).toBe('2 Positionen')
    expect(itemAt(description, 0).label).toBe('Palettierte Trockengüter')
    expect(germanContent.cargo.grandTotalLabel).toBe('EUR 2.937,81')

    expect(() =>
      createForms3PreviewStore({
        ...german.storeSeed,
        descriptionIds: ['duplicate', 'duplicate'],
      }),
    ).toThrow('Cargo description IDs must be unique.')
    expect(() =>
      createForms3PreviewStore({
        ...german.storeSeed,
        initialDraft: { ...german.storeSeed.initialDraft, currencyId: 'stale-currency' },
      }),
    ).toThrow('The initial currency must reference an available choice.')
  })

  test('rounds each line duty in minor units without floating-point drift', () => {
    const totals = deriveForms3Totals(
      [{ id: 'rounding-line', descriptionId: null, quantity: '3', unitRate: '0.10', dutyRateId: 'rate' }],
      [{ id: 'rate', basisPoints: 1800 }],
    )

    expect(totals).toEqual({
      lineAmounts: [{ lineId: 'rounding-line', baseAmountMinor: 30, dutyAmountMinor: 5, amountMinor: 35 }],
      subtotalMinor: 30,
      dutyTotalMinor: 5,
      grandTotalMinor: 35,
    })
  })
})
