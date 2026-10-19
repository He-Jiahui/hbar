import { z } from 'zod'
import { providerInputSchema } from '@hbar/contracts'
import type { ProviderConfig, ProviderModelConfig } from '@hbar/contracts'

const requiredModelFields = {
  visible: true,
  contextWindow: true,
  maxOutput: true,
  imageInput: true,
  imageGeneration: true,
  reasoning: true,
  inputPrice: true,
  outputPrice: true,
  thinkingLevels: true,
  supportedThinkingLevels: true,
  defaultThinkingLevel: true,
  defaultReasoningEffort: true,
  supportedReasoningEfforts: true,
} as const

const resolvedProviderModelSchema = providerInputSchema.shape.models
  .unwrap()
  .element.required({ ...requiredModelFields, name: true })
  .transform((value): ProviderModelConfig => {
    const { description, cacheReadPrice, cacheWritePrice, contextTiers, maxModePricingMultiplier, ...required } = value
    return {
      ...required,
      ...(description === undefined ? {} : { description }),
      ...(cacheReadPrice === undefined ? {} : { cacheReadPrice }),
      ...(cacheWritePrice === undefined ? {} : { cacheWritePrice }),
      ...(contextTiers === undefined ? {} : { contextTiers }),
      ...(maxModePricingMultiplier === undefined ? {} : { maxModePricingMultiplier }),
    }
  })

/** Wire data is already resolved: do not rerun provider configuration defaults. */
export const runtimeResolvedModelSchema = z
  .object({
    ...providerInputSchema.shape,
    id: z.string().min(1).max(225),
    models: z.array(resolvedProviderModelSchema).min(1).max(256),
    contextMode: z.enum(['standard', 'max']).optional(),
  })
  .required({ ...requiredModelFields, model: true })
  .superRefine((value, context) => {
    // Raw model IDs are opaque. Catalog selections retain their strict provider prefix.
    if (value.id === value.model) return
    const separator = value.id.indexOf('/')
    const providerId = separator < 0 ? value.id : value.id.slice(0, separator)
    if (
      !providerInputSchema.shape.id.safeParse(providerId).success ||
      (separator >= 0 && (value.id.length === separator + 1 || value.id.length - separator - 1 > 160))
    ) {
      context.addIssue({ code: 'custom', path: ['id'], message: 'Invalid resolved model selection ID' })
    }
  })
  .transform((value): ProviderConfig => {
    const { cacheReadPrice, cacheWritePrice, contextTiers, maxModePricingMultiplier, contextMode, ...required } = value
    return {
      ...required,
      ...(cacheReadPrice === undefined ? {} : { cacheReadPrice }),
      ...(cacheWritePrice === undefined ? {} : { cacheWritePrice }),
      ...(contextTiers === undefined ? {} : { contextTiers }),
      ...(maxModePricingMultiplier === undefined ? {} : { maxModePricingMultiplier }),
      ...(contextMode === undefined ? {} : { contextMode }),
    }
  })
