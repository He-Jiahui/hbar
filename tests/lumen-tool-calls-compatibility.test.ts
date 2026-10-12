import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenToolCalls01, LumenToolCalls06, LumenToolCallsProvider, selectLumenToolCallsItem, uniqueLumenToolCallsItems } from '@lumen/app-ui/catalog'
import { getLumenVariantComponent } from '@lumen/app-ui/catalog'
import {
  HbarAppUiToolCallsProvider,
  selectHbarAppUiToolCallsItem,
  uniqueHbarAppUiToolCallsItems,
} from '../packages/hbar-app-ui/src/index'
import { HBAR_APP_UI_TOOL_CALLS_FIXTURES } from './fixtures/hbar-app-ui-tool-calls-fixtures'

test('tool calls compatibility exports are canonical Lumen contracts', () => {
  expect(HbarAppUiToolCallsProvider).toBe(LumenToolCallsProvider)
  expect(selectHbarAppUiToolCallsItem).toBe(selectLumenToolCallsItem)
  expect(uniqueHbarAppUiToolCallsItems).toBe(uniqueLumenToolCallsItems)
  expect(getLumenVariantComponent('hbar-app-ui-tool-calls-6')).toBe(LumenToolCalls06)
})

test('the canonical Lumen entry renders tool workflow content and controls', () => {
  const markup = renderToStaticMarkup(
    createElement(LumenToolCallsProvider, {
      content: HBAR_APP_UI_TOOL_CALLS_FIXTURES,
      children: createElement(LumenToolCalls01),
    }),
  )

  expect(markup).toContain('data-lumen-component="tool-calls"')
  expect(markup).toContain('hbar-app-ui-tool-calls-trace')
  expect(markup).toContain('search_incidents')
  expect(markup).toContain('data-lumen-variant=')
})

test('the legacy tool calls implementation and stylesheet are retired', async () => {
  const retired = [
    'ToolActivity.tsx',
    'ToolCallsContent.tsx',
    'ToolCallsPrimitives.tsx',
    'ToolCallsSurface.css',
    'ToolCommandOutput.tsx',
    'ToolDiffResult.tsx',
    'ToolPermissions.tsx',
    'ToolSearchResults.tsx',
    'ToolTrace.tsx',
  ]

  for (const file of retired) {
    expect(await Bun.file(`packages/hbar-app-ui/src/components/tool-calls/${file}`).exists()).toBe(false)
  }
})
