import {describe, expect, test} from 'bun:test'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {
    getHbarAppUiVariant,
    HbarAppUiNavbarProvider,
    selectHbarAppUiNavbarItem,
    uniqueHbarAppUiNavbarItems,
    type HbarAppUiNavbarContent,
    type HbarAppUiNavbarFilterContent,
    type HbarAppUiNavbarTaskListContent,
} from '../packages/hbar-app-ui/src/index'
import {
    createHbarAppUiNavbarLocalizedFixtures,
    HBAR_APP_UI_NAVBAR_FIXTURES,
} from './fixtures/hbar-app-ui-navbar-fixtures'

function renderNavbar(variant: number, content: HbarAppUiNavbarContent = HBAR_APP_UI_NAVBAR_FIXTURES): string {
    const component = getHbarAppUiVariant('navbar', variant).component
    return renderToStaticMarkup(createElement(HbarAppUiNavbarProvider, {content, children: createElement(component, {})}))
}

function requiredTaskList(content: HbarAppUiNavbarContent): HbarAppUiNavbarTaskListContent {
    if (!content.taskList) throw new Error('Expected navbar task fixture')
    return content.taskList
}

function requiredFilterList(content: HbarAppUiNavbarContent): HbarAppUiNavbarFilterContent {
    if (!content.filterList) throw new Error('Expected navbar filter fixture')
    return content.filterList
}

describe('hbar-app-ui navbar surfaces', () => {
    test('renders fourteen independent flow surfaces from host-provided content', () => {
        const markup = Array.from({length: 14}, (_, index) => renderNavbar(index + 1))

        expect(markup[0]).toContain('hbar-app-ui-navbar-project-board')
        expect(markup[0]).toContain('Checkout Flow')
        expect(markup[1]).toContain('hbar-app-ui-navbar-task-list')
        expect(markup[1]).toContain('Payment retries')
        expect(markup[2]).toContain('hbar-app-ui-navbar-deployment')
        expect(markup[2]).toContain('Northwind')
        expect(markup[3]).toContain('hbar-app-ui-navbar-landing')
        expect(markup[4]).toContain('Infrastructure that stays out of the way')
        expect(markup[5]).toContain('hbar-app-ui-navbar-activity')
        expect(markup[6]).toContain('hbar-app-ui-navbar-analytics')
        expect(markup[7]).toContain('hbar-app-ui-navbar-filter-list')
        expect(markup[8]).toContain('hbar-app-ui-navbar-commerce')
        expect(markup[9]).toContain('hbar-app-ui-navbar-docs')
        expect(markup[10]).toContain('hbar-app-ui-navbar-document')
        expect(markup[11]).toContain('hbar-app-ui-navbar-landing-centered')
        expect(markup[12]).toContain('hbar-app-ui-navbar-portfolio')
        expect(markup[13]).toContain('hbar-app-ui-navbar-article')
        expect(new Set(markup).size).toBe(14)

        for (const surface of markup) {
            const normalized = surface.toLocaleLowerCase()
            expect(normalized).not.toContain('react-bits')
            expect(normalized).not.toContain('reactbits')
        }
    })

    test('keeps continuous activity text inline while preserving semantic header, list, and article flow', () => {
        const activity = renderNavbar(6)
        const article = renderNavbar(14)

        expect(activity).toContain('<strong>Nadia V.</strong> requested review on Billing retry policy')
        expect(activity).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
        expect(article).toContain('<header>')
        expect(article).toContain('<main data-hbar-app-ui-list-strategy="content-grown"')
        expect(article).toContain('<article>')
        expect(article).toContain('Error budgets are a scheduling tool')
    })

    test('renders non-default host locale data without a package fallback label', () => {
        const localized = createHbarAppUiNavbarLocalizedFixtures()
        const landing = renderNavbar(4, localized)
        const filter = renderNavbar(8, localized)

        expect(landing).toContain('Kostenlosen Arbeitsbereich jetzt erstellen')
        expect(landing).toContain('Vollstaendiges Navigationsmenue oeffnen')
        expect(filter).toContain('Weitere gespeicherte Ansichten anzeigen')
        expect(filter).toContain('Aktuelle gefilterte Ergebnisse exportieren')
        expect(landing).not.toContain('aria-label="Open menu"')
    })

    test('handles empty, stale, duplicate, boundary, and over-bound host lists without synthetic records', () => {
        const taskList = requiredTaskList(HBAR_APP_UI_NAVBAR_FIXTURES)
        const filterList = requiredFilterList(HBAR_APP_UI_NAVBAR_FIXTURES)
        const emptyContent: HbarAppUiNavbarContent = {
            ...HBAR_APP_UI_NAVBAR_FIXTURES,
            taskList: {...taskList, rows: []},
        }
        expect(renderNavbar(2, emptyContent)).not.toContain('Payment retries')

        const duplicateAndStale: HbarAppUiNavbarContent = {
            ...HBAR_APP_UI_NAVBAR_FIXTURES,
            filterList: {
                ...filterList,
                activeFilter: 'missing-filter',
                filters: [
                    {id: 'all', label: 'All', count: 1},
                    {id: 'all', label: 'Duplicate all', count: 2},
                ],
                items: [
                    {id: 'kept', title: 'Kept row', actor: 'Owner', age: 'now'},
                    {id: 'kept', title: 'Duplicate row', actor: 'Owner', age: 'later'},
                ],
            },
        }
        const staleMarkup = renderNavbar(8, duplicateAndStale)
        expect(staleMarkup).toContain('class="hbar-app-ui-button hbar-app-ui-button-neutral is-selected"')
        expect(staleMarkup).toContain('Kept row')
        expect(staleMarkup).not.toContain('Duplicate all')
        expect(staleMarkup).not.toContain('Duplicate row')

        const boundaryRows = Array.from({length: taskList.listStrategy.expectedMaximum}, (_, index) => ({
            id: `boundary-${index}`,
            title: `Boundary task ${index}`,
            sprint: 'Sprint',
            owner: 'Owner',
        }))
        const overBoundaryRows = [...boundaryRows, {id: 'boundary-over', title: 'Boundary task over', sprint: 'Sprint', owner: 'Owner'}]
        const boundaryContent: HbarAppUiNavbarContent = {...HBAR_APP_UI_NAVBAR_FIXTURES, taskList: {...taskList, rows: boundaryRows}}
        const overBoundaryContent: HbarAppUiNavbarContent = {...HBAR_APP_UI_NAVBAR_FIXTURES, taskList: {...taskList, rows: overBoundaryRows}}
        expect(renderNavbar(2, boundaryContent).match(/Boundary task/g)).toHaveLength(taskList.listStrategy.expectedMaximum)
        expect(renderNavbar(2, overBoundaryContent).match(/Boundary task/g)).toHaveLength(taskList.listStrategy.expectedMaximum + 1)
    })

    test('uses stable-ID de-duplication and a documented first-item fallback for stale active IDs', () => {
        const items = [
            {id: 'kept', value: 'first'},
            {id: 'kept', value: 'duplicate'},
            {id: 'other', value: 'second'},
        ]
        const unique = uniqueHbarAppUiNavbarItems(items)

        expect(unique).toEqual([{id: 'kept', value: 'first'}, {id: 'other', value: 'second'}])
        expect(selectHbarAppUiNavbarItem(unique, 'missing')).toEqual({id: 'kept', value: 'first'})
        expect(selectHbarAppUiNavbarItem([], 'missing')).toBeUndefined()
    })
})
