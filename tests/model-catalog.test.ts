import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import {
  DEFAULT_THINKING_LEVELS,
  modelSelectionId,
  providerSchema,
} from '@hbar/contracts'
import { Kernel } from '@hbar/kernel'

const fixtures: Array<{ root: string; kernel: Kernel }> = []

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    await fixture.kernel.close()
    await rm(fixture.root, { recursive: true, force: true })
  }
})
test('provider schema expands legacy single-model configs and preserves model capabilities', () => {
  const legacy = providerSchema.parse({
    id: 'legacy',
    name: 'Legacy',
    protocol: 'openai-completions',
    baseUrl: 'https://example.test/v1',
    model: 'legacy-model',
  })
  expect(legacy.models).toHaveLength(1)
  expect(legacy.models[0]?.id).toBe('legacy-model')
  expect(legacy.models[0]?.thinkingLevels).toEqual(['off'])
  expect(legacy.defaultThinkingLevel).toBe('off')

  const multi = providerSchema.parse({
    id: 'multi',
    name: 'Multi',
    protocol: 'openai-completions',
    baseUrl: 'https://example.test/v1',
    model: 'reasoning',
    models: [
      { id: 'fast', thinkingLevels: ['off', 'low'], defaultThinkingLevel: 'low' },
      {
        id: 'reasoning',
        thinkingLevels: DEFAULT_THINKING_LEVELS,
        defaultThinkingLevel: 'high',
      },
    ],
  })
  expect(multi.models.map((model) => model.id)).toEqual(['fast', 'reasoning'])
  expect(multi.models[0]?.defaultThinkingLevel).toBe('low')
  expect(multi.models[1]?.defaultThinkingLevel).toBe('high')
  expect(multi.thinkingLevels).toEqual([...DEFAULT_THINKING_LEVELS])
})

test('kernel exposes provider groups with independent model and thinking metadata', async () => {
  const root = await mkdtemp(join(process.env.TEMP ?? process.cwd(), 'hbar-model-catalog-'))
  const kernel = await Kernel.create({ home: join(root, 'data'), workspace: root, demo: true })
  fixtures.push({ root, kernel })
  await kernel.saveProvider({
    id: 'multi',
    name: 'Multi',
    protocol: 'mock',
    baseUrl: 'http://127.0.0.1',
    model: 'deep',
    models: [
      { id: 'fast', thinkingLevels: ['off', 'low'], defaultThinkingLevel: 'low' },
      { id: 'deep', thinkingLevels: ['off', 'medium', 'high'], defaultThinkingLevel: 'high' },
    ],
  })

  const catalog = await kernel.models()
  const grouped = catalog.filter((model) => model.providerId === 'multi')
  expect(grouped.map((model) => model.id)).toEqual(['multi/fast', 'multi/deep'])
  expect(grouped.map((model) => model.providerName)).toEqual(['Multi', 'Multi'])
  expect(grouped[0]?.thinkingLevels).toEqual(['off', 'low'])
  expect(grouped[1]?.thinkingLevels).toEqual(['off', 'medium', 'high'])
  expect(modelSelectionId('multi', 'deep', 2)).toBe('multi/deep')

  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id)
  const run = await kernel.submit(
    session.id,
    'multi-model-run',
    { text: 'use the deep model', images: [], thinking: 'xhigh' },
    'multi/deep',
  )
  expect(run.input.thinking).toBe('high')
  await kernel.waitForIdle()
  const request = (await kernel.storage.call('events', session.id, 0)).find((event) => event.type === 'request.started')
  expect((request?.data as { request?: { model?: { model?: string } } }).request?.model?.model).toBe('deep')
})
