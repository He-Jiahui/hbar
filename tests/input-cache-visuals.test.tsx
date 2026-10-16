import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarInputCacheMetrics } from '../packages/app-react/src/input-cache-metrics'
import { INPUT_CACHE_CHART_BUCKETS, inputCacheBuckets } from '../packages/app-react/src/input-cache-model'
import { inputCacheCopy } from '../apps/web/src/input-cache-copy'
import { inputCacheReport } from './fixtures/input-cache-report'

for (const count of [0, 1, 12, 120, 121, 500])
  test(`cache trend preserves actual token weights in at most 120 points: ${count}`, () => {
    const report = inputCacheReport(count)
    const buckets = inputCacheBuckets([...report.series].reverse())
    expect(buckets.length).toBeLessThanOrEqual(INPUT_CACHE_CHART_BUCKETS)
    expect(buckets.reduce((sum, bucket) => sum + bucket.input, 0)).toBe(report.totals.input)
    expect(buckets.reduce((sum, bucket) => sum + bucket.cacheRead, 0)).toBe(report.totals.cacheRead)
    if (count) expect(buckets[0]?.start).toBe(0)
  })
test('cache trend ignores duplicate identities and does not invent a ratio for empty or invalid buckets', () => {
  const bucket = { start: 0, end: 1, input: 100, cacheRead: 90 }
  expect(inputCacheBuckets([bucket, bucket])).toHaveLength(1)
  expect(inputCacheBuckets([{ ...bucket, input: 0, cacheRead: 0 }])[0]?.ratio).toBeNull()
  expect(inputCacheBuckets([{ ...bucket, cacheRead: 101 }])[0]?.ratio).toBeNull()
  expect(
    inputCacheBuckets([
      { ...bucket, input: 1, cacheRead: 0 },
      { start: 1, end: 2, input: 99, cacheRead: 99 },
    ]).reduce((sum, p) => sum + p.cacheRead, 0),
  ).toBe(99)
})
for (const locale of ['zh-CN', 'en-US'] as const)
  test(`localized cache metrics expose cold input, stable targets and low outliers: ${locale}`, () => {
    const base = inputCacheCopy(locale)
    const labels = { ...base, title: base.title.repeat(10) }
    const render = (count: number, rate = 0.99) =>
      renderToStaticMarkup(<HbarInputCacheMetrics report={inputCacheReport(count, rate)} labels={labels} />)
    const healthy = render(12)
    expect(healthy).toContain(labels.title)
    expect(healthy).toContain(labels.status.healthy)
    expect(healthy).toContain(labels.percent(0.9075))
    expect(healthy).toContain('hbar-input-cache-minimum')
    expect(healthy).toContain('hbar-input-cache-target')
    expect(render(12, 0.89)).toContain(labels.status['below-minimum'])
    expect(render(12, 0.94)).toContain(labels.status['below-target'])
    expect(render(1)).toContain(labels.status.insufficient)
    expect(render(0)).toContain(labels.empty)
    expect(render(0)).not.toContain('<svg')
  })
