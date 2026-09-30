import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAgentApproval06, type LumenAgentApprovalHistoryContent } from '@lumen/app-ui'
import {
  createHistoryPreviewStore,
  projectHistoryPreviewContent,
} from '../apps/hbar-app-ui-preview/src/history-preview-model'
import {
  HBAR_APP_UI_AGENT_APPROVAL_FIXTURES,
  createHbarAppUiAgentApprovalLocalizedFixtures,
} from './fixtures/hbar-app-ui-agent-approval-fixtures'

function fixture(): LumenAgentApprovalHistoryContent {
  const history = HBAR_APP_UI_AGENT_APPROVAL_FIXTURES.history
  if (!history) throw new Error('History fixture required')
  return history
}
function render(history: LumenAgentApprovalHistoryContent | undefined) {
  return renderToStaticMarkup(createElement(LumenAgentApproval06, { content: { history } }))
}
const rows = (markup: string) => (markup.match(/<li\b/g) ?? []).length

describe('host-owned approval history', () => {
  test('matches native pressed filters, noninteractive rows and search semantics', () => {
    const markup = render(fixture())
    expect(rows(markup)).toBe(8)
    expect(markup.match(/aria-pressed=/g)).toHaveLength(4)
    expect(markup.match(/<p>/g)).toHaveLength(16)
    expect(markup).toContain('role="banner"')
    expect(markup).toContain('<label for=')
    expect(markup).not.toContain('role="tab')
    expect(markup).not.toContain('role="status"')
    expect(markup).not.toContain('<main')
  })
  test('all filter counts and case-insensitive title/detail queries compose and recover', () => {
    const content = fixture()
    const store = createHistoryPreviewStore(content)
    for (const [id, count] of [
      ['all', 8],
      ['approved', 4],
      ['skipped', 3],
      ['expired', 1],
    ] as const) {
      store.getState().filter(content.historyId, id)
      expect(rows(render(projectHistoryPreviewContent(store.getState())))).toBe(count)
    }
    store.getState().clear(content.historyId)
    for (const query of [' MAYA ', 'refunded 3']) {
      store.getState().search(content.historyId, query)
      expect(rows(render(projectHistoryPreviewContent(store.getState())))).toBe(1)
    }
    store.getState().filter(content.historyId, 'skipped')
    const empty = render(projectHistoryPreviewContent(store.getState()))
    expect(rows(empty)).toBe(0)
    expect(empty).toContain(content.labels.emptyTitle)
    expect(empty).toContain(content.labels.emptyDescription)
    expect(empty).toContain(content.labels.clearFilters)
    store.getState().clear(content.historyId)
    expect(store.getState().query).toBe('')
    expect(store.getState().activeFilterId).toBe('all')
    expect(rows(render(projectHistoryPreviewContent(store.getState())))).toBe(8)
  })
  test('stale targets and filter IDs do not mutate another history', () => {
    const content = fixture()
    const store = createHistoryPreviewStore(content)
    const another = createHistoryPreviewStore(content)
    const initial = store.getState()
    initial.search('old', 'Maya')
    initial.filter('old', 'approved')
    initial.clear('old')
    initial.filter(content.historyId, 'missing')
    expect(store.getState()).toBe(initial)
    initial.search(content.historyId, 'Maya')
    initial.replace({ ...content, historyId: 'new' })
    initial.search(content.historyId, 'stale')
    expect(store.getState().query).toBe('')
    expect(another.getState().query).toBe('')
  })
  test('localization/reorder preserves valid IDs, removed IDs choose first available filter', () => {
    const content = fixture()
    const store = createHistoryPreviewStore(content)
    store.getState().filter(content.historyId, 'approved')
    store.getState().search(content.historyId, 'no results')
    const localized = createHbarAppUiAgentApprovalLocalizedFixtures().history
    if (!localized) throw new Error('Localized history required')
    store.getState().replace({ ...localized, filters: [...localized.filters].reverse() })
    const markup = render(projectHistoryPreviewContent(store.getState()))
    expect(store.getState().activeFilterId).toBe('approved')
    expect(markup).toContain(localized.labels.emptyTitle)
    expect(markup).not.toContain(content.labels.emptyTitle)
    store.getState().replace({ ...content, filters: content.filters.filter((filter) => filter.id !== 'approved') })
    expect(store.getState().activeFilterId).toBe('all')
    store.getState().replace({ ...content, filters: [] })
    expect(store.getState().activeFilterId).toBe('')
    store.getState().replace(undefined)
    expect(projectHistoryPreviewContent(store.getState())).toBeUndefined()
  })
  test('blank filter and history target IDs cannot become active model state', () => {
    const content = fixture()
    const firstFilter = content.filters[0]
    if (!firstFilter) throw new Error('Filter required')
    const store = createHistoryPreviewStore({
      ...content,
      activeFilterId: ' ',
      filters: [{ ...firstFilter, id: ' ' }, ...content.filters],
    })
    expect(store.getState().activeFilterId).toBe(firstFilter.id)
    const initial = store.getState()
    initial.filter(content.historyId, ' ')
    initial.filter(' ', firstFilter.id)
    initial.search(' ', 'stale')
    initial.clear(' ')
    expect(store.getState()).toBe(initial)
  })
  test('export records an owned preview intent without changing supplied history', () => {
    const content = fixture()
    const store = createHistoryPreviewStore(content)
    store.getState().export('missing-history')
    expect(store.getState().exportRequested).toBe(false)
    projectHistoryPreviewContent(store.getState())?.onExport?.(content.historyId)
    expect(store.getState().exportRequested).toBe(true)
    expect(store.getState().content?.entries).toBe(content.entries)
    store.getState().replace({ ...content, historyId: 'another-owner' })
    expect(store.getState().exportRequested).toBe(false)
  })
  test('pane list preserves empty, single, boundary and over-bound rows; deduplicates stable IDs', () => {
    const content = fixture()
    const entry = content.entries[0]
    const filter = content.filters[0]
    if (!entry || !filter) throw new Error('Rows required')
    for (const count of [0, 1, 8, 9, 32]) {
      const entries = Array.from({ length: count }, (_, index) => ({ ...entry, id: `row-${index}` }))
      const markup = render({ ...content, activeFilterId: 'missing', entries })
      expect(rows(markup)).toBe(count)
      expect(markup).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    }
    const markup = render({
      ...content,
      filters: [filter, filter],
      entries: [entry, { ...entry, title: 'Duplicate hidden' }],
    })
    expect(rows(markup)).toBe(1)
    expect(markup.match(/aria-pressed=/g)).toHaveLength(1)
    expect(markup).not.toContain('Duplicate hidden')
  })
})
