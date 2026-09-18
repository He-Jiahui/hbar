import {
  hostProcessInfoSchema,
  metricValueSchema,
  performancePointSchema,
  performanceReadingsSchema,
  performanceSampleSchema,
  type HostProcessInfo,
  type MetricUnit,
  type MetricValue,
  type PerformancePoint,
  type PerformanceReadings,
  type PerformanceSample,
} from '@hbar/contracts/metrics'

export type ProviderReadings = Omit<PerformanceReadings, 'eventLoopLagMs'>

export interface PerformanceProvider {
  readonly process: HostProcessInfo
  sample(elapsedMs: number): Promise<ProviderReadings>
}

export interface PerformanceCollectorOptions {
  readonly intervalMs?: number | undefined
  readonly maxSamples?: number | undefined
  readonly now?: (() => number) | undefined
}

export function available(
  value: number,
  unit: MetricUnit,
  source: string,
  estimated = false,
  sampleCount = 1,
): MetricValue {
  return metricValueSchema.parse({
    value,
    unit,
    availability: 'available',
    reason: null,
    source,
    estimated,
    sampleCount,
  })
}

export function unavailable(unit: MetricUnit, reason: string, source: string): MetricValue {
  return metricValueSchema.parse({
    value: null,
    unit,
    availability: 'unavailable',
    reason,
    source,
    estimated: false,
    sampleCount: 0,
  })
}

function aggregate(values: readonly MetricValue[]): MetricValue {
  const samples = values.filter((value): value is MetricValue & { value: number } => value.value !== null)
  if (!samples.length) {
    const first = values[0]
    return unavailable(first?.unit ?? 'count', first?.reason ?? 'NO_SAMPLES', first?.source ?? 'collector')
  }
  return available(
    samples.reduce((sum, sample) => sum + sample.value, 0) / samples.length,
    samples[0]!.unit,
    new Set(samples.map((sample) => sample.source)).size === 1 ? samples[0]!.source : 'mixed',
    samples.some((sample) => sample.estimated),
    samples.reduce((sum, sample) => sum + sample.sampleCount, 0),
  )
}

const readingKeys = Object.keys(performanceReadingsSchema.shape) as (keyof PerformanceReadings)[]

export class PerformanceCollector {
  readonly intervalMs: number
  readonly maxSamples: number
  private readonly now: () => number
  private readonly processSnapshot: HostProcessInfo
  private readonly processObservedAt: number
  private readonly samples: PerformanceSample[] = []
  private timer?: ReturnType<typeof setInterval> | undefined
  private lastObservedAt?: number | undefined
  private sampling = false
  private droppedBefore: number | null = null
  private skipped = 0

  constructor(
    private readonly provider: PerformanceProvider,
    options: PerformanceCollectorOptions = {},
  ) {
    this.intervalMs = Math.min(Math.max(options.intervalMs ?? 1_000, 100), 60_000)
    this.maxSamples = Math.min(Math.max(options.maxSamples ?? 3_600, 2), 86_400)
    this.now = options.now ?? Date.now
    this.processObservedAt = this.now()
    this.processSnapshot = hostProcessInfoSchema.parse(provider.process)
  }

  get process(): HostProcessInfo {
    return {
      ...this.processSnapshot,
      uptimeMs: this.processSnapshot.uptimeMs + Math.max(0, this.now() - this.processObservedAt),
    }
  }

  async sampleOnce(): Promise<PerformanceSample | null> {
    if (this.sampling) {
      this.skipped++
      return null
    }
    this.sampling = true
    const observedAt = this.now()
    const elapsedMs = Math.max(0.001, observedAt - (this.lastObservedAt ?? observedAt - this.intervalMs))
    try {
      const readings = await this.provider.sample(elapsedMs)
      const sample = performanceSampleSchema.parse({
        observedAt,
        elapsedMs,
        readings: {
          ...readings,
          eventLoopLagMs: available(
            Math.max(0, this.lastObservedAt === undefined ? 0 : elapsedMs - this.intervalMs),
            'milliseconds',
            'collector-timer',
          ),
        },
      })
      this.lastObservedAt = observedAt
      this.samples.push(sample)
      while (this.samples.length > this.maxSamples) {
        this.droppedBefore = this.samples.shift()!.observedAt
      }
      return sample
    } finally {
      this.sampling = false
    }
  }

  async start() {
    if (this.timer) return
    await this.sampleOnce()
    this.timer = setInterval(() => void this.sampleOnce().catch(() => this.skipped++), this.intervalMs)
    this.timer.unref?.()
  }

  stop() {
    clearInterval(this.timer)
    this.timer = undefined
  }

  current(): PerformanceSample | null {
    return this.samples.at(-1) ?? null
  }

  query(input: { readonly from: number; readonly to: number; readonly bucketMs: number; readonly maxPoints: number }): {
    readonly points: readonly PerformancePoint[]
    readonly gap: boolean
    readonly skippedSamples: number
  } {
    if (input.from >= input.to) throw new Error('Metrics window requires from < to')
    const duration = input.to - input.from
    const bucketMs = Math.max(input.bucketMs, Math.ceil(duration / input.maxPoints))
    const points: PerformancePoint[] = []
    for (let start = input.from; start < input.to && points.length < input.maxPoints; start += bucketMs) {
      const end = Math.min(input.to, start + bucketMs)
      const bucket = this.samples.filter((sample) => sample.observedAt >= start && sample.observedAt < end)
      if (!bucket.length) continue
      const readings = Object.fromEntries(
        readingKeys.map((key) => [key, aggregate(bucket.map((sample) => sample.readings[key]))]),
      )
      points.push(performancePointSchema.parse({ start, end, readings }))
    }
    return {
      points,
      gap: this.skipped > 0 || (this.droppedBefore !== null && input.from <= this.droppedBefore),
      skippedSamples: this.skipped,
    }
  }
}
