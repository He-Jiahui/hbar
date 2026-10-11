import { expect, test } from 'bun:test'
import { providerSchema } from '@hbar/contracts'

test('image generation is opt-in per provider model and survives provider normalization', () => {
  const legacy = providerSchema.parse({
    id: 'legacy',
    name: 'Legacy',
    protocol: 'openai-responses',
    baseUrl: 'https://example.test/v1',
    model: 'chat',
  })
  expect(legacy.models[0]?.imageGeneration).toBeFalse()

  const optedIn = providerSchema.parse({
    id: 'images',
    name: 'Images',
    protocol: 'openai-responses',
    baseUrl: 'https://example.test/v1',
    model: 'paint',
    models: [{ id: 'paint', imageGeneration: true }, { id: 'chat' }],
  })
  expect(optedIn.models.map((model) => [model.id, model.imageGeneration])).toEqual([
    ['paint', true],
    ['chat', false],
  ])
})
