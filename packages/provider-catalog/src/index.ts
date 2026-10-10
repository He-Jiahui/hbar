import { getSupportedThinkingLevels } from '@earendil-works/pi-ai'
import type { Api, Model } from '@earendil-works/pi-ai'
import {
  builtinProviders,
  getBuiltinModelDataGeneratedAt,
  getBuiltinModels,
  getBuiltinProviders,
} from '@earendil-works/pi-ai/providers/all'
import type {
  ProviderPresetListInput,
  ProviderPresetListResult,
  ProviderPresetModel,
  ProviderPresetModelsInput,
  ProviderPresetModelsResult,
  ProviderPresetSummary,
} from '@hbar/contracts/commands/configuration'
import { presetContextProfile } from './context-profile'

type SupportedProtocol = ProviderPresetSummary['protocol']

interface PresetRecord {
  summary: ProviderPresetSummary
  models: ProviderPresetModel[]
}

const supportedProtocols = new Set<string>(['openai-completions', 'openai-responses', 'anthropic-messages'])

function isSupportedProtocol(value: string): value is SupportedProtocol {
  return supportedProtocols.has(value)
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function defaultThinkingLevel(levels: readonly ProviderPresetModel['thinkingLevels'][number][]) {
  return levels.includes('medium') ? ('medium' as const) : levels[0]!
}

function toPresetModel(model: Model<Api>): ProviderPresetModel {
  const thinkingLevels = getSupportedThinkingLevels(model)
  return {
    id: model.id,
    name: model.name,
    ...presetContextProfile(model),
    maxOutput: model.maxTokens,
    imageInput: model.input.includes('image'),
    reasoning: model.reasoning,
    inputPrice: model.cost.input,
    outputPrice: model.cost.output,
    thinkingLevels,
    defaultThinkingLevel: defaultThinkingLevel(thinkingLevels),
  }
}

function buildPresets(): PresetRecord[] {
  const names = new Map(builtinProviders().map((provider) => [provider.id, provider.name]))
  const records: PresetRecord[] = []
  for (const providerId of getBuiltinProviders()) {
    const groups = new Map<string, { protocol: SupportedProtocol; baseUrl: string; models: ProviderPresetModel[] }>()
    for (const model of getBuiltinModels(providerId)) {
      if (!isSupportedProtocol(model.api) || !model.baseUrl) continue
      const key = `${model.api}\n${model.baseUrl}`
      const existing = groups.get(key)
      if (existing) existing.models.push(toPresetModel(model))
      else groups.set(key, { protocol: model.api, baseUrl: model.baseUrl, models: [toPresetModel(model)] })
    }
    for (const group of groups.values()) {
      const models = group.models.toSorted(
        (left, right) =>
          left.name.localeCompare(right.name, 'en', { sensitivity: 'base' }) || left.id.localeCompare(right.id),
      )
      records.push({
        summary: {
          id: `${providerId}:${group.protocol}:${stableHash(group.baseUrl)}`,
          providerId,
          name: names.get(providerId) ?? providerId,
          protocol: group.protocol,
          baseUrl: group.baseUrl,
          requiresBaseUrlConfiguration: /\{[^}]+\}/.test(group.baseUrl),
          modelCount: models.length,
        },
        models,
      })
    }
  }
  return records.toSorted(
    (left, right) =>
      left.summary.name.localeCompare(right.summary.name, 'en', { sensitivity: 'base' }) ||
      left.summary.protocol.localeCompare(right.summary.protocol) ||
      left.summary.baseUrl.localeCompare(right.summary.baseUrl),
  )
}

function paginate<Value>(items: readonly Value[], cursor: string | undefined, limit: number) {
  const offset = cursor === undefined ? 0 : Number(cursor)
  const page = items.slice(offset, offset + limit)
  const nextOffset = offset + page.length
  return { items: page, nextCursor: nextOffset < items.length ? String(nextOffset) : null }
}

function includesQuery(values: readonly string[], query: string | undefined): boolean {
  const normalized = query?.trim().toLocaleLowerCase()
  return !normalized || values.some((value) => value.toLocaleLowerCase().includes(normalized))
}

export class ProviderPresetNotFoundError extends Error {
  constructor(readonly presetId: string) {
    super(`Provider preset ${presetId} was not found`)
    this.name = 'ProviderPresetNotFoundError'
  }
}

export class PiProviderPresetCatalog {
  readonly #catalogGeneratedAt = getBuiltinModelDataGeneratedAt() ?? null
  readonly #presets = buildPresets()
  readonly #presetsById = new Map(this.#presets.map((preset) => [preset.summary.id, preset]))

  list(input: ProviderPresetListInput): ProviderPresetListResult {
    const matches = this.#presets
      .map((preset) => preset.summary)
      .filter((preset) => includesQuery([preset.name, preset.providerId, preset.protocol, preset.baseUrl], input.query))
    return { ...paginate(matches, input.cursor, input.limit ?? 50), catalogGeneratedAt: this.#catalogGeneratedAt }
  }

  models(input: ProviderPresetModelsInput): ProviderPresetModelsResult {
    const preset = this.#presetsById.get(input.presetId)
    if (!preset) throw new ProviderPresetNotFoundError(input.presetId)
    const matches = preset.models.filter((model) => includesQuery([model.name, model.id], input.query))
    return {
      preset: preset.summary,
      ...paginate(matches, input.cursor, input.limit ?? 50),
      catalogGeneratedAt: this.#catalogGeneratedAt,
    }
  }
}

export function createPiProviderPresetCatalog(): PiProviderPresetCatalog {
  return new PiProviderPresetCatalog()
}
