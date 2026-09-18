import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { hostProcessInfoSchema, performancePointSchema, performanceSampleSchema } from '../metrics'

export const metricsQueryInputSchema = z.strictObject({
  from: z.number().int().nonnegative().optional(),
  to: z.number().int().positive().optional(),
  bucketMs: z.number().int().min(100).max(3_600_000).default(1_000),
  maxPoints: z.number().int().min(1).max(500).default(120),
})
export const metricsQueryResultSchema = z.strictObject({
  observedAt: z.number().int().nonnegative(),
  intervalMs: z.number().int().positive(),
  retentionSamples: z.number().int().positive(),
  process: hostProcessInfoSchema,
  current: performanceSampleSchema.nullable(),
  gap: z.boolean(),
  skippedSamples: z.number().int().nonnegative(),
  points: z.array(performancePointSchema).max(500),
})
export const metricsCurrentResultSchema = z.strictObject({
  observedAt: z.number().int().nonnegative(),
  intervalMs: z.number().int().positive(),
  retentionSamples: z.number().int().positive(),
  process: hostProcessInfoSchema,
  current: performanceSampleSchema.nullable(),
})
export const metricsWatchResultSchema = z.strictObject({
  samples: z.array(performanceSampleSchema).max(200),
  cursor: z.number().int().nonnegative(),
  reset: z.boolean(),
})

const metadata = (id: 'metrics.query' | 'metrics.current') => ({
  id,
  version: 1,
  owner: 'hbar.metrics',
  kind: 'query' as const,
  execution: 'host' as const,
  stateEffect: 'none' as const,
  category: 'monitoring.performance',
  scope: 'global' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['cli', 'tui', 'api', 'palette'] as ('cli' | 'tui' | 'api' | 'palette')[],
})

export const metricsCommands = {
  'metrics.current': defineCommand(metadata('metrics.current'), z.strictObject({}), metricsCurrentResultSchema),
  'metrics.query': defineCommand(metadata('metrics.query'), metricsQueryInputSchema, metricsQueryResultSchema),
}

export type MetricsQueryInput = z.output<typeof metricsQueryInputSchema>
export type MetricsQueryResult = z.output<typeof metricsQueryResultSchema>
export type MetricsCurrentResult = z.output<typeof metricsCurrentResultSchema>
export type MetricsWatchResult = z.output<typeof metricsWatchResultSchema>
