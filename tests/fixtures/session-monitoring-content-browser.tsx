import { createRoot, type Root } from 'react-dom/client'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError } from '@hbar/commands'
import { usageQueryInputSchema, type UsageQueryInput } from '@hbar/contracts/commands/usage'
import { HbarRuntimeProvider, HbarSessionMonitoring } from '@hbar/app-react'
import { LumenProvider, LumenFrame, DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import { monitoringReport } from './session-monitoring-content-data'
import '@lumen/app-ui/styles.css'

export interface MonitoringContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly count: number
  readonly buckets?: number
  readonly suffix: string
  readonly state?: 'ready' | 'loading' | 'error' | 'offline'
  readonly duplicate?: boolean
  readonly wrongScope?: boolean
}
declare global {
  interface Window {
    mountMonitoringContent(input: MonitoringContentInput): Promise<void>
    monitoringContentState(): {
      readonly controls: ReturnType<ReturnType<typeof createAppRuntime>['view']['state']['controls']['getSnapshot']>
      readonly calls: readonly UsageQueryInput[]
      readonly panels: number
    }
    repairMonitoringContent(): void
    refreshMonitoringContent(): Promise<unknown>
    reorderMonitoringContent(): Promise<unknown>
    failMonitoringContent(): Promise<unknown>
    disposeMonitoringContent?: () => void
  }
}
let root: Root | undefined
const workspace = { id: 'original-workspace', name: 'Owned workspace', path: 'D:/owned-monitoring', createdAt: 1 }
const session = {
  id: 'original-session',
  workspaceId: workspace.id,
  title: 'Original session',
  archived: false,
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  seq: 0,
}
window.mountMonitoringContent = async (input) => {
  window.disposeMonitoringContent?.()
  const node = document.getElementById('monitoring-content-fixture')
  if (!node) throw new Error('Missing owned monitoring fixture')
  const calls: UsageQueryInput[] = []
  let failed = input.state === 'error'
  let reversed = false
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const owned = createAppRuntime({
    instanceId: crypto.randomUUID(),
    hostId: 'owned-monitoring-host',
    directory: {
      execute(name) {
        if (name === 'workspace.get') return Promise.resolve(workspace)
        if (name === 'session.get') return Promise.resolve(session)
        return Promise.resolve({ items: name === 'workspace.list' ? [workspace] : [session], nextCursor: null })
      },
    },
    usage: {
      async execute(name, raw) {
        if (name !== 'usage.query') throw new Error(`Unexpected owned usage command ${name}`)
        const query = usageQueryInputSchema.parse(raw)
        calls.push(query)
        if (input.state === 'loading') await gate
        if (failed) throw new CommandError('READ_FAILED', 'Owned usage read failed')
        const report = monitoringReport(input.wrongScope ? 'foreign-session' : session.id, input.count, input.buckets)
        if (input.duplicate && report.models[0])
          report.models.splice(1, 0, { ...report.models[0], modelId: 'Foreign duplicate should not replace original' })
        if (reversed) report.models.reverse()
        return report
      },
    },
    surfaces: { canRender: (id) => id === 'monitoring' },
  })
  await owned.ready
  await owned.view.commands.execute('app.setSession', { sessionId: session.id, workspaceId: workspace.id })
  if (input.state !== 'loading') {
    for (let attempt = 0; attempt < 500 && owned.view.state.controls.getSnapshot().status === 'loading'; attempt++)
      await BunSafeYield()
    if (owned.view.state.controls.getSnapshot().status === 'loading')
      throw new Error('Owned monitoring read did not settle')
  }
  await owned.view.commands.execute('app.openPanel', { panelId: 'monitoring' })
  const base = getShellCopy(input.locale).monitoring
  const labels = {
    ...base,
    title: base.title + input.suffix,
    description: base.description + input.suffix,
    close: base.close + input.suffix,
    loading: base.loading + input.suffix,
    offline: base.offline + input.suffix,
    oldResult: base.oldResult + input.suffix,
    gap: base.gap + input.suffix,
    empty: base.empty + input.suffix,
    unavailable: base.unavailable + input.suffix,
    series: base.series + input.suffix,
    models: base.models + input.suffix,
    previous: base.previous + input.suffix,
    next: base.next + input.suffix,
    page: (from: number, to: number, total: number) => base.page(from, to, total) + input.suffix,
    totals: {
      tokens: base.totals.tokens + input.suffix,
      runs: base.totals.runs + input.suffix,
      attempts: base.totals.attempts + input.suffix,
      cost: base.totals.cost + input.suffix,
      cache: base.totals.cache + input.suffix,
      rate: base.totals.rate + input.suffix,
    },
    latency: {
      ...base.latency,
      title: base.latency.title + input.suffix,
      firstToken: base.latency.firstToken + input.suffix,
      response: base.latency.response + input.suffix,
    },
    execution: { ...base.execution, title: base.execution.title + input.suffix },
    error: (code: string) => base.error(code) + input.suffix,
    tokens: (value: number) => base.tokens(value) + input.suffix,
    currency: (value: number) => base.currency(value) + input.suffix,
  }
  root = createRoot(node)
  root.render(
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode }}>
      <HbarRuntimeProvider view={owned.view}>
        <LumenFrame className="owned-monitoring-pane">
          <HbarSessionMonitoring labels={labels} connected={input.state !== 'offline'} />
        </LumenFrame>
      </HbarRuntimeProvider>
    </LumenProvider>,
  )
  const refresh = () => owned.view.commands.execute('sessionControls.refresh', { sessionId: session.id })
  window.monitoringContentState = () => ({
    controls: owned.view.state.controls.getSnapshot(),
    calls,
    panels: Object.keys(owned.view.state.surfaces.getSnapshot().panels).length,
  })
  window.refreshMonitoringContent = refresh
  window.repairMonitoringContent = () => {
    failed = false
    release()
  }
  window.reorderMonitoringContent = () => {
    reversed = !reversed
    return refresh()
  }
  window.failMonitoringContent = () => {
    failed = true
    return refresh()
  }
  window.disposeMonitoringContent = () => {
    release()
    root?.unmount()
    root = undefined
    owned.dispose()
  }
}
function BunSafeYield(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
