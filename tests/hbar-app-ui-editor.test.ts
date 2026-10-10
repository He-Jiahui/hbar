import {describe, expect, test} from 'bun:test'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {
    HbarAppUiEditorProvider,
    getHbarAppUiVariant,
    type HbarAppUiCodeWorkspaceContent,
    type HbarAppUiEditorContent,
    type HbarAppUiSuggestionReviewContent,
} from '../packages/hbar-app-ui/src/index'
import {selectHbarAppUiEditorItem, uniqueHbarAppUiEditorItems} from '../packages/hbar-app-ui/src/components/editor/EditorContent'
import {HBAR_APP_UI_EDITOR_FIXTURES} from './fixtures/hbar-app-ui-editor-fixtures'

function renderEditor(variant: number, content: HbarAppUiEditorContent = HBAR_APP_UI_EDITOR_FIXTURES): string {
    const component = getHbarAppUiVariant('editor', variant).component
    return renderToStaticMarkup(createElement(HbarAppUiEditorProvider, {content, children: createElement(component, {})}))
}

function requiredCode(content: HbarAppUiEditorContent): HbarAppUiCodeWorkspaceContent {
    if (!content.code) throw new Error('Expected code fixture')
    return content.code
}

function requiredSuggestions(content: HbarAppUiEditorContent): HbarAppUiSuggestionReviewContent {
    if (!content.suggestions) throw new Error('Expected suggestion fixture')
    return content.suggestions
}

describe('hbar-app-ui editor workflows', () => {
    test('keeps each workflow in its own semantic surface with test-injected content', () => {
        const markup = Array.from({length: 5}, (_, index) => renderEditor(index + 1))

        expect(markup[0]).toContain('hbar-app-ui-editor-rich-text')
        expect(markup[0]).toContain('Audit ledger design notes')
        expect(markup[1]).toContain('hbar-app-ui-editor-markdown')
        expect(markup[1]).toContain('streaming-meter.md')
        expect(markup[2]).toContain('hbar-app-ui-editor-code')
        expect(markup[2]).toContain('meter.ts')
        expect(markup[3]).toContain('hbar-app-ui-editor-suggestions')
        expect(markup[3]).toContain('Suggestions')
        expect(markup[4]).toContain('hbar-app-ui-editor-reader')
        expect(markup[4]).toContain('Halcyon handbook')
        expect(new Set(markup).size).toBe(5)

        for (const surface of markup) {
            const normalized = surface.toLocaleLowerCase()
            expect(normalized).not.toContain('react-bits')
            expect(normalized).not.toContain('reactbits')
        }
    })

    test('keeps review copy in one flowing paragraph while actions target supplied suggestion IDs', () => {
        const markup = renderEditor(4, {...HBAR_APP_UI_EDITOR_FIXTURES, referenceSuggestions: undefined})

        expect(markup).toContain('hbar-app-ui-editor-suggestion-copy')
        expect(markup).toMatch(/<p><span>The change <\/span><button[^>]*>[\s\S]*?should probably be rolled out slowly[\s\S]*?<\/button><span>, starting with internal workspaces/)
        expect(markup).toContain('<s>should probably be rolled out slowly</s>')
        expect(markup).toContain('<strong>rolls out in three stages</strong>')
        expect(markup).toContain('Accept all')
        expect(markup).toContain('Dismiss')
        expect(markup).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    })

    test('renders a non-default locale with a deliberately long label from the host bundle', () => {
        const code = requiredCode(HBAR_APP_UI_EDITOR_FIXTURES)
        const localized: HbarAppUiEditorContent = {
            ...HBAR_APP_UI_EDITOR_FIXTURES,
            referenceCode: undefined,
            code: {
                ...code,
                labels: {
                    ...code.labels,
                    openFilesLabel: 'Geoeffnete Arbeitsbereichsdateien mit einem absichtlich sehr langen lokalisierten Namen',
                    runLabel: 'Ausfuehrung starten',
                    stopLabel: 'Ausfuehrung anhalten',
                },
            },
        }

        const markup = renderEditor(3, localized)
        expect(markup).toContain('Geoeffnete Arbeitsbereichsdateien mit einem absichtlich sehr langen lokalisierten Namen')
        expect(markup).toContain('Ausfuehrung starten')
        expect(markup).not.toContain('aria-label="Open files"')
    })

    test('handles empty, stale, duplicate, boundary, and over-bound list data without fake records', () => {
        const code = requiredCode(HBAR_APP_UI_EDITOR_FIXTURES)
        const suggestions = requiredSuggestions(HBAR_APP_UI_EDITOR_FIXTURES)
        const staleAndDuplicateCode: HbarAppUiEditorContent = {
            ...HBAR_APP_UI_EDITOR_FIXTURES,
            referenceCode: undefined,
            referenceSuggestions: undefined,
            code: {
                ...code,
                activeFileId: 'missing-file',
                files: [
                    {id: 'first', name: 'first.ts', source: 'const first = true;'},
                    {id: 'first', name: 'duplicate.ts', source: 'const duplicate = true;'},
                ],
            },
            suggestions: {...suggestions, suggestions: []},
        }

        const codeMarkup = renderEditor(3, staleAndDuplicateCode)
        const emptySuggestionMarkup = renderEditor(4, staleAndDuplicateCode)
        expect(codeMarkup).toContain('first.ts')
        expect(codeMarkup).not.toContain('duplicate.ts')
        expect(codeMarkup).toContain('aria-selected="true"')
        expect(emptySuggestionMarkup).toContain(suggestions.labels.emptySuggestionsLabel)

        const boundaryItems = Array.from({length: suggestions.listStrategy.expectedMaximum}, (_, index) => ({
            id: `boundary-${index}`,
            initials: 'AB',
            author: `Author ${index}`,
            age: `${index}`,
            selected: `${index}`,
            detail: `${index}`,
            primaryAction: 'accept' as const,
        }))
        const overBoundItems = [...boundaryItems, {
            id: 'boundary-over', initials: 'AB', author: 'Over bound', age: '4', selected: '4', detail: '4', primaryAction: 'accept' as const,
        }]
        const boundaryContent: HbarAppUiEditorContent = {
            ...HBAR_APP_UI_EDITOR_FIXTURES,
            referenceSuggestions: undefined,
            suggestions: {...suggestions, suggestions: boundaryItems},
        }
        const overBoundContent: HbarAppUiEditorContent = {
            ...HBAR_APP_UI_EDITOR_FIXTURES,
            referenceSuggestions: undefined,
            suggestions: {...suggestions, suggestions: overBoundItems},
        }
        expect(renderEditor(4, boundaryContent).match(/hbar-app-ui-editor-suggestion-card/g)).toHaveLength(3)
        expect(renderEditor(4, overBoundContent).match(/hbar-app-ui-editor-suggestion-card/g)).toHaveLength(4)
    })

    test('uses explicit safe selection and stable-ID de-duplication helpers for mutated host lists', () => {
        const items = [
            {id: 'kept', value: 'first'},
            {id: 'kept', value: 'duplicate'},
            {id: 'other', value: 'second'},
        ]
        const unique = uniqueHbarAppUiEditorItems(items)

        expect(unique).toEqual([{id: 'kept', value: 'first'}, {id: 'other', value: 'second'}])
        expect(selectHbarAppUiEditorItem(unique, 'missing')).toEqual({id: 'kept', value: 'first'})
        expect(selectHbarAppUiEditorItem([], 'missing')).toBeUndefined()
    })
})
