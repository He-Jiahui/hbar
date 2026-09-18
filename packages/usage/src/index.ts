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

function pricing(model: ProviderConfig): UsageAttemptDescriptor['pricing'] {
  const fixture = model.protocol === 'mock'
  return {
    available: fixture || model.inputPrice > 0 || model.outputPrice > 0,
    currency: 'USD',
    inputPerMillion: model.inputPrice,
    outputPerMillion: model.outputPrice,
    cacheReadPerMillion: null,
    cacheWritePerMillion: null,
    source: fixture ? 'fixture' : 'provider-config',
    version: `pricing-v1:${model.id}:${model.model}:${model.inputPrice}:${model.outputPrice}`,
    effectiveAt: null,
  }
}

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
    pricing: pricing(model),
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
  return usageRecordedDataSchema.parse({
    ...input.usage,
    ...descriptor,
    accountingVersion: USAGE_ACCOUNTING_VERSION,
    usageId: `${input.runId ?? 'session'}:${input.attemptId}:${input.source}`,
    cacheEligibleInput: null,
    costEstimated: descriptor.pricing.source !== 'fixture',
  })
}
