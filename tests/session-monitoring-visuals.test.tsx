import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Run, RunStatus } from '@hbar/contracts'
import {
  monitoringModels,
  monitoringRuns,
  monitoringRunCounts,
  monitoringUsageBuckets,
} from '../packages/app-react/src/session-monitoring-model'
import { HbarSessionMonitoringUsage } from '../packages/app-react/src/session-monitoring-usage'
import { HbarSessionRunOverview } from '../packages/app-react/src/session-run-overview'
import { sessionMonitoringUsage } from './fixtures/session-monitoring-fixture'
import { getShellCopy } from '../apps/web/src/shell-copy'

const run = (id: string, createdAt: number, status: RunStatus = 'completed', sessionId = 'session'): Run => ({
  id,
  sessionId,
  status,
  createdAt,
  requestId: id,
  input: { text: id, images: [] },
  modelId: 'provider/model',
  startedAt: createdAt,
  endedAt: createdAt + 1,
  error: null,
})

test('the Run window scopes, deduplicates and sorts before the 80-row limit', () => {
  const own = Array.from({ length: 81 }, (_, index) => run(`own-${index}`, index))
  const foreign = Array.from({ length: 80 }, (_, index) => run(`foreign-${index}`, index + 100, 'running', 'other'))
  const projected = monitoringRuns([foreign[0]!, ...foreign, ...own, own[0]!], 'session')
  expect(projected).toHaveLength(80)
  expect(projected[0]?.id).toBe('own-80')
  expect(projected.at(-1)?.id).toBe('own-1')
  expect(monitoringRuns(own, null)).toEqual([])
  expect(monitoringRuns(foreign, 'session')).toEqual([])
})

for (const count of [0, 1, 40, 41, 500, 501])
  test(`chart aggregation preserves all real usage and order for ${count} buckets`, () => {
    const sample = sessionMonitoringUsage().series[0]!
    const series = Array.from({ length: count }, (_, index) => ({
      ...sample,
      start: index * 1000,
      end: index * 1000 + 1000,
      input: index + 1,
      output: index * 2,
    }))
    const buckets = monitoringUsageBuckets([...series].reverse())
    expect(buckets.length).toBeLessThanOrEqual(40)
    expect(buckets.reduce((sum, bucket) => sum + bucket.input, 0)).toBe(
      series.reduce((sum, bucket) => sum + bucket.input, 0),
    )
    expect(buckets.reduce((sum, bucket) => sum + bucket.output, 0)).toBe(
      series.reduce((sum, bucket) => sum + bucket.output, 0),
    )
    if (count) {
      expect(buckets[0]?.start).toBe(0)
      expect(buckets.at(-1)?.end).toBe(count * 1000)
    } else expect(buckets).toEqual([])
  })

test('outcome counts preserve failed, interrupted, normal cancellation and live work separately', () => {
  const counts = monitoringRunCounts([
    run('failure', 1, 'failed'),
    run('interruption', 2, 'interrupted'),
    run('cancel', 3, 'cancelled'),
    run('running', 4, 'running'),
    run('queue', 5, 'queued'),
  ])
  expect(counts.failed).toBe(1)
  expect(counts.interrupted).toBe(1)
  expect(counts.cancelled).toBe(1)
  expect(counts.running).toBe(1)
  expect(counts.queued).toBe(1)
  expect(counts.completed).toBe(0)
})

test('model visual shares use unique identities and order by measured usage', () => {
  const first = sessionMonitoringUsage().models[0]!
  const other = { ...first, modelSelectionId: 'larger', input: 500, output: 200 }
  expect(monitoringModels([first, first, other]).map((item) => item.modelSelectionId)).toEqual([
    'larger',
    first.modelSelectionId,
  ])
})

for (const locale of ['zh-CN', 'en-US'] as const) {
  for (const count of [0, 1, 20, 21, 1024])
    test(`measured usage retains readable charts and a 20-model first page: ${locale}, ${count}`, () => {
      const labels = getShellCopy(locale).monitoring
      const report = sessionMonitoringUsage()
      const base = report.models[0]!
      report.models = Array.from({ length: count }, (_, index) => ({
        ...base,
        modelSelectionId: `model-${index}`,
        modelId: `model-${index}`,
      }))
      const html = renderToStaticMarkup(<HbarSessionMonitoringUsage report={report} labels={labels} />)
      expect(html).toContain(labels.composition.title)
      expect(html).toContain(labels.composition.summary(100, 40))
      expect(html).toContain(labels.chart.bucket(0, 60_000, 100, 40))
      expect((html.match(/data-model-usage=/g) ?? []).length).toBe(Math.min(count, 20))
      if (count > 20) expect(html).toContain(labels.moreModels(Math.min(20, count - 20)))
      expect(html).not.toContain('NaN')
      expect(html).not.toContain('Infinity')
    })

  test(`missing cost and latency remain unavailable, while real zero usage is honest: ${locale}`, () => {
    const labels = getShellCopy(locale).monitoring
    const report = sessionMonitoringUsage()
    report.cost = { ...report.cost, availability: 'unavailable', value: null }
    report.models = []
    report.series = []
    delete report.execution
    report.totals = { attempts: 0, runs: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, billableTokens: 0 }
    report.latency.firstText = { ...report.latency.firstText, availability: 'unavailable', p95: 84 }
    report.latency.response = { ...report.latency.response, availability: 'empty', p95: null }
    const html = renderToStaticMarkup(<HbarSessionMonitoringUsage report={report} labels={labels} />)
    expect(html).toContain(labels.unavailable)
    expect(html).not.toContain(labels.currency(0))
    expect(html).not.toContain(labels.duration(84))
    expect(html).not.toContain('data-chart-bucket')
    expect(html).not.toContain('hbar-monitoring-ring-input')
    expect(html).not.toContain('NaN')
  })

  for (const count of [0, 1, 80])
    test(`Run overview has true localized outcomes for ${locale}, ${count}`, () => {
      const labels = getShellCopy(locale).monitoring.history.overview
      const runs = Array.from({ length: count }, (_, index) =>
        run(String(index), index, index % 2 ? 'failed' : 'completed'),
      )
      const html = renderToStaticMarkup(<HbarSessionRunOverview runs={runs} labels={labels} />)
      if (!count) expect(html).toBe('')
      else {
        expect(html).toContain(labels.window(count))
        expect(html).toContain(labels.status('completed'))
        expect((html.match(/title=/g) ?? []).length).toBe(count)
      }
    })
}
