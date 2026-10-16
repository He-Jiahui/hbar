import {
  INPUT_CACHE_MINIMUM,
  INPUT_CACHE_TARGET,
  INPUT_CACHE_STABILITY_SAMPLES,
  type InputCacheQuality,
  type UsageMetric,
} from '@hbar/contracts/commands/usage'

export interface InputCacheSample {
  /** Inclusive provider input: cache reads and writes are already included. */
  readonly input: number
  readonly cacheRead: number
}

function valid(sample: InputCacheSample): boolean {
  return (
    Number.isFinite(sample.input) &&
    sample.input > 0 &&
    Number.isFinite(sample.cacheRead) &&
    sample.cacheRead >= 0 &&
    sample.cacheRead <= sample.input
  )
}

/** Token-weighted actual reuse. Cold requests count; cache eligibility is a different metric. */
export function inputCacheHitRate(samples: readonly InputCacheSample[]): UsageMetric {
  const available = samples.filter(valid)
  const input = samples.reduce((sum, sample) => sum + sample.input, 0)
  const complete = samples.length > 0 && available.length === samples.length
  return {
    value: complete ? samples.reduce((sum, sample) => sum + sample.cacheRead, 0) / input : null,
    unit: 'ratio',
    availability: !samples.length ? 'empty' : complete ? 'available' : 'unavailable',
    reason: !samples.length || complete ? null : 'INPUT_CACHE_USAGE_INVALID',
    source: 'provider-input-tokens',
    estimated: false,
    sampleCount: available.length,
  }
}

/** Input is chronological. The latest ten requests must each reach 95%; no outlier is discarded. */
export function assessInputCache(
  samples: readonly InputCacheSample[],
  gap = false,
  aggregate?: InputCacheSample,
): InputCacheQuality {
  const recent = samples.slice(-INPUT_CACHE_STABILITY_SAMPLES)
  const rate = inputCacheHitRate(recent)
  const ratios = recent.filter(valid).map((sample) => sample.cacheRead / sample.input)
  const recentMinimum = ratios.length ? Math.min(...ratios) : null
  const overall = inputCacheHitRate(aggregate ? [aggregate] : samples)
  return {
    minimum: INPUT_CACHE_MINIMUM,
    target: INPUT_CACHE_TARGET,
    windowSize: INPUT_CACHE_STABILITY_SAMPLES,
    sampleCount: rate.sampleCount,
    belowMinimum: ratios.filter((ratio) => ratio < INPUT_CACHE_MINIMUM).length,
    belowTarget: ratios.filter((ratio) => ratio < INPUT_CACHE_TARGET).length,
    recentMinimum,
    recentRate: rate,
    status: !samples.length
      ? 'empty'
      : gap || rate.availability !== 'available' || overall.availability !== 'available'
        ? 'unavailable'
        : recent.length < INPUT_CACHE_STABILITY_SAMPLES
          ? 'insufficient'
          : (recentMinimum ?? 0) < INPUT_CACHE_MINIMUM || (overall.value ?? 0) <= INPUT_CACHE_MINIMUM
            ? 'below-minimum'
            : (recentMinimum ?? 0) < INPUT_CACHE_TARGET
              ? 'below-target'
              : 'healthy',
  }
}
