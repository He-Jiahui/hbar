import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenEditor04 } from '@lumen/app-ui/catalog'
import {
  uniqueHbarAppUiReferenceSuggestions,
  type HbarAppUiSuggestionsReferenceContent,
} from '../packages/hbar-app-ui/src/index'
import { createSuggestionsEditorPreviewStore } from '../apps/hbar-app-ui-preview/src/suggestionsEditorPreviewStore'
import {
  HBAR_APP_UI_EDITOR_FIXTURES,
  createHbarAppUiEditorLocalizedFixtures,
  createHbarAppUiEditorOverflowFixtures,
} from './fixtures/hbar-app-ui-editor-fixtures'

function required(content = HBAR_APP_UI_EDITOR_FIXTURES): HbarAppUiSuggestionsReferenceContent {
  if (!content.referenceSuggestions) throw new Error('Expected source review fixture')
  return content.referenceSuggestions
}
function render(content: HbarAppUiSuggestionsReferenceContent): string {
  return renderToStaticMarkup(createElement(LumenEditor04, { content: { referenceSuggestions: content } }))
}

describe('source suggestions preview and host contract', () => {
  test('keeps document paragraphs, inline actionable ranges and semantic review cards', () => {
    const html = render(required())
    expect(html).toContain('role="banner"')
    expect(html).toContain('<h2>Streaming meter rollout</h2>')
    expect(html).toContain('should probably be rolled out slowly')
    expect(html).toContain('Suggestions')
    expect(html.match(/<article/g)).toHaveLength(3)
    expect(html).toContain('role="complementary"')
    expect(html).toContain('3 suggestions remaining')
    expect(html).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(html).toContain('data-boundary="none"')
  })
  test('accepting changes only the corresponding inline phrase, while resolve/dismiss leave it intact', () => {
    const content = required()
    const store = createSuggestionsEditorPreviewStore(content)
    store.getState().resolve(content.document.id, 'rollout', 'accept')
    let html = render({
      ...content,
      decisions: store.getState().decisions,
      selectedSuggestionId: store.getState().selectedSuggestionId,
    })
    expect(html).toContain('rolls out in three stages')
    expect(html).toContain('is-accepted')
    expect(html).not.toContain('>should probably be rolled out slowly</button>')
    expect(html.match(/<article/g)).toHaveLength(2)
    expect(store.getState().selectedSuggestionId).toBe('drift')
    store.getState().resolve(content.document.id, 'drift', 'resolve')
    store.getState().resolve(content.document.id, 'plans', 'dismiss')
    html = render({ ...content, decisions: store.getState().decisions })
    expect(html).toContain('a drift of under 0.5%')
    expect(html).toContain('customers on the bigger plans')
    expect(html).toContain('Review complete')
    expect(html).toContain('0 suggestions remaining')
  })
  test('selects by original ID, advances after removal, and preserves dismissed copy', () => {
    const content = required()
    const store = createSuggestionsEditorPreviewStore(content)
    store.getState().resolve(content.document.id, 'drift', 'dismiss')
    expect(store.getState().selectedSuggestionId).toBe('rollout')
    store.getState().reset(content)
    store.getState().select(content.document.id, 'plans')
    expect(store.getState().selectedSuggestionId).toBe('plans')
    store.getState().resolve(content.document.id, 'drift', 'dismiss')
    expect(store.getState().selectedSuggestionId).toBe('plans')
    expect(store.getState().decisions.drift).toBe('dismiss')
    store.getState().resolve(content.document.id, 'plans', 'accept')
    expect(store.getState().selectedSuggestionId).toBe('rollout')
  })
  test('Accept all reaches complete/Restore, with no stale callback corrupting a replacement document', () => {
    const content = required()
    const store = createSuggestionsEditorPreviewStore(content)
    store.getState().acceptAll(content.document.id)
    expect(Object.values(store.getState().decisions)).toEqual(['accept', 'accept', 'accept'])
    expect(store.getState().selectedSuggestionId).toBeUndefined()
    const other = { ...content, document: { ...content.document, id: 'other' } }
    store.getState().reset(other)
    store.getState().restore(content.document.id)
    store.getState().resolve(content.document.id, 'rollout', 'accept')
    store.getState().acceptAll(content.document.id)
    expect(store.getState().decisions).toEqual({})
    store.getState().acceptAll(other.document.id)
    store.getState().restore(other.document.id)
    expect(store.getState().selectedSuggestionId).toBe('rollout')
    expect(store.getState().decisions).toEqual({})
  })
  test('deduplicates IDs and handles empty, single, boundary and overflow records without embedding cards', () => {
    const content = required()
    const one = content.suggestions[0]!
    expect(uniqueHbarAppUiReferenceSuggestions([one, { ...one, author: 'duplicate' }])).toEqual([one])
    expect(render({ ...content, suggestions: [], selectedSuggestionId: undefined })).toContain(
      content.labels.completeTitle,
    )
    expect(render({ ...content, suggestions: [one] }).match(/<article/g)).toHaveLength(1)
    expect(render(content).match(/<article/g)).toHaveLength(content.paneStrategy.expectedMaximum)
    const overflow = required(createHbarAppUiEditorOverflowFixtures())
    expect(render(overflow).match(/<article/g)).toHaveLength(24)
    expect(render(overflow)).toContain('Wei Chen 23')
    expect(render(overflow)).toContain('data-hbar-app-ui-expected-maximum="3"')
  })
  test('host controls long localized labels, document data and completion/recovery copy', () => {
    const content = required(createHbarAppUiEditorLocalizedFixtures())
    const html = render(content)
    expect(html).toContain('Ausfuehrlicher Entwurf zur Streaming-Zaehler-Migration')
    expect(html).toContain('Alle annehmen')
    expect(html).toContain('Vorschlaege')
    expect(html).not.toContain('>Accept all</button>')
    expect(
      render({ ...content, decisions: Object.fromEntries(content.suggestions.map((item) => [item.id, 'accept'])) }),
    ).toContain('Pruefung abgeschlossen')
  })
})
