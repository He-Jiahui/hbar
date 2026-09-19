import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema } from '../index'
import { USAGE_ACCOUNTING_VERSION, usageSourceSchema } from '../usage'

export const usageScopeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('global') }),
  z.strictObject({ kind: z.literal('workspace'), workspaceId: idSchema }),
  z.strictObject({
    kind: z.literal('session'),
    sessionId: idSchema,
    includeDescendants: z.boolean().default(false),
  }),
  z.strictObject({ kind: z.literal('run'), runId: idSchema }),
])

export const usageFiltersSchema = z.strictObject({
  providerId: idSchema.optional(),
  modelId: idSchema.optional(),
  source: usageSourceSchema.optional(),
})

export const usageQueryInputSchema = z.strictObject({
  scope: usageScopeSchema,
  from: z.number().int().nonnegative().optional(),
  to: z.number().int().positive().optional(),
  bucketMs: z.number().int().min(1_000).max(31_536_000_000).default(60_000),
  maxBuckets: z.number().int().min(1).max(500).default(120),
  maxSamples: z.number().int().min(1).max(10_000).default(5_000),
  filters: usageFiltersSchema.default({}),
})

export const usageExportInputSchema = z.strictObject({
  scope: usageScopeSchema,
  from: z.number().int().nonnegative().optional(),
  to: z.number().int().positive().optional(),
  filters: usageFiltersSchema.default({}),
  after: z.string().min(1).max(256).optional(),
  limit: z.number().int().min(1).max(500).default(100),
})

export const usageAvailabilitySchema = z.enum(['available', 'empty', 'unavailable'])
export const usageMetricSchema = z.strictObject({
  value: z.number().finite().nullable(),
  unit: z.enum(['USD', 'ratio', 'tokens_per_second']),
  availability: usageAvailabilitySchema,
  reason: z.string().max(160).nullable(),
  source: z.string().min(1).max(80),
  estimated: z.boolean(),
  sampleCount: z.number().int().nonnegative(),
})
export const usageLatencySchema = z.strictObject({
  p50: z.number().nonnegative().nullable(),
  p95: z.number().nonnegative().nullable(),
  unit: z.literal('milliseconds'),
  availability: usageAvailabilitySchema,
  reason: z.string().max(160).nullable(),
  sampleCount: z.number().int().nonnegative(),
})
export const usageTotalsSchema = z.strictObject({
  attempts: z.number().int().nonnegative(),
  runs: z.number().int().nonnegative(),
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  cacheRead: z.number().nonnegative(),
  cacheWrite: z.number().nonnegative(),
  billableTokens: z.number().nonnegative(),
})
export const usageModelSummarySchema = usageTotalsSchema.extend({
  providerId: idSchema,
  modelId: idSchema,
  modelSelectionId: idSchema,
  cost: usageMetricSchema,
})
export const usageBucketSchema = usageTotalsSchema.extend({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  cost: usageMetricSchema,
})
export const usageAttemptExportSchema = usageTotalsSchema
  .pick({
    input: true,
    output: true,
    cacheRead: true,
    cacheWrite: true,
    billableTokens: true,
  })
  .extend({
    usageId: idSchema,
    attemptId: idSchema,
    sessionId: idSchema,
    workspaceId: idSchema,
    runId: idSchema.nullable(),
    source: usageSourceSchema,
    providerId: idSchema,
    modelId: idSchema,
    modelSelectionId: idSchema,
    startedAt: z.number().int().nonnegative().nullable(),
    firstProviderEventAt: z.number().int().nonnegative().nullable(),
    firstThinkingAt: z.number().int().nonnegative().nullable(),
    firstTextAt: z.number().int().nonnegative().nullable(),
    endedAt: z.number().int().nonnegative(),
    runStatus: z
      .enum(['queued', 'running', 'waiting_approval', 'completed', 'cancelled', 'failed', 'interrupted'])
      .nullable(),
    cost: usageMetricSchema,
    pricingVersion: z.string().max(512).nullable(),
    accountingVersion: z.number().int().positive(),
  })

export const usageQueryResultSchema = z.strictObject({
  accountingVersion: z.literal(USAGE_ACCOUNTING_VERSION),
  scope: usageScopeSchema,
  window: z.strictObject({
    from: z.number().int().nonnegative(),
    to: z.number().int().positive(),
    bucketMs: z.number().int().positive(),
  }),
  observedAt: z.number().int().nonnegative(),
  gap: z.boolean(),
  totals: usageTotalsSchema,
  cost: usageMetricSchema,
  cacheHitRate: usageMetricSchema,
  rates: z.strictObject({ input: usageMetricSchema, output: usageMetricSchema, total: usageMetricSchema }),
  latency: z.strictObject({
    firstProviderEvent: usageLatencySchema,
    firstThinking: usageLatencySchema,
    firstText: usageLatencySchema,
    response: usageLatencySchema,
  }),
  models: z.array(usageModelSummarySchema).max(1_024),
  series: z.array(usageBucketSchema).max(500),
})

export const usageExportResultSchema = z.strictObject({
  accountingVersion: z.literal(USAGE_ACCOUNTING_VERSION),
  scope: usageScopeSchema,
  observedAt: z.number().int().nonnegative(),
  gap: z.boolean(),
  items: z.array(usageAttemptExportSchema).max(500),
  nextCursor: z.string().min(1).max(256).optional(),
})

const metadata = (id: 'usage.query' | 'usage.export') => ({
  id,
  version: 1,
  owner: 'hbar.usage',
  kind: 'query' as const,
  execution: 'host' as const,
  stateEffect: 'none' as const,
  category: 'monitoring.usage',
  scope: 'global' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['cli', 'tui', 'api', 'palette'] as ('cli' | 'tui' | 'api' | 'palette')[],
})

export const usageCommands = {
  'usage.query': defineCommand(metadata('usage.query'), usageQueryInputSchema, usageQueryResultSchema),
  'usage.export': defineCommand(metadata('usage.export'), usageExportInputSchema, usageExportResultSchema),
}

export type UsageScope = z.output<typeof usageScopeSchema>
export type UsageFilters = z.output<typeof usageFiltersSchema>
export type UsageQueryInput = z.output<typeof usageQueryInputSchema>
export type UsageQueryResult = z.output<typeof usageQueryResultSchema>
export type UsageExportInput = z.output<typeof usageExportInputSchema>
export type UsageExportResult = z.output<typeof usageExportResultSchema>
export type UsageAttemptExport = z.output<typeof usageAttemptExportSchema>
export type UsageMetric = z.output<typeof usageMetricSchema>
export type UsageLatency = z.output<typeof usageLatencySchema>
