import { z } from 'zod'
import { idSchema, usageSchema } from './index'

export const USAGE_ACCOUNTING_VERSION = 1 as const

export const usageSourceSchema = z.enum(['model', 'compaction'])
export const usagePricingSnapshotSchema = z.strictObject({
  available: z.boolean(),
  currency: z.literal('USD'),
  inputPerMillion: z.number().nonnegative(),
  outputPerMillion: z.number().nonnegative(),
  cacheReadPerMillion: z.number().nonnegative().nullable(),
  cacheWritePerMillion: z.number().nonnegative().nullable(),
  source: z.enum(['provider-config', 'fixture']),
  version: z.string().min(1).max(512),
  effectiveAt: z.number().int().nonnegative().nullable(),
})

export const usageAttemptDescriptorSchema = z.strictObject({
  attemptId: idSchema,
  source: usageSourceSchema,
  providerId: idSchema,
  modelId: idSchema,
  modelSelectionId: idSchema,
  pricing: usagePricingSnapshotSchema,
})

// The numeric Usage fields remain at the top level so existing budget and goal
// consumers can parse new facts without a parallel accounting path.
export const usageRecordedDataSchema = usageSchema.extend({
  accountingVersion: z.literal(USAGE_ACCOUNTING_VERSION),
  usageId: idSchema,
  attemptId: idSchema,
  source: usageSourceSchema,
  providerId: idSchema,
  modelId: idSchema,
  modelSelectionId: idSchema,
  pricing: usagePricingSnapshotSchema,
  cacheEligibleInput: z.number().nonnegative().nullable(),
  costEstimated: z.boolean(),
})

export const usageAttemptMarkerSchema = z.strictObject({ attemptId: idSchema })

export type UsageSource = z.output<typeof usageSourceSchema>
export type UsagePricingSnapshot = z.output<typeof usagePricingSnapshotSchema>
export type UsageAttemptDescriptor = z.output<typeof usageAttemptDescriptorSchema>
export type UsageRecordedData = z.output<typeof usageRecordedDataSchema>
