import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenEditor05 } from '@lumen/app-ui'
import { LumenEditor01, LumenEditorProvider, selectLumenEditorItem, uniqueLumenEditorItems } from '@lumen/app-ui/catalog'
import { getLumenVariantComponent } from '@lumen/app-ui/catalog'
import { HbarAppUiEditorProvider } from '../packages/hbar-app-ui/src/index'
import { selectHbarAppUiEditorItem, uniqueHbarAppUiEditorItems } from '../packages/hbar-app-ui/src/components/editor/EditorContent'
import { HBAR_APP_UI_EDITOR_FIXTURES } from './fixtures/hbar-app-ui-editor-fixtures'

test('editor compatibility exports are canonical Lumen contracts', () => {
  expect(HbarAppUiEditorProvider).toBe(LumenEditorProvider)
  expect(selectHbarAppUiEditorItem).toBe(selectLumenEditorItem)
  expect(uniqueHbarAppUiEditorItems).toBe(uniqueLumenEditorItems)
  expect(getLumenVariantComponent('hbar-app-ui-editor-5')).toBe(LumenEditor05)
})
test('the canonical Lumen entry renders editor content and controls', () => {
  const markup = renderToStaticMarkup(createElement(LumenEditorProvider, {content: HBAR_APP_UI_EDITOR_FIXTURES, children: createElement(LumenEditor01)}))
  expect(markup).toContain('data-lumen-component="editor"')
  expect(markup).toContain('hbar-app-ui-editor-rich-text')
  expect(markup).toContain('Audit ledger design notes')
})
test('legacy editor implementations are retired', async () => {
  for (const file of ['CodeWorkspace.tsx','EditorPrimitives.tsx','EditorSurface.css','LongDocumentReader.tsx','MarkdownWorkspace.tsx','RichTextEditor.tsx','SuggestionReview.tsx']) {
    expect(await Bun.file(`packages/hbar-app-ui/src/components/editor/${file}`).exists()).toBe(false)
  }
})
