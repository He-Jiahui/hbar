import type { UsageQueryInput, UsageQueryResult } from '@hbar/contracts/commands/usage'

export function settingsUsageReport(input: UsageQueryInput, modelCount = 1): UsageQueryResult {
  const cost = {
    value: null,
    unit: 'USD' as const,
    availability: 'unavailable' as const,
    reason: 'PRICING_NOT_AVAILABLE',
    source: 'test-ledger',
    estimated: false,
    sampleCount: 1,
  }
  const metric = { ...cost, unit: 'ratio' as const }
  const rate = { ...cost, unit: 'tokens_per_second' as const }
  const latency = {
    p50: null,
    p95: null,
    unit: 'milliseconds' as const,
    availability: 'unavailable' as const,
    reason: 'NO_SAMPLES',
    sampleCount: 0,
  }
  const totals = { input: 200, output: 80, cacheRead: 40, cacheWrite: 0, billableTokens: 240, attempts: 1, runs: 1 }
  return {
    accountingVersion: 1,
    scope: input.scope,
    window: { from: input.from ?? 0, to: input.to ?? Date.now(), bucketMs: input.bucketMs },
    observedAt: Date.now(),
    gap: false,
    totals,
    cost,
    cacheHitRate: metric,
    rates: { input: rate, output: rate, total: rate },
    latency: { firstProviderEvent: latency, firstThinking: latency, firstText: latency, response: latency },
    series: [{ start: input.from ?? 0, end: (input.from ?? 0) + input.bucketMs, ...totals, cost }],
    models: Array.from({ length: modelCount }, (_, i) => ({
      providerId: 'provider',
      modelId: `model-${i}`,
      modelSelectionId: `provider:model-${i}`,
      ...totals,
      cost,
    })),
  }
}
