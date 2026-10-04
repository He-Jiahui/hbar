import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import { HbarRuntimeProvider, HbarSettingsUsage, SETTINGS_USAGE_MODELS_PER_PAGE } from '@hbar/app-react'
import { usageQueryInputSchema, type UsageQueryInput, type UsageQueryResult } from '@hbar/contracts/commands/usage'
import { getShellCopy } from '../apps/web/src/shell-copy'

function report(input: UsageQueryInput, modelCount = 1): UsageQueryResult {
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
const directory: CommandExecutor = {
  execute: (name) =>
    Promise.resolve(name === 'workspace.get' || name === 'session.get' ? null : { items: [], nextCursor: null }),
}
function fixture(port?: CommandExecutor) {
  const runtime = createAppRuntime({
    instanceId: crypto.randomUUID(),
    hostId: 'settings-usage-host',
    directory,
    ...(port ? { usage: port } : {}),
    surfaces: { canRender: (id) => id === 'settings' },
  })
  const open = (section = 'usage') =>
    runtime.view.commands.execute('app.openSettings', { scope: 'global', section, instanceId: 'settings' })
  const refresh = () => runtime.view.commands.execute('settingsUsage.refresh', { instanceId: 'settings' })
  const entry = () => runtime.view.state.settingsUsage.getSnapshot().entries.settings
  return { runtime, open, refresh, entry }
}

test('settings usage uses only bounded global Host reads; each window preserves the settings page and local failure retries', async () => {
  let fail = false
  const inputs: UsageQueryInput[] = []
  const f = fixture({
    execute(name, raw) {
      expect(name).toBe('usage.query')
      const input = usageQueryInputSchema.parse(raw)
      inputs.push(input)
      return fail
        ? Promise.reject(new CommandError('CONNECTION_CLOSED', 'Disconnected'))
        : Promise.resolve(report(input))
    },
  })
  try {
    await f.runtime.ready
    await f.open()
    expect(await f.refresh()).toEqual({ status: 'ready', error: null })
    const saved = f.entry()?.report
    fail = true
    expect(await f.refresh()).toEqual({ status: 'error', error: 'CONNECTION_CLOSED' })
    expect(f.entry()?.report).toBe(saved)
    fail = false
    for (const [window, duration, bucketMs] of [
      ['1h', 3_600_000, 300_000],
      ['24h', 86_400_000, 3_600_000],
      ['7d', 604_800_000, 21_600_000],
      ['30d', 2_592_000_000, 86_400_000],
    ] as const) {
      await f.runtime.view.commands.execute('settingsUsage.setWindow', { instanceId: 'settings', window })
      const input = inputs.at(-1)
      expect(input).toMatchObject({
        scope: { kind: 'global' },
        bucketMs,
        maxBuckets: 120,
        maxSamples: 5_000,
        filters: {},
      })
      expect((input?.to ?? 0) - (input?.from ?? 0)).toBe(duration)
      expect(f.entry()?.window).toBe(window)
      expect(f.runtime.view.state.presentation.getSnapshot().page).toMatchObject({
        kind: 'settings',
        instanceId: 'settings',
      })
      expect(
        Object.values(f.runtime.view.state.surfaces.getSnapshot().panels).some((panel) => panel.panelId === 'status'),
      ).toBe(false)
    }
  } finally {
    f.runtime.dispose()
  }
})

test('superseded windows and leaving/reentering the category revoke old reads without blocking the fresh result', async () => {
  const pending: {
    input: UsageQueryInput
    resolve: (value: UsageQueryResult) => void
    signal: AbortSignal | undefined
  }[] = []
  const f = fixture({
    execute(_name, raw, options) {
      return new Promise<UsageQueryResult>((resolve) =>
        pending.push({ input: usageQueryInputSchema.parse(raw), resolve, signal: options?.signal }),
      )
    },
  })
  try {
    await f.open()
    const old = f.refresh()
    const next = f.runtime.view.commands.execute('settingsUsage.setWindow', { instanceId: 'settings', window: '7d' })
    expect(pending[0]?.signal?.aborted).toBe(true)
    const fresh = pending[1]
    if (!fresh) throw new Error('Expected the new window read')
    fresh.resolve(report(fresh.input))
    expect(await next).toMatchObject({ status: 'ready' })
    const confirmed = f.entry()?.report
    pending[0]?.resolve(report(pending[0].input))
    expect(await old).toMatchObject({ status: 'error' })
    expect(f.entry()?.report).toBe(confirmed)
    const leaving = f.refresh()
    await f.open('appearance')
    expect(pending[2]?.signal?.aborted).toBe(true)
    await f.open()
    const returning = f.refresh()
    pending[2]?.resolve(report(pending[2].input))
    expect(await leaving).toMatchObject({ status: 'error' })
    const returned = pending[3]
    if (!returned) throw new Error('Expected the reopened category read')
    returned.resolve({ ...report(returned.input), totals: { ...report(returned.input).totals, input: 999 } })
    await returning
    expect(f.entry()?.report?.totals.input).toBe(999)
    expect(f.entry()?.window).toBe('7d')
  } finally {
    f.runtime.dispose()
  }
})

test('unknown capability, wrong scopes, duplicate model IDs and oversized buckets remain recoverable errors', async () => {
  const missing = fixture()
  try {
    await missing.open()
    expect(await missing.refresh()).toMatchObject({ status: 'error', error: 'CAPABILITY_UNAVAILABLE' })
    expect(missing.entry()?.report).toBeNull()
  } finally {
    missing.runtime.dispose()
  }
  for (const change of [
    (value: UsageQueryResult) => ({ ...value, scope: { kind: 'workspace' as const, workspaceId: 'wrong-workspace' } }),
    (value: UsageQueryResult) => ({ ...value, models: [value.models[0]!, value.models[0]!] }),
    (value: UsageQueryResult) => ({
      ...value,
      series: Array.from({ length: 121 }, (_, i) => ({ ...value.series[0]!, start: value.window.from + i })),
    }),
  ]) {
    const f = fixture({ execute: (_name, raw) => Promise.resolve(change(report(usageQueryInputSchema.parse(raw)))) })
    try {
      await f.open()
      expect(await f.refresh()).toMatchObject({ status: 'error', error: 'INVALID_OUTPUT' })
      expect(f.entry()?.report).toBeNull()
    } finally {
      f.runtime.dispose()
    }
  }
})

test('hidden settings and old panel instances cannot issue usage reads; double refresh is bounded', async () => {
  let calls = 0
  let resolveRead: (value: UsageQueryResult) => void = () => {}
  let input: UsageQueryInput | undefined
  const f = fixture({
    execute(_name, raw) {
      calls++
      input = usageQueryInputSchema.parse(raw)
      return new Promise<UsageQueryResult>((resolve) => {
        resolveRead = resolve
      })
    },
  })
  try {
    await f.open()
    const first = f.refresh()
    let busy: unknown
    try {
      await f.refresh()
    } catch (reason) {
      busy = reason
    }
    expect(busy).toMatchObject({ code: 'BUSY' })
    let repeatedWindow: unknown
    try {
      await f.runtime.view.commands.execute('settingsUsage.setWindow', { instanceId: 'settings', window: '24h' })
    } catch (reason) {
      repeatedWindow = reason
    }
    expect(repeatedWindow).toMatchObject({ code: 'BUSY' })
    expect(calls).toBe(1)
    await f.runtime.view.commands.execute('app.back', {})
    expect(await first).toMatchObject({ status: 'error' })
    if (!input) throw new Error('Expected the original query')
    resolveRead(report(input))
    let hidden: unknown
    try {
      await f.refresh()
    } catch (reason) {
      hidden = reason
    }
    expect(hidden).toMatchObject({ code: 'COMMAND_NOT_FOUND' })
    expect(calls).toBe(1)
  } finally {
    f.runtime.dispose()
  }
})

test('retargeting the same settings instance from pinned project A to B revokes the old global read', async () => {
  const pending: {
    input: UsageQueryInput
    signal: AbortSignal | undefined
    resolve: (value: UsageQueryResult) => void
  }[] = []
  const f = fixture({
    execute(_name, raw, options) {
      return new Promise<UsageQueryResult>((resolve) =>
        pending.push({ input: usageQueryInputSchema.parse(raw), signal: options?.signal, resolve }),
      )
    },
  })
  try {
    await f.runtime.view.commands.execute('app.openSettings', {
      scope: 'global',
      section: 'usage',
      instanceId: 'settings',
      binding: 'pinned',
      workspaceId: 'project-A',
    })
    const panelA = f.runtime.view.state.surfaces.getSnapshot().panels.settings
    const old = f.refresh()
    await f.runtime.view.commands.execute('app.openSettings', {
      scope: 'global',
      section: 'usage',
      instanceId: 'settings',
      binding: 'pinned',
      workspaceId: 'project-B',
    })
    const panelB = f.runtime.view.state.surfaces.getSnapshot().panels.settings
    expect(panelB).not.toBe(panelA)
    expect(panelB?.workspaceId).toBe('project-B')
    expect(pending[0]?.signal?.aborted).toBe(true)
    const fresh = f.refresh()
    const readB = pending[1]
    if (!readB) throw new Error('Expected project B settings read')
    const confirmed = report(readB.input)
    readB.resolve({ ...confirmed, totals: { ...confirmed.totals, input: 777 } })
    expect(await fresh).toMatchObject({ status: 'ready' })
    const readA = pending[0]
    if (!readA) throw new Error('Expected project A settings read')
    readA.resolve({ ...report(readA.input), totals: { ...report(readA.input).totals, input: 111 } })
    expect(await old).toMatchObject({ status: 'error' })
    expect(f.entry()?.report?.totals.input).toBe(777)
    expect(pending.map((item) => item.input.scope)).toEqual([{ kind: 'global' }, { kind: 'global' }])
    expect(f.runtime.view.state.surfaces.getSnapshot().panels.settings).toBe(panelB)
  } finally {
    f.runtime.dispose()
  }
})

test('a malformed bucket after a window switch cannot reuse old data; switching back and explicitly retrying recover', async () => {
  let rejectBucket = true
  const f = fixture({
    execute(_name, raw) {
      const input = usageQueryInputSchema.parse(raw)
      const value = report(input)
      if (rejectBucket && input.bucketMs === 21_600_000) {
        rejectBucket = false
        return Promise.resolve({ ...value, window: { ...value.window, bucketMs: value.window.bucketMs + 1 } })
      }
      return Promise.resolve(value)
    },
  })
  try {
    await f.open()
    await f.refresh()
    expect(f.entry()?.report?.window.bucketMs).toBe(3_600_000)
    expect(
      await f.runtime.view.commands.execute('settingsUsage.setWindow', { instanceId: 'settings', window: '7d' }),
    ).toEqual({ status: 'error', error: 'INVALID_OUTPUT' })
    expect(f.entry()).toMatchObject({ window: '7d', report: null, error: 'INVALID_OUTPUT' })
    await f.runtime.view.commands.execute('settingsUsage.setWindow', { instanceId: 'settings', window: '24h' })
    expect(f.entry()).toMatchObject({ window: '24h', status: 'ready', error: null })
    expect(f.entry()?.report?.window.bucketMs).toBe(3_600_000)
    await f.runtime.view.commands.execute('settingsUsage.setWindow', { instanceId: 'settings', window: '7d' })
    expect(f.entry()).toMatchObject({ window: '7d', status: 'ready', error: null })
    expect(f.entry()?.report?.window.bucketMs).toBe(21_600_000)
  } finally {
    f.runtime.dispose()
  }
})

test('the real twelve-second read deadline leaves a recoverable error without an automatic repeat', async () => {
  let calls = 0
  let firstInput: UsageQueryInput | undefined
  let firstSignal: AbortSignal | undefined
  let resolveLate: (value: UsageQueryResult) => void = () => {}
  const f = fixture({
    execute(_name, raw, options) {
      calls++
      const input = usageQueryInputSchema.parse(raw)
      if (calls > 1) return Promise.resolve(report(input))
      firstInput = input
      firstSignal = options?.signal
      return new Promise<UsageQueryResult>((resolve) => {
        resolveLate = resolve
      })
    },
  })
  try {
    await f.open()
    expect(await f.refresh()).toEqual({ status: 'error', error: 'TIMEOUT' })
    expect(firstSignal?.aborted).toBe(true)
    expect(f.entry()).toMatchObject({ status: 'error', error: 'TIMEOUT', report: null })
    expect(calls).toBe(1)
    expect(await f.refresh()).toEqual({ status: 'ready', error: null })
    const fresh = f.entry()?.report
    if (!firstInput) throw new Error('Expected the timed-out query')
    resolveLate({ ...report(firstInput), totals: { ...report(firstInput).totals, input: 999 } })
    await Promise.resolve()
    expect(calls).toBe(2)
    expect(f.entry()?.report).toBe(fresh)
  } finally {
    f.runtime.dispose()
  }
}, 20_000)

test('both locale Views use true metrics, no invented cost, bounded rows, empty states and long host labels', async () => {
  for (const count of [0, 1, 8, 9, 1_024]) {
    const f = fixture({
      execute: (_name, raw) => {
        const value = report(usageQueryInputSchema.parse(raw), count)
        if (count === 0) value.totals = { ...value.totals, attempts: 0, input: 0, output: 0 }
        return Promise.resolve(value)
      },
    })
    try {
      await f.open()
      await f.refresh()
      for (const locale of ['zh-CN', 'en-US'] as const) {
        const labels = getShellCopy(locale).settingsUsage
        const longLabels = { ...labels, description: `${labels.description}${'长内容Long'.repeat(30)}` }
        const html = renderToStaticMarkup(
          <HbarRuntimeProvider view={f.runtime.view}>
            <HbarSettingsUsage instanceId="settings" connected labels={longLabels} />
          </HbarRuntimeProvider>,
        )
        expect(html).toContain(labels.title)
        expect(html).toContain(labels.costUnavailable)
        expect(html).not.toContain('$0.00')
        expect(html).toContain(longLabels.description)
        expect((html.match(/class="hbar-settings-usage-model-row"/g) ?? []).length).toBe(
          Math.min(count, SETTINGS_USAGE_MODELS_PER_PAGE),
        )
        if (count > 8) expect(html).toContain(labels.page(1, 8, count))
        if (count === 0) {
          expect(html).toContain(labels.empty)
          expect(html).toContain(labels.noModels)
        }
      }
    } finally {
      f.runtime.dispose()
    }
  }
})
