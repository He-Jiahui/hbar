import type { Api, Model } from '@earendil-works/pi-ai'
import type { ProviderPresetModel } from '@hbar/contracts/commands/configuration'

/** Only documented direct-provider models get defaults. Gateways retain their
 * own catalog and rates. These rules never alter an already saved profile.
 * https://developers.openai.com/api/docs/models/gpt-5.4
 * https://developers.openai.com/api/docs/models/gpt-6-astra
 * https://platform.claude.com/docs/en/about-claude/pricing
 */
export function presetContextProfile(
  model: Model<Api>,
): Pick<ProviderPresetModel, 'contextWindow' | 'contextTiers' | 'cacheReadPrice' | 'cacheWritePrice'> {
  const caches = {
    ...(model.cost.cacheRead > 0 ? { cacheReadPrice: model.cost.cacheRead } : {}),
    ...(model.cost.cacheWrite > 0 ? { cacheWritePrice: model.cost.cacheWrite } : {}),
  }
  const openai = model.provider === 'openai' && (model.id === 'gpt-5.4' || model.id === 'gpt-6-astra')
  const anthropic = model.provider === 'anthropic' && /^claude-(?:sonnet|opus)-4-6$/.test(model.id)
  const standard = openai ? 272_000 : anthropic ? 200_000 : model.contextWindow
  const expanded = openai ? 1_050_000 : model.contextWindow
  if (expanded <= standard) return { contextWindow: model.contextWindow, ...caches }
  const tariff = openai ? model.cost.tiers?.find((tier) => tier.inputTokensAbove === standard) : undefined
  return {
    contextWindow: standard,
    ...caches,
    contextTiers: [
      {
        id: 'long',
        contextWindow: expanded,
        inputTokensAbove: standard,
        inputPrice: tariff?.input ?? model.cost.input * (openai ? 2 : 1),
        outputPrice: tariff?.output ?? model.cost.output * (openai ? 1.5 : 1),
        ...(caches.cacheReadPrice === undefined ? {} : { cacheReadPrice: caches.cacheReadPrice * (openai ? 2 : 1) }),
        ...(caches.cacheWritePrice === undefined ? {} : { cacheWritePrice: caches.cacheWritePrice * (openai ? 2 : 1) }),
      },
    ],
  }
}
