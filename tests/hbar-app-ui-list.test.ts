import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiListProvider,
  selectHbarAppUiListItem,
  uniqueHbarAppUiListItems,
  type HbarAppUiListContent,
} from '../packages/hbar-app-ui/src/index'
import { createHbarAppUiListLocalizedFixtures, HBAR_APP_UI_LIST_FIXTURES } from './fixtures/hbar-app-ui-list-fixtures'

function render(variant: number, content: HbarAppUiListContent = HBAR_APP_UI_LIST_FIXTURES) {
  return renderToStaticMarkup(
    createElement(HbarAppUiListProvider, {
      content,
      children: createElement(getHbarAppUiVariant('list', variant).component, {}),
    }),
  )
}

describe('hbar-app-ui list surfaces', () => {
  test('renders twelve distinct Lumen list workflows from host content', () => {
    const values = Array.from({ length: 12 }, (_, index) => render(index + 1))
    expect(new Set(values).size).toBe(12)
    values.forEach((value, index) => {
      expect(value).toContain('data-lumen-component="list"')
      expect(value).toContain(`data-lumen-variant="${index + 1}"`)
      expect(value).not.toContain('lucide')
      expect(value).not.toContain('hbar-app-ui-button')
    })
  })

  test('renders localized copy exclusively from the host contract', () => {
    const value = render(1, createHbarAppUiListLocalizedFixtures())
    expect(value).toContain('指标定义')
    expect(value).toContain('活跃运行')
    expect(value).not.toContain('Defined metrics')
  })

  test('deduplicates IDs and recovers stale selections deterministically', () => {
    const items = [
      { id: 'first', label: 'First' },
      { id: 'first', label: 'Duplicate' },
      { id: 'second', label: 'Second' },
    ]
    expect(uniqueHbarAppUiListItems(items)).toEqual([
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
    ])
    expect(selectHbarAppUiListItem(items, 'missing')).toBe(items[0])
  })

  test('honors empty lists and explicit capacity strategies', () => {
    const content: HbarAppUiListContent = {
      ...HBAR_APP_UI_LIST_FIXTURES,
      metrics: { ...HBAR_APP_UI_LIST_FIXTURES.metrics!, items: [] },
      suppliers: { ...HBAR_APP_UI_LIST_FIXTURES.suppliers!, suppliers: [] },
    }
    expect(render(1, content)).toContain('No metrics')
    expect(render(7, content)).toContain('No suppliers match')
    expect(render(2)).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(render(4)).toContain('data-hbar-app-ui-list-strategy="content-grown"')
  })
})
