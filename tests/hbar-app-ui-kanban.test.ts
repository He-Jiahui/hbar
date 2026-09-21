import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiKanbanProvider,
  selectHbarAppUiKanbanItem,
  uniqueHbarAppUiKanbanItems,
  type HbarAppUiKanbanContent,
} from '../packages/hbar-app-ui/src/index'
import {
  createHbarAppUiKanbanLocalizedFixtures,
  HBAR_APP_UI_KANBAN_FIXTURES,
} from './fixtures/hbar-app-ui-kanban-fixtures'
function render(variant: number, content: HbarAppUiKanbanContent = HBAR_APP_UI_KANBAN_FIXTURES) {
  return renderToStaticMarkup(
    createElement(HbarAppUiKanbanProvider, {
      content,
      children: createElement(getHbarAppUiVariant('kanban', variant).component, {}),
    }),
  )
}
describe('hbar-app-ui kanban surfaces', () => {
  test('renders six distinct Lumen board workflows from host content', () => {
    const values = Array.from({ length: 6 }, (_, index) => render(index + 1))
    expect(new Set(values).size).toBe(6)
    values.forEach((value, index) => {
      expect(value).toContain('data-lumen-component="kanban"')
      expect(value).toContain(`data-lumen-variant="${index + 1}"`)
      expect(value).not.toContain('lucide')
      expect(value).not.toContain('hbar-app-ui-button')
    })
  })
  test('renders localized copy exclusively from the host contract', () => {
    const value = render(1, createHbarAppUiKanbanLocalizedFixtures())
    expect(value).toContain('平台看板')
    expect(value).toContain('核对发票')
    expect(value).not.toContain('Platform board')
  })
  test('deduplicates IDs and recovers stale selections deterministically', () => {
    const items = [
      { id: 'first', label: 'First' },
      { id: 'first', label: 'Duplicate' },
      { id: 'second', label: 'Second' },
    ]
    expect(uniqueHbarAppUiKanbanItems(items)).toEqual([
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
    ])
    expect(selectHbarAppUiKanbanItem(items, 'missing')).toBe(items[0])
  })
  test('honors empty boards and explicit pane capacity', () => {
    const content: HbarAppUiKanbanContent = { ...HBAR_APP_UI_KANBAN_FIXTURES, columns: [], lanes: [], cards: [] }
    expect(render(1, content)).toContain('No board columns')
    expect(render(2, content)).toContain('No board columns')
    expect(render(1)).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
  })
})
