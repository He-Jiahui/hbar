import { expect, test } from 'bun:test'
import type { ModelDescriptor } from '@hbar/contracts/commands/models'
import { COMPOSER_MODEL_PAGE_SIZE, filterComposerModels } from '../packages/app-react/src/composer-model-picker'

function fixture(index: number): ModelDescriptor {
  return {
    id: `provider/model-${index}`,
    providerId: 'provider',
    providerName: '长供应商名称 — Long provider name',
    modelId: `model-${index}`,
    modelName: `模型 ${index} — A long translated display name`,
    contextWindow: 128_000,
    maxOutput: 8192,
    imageInput: true,
    reasoning: true,
    thinkingLevels: ['low', 'high'],
    defaultThinkingLevel: 'low',
    hasKey: true,
  }
}

for (const count of [0, 1, 12, COMPOSER_MODEL_PAGE_SIZE, COMPOSER_MODEL_PAGE_SIZE + 1, 4096]) {
  test(`model menu renders a bounded first page for ${count} records`, () => {
    const models = Array.from({ length: count }, (_, index) => fixture(index))
    const result = filterComposerModels(models, '', COMPOSER_MODEL_PAGE_SIZE)
    expect(result.groups.flatMap(([, group]) => group.models)).toEqual(models.slice(0, COMPOSER_MODEL_PAGE_SIZE))
    expect(result.remaining).toBe(Math.max(0, count - COMPOSER_MODEL_PAGE_SIZE))
  })
}

test('catalog search covers hidden pages, provider names and empty results without a fake selection', () => {
  const models = Array.from({ length: 61 }, (_, index) => fixture(index))
  expect(filterComposerModels(models, 'model-60', 60).groups[0]?.[1].models).toEqual([models[60]!])
  expect(filterComposerModels(models, '长供应商', 60).remaining).toBe(1)
  expect(filterComposerModels(models, 'missing', 60).groups).toEqual([])
})

test('catalog groups use stable provider IDs; duplicate records cannot render duplicate actions', () => {
  const original = fixture(0)
  const renamed = { ...original, modelName: '重命名' }
  const another = { ...fixture(1), providerId: 'other', providerName: 'Other provider' }
  const result = filterComposerModels([original, renamed, another], '', 60)
  expect(result.groups.map(([id]) => id)).toEqual(['provider', 'other'])
  expect(result.groups[0]?.[1].models).toEqual([renamed])
  expect(result.groups[0]?.[1].models[0]?.id).toBe(original.id)
  expect(filterComposerModels([another], original.id, 60).groups).toEqual([])
})
