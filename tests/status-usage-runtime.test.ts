import { expect, test } from 'bun:test'
import { createAppRuntime } from '@hbar/app-runtime'
import type { UsageQueryResult } from '@hbar/contracts/commands/usage'

function usage(): UsageQueryResult {
  const metric = (value: number, unit: 'USD' | 'ratio' | 'tokens_per_second') => ({
    value,
    unit,
    availability: 'available' as const,
    reason: null,
    source: 'fixture',
    estimated: unit === 'USD',
    sampleCount: 2,
  })
  const latency = {
    p50: 40,
    p95: 80,
    unit: 'milliseconds' as const,
    availability: 'available' as const,
    reason: null,
    sampleCount: 2,
  }
  return {
    accountingVersion: 1,
    scope: { kind: 'global' },
    window: { from: 0, to: 120_000, bucketMs: 60_000 },
    observedAt: 120_000,
    gap: false,
    totals: { attempts: 2, runs: 2, input: 200, output: 80, cacheRead: 40, cacheWrite: 10, billableTokens: 240 },
    cost: metric(0.25, 'USD'),
    cacheHitRate: metric(0.2, 'ratio'),
    rates: {
      input: metric(10, 'tokens_per_second'),
      output: metric(4, 'tokens_per_second'),
      total: metric(14, 'tokens_per_second'),
    },
    latency: { firstProviderEvent: latency, firstThinking: latency, firstText: latency, response: latency },
    models: [
      {
        modelSelectionId: 'provider:model',
        providerId: 'provider',
        modelId: 'model',
        attempts: 2,
        runs: 2,
        input: 200,
        output: 80,
        cacheRead: 40,
        cacheWrite: 10,
        billableTokens: 240,
        cost: metric(0.25, 'USD'),
      },
    ],
    series: [
      {
        start: 0,
        end: 60_000,
        attempts: 1,
        runs: 1,
        input: 100,
        output: 40,
        cacheRead: 20,
        cacheWrite: 5,
        billableTokens: 120,
        cost: metric(0.125, 'USD'),
      },
      {
        start: 60_000,
        end: 120_000,
        attempts: 1,
        runs: 1,
        input: 100,
        output: 40,
        cacheRead: 20,
        cacheWrite: 5,
        billableTokens: 120,
        cost: metric(0.125, 'USD'),
      },
    ],
  }
}

test('status usage workspace queries the global bounded usage ledger', async () => {
  let input: unknown
  const runtime = createAppRuntime({
    instanceId: 'status-usage',
    hostId: 'host',
    directory: {
      async execute() {
        return { items: [], nextCursor: null }
      },
    },
    usage: {
      async execute(name: string, value: unknown) {
        if (name !== 'usage.query') throw new Error(`Unsupported usage command: ${name}`)
        input = value
        return usage()
      },
    },
    surfaces: { canRender: (panelId) => panelId === 'status' },
  })
  try {
    const panel = await runtime.view.commands.execute('app.openStatus', { section: 'usage' })
    await runtime.view.commands.execute('statusWorkspace.refresh', { instanceId: panel.instanceId })
    expect(input).toEqual({
      scope: { kind: 'global' },
      bucketMs: 60_000,
      maxBuckets: 120,
      maxSamples: 10_000,
      filters: {},
    })
    expect(runtime.view.state.status.getSnapshot().entries[panel.instanceId]).toMatchObject({
      section: 'usage',
      status: 'ready',
      usage: { totals: { billableTokens: 240 }, models: [{ modelSelectionId: 'provider:model' }] },
    })
  } finally {
    runtime.dispose()
  }
})
