import type { ComposerModelState } from '@hbar/app-runtime'

type ModelDescriptor = ComposerModelState['models'][number]

// The Host model list is bounded at 4,096; each picker renders at most one 60-row page.
export const MODEL_CATALOG_PAGE_SIZE = 60

export function filterCatalogModels(
  models: readonly ModelDescriptor[],
  query: string,
  limit: number,
  selectedModelId?: string | null,
) {
  const needle = query.trim().toLocaleLowerCase()
  const unique = new Map(models.map((model) => [model.id, model]))
  const matches = [...unique.values()].filter((model) =>
    `${model.providerName} ${model.modelName} ${model.modelId} ${model.description ?? ''}`
      .toLocaleLowerCase()
      .includes(needle),
  )
  // Keep Host order stable for on-page choices; bring in only a selected off-page item.
  const selectedIndex = selectedModelId ? matches.findIndex((model) => model.id === selectedModelId) : -1
  const selected = selectedIndex >= limit && limit > 0 ? matches[selectedIndex] : undefined
  const visible =
    selected && limit > 0
      ? [selected, ...matches.filter((model) => model !== selected).slice(0, limit - 1)]
      : matches.slice(0, limit)
  const groups = new Map<string, { name: string; models: ModelDescriptor[] }>()
  for (const model of visible) {
    const group = groups.get(model.providerId) ?? { name: model.providerName, models: [] }
    group.models.push(model)
    groups.set(model.providerId, group)
  }
  return { groups: [...groups.entries()], remaining: matches.length - visible.length }
}
