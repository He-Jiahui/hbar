import { expect, test } from 'bun:test'
import type { EChartsOption } from 'echarts'
import { readingEchartsOption, type EchartsReadingTheme } from '../packages/app-react/src/echarts-chart-model'
import { usageQueryResultSchema } from '@hbar/contracts/commands/usage'
import { monitoringReport } from './fixtures/session-monitoring-content-data'

const theme: EchartsReadingTheme = {
  foreground: 'foreground',
  muted: 'muted',
  edge: 'edge',
  info: 'info',
  fontFamily: 'host-font',
  fontSize: 17,
  animation: true,
  duration: 260,
}
test('chart themes single and multiple axes without changing host data or overrides', () => {
  const data = [1, 2, 3]
  const option: EChartsOption = {
    textStyle: { fontWeight: 'bold' },
    xAxis: [{ type: 'category', data, axisLabel: { formatter: '{value} units' } }, { type: 'value' }],
    yAxis: { type: 'value', axisLabel: { color: 'owned-color' } },
    series: [{ id: 'original-series', type: 'line', data }],
    color: ['owned-palette'],
  }
  const result = readingEchartsOption(option, theme)
  expect(result.textStyle).toEqual({ color: 'foreground', fontFamily: 'host-font', fontSize: 17, fontWeight: 'bold' })
  expect(result.xAxis).toEqual([
    {
      type: 'category',
      data,
      axisLine: { lineStyle: { color: 'edge' } },
      axisLabel: { color: 'muted', fontFamily: 'host-font', fontSize: 17, formatter: '{value} units' },
      splitLine: { lineStyle: { color: 'edge' } },
    },
    {
      type: 'value',
      axisLine: { lineStyle: { color: 'edge' } },
      axisLabel: { color: 'muted', fontFamily: 'host-font', fontSize: 17 },
      splitLine: { lineStyle: { color: 'edge' } },
    },
  ])
  expect(result.yAxis).toMatchObject({ axisLabel: { color: 'owned-color', fontSize: 17 } })
  expect(result.series).toBe(option.series)
  expect(result.color).toBe(option.color)
  expect(option.xAxis).toEqual([
    { type: 'category', data, axisLabel: { formatter: '{value} units' } },
    { type: 'value' },
  ])
})
test('owning reduced motion dominates host animation and empty series stays empty', () => {
  expect(readingEchartsOption({ animation: true, series: [] }, { ...theme, animation: false }).animation).toBe(false)
  expect(readingEchartsOption({ animation: false }, theme).animation).toBe(false)
  const result = readingEchartsOption({ series: [] }, theme)
  expect(result.series).toEqual([])
  expect(result.xAxis).toBeUndefined()
  expect(result.yAxis).toBeUndefined()
  expect(result.animationDurationUpdate).toBe(260)
})
test('usage renderer receives zero, one, normal and maximum public buckets; over-capacity is rejected by DTO', () => {
  for (const count of [0, 1, 3, 500]) {
    const report = usageQueryResultSchema.parse(monitoringReport('original-session', 1, count))
    const series: EChartsOption['series'] = [
      { id: 'original-series', type: 'line', data: report.series.map((bucket) => bucket.input) },
    ]
    expect(readingEchartsOption({ series }, theme).series).toBe(series)
    expect(report.series).toHaveLength(count)
  }
  expect(usageQueryResultSchema.safeParse(monitoringReport('original-session', 1, 501)).success).toBe(false)
})
