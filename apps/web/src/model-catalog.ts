import type { ModelInfo, ThinkingLevel } from '@hbar/contracts'
import { translate, type LocaleMessageKey } from './locale'

export interface ModelProviderGroup {
  providerId: string
  providerName: string
  models: ModelInfo[]
}

export function groupModelsByProvider(models: readonly ModelInfo[]): ModelProviderGroup[] {
  const groups = new Map<string, ModelProviderGroup>()
  for (const model of models) {
    const providerId = model.providerId || model.id
    const group = groups.get(providerId)
    if (group) {
      group.models.push(model)
      continue
    }
    groups.set(providerId, {
      providerId,
      providerName: model.providerName || model.name,
      models: [model],
    })
  }
  return [...groups.values()]
}

export function modelThinkingLevels(model: ModelInfo): ThinkingLevel[] {
  const levels = model.thinkingLevels.length > 0
    ? model.thinkingLevels
    : model.supportedThinkingLevels.length > 0
      ? model.supportedThinkingLevels
      : ['off' as const]
  return [...levels]
}

export function modelThinkingLabel(level: ThinkingLevel, locale = 'zh-CN'): string {
  const keys: Record<ThinkingLevel, LocaleMessageKey> = {
    off: 'thinkingLevelOff', minimal: 'thinkingLevelMinimal', low: 'thinkingLevelLow', medium: 'thinkingLevelMedium',
    high: 'thinkingLevelHigh', xhigh: 'thinkingLevelXhigh', max: 'thinkingLevelMax',
  }
  return translate(locale, keys[level])
}
