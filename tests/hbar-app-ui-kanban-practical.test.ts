import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiKanbanProvider,
  type HbarAppUiKanbanContent,
} from '../packages/hbar-app-ui/src/index'
import {
  createHbarAppUiKanbanLocalizedFixtures,
  HBAR_APP_UI_KANBAN_FIXTURES,
} from './fixtures/hbar-app-ui-kanban-fixtures'

function render(variant: number, content: HbarAppUiKanbanContent): string {
  return renderToStaticMarkup(
    createElement(HbarAppUiKanbanProvider, {
      content,
      children: createElement(getHbarAppUiVariant('kanban', variant).component, {}),
    }),
  )
}

describe('Kanban practical content boundaries', () => {
  test('uncaptured details retain known summary counts without invented activity or priority', () => {
    const flow = HBAR_APP_UI_KANBAN_FIXTURES.referenceDetail
    if (!flow) throw new Error('Missing detail fixture')
    const unknown = flow.cards.filter((card) => card.detailAvailability === 'unavailable')
    expect(unknown.map(({ id }) => id)).toEqual(['CDR-114', 'CDR-104', 'CDR-98', 'CDR-91', 'CDR-87'])
    expect(unknown.reduce((sum, card) => sum + (card.activityCount ?? 0), 0)).toBe(3)
    expect(unknown.every((card) => !card.priority && !card.description && (card.activity?.length ?? 0) === 0)).toBe(
      true,
    )
    const selected = render(4, {
      ...HBAR_APP_UI_KANBAN_FIXTURES,
      referenceDetail: { ...flow, selectedCardId: 'CDR-114' },
    })
    expect(selected).toContain(flow.labels.detailUnavailable!)
    expect(selected).toContain('Priya Nandakumar')
    expect(selected).toContain('5 points')
    expect(selected).not.toContain('Retention job is written')
    expect(selected).not.toContain('No comments yet')
  })

  test('localized empty/one/boundary/over-bound board records retain pane ownership and accessible content', () => {
    const localized = createHbarAppUiKanbanLocalizedFixtures()
    const flow = localized.referenceBoard
    const template = flow?.cards[0]
    const column = flow?.columns[0]
    if (!flow || !template || !column) throw new Error('Missing localized board fixture')
    const longTitle = '跨地区账单核对与付款失败恢复任务 — 多语言工作区中的长事项说明'
    const empty = render(1, { ...localized, referenceBoard: { ...flow, columns: [], cards: [] } })
    expect(empty).toContain(localized.labels.empty)
    const boundary = localized.listStrategy.expectedMaximum
    for (const count of [1, boundary, boundary + 1]) {
      const cards = Array.from({ length: count }, (_, index) => ({
        ...template,
        id: `local-${index}`,
        label: `${longTitle} ${index + 1}`,
      }))
      const markup = render(1, {
        ...localized,
        referenceBoard: { ...flow, columns: [{ ...column, cardIds: cards.map(({ id }) => id) }], cards },
      })
      expect((markup.match(/class="hbar-app-ui-kanban-reference-card /g) ?? []).length).toBe(count)
      expect(markup).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
      expect(markup).toContain(`${longTitle} ${count}`)
    }
    const detail = localized.referenceDetail
    if (!detail) throw new Error('Missing localized detail fixture')
    expect(detail.labels.detailUnavailable).toBe('参考快照未包含这张卡片的详细属性和动态。')
  })
})
