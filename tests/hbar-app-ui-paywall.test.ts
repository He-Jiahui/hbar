import {describe, expect, test} from 'bun:test'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {getHbarAppUiVariant, HbarAppUiPaywallProvider, uniqueHbarAppUiPaywallItems, type HbarAppUiPaywallContent} from '../packages/hbar-app-ui/src/index'
import {createHbarAppUiPaywallLocalizedFixtures, HBAR_APP_UI_PAYWALL_FIXTURES} from './fixtures/hbar-app-ui-paywall-fixtures'

function renderPaywall(variant: number, content: HbarAppUiPaywallContent = HBAR_APP_UI_PAYWALL_FIXTURES): string {
    const component = getHbarAppUiVariant('paywall', variant).component
    return renderToStaticMarkup(createElement(HbarAppUiPaywallProvider, {content, children: createElement(component, {})}))
}

describe('hbar-app-ui paywall surfaces', () => {
    test('keeps each paywall pattern independently addressable', () => {
        const markup = Array.from({length: 7}, (_, index) => renderPaywall(index + 1))
        expect(new Set(markup).size).toBe(7)
        expect(markup[0]).toContain('hbar-app-ui-paywall-article')
        expect(markup[1]).toContain('hbar-app-ui-paywall-feature-card')
        expect(markup[2]).toContain('hbar-app-ui-paywall-plan-list')
        expect(markup[3]).toContain('hbar-app-ui-paywall-meter-list')
        expect(markup[4]).toContain('hbar-app-ui-paywall-trial-card')
        expect(markup[5]).toContain('hbar-app-ui-paywall-reads-card')
        expect(markup[6]).toContain('hbar-app-ui-paywall-seat-card')
        for (const value of markup) {
            expect(value.toLowerCase()).not.toContain('react-bits')
            expect(value.toLowerCase()).not.toContain('reactbits')
        }
    })

    test('renders localized host copy without English fallback text', () => {
        const localized = createHbarAppUiPaywallLocalizedFixtures()
        expect(renderPaywall(1, localized)).toContain('Was eine Datenbankmigration wirklich kostet')
        expect(renderPaywall(3, localized)).toContain('Wähle einen Plan')
        expect(renderPaywall(6, localized)).toContain('Das war dein letzter kostenloser Artikel')
        expect(renderPaywall(1, localized)).not.toContain('What a database migration actually costs')
    })

    test('handles empty lists and boundary duplicate IDs without assuming content', () => {
        const empty: HbarAppUiPaywallContent = {
            ...HBAR_APP_UI_PAYWALL_FIXTURES,
            featureGate: HBAR_APP_UI_PAYWALL_FIXTURES.featureGate && {...HBAR_APP_UI_PAYWALL_FIXTURES.featureGate, features: []},
            usage: HBAR_APP_UI_PAYWALL_FIXTURES.usage && {...HBAR_APP_UI_PAYWALL_FIXTURES.usage, meters: []},
        }
        expect(renderPaywall(2, empty)).not.toContain('Send any saved view')
        expect(renderPaywall(4, empty)).not.toContain('API requests')

        const rows = [{id: 'one', label: 'One'}, {id: 'one', label: 'Duplicate'}, {id: 'two', label: 'Two'}]
        expect(uniqueHbarAppUiPaywallItems(rows)).toEqual([{id: 'one', label: 'One'}, {id: 'two', label: 'Two'}])
    })
})
