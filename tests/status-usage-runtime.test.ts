import { expect, test } from 'bun:test'
import { createAppRuntime } from '@hbar/app-runtime'
import type { UsageAttemptExport, UsageQueryResult } from '@hbar/contracts/commands/usage'

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

function exportItem(usageId: string): UsageAttemptExport {
  return {
    usageId,
    attemptId: `attempt-${usageId}`,
    sessionId: 'session',
    workspaceId: 'workspace',
    runId: 'run',
    source: 'model',
    providerId: 'provider',
    modelId: 'model',
    modelSelectionId: 'provider:model',
    startedAt: 1,
    firstProviderEventAt: 2,
    firstThinkingAt: null,
    firstTextAt: 3,
    endedAt: 4,
    runStatus: 'completed',
    input: 100,
    output: 40,
    cacheRead: 20,
    cacheWrite: 5,
    billableTokens: 120,
    cost: {
      value: 0.125,
      unit: 'USD',
      availability: 'available',
      reason: null,
      source: 'fixture',
      estimated: true,
      sampleCount: 1,
    },
    pricingVersion: 'fixture-v1',
    accountingVersion: 1,
  }
}

test('status usage workspace owns filters and exports the bounded paged ledger', async () => {
  const queryInputs: Record<string, unknown>[] = []
  const exportInputs: Record<string, unknown>[] = []
  const saved: { name: string; mime: string; content: string }[] = []
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
        if (name === 'usage.query') {
          queryInputs.push(value as Record<string, unknown>)
          return usage()
        }
        if (name === 'usage.export') {
          const input = value as Record<string, unknown>
          exportInputs.push(input)
          const second = input.after === 'next-page'
          return {
            accountingVersion: 1,
            scope: { kind: 'workspace', workspaceId: 'workspace' },
            observedAt: 10,
            gap: !second,
            items: [exportItem(second ? 'usage-2' : 'usage-1')],
            ...(second ? {} : { nextCursor: 'next-page' }),
          }
        }
        throw new Error(`Unsupported usage command: ${name}`)
      },
    },
    exporter: {
      async save(file) {
        saved.push(file)
      },
    },
    surfaces: { canRender: (panelId) => panelId === 'status' },
  })
  try {
    const panel = await runtime.view.commands.execute('app.openStatus', {
      section: 'usage',
      workspaceId: 'workspace',
      sessionId: 'session',
      binding: 'pinned',
    })
    await runtime.view.commands.execute('statusWorkspace.refresh', { instanceId: panel.instanceId })
    const initial = queryInputs[0]!
    expect(initial).toMatchObject({
      scope: { kind: 'global' },
      bucketMs: 3_600_000,
      maxBuckets: 24,
      maxSamples: 10_000,
      filters: {},
    })
    expect((initial.to as number) - (initial.from as number)).toBe(86_400_000)
    await runtime.view.commands.execute('statusWorkspace.setUsageQuery', {
      instanceId: panel.instanceId,
      scope: 'workspace',
      includeDescendants: false,
      window: '7d',
      aggregation: 'day',
      providerId: 'provider',
      modelId: 'model',
    })
    const filtered = queryInputs[1]!
    expect(filtered).toMatchObject({
      scope: { kind: 'workspace', workspaceId: 'workspace' },
      bucketMs: 86_400_000,
      maxBuckets: 7,
      maxSamples: 10_000,
      filters: { providerId: 'provider', modelId: 'model' },
    })
    expect((filtered.to as number) - (filtered.from as number)).toBe(604_800_000)
    await runtime.view.commands.execute('statusWorkspace.exportUsage', {
      instanceId: panel.instanceId,
      format: 'csv',
    })
    expect(exportInputs).toHaveLength(2)
    expect(exportInputs[0]).toMatchObject({
      scope: { kind: 'workspace', workspaceId: 'workspace' },
      filters: { providerId: 'provider', modelId: 'model' },
      limit: 500,
    })
    expect(exportInputs[1]).toMatchObject({ after: 'next-page', limit: 500 })
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ mime: 'text/csv;charset=utf-8' })
    expect(saved[0]!.name).toMatch(/^hbar-usage-\d+\.csv$/)
    expect(saved[0]!.content).toContain('usageId,attemptId,sessionId')
    expect(saved[0]!.content).toContain('usage-1')
    expect(saved[0]!.content).toContain('usage-2')
    expect(runtime.view.state.status.getSnapshot().entries[panel.instanceId]).toMatchObject({
      section: 'usage',
      status: 'ready',
      usage: { totals: { billableTokens: 240 }, models: [{ modelSelectionId: 'provider:model' }] },
      usageQuery: { scope: 'workspace', window: '7d', aggregation: 'day' },
      usageExport: { status: 'succeeded', format: 'csv', rowCount: 2, incomplete: false },
    })
  } finally {
    runtime.dispose()
  }
})

test('status usage export stops after twenty Host pages and marks the file incomplete', async () => {
  let pages = 0
  let content = ''
  const runtime = createAppRuntime({
    instanceId: 'status-usage-limit',
    hostId: 'host',
    directory: {
      async execute() {
        return { items: [], nextCursor: null }
      },
    },
    usage: {
      async execute(name: string) {
        if (name === 'usage.query') return usage()
        pages += 1
        return {
          accountingVersion: 1,
          scope: { kind: 'global' },
          observedAt: 10,
          gap: false,
          items: [exportItem(`usage-${pages}`)],
          nextCursor: `page-${pages + 1}`,
        }
      },
    },
    exporter: {
      async save(file) {
        content = file.content
      },
    },
    surfaces: { canRender: (panelId) => panelId === 'status' },
  })
  try {
    const panel = await runtime.view.commands.execute('app.openStatus', { section: 'usage' })
    await runtime.view.commands.execute('statusWorkspace.refresh', { instanceId: panel.instanceId })
    await runtime.view.commands.execute('statusWorkspace.exportUsage', {
      instanceId: panel.instanceId,
      format: 'json',
    })
    expect(pages).toBe(20)
    expect(JSON.parse(content)).toMatchObject({ version: 1, gap: false, truncated: true })
    expect(runtime.view.state.status.getSnapshot().entries[panel.instanceId]?.usageExport).toMatchObject({
      status: 'succeeded',
      rowCount: 20,
      incomplete: true,
    })
  } finally {
    runtime.dispose()
  }
})
