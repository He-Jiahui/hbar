import { z } from 'zod'

/** Prices are USD per million tokens. A threshold applies to the full request,
 * including cached input, and never retroactively changes earlier requests. */
export const modelContextTierSchema = z.strictObject({
  id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)
    .refine((id) => id !== 'standard'),
  contextWindow: z.number().int().min(1024).max(10_000_000),
  inputTokensAbove: z.number().int().nonnegative().max(10_000_000),
  inputPrice: z.number().finite().nonnegative(),
  outputPrice: z.number().finite().nonnegative(),
  cacheReadPrice: z.number().finite().nonnegative().optional(),
  cacheWritePrice: z.number().finite().nonnegative().optional(),
})
export const modelContextTiersSchema = z
  .array(modelContextTierSchema)
  .max(8)
  .superRefine((tiers, context) => {
    const ids = new Set<string>()
    for (const [index, tier] of tiers.entries()) {
      if (ids.has(tier.id))
        context.addIssue({ code: 'custom', path: [index, 'id'], message: 'Context tier ids must be unique' })
      ids.add(tier.id)
      const previous = tiers[index - 1]
      if (
        previous &&
        (tier.contextWindow <= previous.contextWindow || tier.inputTokensAbove <= previous.inputTokensAbove)
      )
        context.addIssue({
          code: 'custom',
          path: [index],
          message: 'Context windows and pricing thresholds must be strictly increasing',
        })
      if (tier.inputTokensAbove >= tier.contextWindow)
        context.addIssue({
          code: 'custom',
          path: [index, 'inputTokensAbove'],
          message: 'A pricing threshold must be below its context capacity',
        })
    }
  })
export type ModelContextTier = z.output<typeof modelContextTierSchema>

export function maximumContextWindow(model: {
  readonly contextWindow: number
  readonly contextTiers?: readonly ModelContextTier[]
}): number {
  return Math.max(model.contextWindow, model.contextTiers?.at(-1)?.contextWindow ?? model.contextWindow)
}
