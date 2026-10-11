import { z } from 'zod'
import { usagePricingSnapshotSchema } from './usage'

const count = z.number().int().nonnegative()
const tokens = z.number().finite().nonnegative()
const measured = z.number().finite().nonnegative().nullable()
export const observabilityScopeSchema = z.enum(['session', 'turn', 'window'])
export const observabilityDetailSchema = z.enum(['skills', 'tools', 'files', 'terminal', 'compactions', 'requests'])
export const sessionObservabilityInputSchema = z.strictObject({
  sessionId: z.string().min(1).max(256),
  scope: observabilityScopeSchema.default('session'),
  anchor: count.optional(),
  detail: observabilityDetailSchema.default('skills'),
  after: z.string().min(1).max(8_000).optional(),
  limit: count.min(1).max(50).default(20),
})
export const activitySummarySchema = z.strictObject({
  total: count,
  succeeded: count,
  failed: count,
  denied: count,
  cancelled: count,
  interrupted: count,
  unknown: count,
  pending: count,
  successRate: measured,
  durationMs: measured,
  averageMs: measured,
  p95Ms: measured,
  maximumMs: measured,
  timingSamples: count,
})
export const observabilityRecordSchema = z.strictObject({
  id: z.string().min(1).max(8_000),
  label: z.string().max(16_000),
  secondary: z.string().max(4_000).nullable(),
  count: count,
  succeeded: count,
  failed: count,
  durationMs: measured,
  averageMs: measured,
  status: z.string().max(80).nullable(),
  time: count.nullable(),
  linesRead: measured,
  patches: measured,
  addedLines: measured,
  removedLines: measured,
  beforeTokens: measured,
  afterTokens: measured,
  input: measured,
  output: measured,
  cost: measured,
  pricing: usagePricingSnapshotSchema.nullable(),
})
export const sessionObservabilityReportSchema = z.strictObject({
  sessionId: z.string().min(1).max(256),
  revision: count,
  observedAt: count,
  range: z.strictObject({
    scope: observabilityScopeSchema,
    anchor: count,
    ordinal: count,
    label: z.string().max(200),
    fromSeq: count,
    throughSeq: count,
    startedAt: count,
    endedAt: count,
    previous: count.nullable(),
    next: count.nullable(),
  }),
  usage: z.strictObject({
    input: tokens,
    output: tokens,
    cacheRead: tokens,
    cacheWrite: tokens,
    requests: count,
    recorded: count,
    models: count,
    cost: measured,
    knownCost: z.number().finite().nonnegative(),
    pricedRequests: count,
    cacheHitRate: measured,
    cacheInputShare: measured,
    durationMs: measured,
    tokensPerSecond: measured,
    outputPerSecond: measured,
    timingSamples: count,
  }),
  tools: activitySummarySchema,
  terminal: activitySummarySchema,
  skills: z.strictObject({ used: count, uses: count, loads: count, resourceReads: count }),
  files: z.strictObject({
    reads: count,
    writes: count,
    readPaths: count,
    writtenPaths: count,
    linesRead: measured,
    patches: measured,
    addedLines: measured,
    removedLines: measured,
    measuredReads: count,
    measuredWrites: count,
  }),
  compactions: z.strictObject({
    total: count,
    completed: count,
    failed: count,
    running: count,
    durationMs: measured,
    averageMs: measured,
    beforeTokens: measured,
    afterTokens: measured,
    removedTokens: z.number().finite().nullable(),
    reductionRate: z.number().finite().nullable(),
    measured: count,
  }),
  series: z.array(z.strictObject({ start: count, input: tokens, output: tokens, cacheRead: tokens })).max(40),
  detail: observabilityDetailSchema,
  records: z.array(observabilityRecordSchema).max(50),
  nextCursor: z.string().min(1).max(8_000).nullable(),
})
export type SessionObservabilityInput = z.input<typeof sessionObservabilityInputSchema>
export type SessionObservabilityReport = z.infer<typeof sessionObservabilityReportSchema>
export type ObservabilityScope = z.infer<typeof observabilityScopeSchema>
export type ObservabilityDetail = z.infer<typeof observabilityDetailSchema>
export type ObservabilityRecord = z.infer<typeof observabilityRecordSchema>
