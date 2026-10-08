import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarRuntimeProvider, HbarSessionMonitoring } from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import type { UsageQueryResult } from '@hbar/contracts/commands/usage'
import { getShellCopy } from '../apps/web/src/shell-copy'

const workspace = { id: 'workspace', path: 'D:/workspace', name: 'Workspace', createdAt: 1 }
const session = {
  id: 'session',
  workspaceId: workspace.id,
  title: 'Measured session',
  archived: false,
  parentId: null,
  createdAt: 2,
  updatedAt: 3,
  seq: 4,
}

function usage(): UsageQueryResult {
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
    scope: { kind: 'session', sessionId: session.id, includeDescendants: false },
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

async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (check()) return
    await Bun.sleep(1)
  }
  throw new Error('state did not settle')
}

test('session monitoring renders only the runtime usage projection and closes through a command', async () => {
  const runtime = createAppRuntime({
    instanceId: 'session-monitoring',
    hostId: 'host',
    directory: {
      async execute(name: string) {
        if (name === 'session.get') return session
        if (name === 'workspace.get') return workspace
        if (name === 'session.list') return { items: [session], nextCursor: null }
        if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
        throw new Error(`Unsupported query: ${name}`)
      },
    },
    usage: {
      async execute() {
        return usage()
      },
    },
    surfaces: { canRender: (panelId) => panelId === 'monitoring' },
  })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    await waitFor(() => runtime.view.state.controls.getSnapshot().usage !== null)
    await runtime.view.commands.execute('app.openPanel', { panelId: 'monitoring' })
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarSessionMonitoring labels={getShellCopy('en-US').monitoring} />
      </HbarRuntimeProvider>,
    )
    expect(html).toContain('Session monitoring')
    expect(html).toContain('140')
    expect(html).toContain('$0.125')
    expect(html).toContain('provider / model')
    expect(html).toContain('Token timeline')
    expect(html).toContain('Execution statistics')
    expect(html).toContain('1 succeeded · 0 failed · 0 unknown')
    expect(html).toContain('lumen-compact-metrics')
    expect(html).toContain('hbar-app-react-monitoring-echarts')
    expect(html).not.toContain('hbar-app-react-monitoring-lumen')
    expect(html).not.toContain('<details open')
    expect(html).not.toContain('hbar-app-ui-metrics')

    const panelId = runtime.view.state.surfaces.getSnapshot().focusedPanelId
    expect(panelId).not.toBeNull()
    await runtime.view.commands.execute('app.closePanel', { instanceId: panelId! })
    expect(runtime.view.state.surfaces.getSnapshot().focusedPanelId).toBeNull()
  } finally {
    runtime.dispose()
  }
})
