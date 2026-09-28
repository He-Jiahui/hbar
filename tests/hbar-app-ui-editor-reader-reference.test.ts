import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenEditor05 } from '@lumen/app-ui'
import {
  uniqueHbarAppUiReaderReferenceSections,
  type HbarAppUiReaderReferenceContent,
} from '../packages/hbar-app-ui/src/index'
import { createReaderEditorPreviewStore } from '../apps/hbar-app-ui-preview/src/readerEditorPreviewStore'
import {
  HBAR_APP_UI_EDITOR_FIXTURES,
  createHbarAppUiEditorLocalizedFixtures,
  createHbarAppUiEditorOverflowFixtures,
} from './fixtures/hbar-app-ui-editor-fixtures'

function required(content = HBAR_APP_UI_EDITOR_FIXTURES): HbarAppUiReaderReferenceContent {
  if (!content.referenceReader) throw new Error('Expected reader reference fixture')
  return content.referenceReader
}
function render(content: HbarAppUiReaderReferenceContent): string {
  return renderToStaticMarkup(createElement(LumenEditor05, { content: { referenceReader: content } }))
}

describe('source reader preview and host contract', () => {
  test('keeps the outline, banner, breadcrumb and tiered flowing document sections', () => {
    const html = render(required())
    expect(html).toContain('role="banner"')
    expect(html).toContain('aria-label="Document outline"')
    expect(html).toContain('<h2>Access ledger</h2>')
    expect(html).toContain('<h3>Immutability</h3>')
    expect(html).toContain('<h2>Reading the ledger</h2>')
    expect(html.match(/<section class=/g)).toHaveLength(7)
    expect(html).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(html).toContain('aria-current="true"')
    expect(html).toContain('aria-pressed="true"')
  })
  test('selects an original section ID without scrolling or changing independent focus and outline states', () => {
    const content = required()
    const store = createReaderEditorPreviewStore(content)
    store.getState().selectSection(content.documentId, 'retention')
    expect(store.getState().selectedSectionId).toBe('retention')
    expect(store.getState().focusMode).toBe(true)
    expect(store.getState().outlineOpen).toBe(true)
    store.getState().setFocusMode(content.documentId, false)
    store.getState().setOutlineOpen(content.documentId, false)
    expect(store.getState().selectedSectionId).toBe('retention')
    const state = store.getState()
    const html = render({
      ...content,
      sections: state.sections,
      selectedSectionId: state.selectedSectionId,
      focusMode: state.focusMode,
      outlineOpen: state.outlineOpen,
    })
    expect(html).toContain('data-open="false"')
    expect(html).not.toContain('is-dimmed')
    expect(html).toContain('aria-pressed="false"')
    store.getState().setOutlineOpen(content.documentId, true)
    expect(store.getState().selectedSectionId).toBe('retention')
  })
  test('ignores stale document and section IDs while a replacement document is mounted', () => {
    const content = required()
    const store = createReaderEditorPreviewStore(content)
    store.getState().selectSection(content.documentId, 'missing')
    expect(store.getState().selectedSectionId).toBe('immutability')
    store.getState().reset({ ...content, documentId: 'replacement', selectedSectionId: 'absent' })
    store.getState().setFocusMode(content.documentId, false)
    store.getState().setOutlineOpen(content.documentId, false)
    store.getState().selectSection(content.documentId, 'retention')
    expect(store.getState().selectedSectionId).toBe('access')
    expect(store.getState().focusMode).toBe(true)
    expect(store.getState().outlineOpen).toBe(true)
  })
  test('deduplicates IDs and respects empty, one, boundary and over-bound host records', () => {
    const content = required()
    const one = content.sections[0]!
    expect(uniqueHbarAppUiReaderReferenceSections([one, { ...one, title: 'duplicate' }])).toEqual([one])
    expect(render({ ...content, sections: [], selectedSectionId: undefined })).toContain(
      content.labels.emptyOutlineLabel,
    )
    expect(render({ ...content, sections: [one] }).match(/<h2>/g)).toHaveLength(1)
    expect(render(content).match(/<section class=/g)).toHaveLength(content.listStrategy.expectedMaximum)
    const overflow = required(createHbarAppUiEditorOverflowFixtures())
    expect(render(overflow).match(/<section class=/g)).toHaveLength(28)
    expect(render(overflow)).toContain('Rate limits 27')
    expect(render(overflow)).toContain('data-hbar-app-ui-expected-maximum="7"')
  })
  test('takes all visible copy and section headings from a localized host fixture', () => {
    const content = required(createHbarAppUiEditorLocalizedFixtures())
    const html = render(content)
    expect(html).toContain('Ausfuehrliches Handbuch fuer Arbeitsbereiche')
    expect(html).toContain('Fokusmodus mit langer Bezeichnung')
    expect(html).toContain('Abschnitt Access ledger mit erweiterter Bezeichnung')
    expect(html).toContain('7 Abschnitte')
    expect(html).not.toContain('>Focus</button>')
  })
  test('retains the pre-existing reader contract when referenceReader is absent', () => {
    const legacy = HBAR_APP_UI_EDITOR_FIXTURES.reader
    if (!legacy) throw new Error('Expected legacy reader fixture')
    const html = renderToStaticMarkup(createElement(LumenEditor05, { content: { reader: legacy } }))
    expect(html).toContain('hbar-app-ui-editor-reader-outline')
    expect(html).toContain('Reading the ledger')
  })
})
