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
      if (index === 0) expect(value).toContain('lucide-plus')
      else expect(value).not.toContain('lucide')
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
    const referenceBoard = HBAR_APP_UI_KANBAN_FIXTURES.referenceBoard!
    const content: HbarAppUiKanbanContent = { ...HBAR_APP_UI_KANBAN_FIXTURES, columns: [], lanes: [], cards: [], referenceBoard: {...referenceBoard, columns: [], cards: []} }
    expect(render(1, content)).toContain('No board columns')
    expect(render(2, content)).toContain('No board columns')
    expect(render(1)).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
  })
  test('reference board keeps ten host-owned cards, regions, native composer labels and accessible priorities', () => {
    const reference = HBAR_APP_UI_KANBAN_FIXTURES.referenceBoard!
    const markup = render(1)
    expect(markup).toContain(reference.labels.detail(10))
    expect((markup.match(/class="hbar-app-ui-kanban-reference-card /g) ?? []).length).toBe(10)
    expect((markup.match(/role="region"/g) ?? []).length).toBe(4)
    expect(markup).toContain(reference.labels.card(reference.cards[0]!))
    expect(markup).not.toContain('New card in Backlog')
    const composing = render(1, {...HBAR_APP_UI_KANBAN_FIXTURES, referenceBoard: {...reference, composerColumnId: 'backlog', draft: 'Audit sample card'}})
    expect(composing).toContain('New card in Backlog')
    expect(composing).toContain('value="Audit sample card"')
    const one = render(1, {...HBAR_APP_UI_KANBAN_FIXTURES, referenceBoard: {...reference, columns: [{...reference.columns[0]!, cardIds: ['HAL-241']}], cards: [reference.cards[0]!]}})
    expect((one.match(/class="hbar-app-ui-kanban-reference-card /g) ?? []).length).toBe(1)
    const duplicated = render(1, {...HBAR_APP_UI_KANBAN_FIXTURES, referenceBoard: {...reference, cards: [reference.cards[0]!, {...reference.cards[0]!, label: 'duplicate'}]}})
    expect(duplicated).toContain('Retry billing webhooks that fail on timeout')
    expect(duplicated).not.toContain('duplicate')
  })
})
