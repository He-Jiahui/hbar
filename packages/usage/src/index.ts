import { modelSelectionId } from '@hbar/contracts'
import {
  USAGE_ACCOUNTING_VERSION,
  usageAttemptDescriptorSchema,
  usageRecordedDataSchema,
  type UsageAttemptDescriptor,
  type UsageRecordedData,
  type UsageSource,
} from '@hbar/contracts/usage'
import type { ProviderConfig, Usage } from '@hbar/contracts'
import { configuredContextCost, contextPricing } from './context-pricing'

export * from './service'
export * from './input-cache'

export function describeUsageAttempt(
  attemptId: string,
  source: UsageSource,
  model: ProviderConfig,
): UsageAttemptDescriptor {
  return usageAttemptDescriptorSchema.parse({
    attemptId,
    source,
    providerId: model.id,
    modelId: model.model,
    modelSelectionId: modelSelectionId(model.id, model.model, model.models.length),
    pricing: contextPricing(model),
  })
}

export function createUsageFact(input: {
  readonly usage: Usage
  readonly runId?: string | undefined
  readonly attemptId: string
  readonly source: UsageSource
  readonly model: ProviderConfig
}): UsageRecordedData {
  const descriptor = describeUsageAttempt(input.attemptId, input.source, input.model)
  const configured = Boolean(
    input.model.contextTiers?.length ||
    input.model.maxModePricingMultiplier ||
    input.model.cacheReadPrice !== undefined ||
    input.model.cacheWritePrice !== undefined,
  )
  const pricing = configured ? contextPricing(input.model, input.usage) : descriptor.pricing
  return usageRecordedDataSchema.parse({
    ...input.usage,
    ...descriptor,
    pricing,
    ...(configured && pricing.available && input.model.protocol !== 'mock'
      ? { cost: configuredContextCost(input.usage, pricing) }
      : {}),
    accountingVersion: USAGE_ACCOUNTING_VERSION,
    usageId: `${input.runId ?? 'session'}:${input.attemptId}:${input.source}`,
    cacheEligibleInput: null,
    costEstimated: descriptor.pricing.source !== 'fixture',
  })
}
