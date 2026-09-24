import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarAppUiModelSpend } from '../packages/hbar-app-ui/src/ai-usage'
import {
  createUsageModelPreviewStore,
  projectUsageModelPreview,
} from '../apps/hbar-app-ui-preview/src/usage-model-preview-model'
import {
  USAGE_MODEL_FIXTURE,
  USAGE_MODEL_RECORDS,
  modelSpendFixture,
} from './fixtures/hbar-app-ui-usage-model-fixtures'

test('model sort projections keep billing facts attached while changing order and normalized metric', () => {
  const fixture = modelSpendFixture(null),
    store = createUsageModelPreviewStore(fixture.records)
  const project = () => projectUsageModelPreview(store.getState(), fixture.content, fixture.pagination).table!
  expect(project().rows.map((row) => row.id)).toEqual([
    'atlas-pro',
    'atlas',
    'atlas-long',
    'quill',
    'ember',
    'ember-mini',
  ])
  store.getState().select('requests')
  expect(project().rows.map((row) => row.id)).toEqual([
    'ember-mini',
    'ember',
    'atlas',
    'quill',
    'atlas-pro',
    'atlas-long',
  ])
  expect(project().rows[0]).toMatchObject({ cost: '$42.60', requests: '402k', share: 100, shareEmphasis: true })
  expect(project().rows.find((row) => row.id === 'atlas-pro')?.share).toBe(11.9881)
  store.getState().select('tokens')
  expect(project().rows.map((row) => row.id)).toEqual([
    'atlas-long',
    'atlas',
    'atlas-pro',
    'quill',
    'ember',
    'ember-mini',
  ])
  expect(project().rows[0]).toMatchObject({ input: '513M', output: '19M', share: 100 })
  const prior = store.getState()
  store.getState().select('missing')
  expect(store.getState()).toBe(prior)
})

test('empty, one, normal, 50 and 51 records respect the host paging boundary', () => {
  const fixture = modelSpendFixture(null),
    first = fixture.records[0]!
  for (const count of [0, 1, 6, 50, 51]) {
    const rows = Array.from({ length: count }, (_, i) => ({ ...first, row: { ...first.row, id: `model-${i}` } }))
    const store = createUsageModelPreviewStore(rows)
    const content = projectUsageModelPreview(store.getState(), fixture.content, fixture.pagination)
    expect(content.table!.rows).toHaveLength(Math.min(count, 50))
    const html = renderToStaticMarkup(createElement(HbarAppUiModelSpend, content))
    expect((html.match(/data-model-id=/g) ?? []).length).toBe(Math.min(count, 50))
    if (count === 0) expect(html).toContain('No model usage in this billing period')
    if (count === 51) {
      expect(content.table!.pagination?.canPrevious).toBe(false)
      content.table!.pagination!.onNext()
      expect(projectUsageModelPreview(store.getState(), fixture.content, fixture.pagination).table!.rows).toHaveLength(
        1,
      )
      store.getState().next()
      expect(store.getState().page).toBe(1)
      store.getState().select('tokens')
      expect(store.getState().page).toBe(0)
    } else expect(content.table!.pagination).toBeUndefined()
  }
})

test('duplicate records update in place and host replacement clamps stale pages', () => {
  const fixture = modelSpendFixture('overflow'),
    store = createUsageModelPreviewStore(fixture.records)
  store.getState().next()
  store.getState().next()
  store.getState().next()
  expect(store.getState().page).toBe(3)
  const first = USAGE_MODEL_RECORDS[0]!
  store.getState().replace([first, { ...first, row: { ...first.row, model: 'Updated provider model' } }])
  expect(store.getState().records).toHaveLength(1)
  expect(store.getState().page).toBe(0)
  const content = projectUsageModelPreview(store.getState(), fixture.content, fixture.pagination)
  expect(content.table!.rows[0]!.model).toBe('Updated provider model')
  const select = content.table!.sortBy!.onChange
  store.getState().replace([...USAGE_MODEL_RECORDS].reverse())
  select('requests')
  expect(projectUsageModelPreview(store.getState(), fixture.content, fixture.pagination).table!.rows[0]!.id).toBe(
    'ember-mini',
  )
  store.getState().replace([])
  store.getState().next()
  expect(store.getState().page).toBe(0)
})

test('localized table preserves separate mobile summaries, native sort tabs and passive bars', () => {
  const fixture = modelSpendFixture('localized'),
    store = createUsageModelPreviewStore(fixture.records)
  const html = renderToStaticMarkup(
    createElement(HbarAppUiModelSpend, projectUsageModelPreview(store.getState(), fixture.content, fixture.pagination)),
  )
  expect(html).toContain('Modellkosten')
  expect(html).toContain('Ein ausführlicher Anbietername')
  expect(html).toContain('Eingabetokens')
  expect(html).toContain('aria-label="Sortierung"')
  expect(html.match(/role="tab"/g)).toHaveLength(3)
  expect(html).not.toContain('role="progressbar"')
  expect(html).not.toContain('role="list"')
})

test('direct table records merge duplicate IDs and bound invalid share geometry', () => {
  const table = USAGE_MODEL_FIXTURE.table!,
    row = table.rows[0]!
  const html = renderToStaticMarkup(
    createElement(HbarAppUiModelSpend, {
      ...USAGE_MODEL_FIXTURE,
      table: {
        ...table,
        rows: [
          row,
          { ...row, model: 'Replaced', share: NaN },
          { ...row, id: 'high', share: 120 },
          { ...row, id: 'low', share: -1 },
        ],
      },
    }),
  )
  expect(html.match(/data-model-id=/g)).toHaveLength(3)
  expect(html).toContain('Replaced')
  expect(html).not.toContain('NaN')
  expect(html).toContain('inline-size:0%')
  expect(html).toContain('inline-size:100%')
})
