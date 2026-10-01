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
  createHbarAppUiKanbanOverflowFixtures,
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
      else if (index === 1) expect(value).toContain('lucide-chevron-down')
      else if (index === 2 || index === 3 || index === 4 || index === 5) expect(value).toContain('lucide-grip')
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
    const content: HbarAppUiKanbanContent = {
      ...HBAR_APP_UI_KANBAN_FIXTURES,
      columns: [],
      lanes: [],
      cards: [],
      referenceBoard: { ...referenceBoard, columns: [], cards: [] },
    }
    expect(render(1, content)).toContain('No board columns')
    expect(render(2, { ...content, referenceSwimlanes: undefined })).toContain('No board columns')
    expect(render(1)).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
  })
  test('reference board keeps ten host-owned cards, regions, native composer labels and accessible priorities', () => {
    const reference = HBAR_APP_UI_KANBAN_FIXTURES.referenceBoard!
    const markup = render(1)
    expect(markup).toContain(reference.labels.detail(10))
    expect((markup.match(/class="hbar-app-ui-kanban-reference-card /g) ?? []).length).toBe(10)
    expect((markup.match(/<section class="hbar-app-ui-kanban-reference-column"/g) ?? []).length).toBe(4)
    reference.columns.forEach((column) => expect(markup).toContain(`aria-label="${column.label}"`))
    expect(markup).toContain(reference.labels.card(reference.cards[0]!))
    expect(markup).not.toContain('New card in Backlog')
    const composing = render(1, {
      ...HBAR_APP_UI_KANBAN_FIXTURES,
      referenceBoard: { ...reference, composerColumnId: 'backlog', draft: 'Audit sample card' },
    })
    expect(composing).toContain('New card in Backlog')
    expect(composing).toContain('value="Audit sample card"')
    const one = render(1, {
      ...HBAR_APP_UI_KANBAN_FIXTURES,
      referenceBoard: {
        ...reference,
        columns: [{ ...reference.columns[0]!, cardIds: ['HAL-241'] }],
        cards: [reference.cards[0]!],
      },
    })
    expect((one.match(/class="hbar-app-ui-kanban-reference-card /g) ?? []).length).toBe(1)
    const duplicated = render(1, {
      ...HBAR_APP_UI_KANBAN_FIXTURES,
      referenceBoard: { ...reference, cards: [reference.cards[0]!, { ...reference.cards[0]!, label: 'duplicate' }] },
    })
    expect(duplicated).toContain('Retry billing webhooks that fail on timeout')
    expect(duplicated).not.toContain('duplicate')
  })
  test('swimlanes render Host stages, lane disclosures, counts and eleven accessible cards', () => {
    const flow = HBAR_APP_UI_KANBAN_FIXTURES.referenceSwimlanes!
    const markup = render(2)
    expect(markup).toContain(flow.labels.detail)
    expect((markup.match(/class="hbar-app-ui-kanban-swimlane-card /g) ?? []).length).toBe(11)
    expect((markup.match(/class="hbar-app-ui-kanban-swimlane-lane"/g) ?? []).length).toBe(3)
    expect(markup).toContain(flow.labels.card(flow.lanes[1]!.cards[0]!, flow.lanes[1]!.label, flow.stages[0]!.label))
    expect(markup).toContain('aria-expanded="true"')
    expect(markup).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    const collapsed = render(2, {
      ...HBAR_APP_UI_KANBAN_FIXTURES,
      referenceSwimlanes: { ...flow, collapsedLaneIds: ['billing', 'identity', 'platform'] },
    })
    expect(collapsed).toContain('Expand all')
    expect((collapsed.match(/aria-expanded="false"/g) ?? []).length).toBe(3)
    expect(collapsed).not.toContain('hbar-app-ui-kanban-swimlane-card ')
    const partial = render(2, {
      ...HBAR_APP_UI_KANBAN_FIXTURES,
      referenceSwimlanes: { ...flow, collapsedLaneIds: ['billing'] },
    })
    expect((partial.match(/class="hbar-app-ui-kanban-swimlane-card /g) ?? []).length).toBe(7)
  })
  test('swimlane locale and data bounds come from the Host', () => {
    const localized = render(2, createHbarAppUiKanbanLocalizedFixtures())
    expect(localized).toContain('工作流')
    expect(localized).toContain('核对发票')
    expect(localized).not.toContain('Workstreams')
    const flow = HBAR_APP_UI_KANBAN_FIXTURES.referenceSwimlanes!
    const empty = render(2, { ...HBAR_APP_UI_KANBAN_FIXTURES, referenceSwimlanes: { ...flow, lanes: [] } })
    expect(empty).toContain('Workstreams')
    expect(empty).not.toContain('hbar-app-ui-kanban-swimlane-card ')
    const one = render(2, {
      ...HBAR_APP_UI_KANBAN_FIXTURES,
      referenceSwimlanes: { ...flow, lanes: [{ ...flow.lanes[0]!, cards: [flow.lanes[0]!.cards[0]!] }] },
    })
    expect((one.match(/class="hbar-app-ui-kanban-swimlane-card /g) ?? []).length).toBe(1)
  })
  test('regroup board preserves nine Host cards through status, assignee and priority columns', () => {
    const flow = HBAR_APP_UI_KANBAN_FIXTURES.referenceRegroup!
    const status = render(3)
    expect(status).toContain(flow.labels.title)
    expect((status.match(/class="hbar-app-ui-kanban-regroup-card /g) ?? []).length).toBe(9)
    expect((status.match(/class="hbar-app-ui-kanban-regroup-column"/g) ?? []).length).toBe(4)
    expect(status).toContain(flow.labels.card(flow.cards[1]!, flow.groups[0]!.label, flow.columns.status![0]!.label))
    expect(status).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    const assigned = render(3, { ...HBAR_APP_UI_KANBAN_FIXTURES, referenceRegroup: { ...flow, groupId: 'assignee' } })
    expect((assigned.match(/class="hbar-app-ui-kanban-regroup-column"/g) ?? []).length).toBe(3)
    expect(assigned).toContain('Ana Reyes')
    const priority = render(3, { ...HBAR_APP_UI_KANBAN_FIXTURES, referenceRegroup: { ...flow, groupId: 'priority' } })
    expect(priority).toContain('Urgent')
    expect((priority.match(/class="hbar-app-ui-kanban-regroup-card /g) ?? []).length).toBe(9)
  })
  test('regroup board has localized and empty/one-card bounds', () => {
    const localized = render(3, createHbarAppUiKanbanLocalizedFixtures())
    expect(localized).toContain('项目路线图')
    expect(localized).toContain('核对发票')
    expect(localized).not.toContain('Northwind roadmap')
    const flow = HBAR_APP_UI_KANBAN_FIXTURES.referenceRegroup!
    const empty = render(3, { ...HBAR_APP_UI_KANBAN_FIXTURES, referenceRegroup: { ...flow, cards: [] } })
    expect(empty).not.toContain('hbar-app-ui-kanban-regroup-card ')
    const one = render(3, { ...HBAR_APP_UI_KANBAN_FIXTURES, referenceRegroup: { ...flow, cards: [flow.cards[0]!] } })
    expect((one.match(/class="hbar-app-ui-kanban-regroup-card /g) ?? []).length).toBe(1)
  })
  test('detail board renders seven Host cards and read-only selected-card properties', () => {
    const flow = HBAR_APP_UI_KANBAN_FIXTURES.referenceDetail!
    const markup = render(4)
    expect(markup).toContain(flow.labels.detail(7))
    expect((markup.match(/class="hbar-app-ui-kanban-detail-card"/g) ?? []).length).toBe(7)
    expect((markup.match(/class="hbar-app-ui-kanban-detail-column"/g) ?? []).length).toBe(4)
    expect(markup).toContain('aria-label="CDR-118 details"')
    expect(markup).toContain('Large uploads restart from zero')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).not.toContain('<select')
    const emptyActivity = render(4, {
      ...HBAR_APP_UI_KANBAN_FIXTURES,
      referenceDetail: { ...flow, selectedCardId: 'CDR-109' },
    })
    expect(emptyActivity).toContain('No comments yet')
    const unknown = render(4, {
      ...HBAR_APP_UI_KANBAN_FIXTURES,
      referenceDetail: { ...flow, selectedCardId: 'CDR-98' },
    })
    expect(unknown).toContain(flow.labels.detailUnavailable!)
    expect(unknown).not.toContain('Every grant and revoke')
    expect(unknown).not.toContain('No comments yet')
    const closed = render(4, { ...HBAR_APP_UI_KANBAN_FIXTURES, referenceDetail: { ...flow, selectedCardId: null } })
    expect(closed).not.toContain('hbar-app-ui-kanban-detail-pane')
  })
  test('detail board handles localized and empty/one-card capacity', () => {
    const localized = render(4, createHbarAppUiKanbanLocalizedFixtures())
    expect(localized).toContain('交付看板')
    expect(localized).toContain('核对发票')
    expect(localized).not.toContain('Cedar Labs delivery')
    const flow = HBAR_APP_UI_KANBAN_FIXTURES.referenceDetail!
    const empty = render(4, {
      ...HBAR_APP_UI_KANBAN_FIXTURES,
      referenceDetail: { ...flow, cards: [], selectedCardId: null },
    })
    expect(empty).not.toContain('hbar-app-ui-kanban-detail-card"')
    const one = render(4, {
      ...HBAR_APP_UI_KANBAN_FIXTURES,
      referenceDetail: { ...flow, cards: [flow.cards[0]!], selectedCardId: flow.cards[0]!.id },
    })
    expect((one.match(/class="hbar-app-ui-kanban-detail-card"/g) ?? []).length).toBe(1)
  })
  test('sprint board derives summary and three capacity bars from ten Host cards', () => {
    const flow = HBAR_APP_UI_KANBAN_FIXTURES.referenceSprint!
    const markup = render(5)
    expect(markup).toContain(flow.labels.title)
    expect(markup).toContain('44 pts')
    expect(markup).toContain('10 pts')
    expect(markup).toContain('23%')
    expect((markup.match(/class="hbar-app-ui-kanban-sprint-card /g) ?? []).length).toBe(10)
    expect((markup.match(/role="progressbar"/g) ?? []).length).toBe(3)
    expect(markup).toContain('Blocked')
    expect(markup).toContain(flow.labels.card(flow.cards[0]!))
    const moved = render(5, {
      ...HBAR_APP_UI_KANBAN_FIXTURES,
      referenceSprint: {
        ...flow,
        cards: flow.cards.map((card) => (card.id === 'MER-52' ? { ...card, stageId: 'building' } : card)),
      },
    })
    expect(moved).toContain('10 / 21 pts')
    expect(moved).toContain('18 / 13 pts')
  })
  test('sprint board localizes copy and handles empty/one-card capacity', () => {
    const localized = render(5, createHbarAppUiKanbanLocalizedFixtures())
    expect(localized).toContain('迭代 34')
    expect(localized).toContain('核对发票')
    expect(localized).not.toContain('Sprint 34')
    const flow = HBAR_APP_UI_KANBAN_FIXTURES.referenceSprint!
    const empty = render(5, { ...HBAR_APP_UI_KANBAN_FIXTURES, referenceSprint: { ...flow, cards: [] } })
    expect(empty).toContain('0%')
    expect(empty).not.toContain('hbar-app-ui-kanban-sprint-card ')
    const one = render(5, { ...HBAR_APP_UI_KANBAN_FIXTURES, referenceSprint: { ...flow, cards: [flow.cards[0]!] } })
    expect((one.match(/class="hbar-app-ui-kanban-sprint-card /g) ?? []).length).toBe(1)
  })
  test('compact board renders four Host columns, ten cards, live counts and bounded arrows', () => {
    const flow = HBAR_APP_UI_KANBAN_FIXTURES.referenceCompact!
    const markup = render(6)
    expect(markup).toContain(flow.labels.detail(10))
    expect((markup.match(/class="hbar-app-ui-kanban-compact-card"/g) ?? []).length).toBe(10)
    expect((markup.match(/<section class="hbar-app-ui-kanban-compact-column"/g) ?? []).length).toBe(4)
    expect(markup).toContain('aria-label="Column"')
    expect(markup).toContain(flow.labels.card(flow.cards[0]!))
    expect(markup).toContain('aria-label="Move Prune stale invite tokens to previous column" disabled=""')
    expect(markup).toContain('aria-label="Move Ship the changelog RSS feed to next column" disabled=""')
    expect(markup).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    const moved = render(6, {
      ...HBAR_APP_UI_KANBAN_FIXTURES,
      referenceCompact: {
        ...flow,
        cards: flow.cards.map((card) => (card.id === 'invite' ? { ...card, columnId: 'today' } : card)),
        announcement: flow.labels.moved('Prune stale invite tokens', 'Today'),
      },
    })
    expect(moved).toContain('Prune stale invite tokens moved to Today.')
    expect(moved).toContain('aria-label="Move Prune stale invite tokens to Inbox"')
  })
  test('compact board localizes and bounds empty, one-card, duplicate and overflowing content', () => {
    const localized = render(6, createHbarAppUiKanbanLocalizedFixtures())
    expect(localized).toContain('海港任务')
    expect(localized).toContain('核对发票')
    expect(localized).toContain('aria-label="将核对发票移至今日"')
    expect(localized).not.toContain('Harbor tasks')
    const flow = HBAR_APP_UI_KANBAN_FIXTURES.referenceCompact!
    const empty = render(6, { ...HBAR_APP_UI_KANBAN_FIXTURES, referenceCompact: { ...flow, columns: [], cards: [] } })
    expect(empty).toContain(flow.labels.detail(0))
    expect(empty).not.toContain('hbar-app-ui-kanban-compact-card"')
    const one = render(6, {
      ...HBAR_APP_UI_KANBAN_FIXTURES,
      referenceCompact: { ...flow, cards: [flow.cards[0]!, { ...flow.cards[0]!, label: 'duplicate' }] },
    })
    expect((one.match(/class="hbar-app-ui-kanban-compact-card"/g) ?? []).length).toBe(1)
    expect(one).not.toContain('duplicate')
    const overflow = render(6, createHbarAppUiKanbanOverflowFixtures())
    expect((overflow.match(/class="hbar-app-ui-kanban-compact-card"/g) ?? []).length).toBe(40)
  })
})
