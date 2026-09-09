import { expect, test } from 'bun:test'
import type { ModelInfo } from '@hbar/contracts'
import { groupModelsByProvider, modelThinkingLabel, modelThinkingLevels } from './model-catalog'
import { providerFromPreset, providerPresets } from './provider-presets'

function model(overrides: Partial<ModelInfo>): ModelInfo {
  return {
    id: 'provider/model',
    name: 'Model',
    providerId: 'provider',
    providerName: 'Provider',
    modelId: 'model',
    modelName: 'Model',
    protocol: 'openai-completions',
    baseUrl: 'https://example.test/v1',
    model: 'model',
    models: [],
    contextWindow: 128_000,
    maxOutput: 8192,
    imageInput: false,
    reasoning: true,
    inputPrice: 0,
    outputPrice: 0,
    thinkingLevels: ['off', 'low', 'high'],
    supportedThinkingLevels: ['off', 'low', 'high'],
    defaultThinkingLevel: 'low',
    defaultReasoningEffort: 'low',
    supportedReasoningEfforts: ['off', 'low', 'high'],
    hasKey: true,
    ...overrides,
  }
}

test('groups models by provider while preserving provider and model order', () => {
  const groups = groupModelsByProvider([
    model({ id: 'acme/fast', modelId: 'fast', model: 'fast', modelName: 'Fast' }),
    model({ id: 'other/one', providerId: 'other', providerName: 'Other', modelId: 'one', model: 'one' }),
    model({ id: 'acme/deep', modelId: 'deep', model: 'deep', modelName: 'Deep' }),
  ])
  expect(groups.map((group) => group.providerName)).toEqual(['Provider', 'Other'])
  expect(groups[0]?.models.map((entry) => entry.modelId)).toEqual(['fast', 'deep'])
})

test('returns model-specific thinking levels and labels', () => {
  const entry = model({ thinkingLevels: ['off', 'medium', 'high'], supportedThinkingLevels: ['off', 'medium', 'high'] })
  expect(modelThinkingLevels(entry)).toEqual(['off', 'medium', 'high'])
  expect(modelThinkingLabel('medium')).toBe('中')
})

test('expands preset model options into one provider catalog', () => {
  const preset = providerPresets.find((entry) => entry.id === 'openai')!
  const provider = providerFromPreset(preset, 'openai-test')
  expect(provider.model).toBe('gpt-5.5')
  expect(provider.models.map((entry) => entry.id)).toEqual(['gpt-5.5', 'gpt-5.6', 'gpt-5.5-mini'])
  expect(provider.models.every((entry) => entry.thinkingLevels.includes('medium'))).toBeTrue()
})
