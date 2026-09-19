import { expect, test } from 'bun:test'
import {
  createPiProviderPresetCatalog,
  ProviderPresetNotFoundError,
} from '../packages/provider-catalog/src/index.ts'

test('PI provider presets split incompatible provider variants and page large model catalogs', () => {
  const catalog = createPiProviderPresetCatalog()
  const firstPage = catalog.list({ limit: 100 })
  const openRouterVariants = firstPage.items.filter((preset) => preset.providerId === 'openrouter')
  expect(openRouterVariants.map((preset) => preset.protocol).sort()).toEqual([
    'anthropic-messages',
    'openai-completions',
  ])
  expect(openRouterVariants.every((preset) => preset.id.length <= 160)).toBeTrue()

  const openAiCompatible = openRouterVariants.find((preset) => preset.protocol === 'openai-completions')!
  const models = catalog.models({ presetId: openAiCompatible.id, limit: 25 })
  expect(models.items).toHaveLength(25)
  expect(models.nextCursor).toBe('25')
  expect(models.items.every((model) => model.contextWindow >= 1_024)).toBeTrue()
  expect(models.items.every((model) => model.maxOutput >= 64)).toBeTrue()
})

test('PI provider presets expose exact thinking levels and configurable endpoint templates', () => {
  const catalog = createPiProviderPresetCatalog()
  const presets = catalog.list({ limit: 100 }).items
  const anthropic = presets.find(
    (preset) => preset.providerId === 'anthropic' && preset.protocol === 'anthropic-messages',
  )!
  const anthropicModels = catalog.models({ presetId: anthropic.id, query: 'claude-opus', limit: 100 }).items
  expect(anthropicModels.some((model) => model.reasoning && model.thinkingLevels.includes('high'))).toBeTrue()

  const cloudflare = presets.find((preset) => preset.providerId === 'cloudflare-workers-ai')!
  expect(cloudflare.requiresBaseUrlConfiguration).toBeTrue()
  expect(cloudflare.baseUrl).toContain('{CLOUDFLARE_ACCOUNT_ID}')
})

test('PI provider preset lookup rejects stale opaque ids', () => {
  const catalog = createPiProviderPresetCatalog()
  expect(() => catalog.models({ presetId: 'missing', limit: 10 })).toThrow(ProviderPresetNotFoundError)
})
