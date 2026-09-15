import {describe, expect, test} from 'bun:test'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {
    getHbarAppUiVariant,
    HbarAppUiToolCallsProvider,
    selectHbarAppUiToolCallsItem,
    uniqueHbarAppUiToolCallsItems,
    type HbarAppUiToolCallsActivityContent,
    type HbarAppUiToolCallsContent,
    type HbarAppUiToolCallsTraceContent,
} from '../packages/hbar-app-ui/src/index'
import {
    createHbarAppUiToolCallsLocalizedFixtures,
    HBAR_APP_UI_TOOL_CALLS_FIXTURES,
} from './fixtures/hbar-app-ui-tool-calls-fixtures'

function renderToolCalls(variant: number, content: HbarAppUiToolCallsContent = HBAR_APP_UI_TOOL_CALLS_FIXTURES): string {
    const component = getHbarAppUiVariant('tool-calls', variant).component
    return renderToStaticMarkup(createElement(HbarAppUiToolCallsProvider, {content, children: createElement(component, {})}))
}

function requiredTrace(content: HbarAppUiToolCallsContent): HbarAppUiToolCallsTraceContent {
    if (!content.trace) throw new Error('Expected tool trace fixture')
    return content.trace
}

function requiredActivity(content: HbarAppUiToolCallsContent): HbarAppUiToolCallsActivityContent {
    if (!content.activity) throw new Error('Expected tool activity fixture')
    return content.activity
}

describe('hbar-app-ui tool-call surfaces', () => {
    test('renders six independent flow surfaces from host-provided tool data', () => {
        const markup = Array.from({length: 6}, (_, index) => renderToolCalls(index + 1))

        expect(markup[0]).toContain('hbar-app-ui-tool-calls-trace')
        expect(markup[0]).toContain('search_incidents')
        expect(markup[1]).toContain('hbar-app-ui-tool-calls-activity')
        expect(markup[1]).toContain('codebase_search')
        expect(markup[2]).toContain('hbar-app-ui-tool-calls-diff')
        expect(markup[2]).toContain('services/payments/retry.ts')
        expect(markup[3]).toContain('hbar-app-ui-tool-calls-search')
        expect(markup[3]).toContain('Idempotent requests')
        expect(markup[4]).toContain('hbar-app-ui-tool-calls-command')
        expect(markup[4]).toContain('pnpm test payments')
        expect(markup[5]).toContain('hbar-app-ui-tool-calls-permissions')
        expect(markup[5]).toContain('FILESYSTEM')
        expect(new Set(markup).size).toBe(6)

        for (const surface of markup) {
            const normalized = surface.toLocaleLowerCase()
            expect(normalized).not.toContain('react-bits')
            expect(normalized).not.toContain('reactbits')
        }
    })

    test('uses the reference meaning as normal text and list flow rather than positioned text fragments', () => {
        const trace = renderToolCalls(1)
        const diff = renderToolCalls(3)
        const permissions = renderToolCalls(6)

        expect(trace).toContain('<header')
        expect(trace).toContain('<ol>')
        expect(trace).toContain('<dl>')
        expect(trace).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
        expect(diff).toContain('<code>edit_file</code><h2>Applied 2 file edits</h2>')
        expect(permissions).toContain('<section>')
        expect(permissions).toContain('<h3>REQUESTS</h3>')
        expect(permissions).toContain('data-hbar-app-ui-list-strategy="content-grown"')
    })

    test('renders long non-default host copy with no component-owned fallback labels', () => {
        const localized = createHbarAppUiToolCallsLocalizedFixtures()
        const trace = renderToolCalls(1, localized)
        const permissions = renderToolCalls(6, localized)

        expect(trace).toContain('Werkzeugaufrufe und laufende Ausfuehrungen')
        expect(trace).toContain('Ausfuehrung sofort anhalten')
        expect(trace).toContain('UEBERGEBENE AUSFUEHRUNGSPARAMETER')
        expect(permissions).toContain('Werkzeugberechtigungen fuer diesen Arbeitsbereich')
        expect(permissions).not.toContain('aria-label="Stop"')
    })

    test('handles empty, stale, duplicate, boundary, and over-bound lists without synthetic items', () => {
        const trace = requiredTrace(HBAR_APP_UI_TOOL_CALLS_FIXTURES)
        const activity = requiredActivity(HBAR_APP_UI_TOOL_CALLS_FIXTURES)
        const emptyContent: HbarAppUiToolCallsContent = {...HBAR_APP_UI_TOOL_CALLS_FIXTURES, trace: {...trace, items: []}}
        expect(renderToolCalls(1, emptyContent)).not.toContain('search_incidents')

        const duplicateAndStale: HbarAppUiToolCallsContent = {
            ...HBAR_APP_UI_TOOL_CALLS_FIXTURES,
            activity: {
                ...activity,
                activeFilterId: 'missing-filter',
                filters: [{id: 'all', label: 'All'}, {id: 'all', label: 'Duplicate all'}],
                items: [
                    {id: 'kept', name: 'Kept row', detail: 'owner', duration: 'now', filterIds: ['all'], state: 'complete', stateLabel: 'Done'},
                    {id: 'kept', name: 'Duplicate row', detail: 'owner', duration: 'later', filterIds: ['all'], state: 'complete', stateLabel: 'Done'},
                ],
            },
        }
        const staleMarkup = renderToolCalls(2, duplicateAndStale)
        expect(staleMarkup).toContain('class="hbar-app-ui-tool-calls-button is-selected"')
        expect(staleMarkup).toContain('Kept row')
        expect(staleMarkup).not.toContain('Duplicate all')
        expect(staleMarkup).not.toContain('Duplicate row')

        const boundaryItems = Array.from({length: activity.listStrategy.expectedMaximum}, (_, index) => ({
            id: `boundary-${index}`,
            name: `Boundary command ${index}`,
            detail: 'Boundary detail',
            duration: '1ms',
            filterIds: ['all'],
            state: 'complete' as const,
            stateLabel: 'Done',
        }))
        const overBoundaryItems = [...boundaryItems, {id: 'boundary-over', name: 'Boundary command over', detail: 'Boundary detail', duration: '2ms', filterIds: ['all'], state: 'complete' as const, stateLabel: 'Done'}]
        const boundaryContent: HbarAppUiToolCallsContent = {...HBAR_APP_UI_TOOL_CALLS_FIXTURES, activity: {...activity, items: boundaryItems}}
        const overBoundaryContent: HbarAppUiToolCallsContent = {...HBAR_APP_UI_TOOL_CALLS_FIXTURES, activity: {...activity, items: overBoundaryItems}}
        expect(renderToolCalls(2, boundaryContent).match(/Boundary command/g)).toHaveLength(activity.listStrategy.expectedMaximum)
        expect(renderToolCalls(2, overBoundaryContent).match(/Boundary command/g)).toHaveLength(activity.listStrategy.expectedMaximum + 1)
    })

    test('uses stable-ID de-duplication and first-item fallback after host mutation', () => {
        const items = [{id: 'kept', value: 'first'}, {id: 'kept', value: 'duplicate'}, {id: 'other', value: 'second'}]
        const unique = uniqueHbarAppUiToolCallsItems(items)

        expect(unique).toEqual([{id: 'kept', value: 'first'}, {id: 'other', value: 'second'}])
        expect(selectHbarAppUiToolCallsItem(unique, 'missing')).toEqual({id: 'kept', value: 'first'})
        expect(selectHbarAppUiToolCallsItem([], 'missing')).toBeUndefined()
    })
})
