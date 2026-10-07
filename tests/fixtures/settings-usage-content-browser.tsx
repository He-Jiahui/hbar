import { createRoot, type Root } from 'react-dom/client'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError } from '@hbar/commands'
import { usageQueryInputSchema, type UsageQueryInput, type UsageQueryResult } from '@hbar/contracts/commands/usage'
import { HbarRuntimeProvider, HbarSettingsUsage } from '@hbar/app-react'
import { LumenProvider, DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'

export interface SettingsUsageContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly count: number
  readonly buckets: number
  readonly suffix: string
  readonly failure?: boolean
  readonly duplicate?: boolean
  readonly wrongScope?: boolean
}
export const settingsUsageContentModel = (index: number) =>
  `provider: Complete model name 完整模型名称 ${index} ${'LongIdentityWithoutSpaces'.repeat(4)}`

declare global {
  interface Window {
    mountSettingsUsageContent(input: SettingsUsageContentInput): Promise<void>
    settingsUsageContentState(): {
      readonly calls: readonly UsageQueryInput[]
      readonly entry:
        | ReturnType<
            ReturnType<typeof createAppRuntime>['view']['state']['settingsUsage']['getSnapshot']
          >['entries'][string]
        | undefined
    }
    refreshSettingsUsageContent(): Promise<unknown>
    repairSettingsUsageContent(): void
    reorderSettingsUsageContent(): Promise<unknown>
    disposeSettingsUsageContent?: () => void
  }
}
let root: Root | undefined

function fixtureReport(
  input: UsageQueryInput,
  options: SettingsUsageContentInput,
  reversed: boolean,
): UsageQueryResult {
  const cost = {
    value: null,
    unit: 'USD' as const,
    availability: 'unavailable' as const,
    reason: 'PRICING_NOT_AVAILABLE',
    source: 'owned-test-ledger',
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
  const models = Array.from({ length: options.count }, (_, index) => ({
    providerId: 'provider',
    modelId: settingsUsageContentModel(index).slice('provider: '.length),
    modelSelectionId: options.duplicate ? 'duplicate-model' : `original-model-${index}`,
    ...totals,
    cost,
  }))
  return {
    accountingVersion: 1,
    scope: options.wrongScope ? { kind: 'workspace', workspaceId: 'foreign-workspace' } : input.scope,
    window: { from: input.from ?? 0, to: input.to ?? Date.now(), bucketMs: input.bucketMs },
    observedAt: Date.now(),
    gap: false,
    totals,
    cost,
    cacheHitRate: metric,
    rates: { input: rate, output: rate, total: rate },
    latency: { firstProviderEvent: latency, firstThinking: latency, firstText: latency, response: latency },
    series: Array.from({ length: options.buckets }, (_, index) => ({
      start: (input.from ?? 0) + index * input.bucketMs,
      end: (input.from ?? 0) + (index + 1) * input.bucketMs,
      ...totals,
      cost,
    })),
    models: reversed ? models.reverse() : models,
  }
}

window.mountSettingsUsageContent = async (input) => {
  window.disposeSettingsUsageContent?.()
  const element = document.getElementById('settings-usage-content-fixture')
  if (!element) throw new Error('Missing owned usage fixture')
  const calls: UsageQueryInput[] = []
  let failure = input.failure ?? false
  let reversed = false
  const owned = createAppRuntime({
    instanceId: crypto.randomUUID(),
    hostId: 'owned-usage-fixture',
    directory: {
      execute: (name) =>
        Promise.resolve(name === 'workspace.get' || name === 'session.get' ? null : { items: [], nextCursor: null }),
    },
    surfaces: { canRender: (id) => id === 'settings' },
    usage: {
      execute(name, raw) {
        if (name !== 'usage.query') return Promise.reject(new Error(`Unexpected usage command ${name}`))
        const query = usageQueryInputSchema.parse(raw)
        calls.push(query)
        return failure
          ? Promise.reject(new CommandError('READ_FAILED', 'Owned read failure'))
          : Promise.resolve(fixtureReport(query, input, reversed))
      },
    },
  })
  await owned.ready
  await owned.view.commands.execute('app.openSettings', { scope: 'global', section: 'usage', instanceId: 'settings' })
  const base = getShellCopy(input.locale).settingsUsage
  const labels = {
    ...base,
    title: base.title + input.suffix,
    description: base.description + input.suffix,
    summary: base.summary + input.suffix,
    models: base.models + input.suffix,
    activity: base.activity + input.suffix,
    tokens: base.tokens + input.suffix,
    input: base.input + input.suffix,
    output: base.output + input.suffix,
    cost: base.cost + input.suffix,
    refresh: base.refresh + input.suffix,
    previous: base.previous + input.suffix,
    next: base.next + input.suffix,
    windows: [
      ...base.windows.map((item) => ({ ...item, label: item.label + input.suffix })),
      ...base.windows.slice(0, 1),
    ],
    model: (_providerId: string, modelId: string) => `provider: ${modelId}`,
  }
  window.settingsUsageContentState = () => ({
    calls,
    entry: owned.view.state.settingsUsage.getSnapshot().entries.settings,
  })
  window.refreshSettingsUsageContent = () =>
    owned.view.commands.execute('settingsUsage.refresh', { instanceId: 'settings' })
  window.repairSettingsUsageContent = () => {
    failure = false
  }
  window.reorderSettingsUsageContent = () => {
    reversed = true
    return window.refreshSettingsUsageContent()
  }
  window.disposeSettingsUsageContent = () => {
    root?.unmount()
    owned.dispose()
    root = undefined
  }
  root = createRoot(element)
  root.render(
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}>
      <HbarRuntimeProvider view={owned.view}>
        <HbarSettingsUsage instanceId="settings" connected labels={labels} />
      </HbarRuntimeProvider>
    </LumenProvider>,
  )
}
