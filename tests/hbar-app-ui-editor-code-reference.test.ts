import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenEditor03 } from '@lumen/app-ui'
import {
  tokenizeHbarAppUiCodeLine,
  uniqueHbarAppUiCodeFiles,
  type HbarAppUiCodeReferenceContent,
} from '../packages/hbar-app-ui/src/index'
import { createCodeEditorPreviewStore } from '../apps/hbar-app-ui-preview/src/codeEditorPreviewStore'
import {
  HBAR_APP_UI_EDITOR_FIXTURES,
  createHbarAppUiEditorLocalizedFixtures,
  createHbarAppUiEditorOverflowFixtures,
} from './fixtures/hbar-app-ui-editor-fixtures'

function required(content = HBAR_APP_UI_EDITOR_FIXTURES): HbarAppUiCodeReferenceContent {
  if (!content.referenceCode) throw new Error('Expected source code fixture')
  return content.referenceCode
}
function render(content: HbarAppUiCodeReferenceContent): string {
  return renderToStaticMarkup(createElement(LumenEditor03, { content: { referenceCode: content } }))
}

describe('source code preview and host contract', () => {
  test('keeps visible file controls, safe highlighted lines, minimap and flowing footer', () => {
    const html = render({ ...required(), activeLine: required().cursor?.line })
    expect(html).toContain('meter.ts')
    expect(html).toContain('aria-label="Unsaved changes"')
    expect(html).toContain('aria-label="Close ledger.ts"')
    expect(html).toContain('aria-label="Code overview"')
    expect(html).toContain('lumen-code-reference-line is-active')
    expect(html).toContain('Ln 12, Col 0')
    expect(html).toContain('1 warning')
    expect(html).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(html).toContain('data-boundary="none"')
    expect(html).not.toContain('contenteditable=')
    expect(html).not.toContain('<textarea')
  })
  test('limited tokenizer retains every character and escapes untrusted code content', () => {
    const text = 'export const message: string = "<script>"; // comment'
    const tokens = tokenizeHbarAppUiCodeLine(text)
    expect(tokens.map((token) => token.value).join('')).toBe(text)
    expect(tokens.some((token) => token.kind === 'string' && token.value === '"<script>"')).toBe(true)
    expect(tokens.at(-1)?.kind).toBe('comment')
    const html = render({ ...required(), files: [{ id: 'x', name: 'x.ts', source: text }], activeFileId: 'x' })
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect(
      tokenizeHbarAppUiCodeLine('const WINDOW_MS = 10_000;').find((token) => token.value === 'WINDOW_MS')?.kind,
    ).toBe('plain')
  })
  test('selects by original ID, closes active/inactive files, and retains the final tab', () => {
    const content = required()
    const store = createCodeEditorPreviewStore(content)
    store.getState().selectFile('ledger')
    expect(store.getState().activeFileId).toBe('ledger')
    store.getState().closeFile('meter')
    expect(store.getState().files.map((file) => file.id)).toEqual(['ledger', 'types'])
    expect(store.getState().activeFileId).toBe('ledger')
    store.getState().closeFile('ledger')
    expect(store.getState().activeFileId).toBe('types')
    store.getState().closeFile('types')
    expect(store.getState().files.map((file) => file.id)).toEqual(['types'])
  })
  test('guards stale file/line callbacks and clamps columns within the active line', () => {
    const content = required()
    const store = createCodeEditorPreviewStore(content)
    store.getState().selectLine('meter', 6, 999)
    expect(store.getState().cursor).toEqual({ line: 6, column: content.files[0]!.source.split('\n')[5]!.length })
    store.getState().selectLine('ledger', 4, 10)
    store.getState().selectLine('meter', 1000, 10)
    expect(store.getState().cursor.line).toBe(6)
    store.getState().reset({ ...content, files: [content.files[2]!], activeFileId: 'types' })
    store.getState().closeFile('meter')
    store.getState().selectFile('meter')
    store.getState().selectLine('meter', 2, 2)
    expect(store.getState().files.map((file) => file.id)).toEqual(['types'])
    expect(store.getState().activeFileId).toBe('types')
    expect(store.getState().cursor).toEqual({ line: 12, column: 0 })
  })
  test('empty, single, duplicate, boundary and overflowing content preserve stable capacity metadata', () => {
    const content = required()
    const empty = { ...content, files: [], activeFileId: undefined }
    const one = { ...content, files: [content.files[0]!], activeFileId: 'meter' }
    expect(render(empty)).toContain('No open files')
    expect(createCodeEditorPreviewStore(empty).getState().activeFileId).toBeUndefined()
    expect(uniqueHbarAppUiCodeFiles([content.files[0]!, { ...content.files[0]!, name: 'duplicate' }])).toHaveLength(1)
    expect(render(one)).toContain('meter.ts')
    const bound = {
      ...content,
      files: [{ id: 'bound', name: 'bound.ts', source: 'x\n'.repeat(5000) }],
      activeFileId: 'bound',
    }
    expect(bound.files[0]!.source.split('\n')).toHaveLength(5001)
    const overflow = required(createHbarAppUiEditorOverflowFixtures())
    expect(overflow.files.at(-1)?.source).toContain('export const finalLine = true;')
    expect(render(overflow)).toContain('finalLine')
    expect(render(overflow)).toContain('data-hbar-app-ui-expected-maximum="5000"')
  })
  test('uses host-owned localized labels and file names without reusable English fallback', () => {
    const localized = required(createHbarAppUiEditorLocalizedFixtures())
    const html = render(localized)
    expect(html).toContain('arbeitsbereichsweite-streaming-zaehler-meter.ts')
    expect(html).toContain('Geoeffnete Dateien')
    expect(html).toContain('Ausfuehren')
    expect(html).toContain('Warnung')
    expect(html).not.toContain('>Run</button>')
  })
})
