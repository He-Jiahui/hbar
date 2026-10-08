import type { UsageQueryResult } from '@hbar/contracts/commands/usage'

export const monitoringProvider = '原提供商 Original provider identity '.repeat(3).trim()
export const monitoringModel = (index: number) =>
  `原模型 ${index} Complete original model identity ${'LongIdentityWithoutSpaces'.repeat(4)}`.slice(0, 160)
export const monitoringModelName = (index: number) => `${monitoringProvider} / ${monitoringModel(index)}`
export function monitoringReport(sessionId: string, count: number, buckets = 1): UsageQueryResult {
  const cost: UsageQueryResult['cost'] = {
    value: 0.125,
    unit: 'USD',
    availability: 'available',
    reason: null,
    source: 'owned-ledger',
    estimated: false,
    sampleCount: 1,
  }
  const latency: UsageQueryResult['latency']['response'] = {
    p50: 42,
    p95: 84,
    unit: 'milliseconds',
    availability: 'available',
    reason: null,
    sampleCount: 1,
  }
  const totals: UsageQueryResult['totals'] = {
    attempts: count,
    runs: count,
    input: count * 100,
    output: count * 40,
    cacheRead: count * 20,
    cacheWrite: 0,
    billableTokens: count * 120,
  }
  const rate = { ...cost, unit: 'tokens_per_second' as const, value: 14 }
  return {
    accountingVersion: 1,
    scope: { kind: 'session', sessionId, includeDescendants: false },
    window: { from: 0, to: Math.max(60_000, buckets * 60_000), bucketMs: 60_000 },
    observedAt: Math.max(60_000, buckets * 60_000),
    gap: true,
    totals,
    cost,
    cacheHitRate: { ...cost, unit: 'ratio', value: 0.2 },
    rates: { input: rate, output: rate, total: rate },
    latency: { firstProviderEvent: latency, firstThinking: latency, firstText: latency, response: latency },
    execution: {
      toolCalls: { total: 3, succeeded: 1, failed: 1, unknown: 1 },
      requestConcurrency: {
        value: 2,
        unit: 'count',
        availability: 'available',
        reason: null,
        source: 'owned-timeline',
        sampleCount: 1,
      },
      toolConcurrency: {
        value: 1,
        unit: 'count',
        availability: 'available',
        reason: null,
        source: 'owned-timeline',
        sampleCount: 1,
      },
      totalRunDuration: {
        value: 500,
        unit: 'milliseconds',
        availability: 'available',
        reason: null,
        source: 'owned-timeline',
        sampleCount: 1,
      },
      runDuration: latency,
      toolDuration: latency,
    },
    models: Array.from({ length: count }, (_, index) => ({
      ...totals,
      modelSelectionId: `original-model-${index}`,
      providerId: monitoringProvider,
      modelId: monitoringModel(index),
      cost,
    })),
    series: Array.from({ length: buckets }, (_, index) => ({
      ...totals,
      start: index * 60_000,
      end: (index + 1) * 60_000,
      cost,
    })),
  }
}
