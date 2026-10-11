import type { PerformanceReadings } from '@hbar/contracts/metrics'

export type CpuReadingKey = 'systemCpuPercent' | 'hostCpuPercent'

/** Keep sample positions and measured zeroes; unavailable samples belong to gaps. */
export function cpuPerformanceChartData(
  points: readonly { readonly readings: Pick<PerformanceReadings, CpuReadingKey> }[],
  key: CpuReadingKey,
): (number | null)[] {
  return points.map((point) => {
    const metric = point.readings[key]
    return metric.availability === 'available' && metric.value !== null ? metric.value : null
  })
}
