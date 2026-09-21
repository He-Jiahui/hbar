import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiAiChatProvider,
  selectHbarAppUiAiChatItem,
  uniqueHbarAppUiAiChatItems,
  type HbarAppUiAiChatContent,
} from '../packages/hbar-app-ui/src/index'
import {
  createHbarAppUiAiChatLocalizedFixtures,
  HBAR_APP_UI_AI_CHAT_FIXTURES,
} from './fixtures/hbar-app-ui-ai-chat-fixtures'
function render(variant: number, content: HbarAppUiAiChatContent = HBAR_APP_UI_AI_CHAT_FIXTURES) {
  return renderToStaticMarkup(
    createElement(HbarAppUiAiChatProvider, {
      content,
      children: createElement(getHbarAppUiVariant('ai-chat', variant).component, {}),
    }),
  )
}
describe('hbar-app-ui ai chat surfaces', () => {
  test('renders nine distinct Lumen chat workflows from host content', () => {
    const values = Array.from({ length: 9 }, (_, index) => render(index + 1))
    expect(new Set(values).size).toBe(9)
    values.forEach((value, index) => {
      expect(value).toContain('data-lumen-component="ai-chat"')
      expect(value).toContain(`data-lumen-variant="${index + 1}"`)
      expect(value).not.toContain('lucide')
      expect(value).not.toContain('hbar-app-ui-button')
    })
  })
  test('renders localized copy exclusively from the host contract', () => {
    const value = render(1, createHbarAppUiAiChatLocalizedFixtures())
    expect(value).toContain('工作区助手')
    expect(value).toContain('我已经整理好交接说明')
    expect(value).not.toContain('Workspace assistant')
  })
  test('deduplicates IDs and recovers stale selections deterministically', () => {
    const items = [
      { id: 'first', label: 'First' },
      { id: 'first', label: 'Duplicate' },
      { id: 'second', label: 'Second' },
    ]
    expect(uniqueHbarAppUiAiChatItems(items)).toEqual([
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
    ])
    expect(selectHbarAppUiAiChatItem(items, 'missing')).toBe(items[0])
  })
  test('honors empty chat records and explicit pane capacity', () => {
    const content: HbarAppUiAiChatContent = {
      ...HBAR_APP_UI_AI_CHAT_FIXTURES,
      messages: [],
      sources: [],
      providers: [],
    }
    expect(render(1, content)).toContain('No messages')
    expect(render(7, content)).toContain('No pinned sources')
    expect(render(9, content)).toContain('No providers')
    expect(render(1)).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
  })
})
