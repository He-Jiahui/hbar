import { createRoot, type Root } from 'react-dom/client'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError } from '@hbar/commands'
import type { SystemDiagnosis } from '@hbar/contracts/commands/system'
import { HbarRuntimeProvider, HbarSystemDiagnostics } from '@hbar/app-react'
import { LumenProvider, LumenFrame, DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'

export interface SystemDiagnosticsContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly count: number
  readonly suffix: string
  readonly state: 'ready' | 'error' | 'loading' | 'offline'
  readonly tools?: number
}
declare global {
  interface Window {
    mountSystemDiagnosticsContent(input: SystemDiagnosticsContentInput): Promise<void>
    systemDiagnosticsContentState(): {
      readonly calls: readonly string[]
      readonly status: string | undefined
      readonly error: string | null | undefined
    }
    refreshSystemDiagnosticsContent(): Promise<unknown>
    repairSystemDiagnosticsContent(): void
    failSystemDiagnosticsContent(): void
    disposeSystemDiagnosticsContent?: () => void
  }
}
let root: Root | undefined
window.mountSystemDiagnosticsContent = async (input) => {
  window.disposeSystemDiagnosticsContent?.()
  const element = document.getElementById('system-diagnostics-content-fixture')
  if (!element) throw new Error('Missing owned diagnostics fixture')
  const calls: string[] = []
  const report: SystemDiagnosis = {
    host: {
      version: 'v'.repeat(64),
      protocol: 2,
      instanceId: 'owned-diagnostics-host',
      platform: 'p'.repeat(64),
      addresses: [],
      activeRuns: 0,
      demo: false,
    },
    database: Object.fromEntries(
      Array.from({ length: input.count }, (_, index) => [
        `${String(index).padStart(5, '0')}-原存储键-${'LongStorageIdentifier'.repeat(6)}`,
        index,
      ]),
    ),
    recoveredRuns: 0,
    streams: 0,
    plugins: [],
    tools: Array.from({ length: input.tools ?? 1 }, (_, index) => `original-tool-${index}`),
  }
  let failed = input.state === 'error'
  let hold = input.state === 'loading'
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const owned = createAppRuntime({
    instanceId: crypto.randomUUID(),
    hostId: report.host.instanceId,
    directory: {
      execute: (name) =>
        Promise.resolve(name === 'session.get' || name === 'workspace.get' ? null : { items: [], nextCursor: null }),
    },
    surfaces: { canRender: (id) => id === 'settings' },
    system: {
      async execute(name) {
        calls.push(name)
        if (hold) await gate
        if (failed) throw new CommandError('READ_FAILED', 'Owned diagnostics read failure')
        return report
      },
    },
  })
  await owned.ready
  await owned.view.commands.execute('app.openSettings', {
    scope: 'global',
    section: 'diagnostics',
    instanceId: 'settings',
  })
  const base = getShellCopy(input.locale).diagnostics
  const labels = {
    ...base,
    title: base.title + input.suffix,
    description: base.description + input.suffix,
    host: base.host + input.suffix,
    storage: base.storage + input.suffix,
    activity: base.activity + input.suffix,
    refresh: base.refresh + input.suffix,
    version: base.version + input.suffix,
    protocol: base.protocol + input.suffix,
    platform: base.platform + input.suffix,
    demo: base.demo + input.suffix,
  }
  window.refreshSystemDiagnosticsContent = () =>
    owned.view.commands.execute('systemDiagnostics.refresh', { instanceId: 'settings' })
  if (input.state === 'offline') await window.refreshSystemDiagnosticsContent()
  window.systemDiagnosticsContentState = () => {
    const entry = owned.view.state.diagnostics.getSnapshot().entries.settings
    return { calls, status: entry?.status, error: entry?.error }
  }
  window.repairSystemDiagnosticsContent = () => {
    failed = false
    hold = false
    release()
  }
  window.failSystemDiagnosticsContent = () => {
    failed = true
  }
  window.disposeSystemDiagnosticsContent = () => {
    root?.unmount()
    owned.dispose()
    release()
    root = undefined
  }
  root = createRoot(element)
  root.render(
    <LumenProvider
      className="owned-diagnostics-provider"
      appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}
    >
      <HbarRuntimeProvider view={owned.view}>
        <LumenFrame className="owned-diagnostics-pane">
          <HbarSystemDiagnostics instanceId="settings" connected={input.state !== 'offline'} labels={labels} />
        </LumenFrame>
      </HbarRuntimeProvider>
    </LumenProvider>,
  )
}
