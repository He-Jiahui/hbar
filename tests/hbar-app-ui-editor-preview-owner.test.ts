import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useLumenEditorContent } from '@lumen/app-ui'
import { getHbarAppUiVariant } from '../packages/hbar-app-ui/src/index'
import { EditorPreviewHost } from '../apps/hbar-app-ui-preview/src/EditorPreviewHost'
import { createRichEditorPreviewStore } from '../apps/hbar-app-ui-preview/src/richEditorPreviewStore'
import { createMarkdownEditorPreviewStore } from '../apps/hbar-app-ui-preview/src/markdownEditorPreviewStore'
import { createCodeEditorPreviewStore } from '../apps/hbar-app-ui-preview/src/codeEditorPreviewStore'
import { createSuggestionsEditorPreviewStore } from '../apps/hbar-app-ui-preview/src/suggestionsEditorPreviewStore'
import { createReaderEditorPreviewStore } from '../apps/hbar-app-ui-preview/src/readerEditorPreviewStore'
import {
  projectRichEditorPreview,
  projectMarkdownEditorPreview,
  projectCodeEditorPreview,
  projectSuggestionsEditorPreview,
  projectReaderEditorPreview,
} from '../apps/hbar-app-ui-preview/src/editorPreviewProjection'
import {
  HBAR_APP_UI_EDITOR_FIXTURES as input,
  createHbarAppUiEditorLocalizedFixtures,
} from './fixtures/hbar-app-ui-editor-fixtures'

function ContentKeys() {
  return createElement('span', null, Object.keys(useLumenEditorContent() ?? {}).join(','))
}
describe('active Editor preview owners', () => {
  test('the Host supplies only the active rich and legacy keys and bypasses unrelated categories', () => {
    const keys = [
      'richText,referenceRichText',
      'markdown,referenceMarkdown',
      'code,referenceCode',
      'suggestions,referenceSuggestions',
      'reader,referenceReader',
    ]
    for (let variant = 1; variant <= 5; variant++) {
      const html = renderToStaticMarkup(
        createElement(EditorPreviewHost, {
          spec: getHbarAppUiVariant('editor', variant).spec,
          content: input,
          children: createElement(ContentKeys),
        }),
      )
      expect(html).toBe(`<span>${keys[variant - 1]!}</span>`)
    }
    const unrelated = renderToStaticMarkup(
      createElement(EditorPreviewHost, {
        spec: getHbarAppUiVariant('card', 1).spec,
        content: input,
        children: createElement(ContentKeys),
      }),
    )
    expect(unrelated).toBe('<span></span>')
  })
  test('rich projection binds live draft/status while retaining localized metadata and revision guards', () => {
    const localized = createHbarAppUiEditorLocalizedFixtures()
    const reference = localized.referenceRichText!
    const store = createRichEditorPreviewStore(reference)
    store.getState().edit({ documentId: reference.document.id, field: 'body', value: 'Alpha beta' })
    const revision = store.getState().saveRevision
    store.getState().beginSave(reference.document.id, revision)
    expect(projectRichEditorPreview(localized, store.getState()).referenceRichText?.status).toBe('Wird gespeichert…')
    store.getState().edit({ documentId: reference.document.id, field: 'title', value: 'Long localized owner title' })
    store.getState().finishSave(reference.document.id, revision)
    expect(store.getState().savePhase).toBe('pending')
    const projection = projectRichEditorPreview(localized, store.getState()).referenceRichText!
    expect(projection.document.title).toBe('Long localized owner title')
    expect(projection.document.metadata).toBe(reference.document.metadata)
    expect(projection.labels.wordCount(projection.document.body)).toBe('2 Woerter')
    expect(Object.keys(projectRichEditorPreview({}, createRichEditorPreviewStore(undefined).getState()))).toEqual([
      'richText',
      'referenceRichText',
    ])
  })
  test('replacement input with the same document ID has an independent markdown owner', () => {
    const content = input.referenceMarkdown!
    const old = createMarkdownEditorPreviewStore(content)
    const oldCallback = projectMarkdownEditorPreview(input, old.getState()).referenceMarkdown!.onSourceChange!
    const replacement = {
      ...input,
      referenceMarkdown: { ...content, document: { ...content.document, source: '# Replacement document' } },
    }
    const current = createMarkdownEditorPreviewStore(replacement.referenceMarkdown)
    oldCallback(content.document.id, '# Old callback')
    current.getState().selectMode(content.document.id, 'preview')
    expect(projectMarkdownEditorPreview(replacement, current.getState()).referenceMarkdown?.document.source).toBe(
      '# Replacement document',
    )
    expect(projectMarkdownEditorPreview(replacement, current.getState()).referenceMarkdown?.mode).toBe('preview')
    expect(input.referenceMarkdown!.document.source).not.toBe('# Old callback')
  })
  test('code projection keeps read-only source, exact file actions and Run without fake execution', () => {
    const store = createCodeEditorPreviewStore(input.referenceCode)
    const initial = projectCodeEditorPreview(input, store.getState()).referenceCode!
    initial.onCloseFile?.('meter')
    initial.onCursorChange?.('meter', 1, 12)
    const next = projectCodeEditorPreview(input, store.getState()).referenceCode!
    expect(next.activeFileId).toBe('ledger')
    expect(next.files.map((file) => file.id)).toEqual(['ledger', 'types'])
    const state = store.getState()
    next.onRun?.()
    expect(store.getState()).toBe(state)
    expect(Object.keys(projectCodeEditorPreview(input, state))).toEqual(['code', 'referenceCode'])
  })
  test('review completion and restore share the same ID-bound decisions; reader flags remain independent', () => {
    const review = createSuggestionsEditorPreviewStore(input.referenceSuggestions)
    const documentId = input.referenceSuggestions!.document.id
    projectSuggestionsEditorPreview(input, review.getState()).referenceSuggestions!.onAcceptAll?.(documentId)
    expect(Object.values(review.getState().decisions).every((decision) => decision === 'accept')).toBe(true)
    projectSuggestionsEditorPreview(input, review.getState()).referenceSuggestions!.onRestore?.(documentId)
    expect(review.getState().decisions).toEqual({})
    const reader = createReaderEditorPreviewStore(input.referenceReader)
    const readerId = input.referenceReader!.documentId
    const projection = projectReaderEditorPreview(input, reader.getState()).referenceReader!
    projection.onSelectSection?.(readerId, 'retention')
    projection.onFocusModeChange?.(readerId, false)
    projection.onOutlineOpenChange?.(readerId, false)
    expect(projectReaderEditorPreview(input, reader.getState()).referenceReader).toMatchObject({
      selectedSectionId: 'retention',
      focusMode: false,
      outlineOpen: false,
    })
    expect(reader.getState().sections).toEqual(input.referenceReader!.sections)
    expect(Object.keys(projectReaderEditorPreview(input, reader.getState()))).toEqual(['reader', 'referenceReader'])
  })
})
