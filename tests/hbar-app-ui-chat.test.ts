import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiChatProvider,
  selectHbarAppUiChatItem,
  uniqueHbarAppUiChatItems,
  type HbarAppUiChatContent,
} from '../packages/hbar-app-ui/src/index'
import { createHbarAppUiChatLocalizedFixtures, HBAR_APP_UI_CHAT_FIXTURES } from './fixtures/hbar-app-ui-chat-fixtures'

function render(variant: number, content: HbarAppUiChatContent = HBAR_APP_UI_CHAT_FIXTURES) {
  return renderToStaticMarkup(
    createElement(HbarAppUiChatProvider, {
      content,
      children: createElement(getHbarAppUiVariant('chat', variant).component, {}),
    }),
  )
}

describe('hbar-app-ui chat surfaces', () => {
  test('renders six distinct Lumen chat workflows from host content', () => {
    const values = Array.from({ length: 6 }, (_, index) => render(index + 1))
    expect(new Set(values).size).toBe(6)
    values.forEach((value, index) => {
      expect(value).toContain('data-lumen-component="chat"')
      expect(value).toContain(`data-lumen-variant="${index + 1}"`)
      expect(value).not.toContain('lucide')
      expect(value).not.toContain('hbar-app-ui-button')
    })
  })

  test('renders localized copy exclusively from the host contract', () => {
    const value = render(1, createHbarAppUiChatLocalizedFixtures())
    expect(value).toContain('频道')
    expect(value).toContain('带线程的消息')
    expect(value).not.toContain('Threaded messages')
  })

  test('deduplicates IDs and recovers stale selections deterministically', () => {
    const items = [
      { id: 'first', label: 'First' },
      { id: 'first', label: 'Duplicate' },
      { id: 'second', label: 'Second' },
    ]
    expect(uniqueHbarAppUiChatItems(items)).toEqual([
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
    ])
    expect(selectHbarAppUiChatItem(items, 'missing')).toBe(items[0])
  })

  test('honors participant overflow and empty conversation boundaries', () => {
    const content: HbarAppUiChatContent = {
      ...HBAR_APP_UI_CHAT_FIXTURES,
      direct: {
        ...HBAR_APP_UI_CHAT_FIXTURES.direct!,
        contacts: [],
      },
      group: {
        ...HBAR_APP_UI_CHAT_FIXTURES.group!,
        maximumVisibleParticipants: 2,
      },
    }
    expect(render(2, content)).toContain('No contacts')
    const group = render(5, content)
    expect(group).toContain('+3')
    const participants = group.slice(group.indexOf('aria-label="Participants"'), group.indexOf('lumen-chat-message-list'))
    expect(participants).not.toContain('aria-hidden="true">J</span>')
  })
})
