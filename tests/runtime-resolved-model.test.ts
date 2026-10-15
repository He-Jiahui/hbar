import { expect, test } from 'bun:test'
import { providerSchema, resolveProviderModel, resolveModelContextMode } from '@hbar/contracts'
import {
  runtimeModelRequestSchema,
  runtimeDriverSummarySchema,
  runtimeDriverCallbackSchema,
} from '../packages/plugin-sdk/src/runtime-driver'

const provider = providerSchema.parse({
  id: 'niuma_openai',
  name: 'Fixture',
  protocol: 'openai-responses',
  baseUrl: 'https://example.invalid',
  models: [
    { id: 'primary', contextWindow: 128_000, maxOutput: 8192 },
    {
      id: 'gpt-6.1-sol',
      contextWindow: 256_000,
      maxOutput: 16384,
      contextTiers: [
        { id: 'expanded', inputTokensAbove: 200_000, contextWindow: 512_000, inputPrice: 2, outputPrice: 4 },
      ],
    },
  ],
})

test('resolved selection survives execution, summary and beforeRequest RPC without configuration normalization', () => {
  const id = 'niuma_openai/gpt-6.1-sol'
  const model = { ...resolveModelContextMode(resolveProviderModel(provider, id), true), id }
  const request = { system: 'fixture', messages: [], model }
  expect(runtimeModelRequestSchema.parse(request).model).toEqual(model)
  expect(runtimeDriverSummarySchema.parse({ request, apiKey: null }).request.model).toEqual(model)
  expect(
    runtimeDriverCallbackSchema.parse({ invocationId: 'fixture', method: 'beforeRequest', request, stepId: 'step' }),
  ).toEqual({ invocationId: 'fixture', method: 'beforeRequest', request, stepId: 'step' })
  expect(model.contextWindow).toBe(512_000)
  expect(model.model).toBe('gpt-6.1-sol')
})

test('legacy provider alias stays valid while provider configuration keys remain strict', () => {
  const request = { system: '', messages: [], model: resolveProviderModel(provider, provider.id) }
  expect(runtimeModelRequestSchema.parse(request).model).toEqual(request.model)
  expect(providerSchema.safeParse({ ...provider, id: 'niuma_openai/gpt-6.1-sol' }).success).toBe(false)
  for (const id of ['BadProvider/model', '../model', '/model', 'niuma_openai/']) {
    expect(runtimeModelRequestSchema.safeParse({ ...request, model: { ...request.model, id } }).success).toBe(false)
  }
})
