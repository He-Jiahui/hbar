import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  HbarAppUiUsageOverview,
  HbarAppUiModelSpend,
  HbarAppUiRateLimits,
  HbarAppUiSeatUsage,
  HbarAppUiBudgetSettings,
  HbarAppUiUsageOverage,
  HbarAppUiUsageRequestLog,
  HbarAppUiCompactUsage,
  type HbarAppUiModelSpendRow,
} from '../packages/hbar-app-ui/src/ai-usage'
import { USAGE_FIXTURES } from './fixtures/hbar-app-ui-usage-fixtures'

test('all eight usage surfaces render typed host facts without gallery specs', () => {
  const content = USAGE_FIXTURES
  const elements = [
    createElement(HbarAppUiUsageOverview, content.overview),
    createElement(HbarAppUiModelSpend, content.modelSpend),
    createElement(HbarAppUiRateLimits, content.rateLimits),
    createElement(HbarAppUiSeatUsage, content.seats),
    createElement(HbarAppUiBudgetSettings, content.budget),
    createElement(HbarAppUiUsageOverage, content.overage),
    createElement(HbarAppUiUsageRequestLog, content.requests),
    createElement(HbarAppUiCompactUsage, content.compact),
  ]
  for (const [index, element] of elements.entries()) {
    const markup = renderToStaticMarkup(element)
    expect(markup).toContain(`hbar-app-ui-usage-variant-${index + 1}`)
    expect(markup).not.toContain('data-hbar-app-ui-component')
    expect(markup).not.toContain('undefined')
  }
})
test('usage lists merge duplicate IDs, preserve every bounded row, and expose host empty labels', () => {
  const content = { ...USAGE_FIXTURES.modelSpend, table: undefined }
  const first: HbarAppUiModelSpendRow = {
    id: 'legacy',
    model: 'Legacy model',
    share: 72,
    shareLabel: 'Legacy share',
    spend: '$12.40',
    change: '8%',
    direction: 'up',
  }
  const rows = Array.from({ length: 101 }, (_, index) => ({ ...first, id: `row-${index}`, model: `模型 ${index}` }))
  const markup = renderToStaticMarkup(
    createElement(HbarAppUiModelSpend, { ...content, rows: [...rows, { ...rows[0]!, model: '更新后的模型' }] }),
  )
  expect(markup.match(/hbar-app-ui-model-spend-row/g)).toHaveLength(101)
  expect(markup).toContain('更新后的模型')
  expect(markup).not.toContain('>模型 0<')
  const empty = renderToStaticMarkup(
    createElement(HbarAppUiSeatUsage, { ...USAGE_FIXTURES.seats, rows: [], emptyLabel: '没有符合条件的记录' }),
  )
  expect(empty).toContain('没有符合条件的记录')
  expect(empty).not.toContain('Avery')
})
test('budget uses the host state, bounds invalid visual proportions, and never claims a failed save succeeded', () => {
  const markup = renderToStaticMarkup(
    createElement(HbarAppUiBudgetSettings, {
      ...USAGE_FIXTURES.budget,
      title: '会话预算',
      labels: { cap: 'Token 上限', save: '保存预算', saving: '正在保存' },
      busy: true,
      error: '权限已改变',
    }),
  )
  expect(markup).toContain('会话预算')
  expect(markup).toContain('正在保存')
  expect(markup).toContain('权限已改变')
  expect(markup).toContain('disabled=""')
  expect(markup).not.toContain('Budget saved')
  const compact = renderToStaticMarkup(
    createElement(HbarAppUiCompactUsage, {
      ...USAGE_FIXTURES.compact,
      progress: Number.NaN,
      sparkline: [
        { id: 'negative', value: -1 },
        { id: 'high', value: 2 },
        { id: 'nan', value: Number.NaN },
      ],
    }),
  )
  expect(compact).not.toContain('NaN')
  expect(compact).toContain('aria-valuenow="0"')
  expect(compact).toContain('block-size:100%')
})

test('inline usage keeps host totals and metrics without rendering the full chart surface', () => {
  const inline = renderToStaticMarkup(
    createElement(HbarAppUiCompactUsage, { ...USAGE_FIXTURES.compact, density: 'inline' }),
  )
  expect(inline).toContain('class="hbar-app-ui-inline-usage"')
  expect(inline).toContain('aria-label="Plan usage"')
  expect(inline).toContain('Requests')
  expect(inline).toContain('2,482')
  expect(inline).not.toContain('hbar-app-ui-sparkline')
  expect(inline).not.toContain('role="progressbar"')
  expect(inline).not.toContain('<h2>')
})
