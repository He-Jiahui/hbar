import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarAppUiUsageRequestLog } from '../packages/hbar-app-ui/src/ai-usage'
import {
  createUsageRequestPreviewStore,
  projectUsageRequestPreview,
  USAGE_REQUEST_PAGE_SIZE,
} from '../apps/hbar-app-ui-preview/src/usage-request-preview-model'
import {
  USAGE_REQUEST_FACTS,
  USAGE_REQUEST_COPY,
  usageRequestFixture,
} from './fixtures/hbar-app-ui-usage-request-fixtures'
import { USAGE_FIXTURES } from './fixtures/hbar-app-ui-usage-fixtures'

test('request filters project matching totals while retaining a single expanded ID across filter changes', () => {
  const store = createUsageRequestPreviewStore(USAGE_REQUEST_FACTS, 'req_8f2183')
  const view = () => projectUsageRequestPreview(store.getState(), USAGE_REQUEST_COPY)
  expect(view().description).toBe('Last 8 calls · $0.7446 billed')
  store.getState().selectFilter('capped')
  expect(view().description).toBe('Last 1 calls · $0.5884 billed')
  expect(view().table!.rows.map((r) => r.id)).toEqual(['req_8f2183'])
  store.getState().selectFilter('error')
  expect(view().description).toBe('Last 1 calls · $0.0011 billed')
  expect(renderToStaticMarkup(createElement(HbarAppUiUsageRequestLog, view()))).not.toContain('Upstream timeout')
  store.getState().toggle('req_8f215d')
  expect(view().table!.expandedId).toBe('req_8f215d')
  store.getState().selectFilter('all')
  const html = renderToStaticMarkup(createElement(HbarAppUiUsageRequestLog, view()))
  expect((html.match(/aria-expanded="true"/g) ?? []).length).toBe(1)
  expect(html).toContain('Upstream timeout')
  store.getState().toggle('req_8f21c4')
  expect(view().table!.expandedId).toBe('req_8f21c4')
  store.getState().toggle('req_8f21c4')
  expect(view().table!.expandedId).toBeNull()
})

test('empty, one, normal, 50 and 51 requests use host pagination without dropping records', () => {
  for (const count of [0, 1, 8, USAGE_REQUEST_PAGE_SIZE, USAGE_REQUEST_PAGE_SIZE + 1]) {
    const rows = Array.from({ length: count }, (_, i) => ({ ...USAGE_REQUEST_FACTS[i % 8]!, id: `row-${i}` }))
    const store = createUsageRequestPreviewStore(rows, 'row-0')
    const view = () => projectUsageRequestPreview(store.getState(), USAGE_REQUEST_COPY)
    const html = renderToStaticMarkup(createElement(HbarAppUiUsageRequestLog, view()))
    expect((html.match(/data-request-id=/g) ?? []).length).toBe(Math.min(count, 50))
    if (!count) expect(html).toContain('No requests match this filter.')
    if (count > 50) {
      view().table!.pagination!.onNext()
      expect(view().table!.rows.map((r) => r.id)).toEqual(['row-50'])
      view().table!.pagination!.onNext()
      expect(store.getState().page).toBe(1)
      view().table!.pagination!.onPrevious()
      expect(view().table!.rows[0]!.id).toBe('row-0')
    }
  }
})

test('duplicate and stale IDs reconcile, and callbacks stay bound to their original request after reorder', () => {
  const store = createUsageRequestPreviewStore(USAGE_REQUEST_FACTS, 'missing')
  expect(store.getState().expandedId).toBeNull()
  const old = projectUsageRequestPreview(store.getState(), USAGE_REQUEST_COPY)
  const id = old.table!.rows[0]!.id
  store.getState().replace([...USAGE_REQUEST_FACTS].reverse().concat({ ...USAGE_REQUEST_FACTS[0]!, model: 'Updated' }))
  old.table!.onToggle(id)
  expect(store.getState().expandedId).toBe(id)
  expect(store.getState().records.find((r) => r.id === id)!.model).toBe('Updated')
  expect(store.getState().records).toHaveLength(8)
  store.getState().replace([])
  const prior = store.getState()
  old.table!.onToggle(id)
  store.getState().selectFilter('invalid')
  expect(store.getState()).toBe(prior)
  expect(store.getState().expandedId).toBeNull()
})

test('page replacement and filters clamp pages while totals stay based on all matching rows', () => {
  const fixture = usageRequestFixture('overflow')
  const store = createUsageRequestPreviewStore(fixture.records, fixture.expandedId)
  for (let i = 0; i < 6; i++) store.getState().next()
  expect(store.getState().page).toBe(3)
  store.getState().replace(fixture.records.slice(0, 51))
  expect(store.getState().page).toBe(1)
  store.getState().selectFilter('error')
  expect(store.getState().page).toBe(0)
  expect(
    projectUsageRequestPreview(store.getState(), fixture.copy).table!.rows.every((row) => row.status === 'error'),
  ).toBe(true)
})

test('localized long copy, empty status filter and invalid costs remain host-owned and finite', () => {
  const fixture = usageRequestFixture('localized')
  const store = createUsageRequestPreviewStore([{ ...fixture.records[0]!, cost: NaN }], fixture.records[0]!.id)
  const view = () => projectUsageRequestPreview(store.getState(), fixture.copy)
  const html = renderToStaticMarkup(createElement(HbarAppUiUsageRequestLog, view()))
  expect(html).toContain('Anfrageprotokoll')
  expect(html).toContain('besonders großem Kontextfenster')
  expect(html).toContain('0,0000 $')
  expect(html).not.toContain('Completed')
  store.getState().selectFilter('error')
  expect(view().table!.rows).toHaveLength(0)
  expect(renderToStaticMarkup(createElement(HbarAppUiUsageRequestLog, view()))).toContain('Keine Anfragen')
})

test('detail arrays grow at and above their bound, duplicate facts merge, legacy API stays supported', () => {
  const view = projectUsageRequestPreview(
    createUsageRequestPreviewStore(USAGE_REQUEST_FACTS, 'req_8f21c4').getState(),
    USAGE_REQUEST_COPY,
  )
  for (const count of [0, 1, 6, 12, 13]) {
    const details = Array.from({ length: count }, (_, i) => ({
      id: `fact-${i}`,
      label: `Field ${i}`,
      value: `Value ${i}`,
    }))
    const row = { ...view.table!.rows[0]!, details }
    const html = renderToStaticMarkup(
      createElement(HbarAppUiUsageRequestLog, { ...view, table: { ...view.table!, rows: [row, row] } }),
    )
    expect((html.match(/data-request-id=/g) ?? []).length).toBe(1)
    expect((html.match(/title="Value /g) ?? []).length).toBe(count)
  }
  expect(renderToStaticMarkup(createElement(HbarAppUiUsageRequestLog, USAGE_FIXTURES.requests))).toContain('<pre>')
})
