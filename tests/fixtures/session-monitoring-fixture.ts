import type { UsageQueryResult } from '@hbar/contracts/commands/usage'

export function sessionMonitoringUsage(sessionId = 'session'): UsageQueryResult {
  const metric = (value: number, unit: 'USD' | 'ratio' | 'tokens_per_second') => ({
    value,
    unit,
    availability: 'available' as const,
    reason: null,
    source: 'test',
    estimated: false,
    sampleCount: 1,
  })
  const latency = {
    p50: 42,
    p95: 84,
    unit: 'milliseconds' as const,
    availability: 'available' as const,
    reason: null,
    sampleCount: 1,
  }
  return {
    accountingVersion: 1,
    scope: { kind: 'session', sessionId, includeDescendants: false },
    window: { from: 0, to: 60_000, bucketMs: 60_000 },
    observedAt: 60_000,
    gap: false,
    totals: { attempts: 2, runs: 1, input: 100, output: 40, cacheRead: 20, cacheWrite: 0, billableTokens: 120 },
    cost: metric(0.125, 'USD'),
    cacheHitRate: metric(0.2, 'ratio'),
    rates: {
      input: metric(10, 'tokens_per_second'),
      output: metric(4, 'tokens_per_second'),
      total: metric(14, 'tokens_per_second'),
    },
    latency: { firstProviderEvent: latency, firstThinking: latency, firstText: latency, response: latency },
    execution: {
      toolCalls: { total: 1, succeeded: 1, failed: 0, unknown: 0 },
      requestConcurrency: {
        value: 2,
        unit: 'count',
        availability: 'available',
        reason: null,
        source: 'attempt-timeline',
        sampleCount: 2,
      },
      toolConcurrency: {
        value: 1,
        unit: 'count',
        availability: 'available',
        reason: null,
        source: 'tool-timeline',
        sampleCount: 1,
      },
      totalRunDuration: {
        value: 500,
        unit: 'milliseconds',
        availability: 'available',
        reason: null,
        source: 'run-projection',
        sampleCount: 1,
      },
      runDuration: latency,
      toolDuration: latency,
    },
    models: [
      {
        modelSelectionId: 'provider:model',
        providerId: 'provider',
        modelId: 'model',
        attempts: 2,
        runs: 1,
        input: 100,
        output: 40,
        cacheRead: 20,
        cacheWrite: 0,
        billableTokens: 120,
        cost: metric(0.125, 'USD'),
      },
    ],
    series: [
      {
        start: 0,
        end: 60_000,
        attempts: 2,
        runs: 1,
        input: 100,
        output: 40,
        cacheRead: 20,
        cacheWrite: 0,
        billableTokens: 120,
        cost: metric(0.125, 'USD'),
      },
    ],
  }
}
