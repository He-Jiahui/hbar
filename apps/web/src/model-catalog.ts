import type { ModelInfo, ThinkingLevel } from '@hbar/contracts'

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

export function modelThinkingLabel(level: ThinkingLevel): string {
  return {
    off: '关闭',
    minimal: '极低',
    low: '低',
    medium: '中',
    high: '高',
    xhigh: '极高',
    max: '最大',
  }[level]
}
