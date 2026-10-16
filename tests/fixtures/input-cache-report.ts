import { assessInputCache, inputCacheHitRate } from '@hbar/usage'
import type { InputCacheReport } from '../../packages/app-react/src/input-cache-model'

export function inputCacheReport(count = 12, lastRate = 0.99): InputCacheReport {
  const series = Array.from({ length: count }, (_, index) => ({
    start: index * 60_000,
    end: (index + 1) * 60_000,
    input: 100_000,
    cacheRead: index === 0 ? 0 : Math.round(100_000 * (index === count - 1 ? lastRate : 0.99)),
  }))
  return {
    totals: {
      input: series.reduce((sum, p) => sum + p.input, 0),
      cacheRead: series.reduce((sum, p) => sum + p.cacheRead, 0),
    },
    cacheHitRate: inputCacheHitRate(series),
    cacheQuality: assessInputCache(series),
    window: { from: 0, to: Math.max(1, count * 60_000) },
    series,
  }
}
