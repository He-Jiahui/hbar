import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiMobileProvider,
  selectHbarAppUiMobileItem,
  uniqueHbarAppUiMobileItems,
  type HbarAppUiMobileContent,
} from '../packages/hbar-app-ui/src/index'
import {
  createHbarAppUiMobileLocalizedFixtures,
  HBAR_APP_UI_MOBILE_FIXTURES,
} from './fixtures/hbar-app-ui-mobile-fixtures'

function render(variant: number, content: HbarAppUiMobileContent = HBAR_APP_UI_MOBILE_FIXTURES) {
  return renderToStaticMarkup(
    createElement(HbarAppUiMobileProvider, {
      content,
      children: createElement(getHbarAppUiVariant('mobile', variant).component, {}),
    }),
  )
}

describe('hbar-app-ui mobile surfaces', () => {
  test('renders five distinct Lumen mobile workflows from host content', () => {
    const values = Array.from({ length: 5 }, (_, index) => render(index + 1))
    expect(new Set(values).size).toBe(5)
    values.forEach((value, index) => {
      expect(value).toContain('data-lumen-component="mobile"')
      expect(value).toContain(`data-lumen-variant="${index + 1}"`)
      expect(value).not.toContain('lucide')
      expect(value).not.toContain('hbar-app-ui-button')
    })
  })

  test('renders localized copy exclusively from the host contract', () => {
    const value = render(1, createHbarAppUiMobileLocalizedFixtures())
    expect(value).toContain('水星工作台')
    expect(value).toContain('Northwind 续约')
    expect(value).not.toContain('Meridian')
  })

  test('deduplicates IDs and recovers stale selections deterministically', () => {
    const items = [
      { id: 'first', label: 'First' },
      { id: 'first', label: 'Duplicate' },
      { id: 'second', label: 'Second' },
    ]
    expect(uniqueHbarAppUiMobileItems(items)).toEqual([
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
    ])
    expect(selectHbarAppUiMobileItem(items, 'missing')).toBe(items[0])
  })

  test('honors empty mobile feeds and explicit capacity strategies', () => {
    const content: HbarAppUiMobileContent = {
      ...HBAR_APP_UI_MOBILE_FIXTURES,
      home: { ...HBAR_APP_UI_MOBILE_FIXTURES.home!, cards: [] },
      orders: { ...HBAR_APP_UI_MOBILE_FIXTURES.orders!, orders: [] },
    }
    expect(render(3, content)).toContain('No home updates')
    expect(render(4, content)).toContain('No orders')
    expect(render(1)).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(render(5)).toContain('data-hbar-app-ui-list-strategy="content-grown"')
  })
})
