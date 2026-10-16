import type { InputCacheQuality } from '@hbar/contracts/commands/usage'

export interface InputCacheReport {
  readonly totals: { readonly input: number; readonly cacheRead: number }
  readonly cacheHitRate: { readonly value: number | null; readonly availability: string }
  readonly cacheQuality?: InputCacheQuality | undefined
  readonly window: { readonly from: number; readonly to: number }
  readonly series: readonly {
    readonly start: number
    readonly end: number
    readonly input: number
    readonly cacheRead: number
  }[]
}

export const INPUT_CACHE_CHART_BUCKETS = 120
export interface InputCacheBucket {
  readonly start: number
  readonly end: number
  readonly input: number
  readonly cacheRead: number
  readonly ratio: number | null
}

/** Merge adjacent real buckets by token counts, never by averaging percentages. */
export function inputCacheBuckets(series: InputCacheReport['series']): readonly InputCacheBucket[] {
  const ordered = [...new Map(series.map((bucket) => [bucket.start, bucket])).values()].sort(
    (a, b) => a.start - b.start,
  )
  const size = Math.max(1, Math.ceil(ordered.length / INPUT_CACHE_CHART_BUCKETS))
  const result: InputCacheBucket[] = []
  for (let offset = 0; offset < ordered.length; offset += size) {
    const group = ordered.slice(offset, offset + size)
    const first = group[0],
      last = group.at(-1)
    if (!first || !last) continue
    const input = group.reduce((sum, bucket) => sum + bucket.input, 0)
    const cacheRead = group.reduce((sum, bucket) => sum + bucket.cacheRead, 0)
    const valid = group.every((bucket) => bucket.input >= bucket.cacheRead && bucket.cacheRead >= 0)
    result.push({
      start: first.start,
      end: last.end,
      input,
      cacheRead,
      ratio: valid && input > 0 ? cacheRead / input : null,
    })
  }
  return result
}
