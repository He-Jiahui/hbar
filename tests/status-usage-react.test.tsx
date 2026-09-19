import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarRuntimeProvider, HbarStatusWorkspace } from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import type { UsageQueryResult } from '@hbar/contracts/commands/usage'
import { getShellCopy } from '../apps/web/src/shell-copy'

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
  const totals = { attempts: 2, runs: 2, input: 200, output: 80, cacheRead: 40, cacheWrite: 10, billableTokens: 240 }
  return {
    accountingVersion: 1,
    scope: { kind: 'global' },
    window: { from: 0, to: 60_000, bucketMs: 60_000 },
    observedAt: 60_000,
    gap: false,
    totals,
    cost: metric(0.25, 'USD'),
    cacheHitRate: metric(0.2, 'ratio'),
    rates: {
      input: metric(10, 'tokens_per_second'),
      output: metric(4, 'tokens_per_second'),
      total: metric(14, 'tokens_per_second'),
    },
    latency: { firstProviderEvent: latency, firstThinking: latency, firstText: latency, response: latency },
    execution: {
      toolCalls: { total: 3, succeeded: 2, failed: 1, unknown: 0 },
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
        sampleCount: 3,
      },
      totalRunDuration: {
        value: 2_500,
        unit: 'milliseconds',
        availability: 'available',
        reason: null,
        source: 'run-projection',
        sampleCount: 2,
      },
      runDuration: latency,
      toolDuration: latency,
    },
    models: [
      {
        modelSelectionId: 'provider:model',
        providerId: 'provider',
        modelId: 'model',
        ...totals,
        cost: metric(0.25, 'USD'),
      },
    ],
    series: [{ start: 0, end: 60_000, ...totals, cost: metric(0.25, 'USD') }],
  }
}

test('global usage status renders ledger and execution facts', async () => {
  const runtime = createAppRuntime({
    instanceId: 'status-usage-react',
    hostId: 'host',
    directory: {
      async execute() {
        return { items: [], nextCursor: null }
      },
    },
    usage: {
      async execute() {
        return usage()
      },
    },
    surfaces: { canRender: (panelId) => panelId === 'status' },
  })
  try {
    const panel = await runtime.view.commands.execute('app.openStatus', { section: 'usage' })
    await runtime.view.commands.execute('statusWorkspace.refresh', { instanceId: panel.instanceId })
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarStatusWorkspace labels={getShellCopy('en-US').status} />
      </HbarRuntimeProvider>,
    )
    expect(html).toContain('Global AI usage')
    expect(html).toContain('280 tokens')
    expect(html).toContain('$0.25')
    expect(html).toContain('p50 40 ms · p95 80 ms')
    expect(html).toContain('provider / model')
    expect(html).toContain('Execution statistics')
    expect(html).toContain('<dt>Tool calls</dt><dd>3</dd>')
    expect(html).toContain('2 succeeded · 1 failed · 0 unknown')
    expect(html).toContain('Peak request concurrency')
    expect(html).toContain('2.5 s')
  } finally {
    runtime.dispose()
  }
})
