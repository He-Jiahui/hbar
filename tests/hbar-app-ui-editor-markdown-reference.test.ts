import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenEditor02 } from '@lumen/app-ui'
import {
  countHbarAppUiMarkdownWords,
  parseHbarAppUiReferenceMarkdown,
  type HbarAppUiMarkdownReferenceContent,
} from '../packages/hbar-app-ui/src/index'
import { createMarkdownEditorPreviewStore } from '../apps/hbar-app-ui-preview/src/markdownEditorPreviewStore'
import {
  HBAR_APP_UI_EDITOR_FIXTURES,
  createHbarAppUiEditorLocalizedFixtures,
  createHbarAppUiEditorOverflowFixtures,
} from './fixtures/hbar-app-ui-editor-fixtures'

function required(content = HBAR_APP_UI_EDITOR_FIXTURES): HbarAppUiMarkdownReferenceContent {
  if (!content.referenceMarkdown) throw new Error('Expected source Markdown fixture')
  return content.referenceMarkdown
}
function render(content: HbarAppUiMarkdownReferenceContent): string {
  return renderToStaticMarkup(createElement(LumenEditor02, { content: { referenceMarkdown: content } }))
}

describe('source Markdown editor and host contract', () => {
  test('keeps source tab semantics, native textarea and source-derived summary in flowing panes', () => {
    const content = required()
    const html = render({ ...content, onSourceChange: () => undefined })
    expect(html).toContain('role="banner"')
    expect(html).toContain('streaming-meter.md')
    expect(html).toContain('129 words · Markdown')
    expect(html).toContain('role="tablist" aria-label="Editor view"')
    expect(html).toContain('role="tab" aria-selected="true"')
    expect(html).toContain('aria-label="Markdown source"')
    expect(html).toContain('<h3>Migrating to the streaming meter</h3>')
    expect(html).toContain('<strong>ten seconds</strong>')
    expect(html).toContain('<em>unchanged</em>')
    expect(html).toContain('<code>v1/usage</code>')
    expect(html).toContain('data-boundary="none"')
    expect(html).not.toContain('readOnly=""')
  })
  test('uses only observed Markdown subset and escapes untrusted text without fabricating links or HTML', () => {
    const source =
      '# Head\n\n## Section\n\n### Small\n\nAlpha line\nBeta line\n\n- First **strong**\n- Second *em*\n\n7. Seven\n8. Eight\n\n> Quote\n> Second line\n\n`code` [link](https://example.invalid) <script>alert(1)</script>\n\n---'
    const blocks = parseHbarAppUiReferenceMarkdown(source)
    expect(blocks.map((block) => block.kind)).toEqual([
      'heading',
      'subheading',
      'paragraph',
      'paragraph',
      'bullets',
      'numbers',
      'quote',
      'paragraph',
      'paragraph',
    ])
    const numbers = blocks.find((block) => block.kind === 'numbers')
    expect(numbers?.kind === 'numbers' && numbers.items.map((item) => item.marker)).toEqual(['1.', '2.'])
    const html = render({ ...required(), document: { ...required().document, source } })
    expect(html).toContain('<h3>Head</h3>')
    expect(html).toContain('<h4>Section</h4>')
    expect(html).toContain('### Small')
    expect(html).toContain('<strong>strong</strong>')
    expect(html).toContain('<em>em</em>')
    expect(html).toContain('<code>code</code>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<a href=')
    expect(html).not.toContain('<script>')
    expect(html).toContain('7. Seven')
    expect(html).toContain('8. Eight')
  })
  test('raw source counts include Markdown symbols and remain current after editing and mode changes', () => {
    const content = required()
    const store = createMarkdownEditorPreviewStore(content)
    store.getState().edit(content.document.id, '# Changed note\n\nAlpha **beta** and *gamma*.')
    const source = store.getState().document?.source ?? ''
    expect(countHbarAppUiMarkdownWords(source)).toBe(7)
    expect(parseHbarAppUiReferenceMarkdown(source)[0]?.kind).toBe('heading')
    store.getState().selectMode(content.document.id, 'preview')
    const document = store.getState().document
    if (!document) throw new Error('Expected controlled document')
    expect(render({ ...content, document, mode: store.getState().mode })).toContain(
      'lumen-markdown-reference-mode-preview',
    )
    expect(store.getState().document?.source).toBe(source)
    store.getState().selectMode(content.document.id, 'write')
    expect(store.getState().document?.source).toBe(source)
    expect(countHbarAppUiMarkdownWords('')).toBe(0)
    expect(parseHbarAppUiReferenceMarkdown('')).toEqual([])
  })
  test('late callbacks after switching documents cannot edit the new source or mode', () => {
    const content = required()
    const store = createMarkdownEditorPreviewStore(content)
    const next = {
      ...content,
      document: { ...content.document, id: 'different-doc', source: 'New source' },
      mode: 'write' as const,
    }
    store.getState().reset(next)
    store.getState().edit(content.document.id, 'Old response')
    store.getState().selectMode(content.document.id, 'preview')
    expect(store.getState().document).toEqual(next.document)
    expect(store.getState().mode).toBe('write')
    store.getState().reset(undefined)
    store.getState().edit(next.document.id, 'Late response')
    expect(store.getState().document).toBeUndefined()
  })
  test('empty, single and beyond-bound sources preserve content under pane-owned scroll strategy', () => {
    const content = required()
    expect(render({ ...content, document: { ...content.document, source: '' } })).toContain('0 words · Markdown')
    expect(render({ ...content, document: { ...content.document, source: 'One' } })).toContain('1 words · Markdown')
    const boundary = Array.from({ length: content.paneStrategy.expectedMaximumWords }, () => 'word').join(' ')
    const over = `${boundary} last`
    expect(countHbarAppUiMarkdownWords(over)).toBe(content.paneStrategy.expectedMaximumWords + 1)
    expect(render({ ...content, document: { ...content.document, source: over } })).toContain('last')
    expect(render(required(createHbarAppUiEditorOverflowFixtures()))).toContain('Final editable paragraph')
    expect(render(content)).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
  })
  test('host-provided localization and read-only/error/recovery copy are rendered without English fallback', () => {
    const content = required(createHbarAppUiEditorLocalizedFixtures())
    const html = render(content)
    expect(html).toContain('Bearbeitungsmodus mit absichtlich langer lokalisierter Bezeichnung')
    expect(html).toContain('aria-label="Markdown-Quelltext"')
    expect(html).toContain('arbeitsbereichsweite-streaming-zaehler-migration.md')
    expect(html).not.toContain('aria-label="Markdown source"')
    expect(render({ ...content, onSourceChange: undefined })).toContain('readOnly=""')
    for (const summary of ['Speichern fehlgeschlagen', 'Erneut versuchen', 'Gespeichert']) {
      const output = render({ ...content, labels: { ...content.labels, summary: () => summary } })
      expect(output).toContain(summary)
    }
  })
})
