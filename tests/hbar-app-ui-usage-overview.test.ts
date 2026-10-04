import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarAppUiUsageOverview } from '../packages/hbar-app-ui/src/ai-usage'
import {
  createUsageOverviewPreviewStore,
  projectUsageOverviewPreview,
} from '../apps/hbar-app-ui-preview/src/usage-overview-preview-model'
import {
  USAGE_OVERVIEW_DATASETS,
  USAGE_OVERVIEW_FIXTURE,
  usageOverviewDatasets,
} from './fixtures/hbar-app-ui-usage-overview-fixtures'

test('overview renders summaries and interactive data through Lumen controls with tab semantics', () => {
  const html = renderToStaticMarkup(createElement(HbarAppUiUsageOverview, USAGE_OVERVIEW_FIXTURE))
  expect(html.match(/role="tab"/g)).toHaveLength(3)
  const tabs = html.match(/<button\b[^>]*role="tab"[^>]*>[\s\S]*?<\/button>/g) ?? []
  expect(tabs.some((tab) => tab.includes('aria-selected="true"') && tab.replace(/<[^>]+>/g, '') === '7d')).toBe(true)
  expect(html.match(/data-lumen-variant="text"/g)).toHaveLength(3 + USAGE_OVERVIEW_FIXTURE.chart!.points.length)
  expect(html).toContain('aria-label="Mon: 5.7M tokens"')
  expect(html).toContain('$311')
  expect(html).toContain('Hover a bar for detail')
  expect(html).not.toContain('role="progressbar"')
  expect(html).not.toContain('<dl')
})

test('range projection replaces totals and series atomically and rejects stale IDs', () => {
  const store = createUsageOverviewPreviewStore(USAGE_OVERVIEW_DATASETS)
  const first = projectUsageOverviewPreview(store.getState(), 'Range')!
  first.range!.onChange('30d')
  const month = projectUsageOverviewPreview(store.getState(), 'Range')!
  expect(month.metrics.map((metric) => metric.value)).toEqual(['161M', '115M', '46M', '$1,033'])
  expect(month.chart!.points.map((point) => point.label)).toEqual(['W1', 'W2', 'W3', 'W4'])
  first.range!.onChange('90d')
  expect(projectUsageOverviewPreview(store.getState(), 'Range')!.chart!.points.map((point) => point.label)).toEqual([
    'Apr',
    'May',
    'Jun',
  ])
  const before = store.getState()
  first.range!.onChange('missing')
  expect(store.getState()).toBe(before)
  store.getState().replace([USAGE_OVERVIEW_DATASETS[1]!])
  first.range!.onChange('7d')
  expect(store.getState().activeId).toBe('30d')
  store.getState().replace([])
  expect(store.getState().activeId).toBeNull()
  expect(projectUsageOverviewPreview(store.getState(), 'Range')).toBeUndefined()
})

test('duplicate IDs use the newest record and remain stable after reordering', () => {
  const original = USAGE_OVERVIEW_DATASETS[0]!
  const replacement = { ...original, label: 'Neueste Woche' }
  const store = createUsageOverviewPreviewStore([original, USAGE_OVERVIEW_DATASETS[1]!, replacement], 'stale')
  expect(store.getState().activeId).toBe('7d')
  expect(store.getState().datasets).toHaveLength(2)
  const callback = projectUsageOverviewPreview(store.getState(), 'Zeitraum')!.range!.onChange
  store.getState().replace([USAGE_OVERVIEW_DATASETS[1]!, replacement])
  callback('30d')
  expect(projectUsageOverviewPreview(store.getState(), 'Zeitraum')!.metrics[0]!.value).toBe('161M')
  const point = original.content.chart!.points[0]!
  const html = renderToStaticMarkup(
    createElement(HbarAppUiUsageOverview, {
      ...original.content,
      chart: { ...original.content.chart!, points: [point, { ...point, label: 'Updated' }] },
    }),
  )
  expect(html.match(/class="[^"]*\blumen-usage-overview-bar\b[^"]*"/g)).toHaveLength(1)
  expect(html).toContain('Updated')
})

test('whitespace-only range IDs are ignored while padded valid IDs remain exact', () => {
  const original = USAGE_OVERVIEW_DATASETS[0]!
  const valid = { ...original, id: ' range ' }
  const blank = { ...original, id: ' \t ' }
  const store = createUsageOverviewPreviewStore([blank, valid], ' ')
  expect(store.getState().datasets.map((entry) => entry.id)).toEqual([' range '])
  expect(store.getState().activeId).toBe(' range ')
  const previous = store.getState()
  previous.select(' \t ')
  expect(store.getState()).toBe(previous)
  expect(projectUsageOverviewPreview(store.getState(), 'Range')?.range?.value).toBe(' range ')
})

test('host-localized copy, empty, one, normal, boundary and over-bound series render without dropped points', () => {
  const content = usageOverviewDatasets('localized')[0]!.content
  for (const count of [0, 1, 7, 31, 32]) {
    const points = Array.from({ length: count }, (_, index) => ({ ...content.chart!.points[0]!, id: `point-${index}` }))
    const html = renderToStaticMarkup(
      createElement(HbarAppUiUsageOverview, { ...content, chart: { ...content.chart!, points } }),
    )
    expect(html).toContain('Token-Nutzung')
    expect(html).toContain('Gesamte Tokenanzahl')
    expect((html.match(/class="[^"]*\blumen-usage-overview-bar\b[^"]*"/g) ?? []).length).toBe(count)
    if (count === 0) expect(html).toContain('Keine Nutzung')
    if (count > 7) expect(html).toContain('data-overflow="true"')
  }
})

test('invalid chart proportions are bounded and legacy meter-only hosts remain supported', () => {
  const fixture = USAGE_OVERVIEW_FIXTURE
  const point = fixture.chart!.points[0]!
  const html = renderToStaticMarkup(
    createElement(HbarAppUiUsageOverview, {
      ...fixture,
      chart: {
        ...fixture.chart!,
        points: [
          { ...point, totalRatio: Infinity, outputShare: -1 },
          { ...point, id: 'high', totalRatio: 2, outputShare: NaN },
        ],
      },
    }),
  )
  expect(html).not.toContain('NaN')
  expect(html).not.toContain('Infinity')
  expect(html).toContain('block-size:0%')
  expect(html).toContain('block-size:100%')
  const legacy = renderToStaticMarkup(
    createElement(HbarAppUiUsageOverview, {
      ...fixture,
      chart: undefined,
      meters: [
        {
          id: 'legacy',
          label: 'Older integration',
          value: '42',
          progress: 42,
          progressLabel: 'Current capacity',
          detail: 'Host-provided meter',
          tone: 'accent',
        },
      ],
    }),
  )
  expect(legacy).toContain('role="progressbar"')
  expect(legacy).toContain('Older integration')
  expect(legacy).not.toContain('lumen-usage-overview-plot')
})
