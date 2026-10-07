import { createRoot } from 'react-dom/client'
import { HbarRuntimeProvider, HbarSettingsWorkspace } from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import { settingsCommands, type SettingsDescription, type SettingsSnapshot } from '@hbar/contracts/commands/settings'
import { SchemaContentError } from '@hbar/schema-core'
import { DEFAULT_LUMEN_APPEARANCE, LumenFrame, LumenProvider } from '@lumen/app-ui'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'

export interface SettingsWorkspaceFixtureInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly suffix: string
  readonly description: SettingsDescription
  readonly snapshot: SettingsSnapshot
  readonly error: boolean
  readonly fixedScope: boolean
}
declare global {
  interface Window {
    mountSettingsWorkspace(input: SettingsWorkspaceFixtureInput): Promise<void>
    releaseSettingsWorkspace(): Promise<void>
    clearSettingsFixtureReadError(): void
    settingsFixtureWrites: readonly string[]
  }
}
window.mountSettingsWorkspace = async (input) => {
  const container = document.getElementById('settings-workspace-fixture')
  if (!container) throw new Error('Missing settings workspace fixture root')
  const copy = getShellCopy(input.locale).settings
  let failing = input.error
  const writes: string[] = []
  window.settingsFixtureWrites = writes
  window.clearSettingsFixtureReadError = () => {
    failing = false
  }
  const runtime = createAppRuntime({
    instanceId: crypto.randomUUID(),
    hostId: 'settings-text-fixture',
    directory: { execute: (name) => Promise.reject(new Error(`Unexpected directory query: ${name}`)) },
    surfaces: { canRender: (id) => id === 'settings' },
    settings: {
      execute(name, value) {
        if (name === 'settings.describe') return Promise.resolve(input.description)
        if (name === 'settings.get') {
          const { scope } = settingsCommands[name].input.parse(value)
          return Promise.resolve({ ...input.snapshot, scope })
        }
        writes.push(name)
        return Promise.reject(new Error(`Unexpected fixture write: ${name}`))
      },
    },
    schemaContent: {
      query(_id, request) {
        if (failing) return Promise.reject(new SchemaContentError('READ_FAILED', 'Isolated fixture read failure'))
        return Promise.resolve({
          kind: 'options',
          status: 'ready',
          options: [],
          dependencyFingerprint: request.dependencyFingerprint,
          capabilityRevision: 'fixture-1',
        })
      },
    },
  })
  await runtime.view.commands.execute('app.openSettings', { scope: 'global', section: 'model' })
  const root = createRoot(container)
  window.releaseSettingsWorkspace = async () => {
    root.unmount()
    await runtime.dispose()
  }
  const labels = {
    ...copy,
    description: copy.description.repeat(5),
    hostScope: copy.hostScope + input.suffix,
    localOverride: copy.localOverride + input.suffix,
    inheritedFrom: (source: string) => copy.inheritedFrom(source) + input.suffix,
    resolve: (key: string) => copy.resolve(key) + input.suffix,
    refresh: copy.refresh + input.suffix,
    save: copy.save + input.suffix,
    contentRecovery: { ...copy.contentRecovery, retry: copy.contentRecovery.retry + input.suffix },
  }
  root.render(
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}>
      <LumenFrame className="settings-workspace-fixture">
        <HbarRuntimeProvider view={runtime.view}>
          <HbarSettingsWorkspace
            labels={labels}
            connected
            {...(input.fixedScope ? { groupPresentation: [{ id: 'model', scope: 'host', icon: 'model' }] } : {})}
          />
        </HbarRuntimeProvider>
      </LumenFrame>
    </LumenProvider>,
  )
}
