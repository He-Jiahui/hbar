import { expect, test } from 'bun:test'
import {
  maximumContextWindow,
  modelContextTiersSchema,
  providerSchema,
  resolveModelContextMode,
  resolveProviderModel,
} from '@hbar/contracts'
import { createUsageFact } from '@hbar/usage'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { ProviderInput, Usage } from '@hbar/contracts'

const extended = {
  id: 'long',
  contextWindow: 1_050_000,
  inputTokensAbove: 272_000,
  inputPrice: 5,
  outputPrice: 22.5,
  cacheReadPrice: 0.5,
  cacheWritePrice: 6.25,
}
function model(overrides: Partial<ProviderInput> = {}) {
  return providerSchema.parse({
    id: 'tier-fixture',
    name: 'Tier fixture',
    protocol: 'openai-responses',
    baseUrl: 'https://fixture.invalid',
    model: 'tier-model',
    contextWindow: 272_000,
    maxOutput: 8192,
    inputPrice: 2.5,
    outputPrice: 15,
    cacheReadPrice: 0.25,
    cacheWritePrice: 3.125,
    contextTiers: [extended],
    ...overrides,
  })
}
const usage = (input: number): Usage => ({ input, output: 1000, cacheRead: 0, cacheWrite: 0, cost: 999 })
function fact(input: number, max = true, overrides: Partial<ProviderInput> = {}, buckets: Partial<Usage> = {}) {
  return createUsageFact({
    attemptId: 'attempt',
    runId: 'run',
    source: 'model',
    model: resolveModelContextMode(model(overrides), max),
    usage: { ...usage(input), ...buckets },
  })
}

test('standard and MAX capacities are independent of reasoning and remain on the same model', () => {
  const base = model({ reasoning: true })
  expect(maximumContextWindow(base)).toBe(1_050_000)
  expect(resolveModelContextMode(base, false)).toMatchObject({ contextWindow: 272_000, contextMode: 'standard' })
  const max = resolveModelContextMode(base, true)
  expect(max).toMatchObject({ contextWindow: 1_050_000, contextMode: 'max', model: base.model })
  expect(max.thinkingLevels).toEqual(base.thinkingLevels)
  expect(base.contextWindow).toBe(272_000)
})

test('legacy providers retain their sole capacity and do not manufacture MAX support', () => {
  const base = providerSchema.parse({
    id: 'legacy',
    name: 'Legacy',
    protocol: 'mock',
    model: 'legacy',
    baseUrl: 'http://localhost',
  })
  expect(base.contextTiers).toBeUndefined()
  expect(resolveModelContextMode(base, true)).toMatchObject({ contextWindow: 128_000, contextMode: 'standard' })
})

test('prompt-length pricing has an inclusive cheap boundary and applies the premium to the whole request', () => {
  const before = fact(272_000)
  const after = fact(272_001)
  expect(before.pricing).toMatchObject({ contextTierId: 'standard', inputPerMillion: 2.5, outputPerMillion: 15 })
  expect(after.pricing).toMatchObject({
    contextTierId: 'long',
    inputTokensAbove: 272_000,
    inputPerMillion: 5,
    outputPerMillion: 22.5,
  })
  expect(before.cost).toBeCloseTo((272_000 * 2.5 + 1000 * 15) / 1_000_000)
  expect(after.cost).toBeCloseTo((272_001 * 5 + 1000 * 22.5) / 1_000_000)
  expect(after.cost).toBeGreaterThan(before.cost * 1.9)
})

test('a short request in MAX keeps the base tariff, while a configured mode markup is independent', () => {
  expect(fact(10_000).pricing.contextTierId).toBe('standard')
  const marked = fact(10_000, true, { maxModePricingMultiplier: 1.2 })
  expect(marked.pricing).toMatchObject({ multiplier: 1.2, inputPerMillion: 3, outputPerMillion: 18 })
  expect(fact(10_000, false, { maxModePricingMultiplier: 1.2 }).pricing.multiplier).toBe(1)
})

test('cached input counts toward the threshold and its rates are charged without double-counting', () => {
  const result = fact(272_001, true, {}, { cacheRead: 200_000, cacheWrite: 10_000 })
  expect(result.pricing).toMatchObject({ contextTierId: 'long', cacheReadPerMillion: 0.5, cacheWritePerMillion: 6.25 })
  expect(result.cost).toBeCloseTo((62_001 * 5 + 200_000 * 0.5 + 10_000 * 6.25 + 1000 * 22.5) / 1_000_000)
})

test('an unconfigured cache rate remains unavailable instead of reporting cached input as free', () => {
  const result = fact(
    300_000,
    true,
    {
      contextTiers: [
        { id: 'long', contextWindow: 1_050_000, inputTokensAbove: 272_000, inputPrice: 5, outputPrice: 22.5 },
      ],
    },
    { cacheRead: 100_000 },
  )
  expect(result.pricing.available).toBe(false)
  expect(result.pricing.cacheReadPerMillion).toBeNull()
})

test('multiple context tiers select the last applicable tariff and preserve historical snapshots', () => {
  const config = model({
    contextTiers: [
      { ...extended, contextWindow: 512_000 },
      {
        ...extended,
        id: 'largest',
        contextWindow: 1_050_000,
        inputTokensAbove: 512_000,
        inputPrice: 10,
        outputPrice: 30,
      },
    ],
  })
  const saved = createUsageFact({ attemptId: 'attempt', source: 'compaction', model: config, usage: usage(600_000) })
  expect(saved.pricing.contextTierId).toBe('largest')
  config.contextTiers![1]!.inputPrice = 99
  expect(saved.pricing.inputPerMillion).toBe(10)
  expect(saved.cost).toBeCloseTo(6.03)
})

test('context tiers cannot leak from the primary model to another model in the same provider', () => {
  const config = model({
    model: 'large',
    contextTiers: undefined,
    models: [
      { id: 'large', contextTiers: [extended] },
      { id: 'small', contextWindow: 32_000 },
    ],
  })
  const small = resolveProviderModel(config, `${config.id}/small`)
  expect(small.contextTiers).toBeUndefined()
  expect(maximumContextWindow(small)).toBe(32_000)
})

async function removePricingFixture(root: string): Promise<void> {
  const target = await realpath(root)
  if (
    dirname(target).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(target).startsWith('hbar-context-tiers-')
  )
    throw new Error('Unowned pricing fixture')
  await rm(target, { recursive: true, force: true })
}

test('Host catalogs and restart preserve independent per-model context and pricing declarations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-context-tiers-'))
  const options = { home: join(root, 'data'), workspace: root, demo: true, secrets: new MemorySecrets() }
  let kernel = await Kernel.create(options)
  try {
    await kernel.saveProvider({
      id: 'independent',
      name: 'Independent capacities',
      protocol: 'mock',
      baseUrl: 'http://localhost',
      model: 'large',
      models: [
        {
          id: 'large',
          contextWindow: 272_000,
          contextTiers: [extended],
          cacheReadPrice: 0.25,
          cacheWritePrice: 3.125,
          maxModePricingMultiplier: 1.2,
        },
        { id: 'small', contextWindow: 32_000 },
      ],
    })
    const catalog = await kernel.models()
    expect(catalog.find((item) => item.modelId === 'large')?.contextTiers).toEqual([extended])
    expect(catalog.find((item) => item.modelId === 'small')?.contextTiers).toBeUndefined()
    expect(catalog.find((item) => item.modelId === 'small')?.cacheReadPrice).toBeUndefined()
    expect(catalog.find((item) => item.modelId === 'small')?.cacheWritePrice).toBeUndefined()
    expect(catalog.find((item) => item.modelId === 'small')?.maxModePricingMultiplier).toBeUndefined()
    await kernel.close()
    kernel = await Kernel.create(options)
    expect((await kernel.models()).find((item) => item.modelId === 'large')?.contextTiers).toEqual([extended])
    expect((await kernel.models()).find((item) => item.modelId === 'small')?.contextTiers).toBeUndefined()
  } finally {
    await kernel.close()
    await removePricingFixture(root)
  }
})

test.each(
  [
    [extended, { ...extended, id: 'long' }],
    [{ ...extended, contextWindow: 200_000 }],
    [{ ...extended, inputTokensAbove: 1_050_000 }],
    [{ ...extended, inputPrice: -1 }],
    Array.from({ length: 9 }, (_, index) => ({
      ...extended,
      id: `tier-${index}`,
      contextWindow: 1_000_000 + index * 100_000,
      inputTokensAbove: 272_000 + index * 1000,
    })),
  ].map((contextTiers) => ({ contextTiers })),
)('invalid tier configuration is rejected at the provider boundary', ({ contextTiers }) => {
  expect(() => model({ contextTiers })).toThrow()
})

test('the tier contract rejects unsorted thresholds even if capacities increase', () => {
  expect(
    modelContextTiersSchema.safeParse([
      { ...extended, contextWindow: 512_000 },
      { ...extended, id: 'largest', inputTokensAbove: 10 },
    ]).success,
  ).toBe(false)
})
