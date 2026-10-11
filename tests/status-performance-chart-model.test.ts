import { expect, test } from 'bun:test'
import type { MetricValue } from '@hbar/contracts/metrics'
import { cpuPerformanceChartData } from '../packages/app-react/src/status-performance-chart-model'

function metric(
  value: number | null,
  availability: MetricValue['availability'] = value === null ? 'unavailable' : 'available',
): MetricValue {
  return {
    value,
    availability,
    unit: 'percent',
    source: 'fixture',
    reason: value === null ? 'NO_SAMPLES' : null,
    estimated: false,
    sampleCount: value === null ? 0 : 1,
  }
}
test('CPU chart preserves measured zeroes and chronological gaps instead of fabricating idle CPU readings', () => {
  const points = [
    { readings: { systemCpuPercent: metric(42), hostCpuPercent: metric(12) } },
    { readings: { systemCpuPercent: metric(null), hostCpuPercent: metric(0) } },
    { readings: { systemCpuPercent: metric(0), hostCpuPercent: metric(null) } },
    { readings: { systemCpuPercent: metric(9, 'unavailable'), hostCpuPercent: metric(5, 'unavailable') } },
  ]
  const original = structuredClone(points)
  expect(cpuPerformanceChartData(points, 'systemCpuPercent')).toEqual([42, null, 0, null])
  expect(cpuPerformanceChartData(points, 'hostCpuPercent')).toEqual([12, 0, null, null])
  expect(points).toEqual(original)
  expect(cpuPerformanceChartData([], 'systemCpuPercent')).toEqual([])
})
