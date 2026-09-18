import { z } from 'zod'

export const metricUnitSchema = z.enum(['percent', 'bytes', 'bytes_per_second', 'milliseconds', 'count', 'load'])
export const metricValueSchema = z.strictObject({
  value: z.number().finite().nullable(),
  unit: metricUnitSchema,
  availability: z.enum(['available', 'unavailable']),
  reason: z.string().max(160).nullable(),
  source: z.string().min(1).max(80),
  estimated: z.boolean(),
  sampleCount: z.number().int().nonnegative(),
})
export const performanceReadingsSchema = z.strictObject({
  systemCpuPercent: metricValueSchema,
  hostCpuPercent: metricValueSchema,
  systemLoad1: metricValueSchema,
  systemMemoryUsedBytes: metricValueSchema,
  systemMemoryTotalBytes: metricValueSchema,
  hostRssBytes: metricValueSchema,
  hostHeapUsedBytes: metricValueSchema,
  hostThreadCount: metricValueSchema,
  hostDiskReadBytesPerSecond: metricValueSchema,
  hostDiskWriteBytesPerSecond: metricValueSchema,
  systemNetworkReceiveBytesPerSecond: metricValueSchema,
  systemNetworkTransmitBytesPerSecond: metricValueSchema,
  eventLoopLagMs: metricValueSchema,
  activeRuns: metricValueSchema,
  queuedRuns: metricValueSchema,
  managedChildProcesses: metricValueSchema,
})
export const performanceSampleSchema = z.strictObject({
  observedAt: z.number().int().nonnegative(),
  elapsedMs: z.number().nonnegative(),
  readings: performanceReadingsSchema,
})
export const performancePointSchema = z.strictObject({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  readings: performanceReadingsSchema,
})
export const hostProcessInfoSchema = z.strictObject({
  pid: z.number().int().positive(),
  platform: z.string().min(1).max(80),
  arch: z.string().min(1).max(80),
  startedAt: z.number().int().nonnegative(),
  uptimeMs: z.number().nonnegative(),
  logicalProcessors: z.number().int().positive(),
})

export type MetricUnit = z.output<typeof metricUnitSchema>
export type MetricValue = z.output<typeof metricValueSchema>
export type PerformanceReadings = z.output<typeof performanceReadingsSchema>
export type PerformanceSample = z.output<typeof performanceSampleSchema>
export type PerformancePoint = z.output<typeof performancePointSchema>
export type HostProcessInfo = z.output<typeof hostProcessInfoSchema>
