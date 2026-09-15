import {describe, expect, test} from 'bun:test'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {
    getHbarAppUiVariant,
    HbarAppUiAgentPlanProvider,
    selectHbarAppUiAgentPlanItem,
    uniqueHbarAppUiAgentPlanItems,
    type HbarAppUiAgentPlanActualContent,
    type HbarAppUiAgentPlanContent,
    type HbarAppUiAgentPlanChecklistContent,
} from '../packages/hbar-app-ui/src/index'
import {
    createHbarAppUiAgentPlanLocalizedFixtures,
    HBAR_APP_UI_AGENT_PLAN_FIXTURES,
} from './fixtures/hbar-app-ui-agent-plan-fixtures'

function renderPlan(variant: number, content: HbarAppUiAgentPlanContent = HBAR_APP_UI_AGENT_PLAN_FIXTURES): string {
    const component = getHbarAppUiVariant('agent-plan', variant).component
    return renderToStaticMarkup(createElement(HbarAppUiAgentPlanProvider, {content, children: createElement(component, {})}))
}

function requiredChecklist(content: HbarAppUiAgentPlanContent): HbarAppUiAgentPlanChecklistContent {
    if (!content.checklist) throw new Error('Expected checklist fixture')
    return content.checklist
}

function requiredActual(content: HbarAppUiAgentPlanContent): HbarAppUiAgentPlanActualContent {
    if (!content.actual) throw new Error('Expected actual-duration fixture')
    return content.actual
}

describe('hbar-app-ui agent plan surfaces', () => {
    test('renders six independent flow surfaces from host-owned content', () => {
        const markup = Array.from({length: 6}, (_, index) => renderPlan(index + 1))
        expect(markup[0]).toContain('hbar-app-ui-agent-plan-checklist')
        expect(markup[1]).toContain('hbar-app-ui-agent-plan-editable')
        expect(markup[2]).toContain('hbar-app-ui-agent-plan-tree')
        expect(markup[3]).toContain('hbar-app-ui-agent-plan-actual')
        expect(markup[4]).toContain('hbar-app-ui-agent-plan-board-surface')
        expect(markup[5]).toContain('hbar-app-ui-agent-plan-summary')
        expect(new Set(markup).size).toBe(6)
        for (const surface of markup) {
            expect(surface.toLocaleLowerCase()).not.toContain('react-bits')
            expect(surface.toLocaleLowerCase()).not.toContain('reactbits')
        }
    })

    test('keeps reference reading order and declared list strategy in the DOM', () => {
        const checklist = renderPlan(1)
        const editable = renderPlan(2)
        const tree = renderPlan(3)
        const actual = renderPlan(4)
        const board = renderPlan(5)
        const summary = renderPlan(6)

        expect(checklist.indexOf('Fix billing entitlements')).toBeLessThan(checklist.indexOf('Read the billing contract notes'))
        expect(checklist).toContain('data-hbar-app-ui-list-strategy="content-grown"')
        expect(editable).toContain('aria-label="Move Read the billing contract notes up"')
        expect(editable).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
        expect(editable).toContain('Reorder or skip steps, then start the run.')
        expect(tree).toContain('Retry')
        expect(actual).toContain('<table')
        expect(actual).toContain('hbar-app-ui-agent-plan-duration-cell')
        expect(board).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
        expect(summary).toContain('Goal')
    })

    test('renders long non-default locale copy without package fallback labels', () => {
        const localized = createHbarAppUiAgentPlanLocalizedFixtures()
        expect(renderPlan(1, localized)).toContain('Abrechnung und Berechtigungen reparieren')
        expect(renderPlan(2, localized)).toContain('Einen weiteren Schritt hinzufügen')
        expect(renderPlan(4, localized)).toContain('Plan und Ist-Zeit vergleichen')
        expect(renderPlan(6, localized)).toContain('Shell-Befehle')
        expect(renderPlan(1, localized)).not.toContain('Fix billing entitlements')
    })

    test('handles empty, stale, duplicate, boundary, and over-bound records', () => {
        const checklist = requiredChecklist(HBAR_APP_UI_AGENT_PLAN_FIXTURES)
        const actual = requiredActual(HBAR_APP_UI_AGENT_PLAN_FIXTURES)
        const empty: HbarAppUiAgentPlanContent = {...HBAR_APP_UI_AGENT_PLAN_FIXTURES, checklist: {...checklist, steps: []}}
        expect(renderPlan(1, empty)).toContain('No plan steps')
        expect(renderPlan(1, empty)).not.toContain('Read the billing contract notes')

        const duplicate: HbarAppUiAgentPlanContent = {...HBAR_APP_UI_AGENT_PLAN_FIXTURES, checklist: {...checklist, steps: [checklist.steps[0]!, checklist.steps[0]!, checklist.steps[1]!]}}
        const duplicateMarkup = renderPlan(1, duplicate)
        expect(duplicateMarkup.match(/class="hbar-app-ui-agent-plan-step-title">Read the billing contract notes/g)).toHaveLength(1)

        const boundary = Array.from({length: checklist.listStrategy.expectedMaximum}, (_, index) => ({id: `boundary-${index}`, title: `Boundary step ${index}`, state: 'queued' as const, stateLabel: 'Queued'}))
        const overBoundary = [...boundary, {id: 'over-bound', title: 'Over-bound step', state: 'queued' as const, stateLabel: 'Queued'}]
        expect(renderPlan(1, {...HBAR_APP_UI_AGENT_PLAN_FIXTURES, checklist: {...checklist, steps: boundary}}).match(/class="hbar-app-ui-agent-plan-step-title">Boundary step/g)).toHaveLength(checklist.listStrategy.expectedMaximum)
        expect(renderPlan(1, {...HBAR_APP_UI_AGENT_PLAN_FIXTURES, checklist: {...checklist, steps: overBoundary}}).match(/class="hbar-app-ui-agent-plan-step-title">(?:Boundary step|Over-bound step)/g)).toHaveLength(checklist.listStrategy.expectedMaximum + 1)

        const clampedRows = [
            ...actual.rows,
            {id: 'duration-high', title: 'High duration', durationProgress: 2, planned: '1m', actual: '1m', drift: '0m'},
            {id: 'duration-low', title: 'Low duration', durationProgress: -1, planned: '1m', actual: '1m', drift: '0m'},
        ]
        const clampedMarkup = renderPlan(4, {...HBAR_APP_UI_AGENT_PLAN_FIXTURES, actual: {...actual, rows: clampedRows}})
        expect(clampedMarkup).toContain('value="1"')
        expect(clampedMarkup).toContain('value="0"')
        expect(renderPlan(4, {...HBAR_APP_UI_AGENT_PLAN_FIXTURES, actual: {...actual, rows: []}})).toContain('No timing rows')
    })

    test('uses stable IDs and first-item fallback after host mutation', () => {
        const items = [{id: 'kept', value: 'first'}, {id: 'kept', value: 'duplicate'}, {id: 'other', value: 'second'}]
        const unique = uniqueHbarAppUiAgentPlanItems(items)
        expect(unique).toEqual([{id: 'kept', value: 'first'}, {id: 'other', value: 'second'}])
        expect(selectHbarAppUiAgentPlanItem(unique, 'stale')).toEqual({id: 'kept', value: 'first'})
        expect(selectHbarAppUiAgentPlanItem([], 'stale')).toBeUndefined()
    })
})
