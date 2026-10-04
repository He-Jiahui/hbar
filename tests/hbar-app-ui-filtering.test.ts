import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiFilteringProvider,
  selectHbarAppUiFilteringItem,
  uniqueHbarAppUiFilteringItems,
  type HbarAppUiFilteringContent,
} from '../packages/hbar-app-ui/src/index'
import {
  createHbarAppUiFilteringLocalizedFixtures,
  HBAR_APP_UI_FILTERING_FIXTURES,
} from './fixtures/hbar-app-ui-filtering-fixtures'

function render(variant: number, content: HbarAppUiFilteringContent = HBAR_APP_UI_FILTERING_FIXTURES) {
  return renderToStaticMarkup(
    createElement(HbarAppUiFilteringProvider, {
      content,
      children: createElement(getHbarAppUiVariant('filtering', variant).component, {}),
    }),
  )
}

describe('hbar-app-ui filtering surfaces', () => {
  test('renders nine distinct Lumen filtering workflows from host content', () => {
    const values = Array.from({ length: 9 }, (_, index) => render(index + 1))
    expect(new Set(values).size).toBe(9)
    values.forEach((value, index) => {
      expect(value).toContain('data-lumen-component="filtering"')
      expect(value).toContain(`data-lumen-variant="${index + 1}"`)
      expect(value).not.toContain('lucide')
      expect(value).not.toContain('hbar-app-ui-button')
    })
  })

  test('renders localized copy exclusively from the host contract', () => {
    const value = render(2, createHbarAppUiFilteringLocalizedFixtures())
    expect(value).toContain('筛选抽屉')
    expect(value).toContain('128 个结果')
    expect(value).not.toContain('Scrollable body')
  })

  test('deduplicates IDs and recovers stale selections deterministically', () => {
    const items = [
      { id: 'first', label: 'First' },
      { id: 'first', label: 'Duplicate' },
      { id: 'second', label: 'Second' },
    ]
    expect(uniqueHbarAppUiFilteringItems(items)).toEqual([
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
    ])
    expect(selectHbarAppUiFilteringItem(items, 'missing')).toBe(items[0])
  })

  test('honors bounded rules and empty result states', () => {
    const content: HbarAppUiFilteringContent = {
      ...HBAR_APP_UI_FILTERING_FIXTURES,
      query: {
        ...HBAR_APP_UI_FILTERING_FIXTURES.query!,
        initialRules: HBAR_APP_UI_FILTERING_FIXTURES.query!.availableRules,
        maximumRules: 1,
        results: [],
      },
    }
    const value = render(3, content)
    expect(value).toContain('No matching results')
    expect((value.match(/lumen-filtering-rules/g) ?? []).length).toBe(1)
  })
})
