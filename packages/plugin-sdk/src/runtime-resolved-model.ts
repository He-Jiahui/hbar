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
    // The prefix remains a strict provider key; the suffix is the existing opaque model ID.
    id: z
      .string()
      .min(1)
      .max(225)
      .refine((id) => {
        const separator = id.indexOf('/')
        const providerId = separator < 0 ? id : id.slice(0, separator)
        return (
          providerInputSchema.shape.id.safeParse(providerId).success &&
          (separator < 0 || (id.length > separator + 1 && id.length - separator - 1 <= 160))
        )
      }, 'Invalid resolved model selection ID'),
    models: z.array(resolvedProviderModelSchema).min(1).max(256),
    contextMode: z.enum(['standard', 'max']).optional(),
  })
  .required({ ...requiredModelFields, model: true })
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
