import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenEditor01, uniqueLumenRichEditorBlocks } from '@lumen/app-ui'
import type { HbarAppUiRichEditorReferenceContent } from '../packages/hbar-app-ui/src/index'
import { createRichEditorPreviewStore } from '../apps/hbar-app-ui-preview/src/richEditorPreviewStore'
import {
  HBAR_APP_UI_EDITOR_FIXTURES,
  createHbarAppUiEditorLocalizedFixtures,
  createHbarAppUiEditorOverflowFixtures,
} from './fixtures/hbar-app-ui-editor-fixtures'

function required(content = HBAR_APP_UI_EDITOR_FIXTURES): HbarAppUiRichEditorReferenceContent {
  if (!content.referenceRichText) throw new Error('Expected rich editor fixture')
  return content.referenceRichText
}
function render(content: HbarAppUiRichEditorReferenceContent): string {
  return renderToStaticMarkup(createElement(LumenEditor01, { content: { referenceRichText: content } }))
}

describe('source rich editor contract and Host state', () => {
  test('renders source native fields, independent pressed controls and semantic footer without a second draft', () => {
    const fixture = required()
    const markup = render(fixture)
    expect(markup).toContain('lumen-rich-editor-reference')
    expect(markup).toContain('placeholder="Untitled"')
    expect(markup).toContain('aria-label="Document body"')
    expect(markup).toContain('aria-label="Bold" aria-pressed="true"')
    expect(markup).toContain('aria-label="Link" aria-pressed="false"')
    expect(markup).toContain('role="contentinfo"')
    expect(markup).toContain('76 words')
    expect(markup).toContain('454 characters')
    expect(markup).toContain('data-boundary="none"')
    expect(markup).not.toContain('Unsaved changes')
  })
  test('edits only the original document, derives live counters and retains source metadata/status', () => {
    const fixture = required()
    const store = createRichEditorPreviewStore(fixture)
    store.getState().edit({ documentId: fixture.document.id, field: 'body', value: '  Alpha\n beta  ' })
    const body = store.getState().document?.body ?? ''
    expect(fixture.labels.wordCount(body)).toBe('2 words')
    expect(fixture.labels.characterCount(body)).toBe('15 characters')
    expect(store.getState().document?.metadata).toBe(fixture.document.metadata)
    store.getState().edit({ documentId: fixture.document.id, field: 'title', value: 'Edited title' })
    expect(store.getState().document?.title).toBe('Edited title')
    expect(store.getState().document?.body).toBe(body)
    expect(fixture.status).toBe('Saved')
    store.getState().edit({ documentId: fixture.document.id, field: 'body', value: '' })
    expect(fixture.labels.wordCount(store.getState().document?.body ?? '')).toBe('0 words')
    expect(fixture.labels.readingTime('')).toBe('1 min read')
    expect(fixture.labels.readingTime(Array.from({ length: 329 }, () => 'word').join(' '))).toBe('1 min read')
    expect(fixture.labels.readingTime(Array.from({ length: 330 }, () => 'word').join(' '))).toBe('2 min read')
  })
  test('formatting toggles and block labels are independent, with no fake document transformations', () => {
    const fixture = required()
    const store = createRichEditorPreviewStore(fixture)
    const doc = store.getState().document
    store.getState().toggleFormat(fixture.document.id, 'italic')
    store.getState().toggleFormat(fixture.document.id, 'bold')
    store.getState().toggleFormat(fixture.document.id, 'link')
    expect(store.getState().pressed.italic).toBe(true)
    expect(store.getState().pressed.bold).toBe(false)
    expect(store.getState().pressed.link).toBe(true)
    store.getState().selectBlock(fixture.document.id, 'heading-1')
    expect(store.getState().blockId).toBe('heading-1')
    expect(store.getState().document).toBe(doc)
    store.getState().toggleFormat(fixture.document.id, 'italic')
    expect(store.getState().pressed.italic).toBe(false)
  })
  test('preview save labels settle only the latest revision and do not create a persistence receipt', () => {
    const fixture = required()
    const store = createRichEditorPreviewStore(fixture)
    store.getState().edit({ documentId: fixture.document.id, field: 'title', value: 'First draft' })
    expect(store.getState().savePhase).toBe('pending')
    const first = store.getState().saveRevision
    store.getState().beginSave(fixture.document.id, first)
    expect(store.getState().savePhase).toBe('saving')
    store.getState().edit({ documentId: fixture.document.id, field: 'title', value: 'Newer draft' })
    const second = store.getState().saveRevision
    store.getState().finishSave(fixture.document.id, first)
    expect(store.getState().savePhase).toBe('pending')
    store.getState().beginSave(fixture.document.id, second)
    store.getState().finishSave(fixture.document.id, second)
    expect(store.getState().savePhase).toBe('saved')
    expect(store.getState().document?.title).toBe('Newer draft')
    store.getState().reset(undefined)
    store.getState().beginSave(fixture.document.id, second)
    store.getState().finishSave(fixture.document.id, second)
    expect(store.getState().savePhase).toBe('saved')
  })
  test('late callbacks cannot edit another document after reset or target a deleted block', () => {
    const fixture = required()
    const store = createRichEditorPreviewStore(fixture)
    const other = {
      ...fixture,
      document: { ...fixture.document, id: 'other-doc' },
      blocks: [{ id: 'other-block', label: 'Other block' }],
      blockId: 'other-block',
    }
    store.getState().reset(other)
    store.getState().edit({ documentId: fixture.document.id, field: 'body', value: 'Late edit' })
    store.getState().selectBlock(fixture.document.id, 'heading-1')
    store.getState().toggleFormat(fixture.document.id, 'bold')
    expect(store.getState().document).toEqual(other.document)
    expect(store.getState().blockId).toBe('other-block')
    expect(store.getState().pressed).toEqual(other.pressed)
    store.getState().selectBlock(other.document.id, 'heading-1')
    expect(store.getState().blockId).toBe('other-block')
    store.getState().reset(undefined)
    store.getState().edit({ documentId: other.document.id, field: 'body', value: 'Removed document' })
    expect(store.getState().document).toBeUndefined()
  })
  test('empty, one, boundary, over-bound, stale and duplicate block records retain explicit safe selection', () => {
    const fixture = required()
    expect(render({ ...fixture, blocks: [] })).toContain('disabled=""')
    expect(render({ ...fixture, blocks: [] })).toContain('No block styles')
    const one = { id: 'custom', label: 'Supplied block' }
    expect(render({ ...fixture, blocks: [one], blockId: 'stale' })).toContain('Supplied block')
    expect(uniqueLumenRichEditorBlocks([one, { ...one, label: 'Duplicate' }])).toEqual([one])
    expect(fixture.blocks).toHaveLength(fixture.blockStrategy.expectedMaximum)
    const over = [...fixture.blocks, one]
    expect(uniqueLumenRichEditorBlocks(over)).toHaveLength(fixture.blockStrategy.expectedMaximum + 1)
    expect(render({ ...fixture, blocks: over, blockId: one.id })).toContain('Supplied block')
  })
  test('host localization, editable data and save/failure/recovery feedback remain visible without English fallback', () => {
    const localized = required(createHbarAppUiEditorLocalizedFixtures())
    const markup = render(localized)
    expect(markup).toContain('aria-label="Dokumenttitel"')
    expect(markup).toContain('aria-label="Rueckgaengig"')
    expect(markup).toContain('Gespeichert')
    expect(markup).toContain('Lokalisierter Absatzstil mit absichtlich sehr langer Bezeichnung')
    expect(markup).not.toContain('aria-label="Document title"')
    expect(markup).not.toContain('>Saved<')
    for (const status of ['Wird gespeichert', 'Speichern fehlgeschlagen', 'Gespeichert'])
      expect(render({ ...localized, status })).toContain(status)
    const writable = render({ ...localized, onChange: () => undefined })
    expect(writable).not.toContain('readOnly=""')
    expect(render({ ...localized, onChange: undefined })).toContain('readOnly=""')
  })
  test('extended menus and long documents preserve all host content for pane-owned scroll', () => {
    const overflow = required(createHbarAppUiEditorOverflowFixtures())
    expect(overflow.blocks.length).toBeGreaterThan(overflow.blockStrategy.expectedMaximum)
    expect(render(overflow)).toContain('Last editable paragraph')
    const store = createRichEditorPreviewStore(overflow)
    const last = overflow.blocks.at(-1)
    if (!last) throw new Error('Expected last host block')
    store.getState().selectBlock(overflow.document.id, last.id)
    expect(render({ ...overflow, blockId: store.getState().blockId })).toContain(last.label)
  })
})
