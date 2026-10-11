import type { ProviderConfig, Usage } from '@hbar/contracts'
import type { UsagePricingSnapshot } from '@hbar/contracts/usage'

/** Inclusive input from the normalized provider usage selects a whole-request
 * tariff. Enabling a larger window alone does not trigger a prompt-length tier. */
export function contextPricing(model: ProviderConfig, usage?: Usage): UsagePricingSnapshot {
  const fixture = model.protocol === 'mock'
  const tier = usage ? model.contextTiers?.findLast((item) => usage.input > item.inputTokensAbove) : undefined
  const multiplier = model.contextMode === 'max' ? (model.maxModePricingMultiplier ?? 1) : 1
  const input = tier?.inputPrice ?? model.inputPrice
  const output = tier?.outputPrice ?? model.outputPrice
  const cacheRead = tier ? tier.cacheReadPrice : model.cacheReadPrice
  const cacheWrite = tier ? tier.cacheWritePrice : model.cacheWritePrice
  const known = fixture || Boolean(tier) || input > 0 || output > 0
  const available =
    known &&
    (!usage ||
      fixture ||
      ((usage.cacheRead === 0 || cacheRead !== undefined) && (usage.cacheWrite === 0 || cacheWrite !== undefined)))
  const extended = Boolean(
    model.contextTiers?.length ||
    model.contextMode ||
    model.maxModePricingMultiplier ||
    cacheRead !== undefined ||
    cacheWrite !== undefined,
  )
  return {
    available,
    currency: 'USD',
    inputPerMillion: input * multiplier,
    outputPerMillion: output * multiplier,
    cacheReadPerMillion: cacheRead === undefined ? null : cacheRead * multiplier,
    cacheWritePerMillion: cacheWrite === undefined ? null : cacheWrite * multiplier,
    source: fixture ? 'fixture' : 'provider-config',
    version: extended
      ? `pricing-v2:${model.id}:${model.model}:${tier?.id ?? 'standard'}:${input}:${output}:${cacheRead ?? 'unknown'}:${cacheWrite ?? 'unknown'}:${multiplier}`
      : `pricing-v1:${model.id}:${model.model}:${model.inputPrice}:${model.outputPrice}`,
    effectiveAt: null,
    ...(extended
      ? {
          contextMode: model.contextMode ?? 'standard',
          contextTierId: tier?.id ?? 'standard',
          inputTokensAbove: tier?.inputTokensAbove ?? 0,
          multiplier,
        }
      : {}),
  }
}

export function configuredContextCost(usage: Usage, pricing: UsagePricingSnapshot): number {
  const uncached = Math.max(0, usage.input - usage.cacheRead - usage.cacheWrite)
  return (
    (uncached * pricing.inputPerMillion +
      usage.output * pricing.outputPerMillion +
      usage.cacheRead * (pricing.cacheReadPerMillion ?? 0) +
      usage.cacheWrite * (pricing.cacheWritePerMillion ?? 0)) /
    1_000_000
  )
}
