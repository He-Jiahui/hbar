import {describe, expect, test} from 'bun:test'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {
    getHbarAppUiVariant,
    HbarAppUiBillingProvider,
    selectHbarAppUiBillingItem,
    uniqueHbarAppUiBillingItems,
    type HbarAppUiBillingContent,
} from '../packages/hbar-app-ui/src/index'
import {
    createHbarAppUiBillingEmptyFixtures,
    createHbarAppUiBillingBoundaryFixtures,
    createHbarAppUiBillingLocalizedFixtures,
    createHbarAppUiBillingOverflowFixtures,
    createHbarAppUiBillingSingleFixtures,
    HBAR_APP_UI_BILLING_FIXTURES,
} from './fixtures/hbar-app-ui-billing-fixtures'

function renderBilling(variant: number, content: HbarAppUiBillingContent = HBAR_APP_UI_BILLING_FIXTURES): string {
    const component = getHbarAppUiVariant('billing', variant).component
    return renderToStaticMarkup(createElement(HbarAppUiBillingProvider, {content, children: createElement(component, {})}))
}

describe('hbar-app-ui billing surfaces', () => {
    test('renders eight independent workflows from host-owned content', () => {
        const markup = Array.from({length: 8}, (_, index) => renderBilling(index + 1))
        expect(new Set(markup).size).toBe(8)
        expect(markup[0]).toContain('hbar-app-ui-billing-statement-surface')
        expect(markup[1]).toContain('hbar-app-ui-billing-plans-surface')
        expect(markup[2]).toContain('hbar-app-ui-billing-invoice-composer-surface')
        expect(markup[3]).toContain('hbar-app-ui-billing-recovery-surface')
        expect(markup[4]).toContain('hbar-app-ui-billing-change-plan-surface')
        expect(markup[5]).toContain('hbar-app-ui-billing-payment-methods-surface')
        expect(markup[6]).toContain('hbar-app-ui-billing-usage-surface')
        expect(markup[7]).toContain('hbar-app-ui-billing-invoice-detail-surface')
        for (const value of markup) expect(value).toContain('hbar-app-ui-')
    })

    test('renders a non-default locale without moving copy into the package implementation', () => {
        const localized = createHbarAppUiBillingLocalizedFixtures()
        expect(renderBilling(1, localized)).toContain('Abrechnung')
        expect(renderBilling(2, localized)).toContain('Sehr lange lokalisierte Beschreibung')
        expect(renderBilling(6, localized)).toContain('Zahlungsmethode hinzufügen')
        expect(renderBilling(8, localized)).toContain('PDF herunterladen')
    })

    test('keeps pane-owned collections bounded by a real scroll contract', () => {
        const overflow = createHbarAppUiBillingOverflowFixtures()
        const statement = renderBilling(1, overflow)
        const recovery = renderBilling(4, overflow)
        const payment = renderBilling(6, overflow)
        const usage = renderBilling(7, overflow)
        const detail = renderBilling(8, overflow)
        expect(statement).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
        expect(recovery).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
        expect(payment).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
        expect(usage).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
        expect(detail).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
        expect(overflow.statement?.invoices.length).toBeGreaterThan(overflow.statement?.listStrategy.expectedMaximum ?? 0)
        expect(overflow.recovery?.subscriptions.length).toBeGreaterThan(overflow.recovery?.listStrategy.expectedMaximum ?? 0)
    })

    test('preserves empty, one, boundary, over-bound and stale-selection behavior', () => {
        const empty = createHbarAppUiBillingEmptyFixtures()
        const single = createHbarAppUiBillingSingleFixtures()
        const boundary = createHbarAppUiBillingBoundaryFixtures()
        expect(renderBilling(1, empty)).toContain(empty.statement?.labels.emptyLedger ?? '')
        expect(renderBilling(2, empty)).toContain(empty.plans?.labels.emptyPlans ?? '')
        expect(renderBilling(4, empty)).toContain(empty.recovery?.labels.emptySubscriptions ?? '')
        expect(renderBilling(6, empty)).toContain(empty.paymentMethods?.labels.emptyMethods ?? '')
        expect(renderBilling(7, empty)).toContain(empty.usage?.labels.emptyMeters ?? '')
        expect(renderBilling(8, empty)).toContain(empty.invoiceDetail?.labels.emptyLines ?? '')
        expect(renderBilling(1, single)).toContain(single.statement?.invoices[0]?.invoice ?? '')
        expect(renderBilling(2, single)).toContain(single.plans?.plans[0]?.name ?? '')
        expect(renderBilling(4, single)).toContain(single.recovery?.subscriptions[0]?.customer ?? '')
        expect(renderBilling(6, single)).toContain(single.paymentMethods?.methods[0]?.name ?? '')
        expect(renderBilling(7, single)).toContain(single.usage?.meters[0]?.label ?? '')
        expect(renderBilling(8, single)).toContain(single.invoiceDetail?.lines[0]?.description ?? '')
        expect(boundary.statement?.invoices.length).toBe(boundary.statement?.listStrategy.expectedMaximum)
        expect(boundary.plans?.plans.length).toBe(boundary.plans?.listStrategy.expectedMaximum)
        expect(boundary.recovery?.subscriptions.length).toBe(boundary.recovery?.listStrategy.expectedMaximum)
        expect(boundary.paymentMethods?.methods.length).toBe(boundary.paymentMethods?.methodListStrategy.expectedMaximum)
        expect(boundary.usage?.meters.length).toBe(boundary.usage?.listStrategy.expectedMaximum)
        expect(boundary.invoiceDetail?.lines.length).toBe(boundary.invoiceDetail?.listStrategy.expectedMaximum)

        const items = [{id: 'one', value: 1}, {id: 'one', value: 2}, {id: 'two', value: 3}]
        expect(uniqueHbarAppUiBillingItems(items)).toEqual([{id: 'one', value: 1}, {id: 'two', value: 3}])
        expect(selectHbarAppUiBillingItem(items, 'missing')).toEqual({id: 'one', value: 1})
        expect(selectHbarAppUiBillingItem([], 'missing')).toBeUndefined()
    })

    test('keeps editable invoice fields and inline value fragments host-owned', () => {
        const markup = renderBilling(3)
        expect(markup).toContain('Northwind Retail')
        expect(markup).toContain('US-88-2947135')
        expect(markup).toContain('hbar-app-ui-billing-field-customer')
        expect(renderBilling(5)).toContain('Scale')
        expect(renderBilling(7)).toContain('120%')
    })
})
