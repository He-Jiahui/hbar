import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiDataTableProvider,
  selectHbarAppUiDataTableItem,
  uniqueHbarAppUiDataTableItems,
  type HbarAppUiDataTableContent,
} from '../packages/hbar-app-ui/src/index'
import {
  createHbarAppUiDataTableLocalizedFixtures,
  HBAR_APP_UI_DATA_TABLE_FIXTURES,
} from './fixtures/hbar-app-ui-data-table-fixtures'

function render(variant: number, content: HbarAppUiDataTableContent = HBAR_APP_UI_DATA_TABLE_FIXTURES) {
  return renderToStaticMarkup(
    createElement(HbarAppUiDataTableProvider, {
      content,
      children: createElement(getHbarAppUiVariant('data-table', variant).component, {}),
    }),
  )
}

describe('hbar-app-ui data table surfaces', () => {
  test('renders eight distinct Lumen table workflows from host content', () => {
    const values = Array.from({ length: 8 }, (_, index) => render(index + 1))
    expect(new Set(values).size).toBe(8)
    values.forEach((value, index) => {
      expect(value).toContain('data-lumen-component="data-table"')
      expect(value).toContain(`data-lumen-variant="${index + 1}"`)
      expect(value).not.toContain('lucide')
      expect(value).not.toContain('hbar-app-ui-button')
    })
  })

  test('renders localized copy exclusively from the host contract', () => {
    const value = render(1, createHbarAppUiDataTableLocalizedFixtures())
    expect(value).toContain('记录')
    expect(value).toContain('搜索记录')
    expect(value).not.toContain('Faceted filters and column visibility')
  })

  test('deduplicates row IDs and recovers stale selections deterministically', () => {
    const rows = [
      { id: 'first', label: 'First' },
      { id: 'first', label: 'Duplicate' },
      { id: 'second', label: 'Second' },
    ]
    expect(uniqueHbarAppUiDataTableItems(rows)).toEqual([
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
    ])
    expect(selectHbarAppUiDataTableItem(rows, 'missing')).toBe(rows[0])
  })

  test('honors empty rows and bounded skeleton capacity', () => {
    const content: HbarAppUiDataTableContent = {
      ...HBAR_APP_UI_DATA_TABLE_FIXTURES,
      rows: [],
      states: {
        ...HBAR_APP_UI_DATA_TABLE_FIXTURES.states!,
        skeletonRows: 2,
      },
    }
    expect(render(1, content)).toContain('No matching records')
    const loading = render(7, content)
    expect((loading.match(/<span><i><\/i><i><\/i><i><\/i><\/span>/g) ?? []).length).toBe(2)
  })
})
