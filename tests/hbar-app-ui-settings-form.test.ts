import {describe, expect, test} from 'bun:test'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {
    getHbarAppUiVariant,
    HbarAppUiSettingsFormProvider,
    selectHbarAppUiSettingsItem,
    uniqueHbarAppUiSettingsItems,
    type HbarAppUiSettingsFormContent,
} from '../packages/hbar-app-ui/src/index'
import {
    createHbarAppUiSettingsFormLocalizedFixtures,
    HBAR_APP_UI_SETTINGS_FORM_FIXTURES,
} from './fixtures/hbar-app-ui-settings-form-fixtures'

function renderSettings(variant: number, content: HbarAppUiSettingsFormContent = HBAR_APP_UI_SETTINGS_FORM_FIXTURES): string {
    const component = getHbarAppUiVariant('settings-form', variant).component
    return renderToStaticMarkup(createElement(HbarAppUiSettingsFormProvider, {content, children: createElement(component, {})}))
}

describe('hbar-app-ui settings form surfaces', () => {
    test('renders six independent workflows from host-owned content', () => {
        const markup = Array.from({length: 6}, (_, index) => renderSettings(index + 1))
        expect(new Set(markup).size).toBe(6)
        expect(markup[0]).toContain('hbar-app-ui-settings-workspace')
        expect(markup[1]).toContain('hbar-app-ui-settings-profile-surface')
        expect(markup[2]).toContain('hbar-app-ui-settings-preferences-surface')
        expect(markup[3]).toContain('hbar-app-ui-settings-member-row')
        expect(markup[4]).toContain('hbar-app-ui-settings-secret-row')
        expect(markup[5]).toContain('hbar-app-ui-settings-danger-card')
        for (const value of markup) {
            expect(value.toLowerCase()).not.toContain('react-bits')
            expect(value.toLowerCase()).not.toContain('reactbits')
        }
    })

    test('keeps long localized labels in the host bundle', () => {
        const localized = createHbarAppUiSettingsFormLocalizedFixtures()
        expect(renderSettings(1, localized)).toContain('Sehr lange lokalisierte Beschreibung')
        expect(renderSettings(2, localized)).toContain('Öffentliches Profil')
        expect(renderSettings(4, localized)).toContain('Einladung senden')
        expect(renderSettings(5, localized)).toContain('API-Schlüssel')
        expect(renderSettings(6, localized)).toContain('Arbeitsbereich löschen')
        expect(renderSettings(1, localized)).not.toContain('Details, defaults, and formats')
    })

    test('handles empty, boundary, over-bound, duplicate, and stale records', () => {
        const baseMembers = HBAR_APP_UI_SETTINGS_FORM_FIXTURES.members
        const baseApi = HBAR_APP_UI_SETTINGS_FORM_FIXTURES.apiKeys
        if (!baseMembers || !baseApi) throw new Error('Expected settings list fixtures')
        const empty: HbarAppUiSettingsFormContent = {...HBAR_APP_UI_SETTINGS_FORM_FIXTURES, members: {...baseMembers, members: []}, apiKeys: {...baseApi, secrets: []}}
        expect(renderSettings(4, empty)).toContain('No members yet.')
        expect(renderSettings(5, empty)).toContain('No secret keys yet.')

        const boundaryMembers = Array.from({length: baseMembers.listStrategy.expectedMaximum}, (_, index) => ({...baseMembers.members[0]!, id: `boundary-member-${index}`, name: `Boundary member ${index}`}))
        const overMembers = [...boundaryMembers, {...baseMembers.members[0]!, id: 'over-member', name: 'Over-bound member'}]
        expect(renderSettings(4, {...HBAR_APP_UI_SETTINGS_FORM_FIXTURES, members: {...baseMembers, members: boundaryMembers}}).match(/hbar-app-ui-settings-member-row/g)).toHaveLength(baseMembers.listStrategy.expectedMaximum)
        expect(renderSettings(4, {...HBAR_APP_UI_SETTINGS_FORM_FIXTURES, members: {...baseMembers, members: overMembers}}).match(/hbar-app-ui-settings-member-row/g)).toHaveLength(baseMembers.listStrategy.expectedMaximum + 1)

        const duplicate = uniqueHbarAppUiSettingsItems([{id: 'same', value: 'first'}, {id: 'same', value: 'duplicate'}, {id: 'other', value: 'second'}])
        expect(duplicate).toEqual([{id: 'same', value: 'first'}, {id: 'other', value: 'second'}])
        expect(selectHbarAppUiSettingsItem(duplicate, 'missing')).toEqual({id: 'same', value: 'first'})
        expect(selectHbarAppUiSettingsItem([], 'missing')).toBeUndefined()
    })
})
