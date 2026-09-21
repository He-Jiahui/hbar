import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiNotificationsProvider,
  selectHbarAppUiNotificationsItem,
  uniqueHbarAppUiNotificationsItems,
  type HbarAppUiNotificationsContent,
} from '../packages/hbar-app-ui/src/index'
import {
  createHbarAppUiNotificationsLocalizedFixtures,
  HBAR_APP_UI_NOTIFICATIONS_FIXTURES,
} from './fixtures/hbar-app-ui-notifications-fixtures'

function render(variant: number, content: HbarAppUiNotificationsContent = HBAR_APP_UI_NOTIFICATIONS_FIXTURES) {
  return renderToStaticMarkup(
    createElement(HbarAppUiNotificationsProvider, {
      content,
      children: createElement(getHbarAppUiVariant('notifications', variant).component, {}),
    }),
  )
}

describe('hbar-app-ui notification surfaces', () => {
  test('renders six distinct Lumen notification workflows from host content', () => {
    const values = Array.from({ length: 6 }, (_, index) => render(index + 1))
    expect(new Set(values).size).toBe(6)
    values.forEach((value, index) => {
      expect(value).toContain('data-lumen-component="notifications"')
      expect(value).toContain(`data-lumen-variant="${index + 1}"`)
      expect(value).not.toContain('lucide')
      expect(value).not.toContain('hbar-app-ui-button')
    })
  })

  test('renders localized copy exclusively from the host contract', () => {
    const value = render(1, createHbarAppUiNotificationsLocalizedFixtures())
    expect(value).toContain('通知')
    expect(value).toContain('今天')
    expect(value).not.toContain('Notifications')
  })

  test('deduplicates IDs and recovers stale selections deterministically', () => {
    const items = [
      { id: 'first', label: 'First' },
      { id: 'first', label: 'Duplicate' },
      { id: 'second', label: 'Second' },
    ]
    expect(uniqueHbarAppUiNotificationsItems(items)).toEqual([
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
    ])
    expect(selectHbarAppUiNotificationsItem(items, 'missing')).toBe(items[0])
  })

  test('honors empty feeds and explicit capacity strategies', () => {
    const content: HbarAppUiNotificationsContent = {
      ...HBAR_APP_UI_NOTIFICATIONS_FIXTURES,
      center: { ...HBAR_APP_UI_NOTIFICATIONS_FIXTURES.center!, entries: [] },
      system: { ...HBAR_APP_UI_NOTIFICATIONS_FIXTURES.system!, messages: [] },
    }
    expect(render(1, content)).toContain('No notifications')
    expect(render(5, content)).toContain('No system messages')
    expect(render(1)).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(render(6)).toContain('data-hbar-app-ui-list-strategy="content-grown"')
  })
})
