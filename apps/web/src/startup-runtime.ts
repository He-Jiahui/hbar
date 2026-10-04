import { createStore, type StoreApi } from 'zustand/vanilla'
import { CommandError } from '@hbar/commands'
import type { ClientPreferencesState, DraftsState, GlobalSettingsStartup, createAppRuntime } from '@hbar/app-runtime'
import { restoreSessionDrafts, serializeSessionDrafts } from '@hbar/app-runtime'
import type { ConnectionStatus } from '@hbar/client'
import {
  createWebAppearanceEditor,
  type AppearanceEditor,
  type AppearanceEditorBinding,
  type AppearanceEditorPort,
} from './appearance-editor'

type Runtime = ReturnType<typeof createAppRuntime>
export interface WebStartupRuntimeState {
  readonly runtime: Runtime
  readonly appearanceEditor: AppearanceEditor
  readonly binding: AppearanceEditorBinding
  readonly connection: ConnectionStatus
}
export interface WebStartupRuntimeOptions {
  readonly endpointId: string
  readonly bootstrap: () => ClientPreferencesState
  readonly isKnownSettingsGroup: (id: string) => boolean
  readonly createRuntime: (
    hostId: string | null,
    initialGlobalSettings?: GlobalSettingsStartup,
    initialDrafts?: DraftsState,
  ) => Runtime
  readonly appearancePort: (runtime: Runtime) => AppearanceEditorPort
  readonly disposeConnection: () => void
  readonly draftPersistence?: {
    readonly read: (hostId: string) => DraftsState | undefined
    readonly write: (hostId: string, drafts: DraftsState) => void
  }
}

function captureSettings(runtime: Runtime, isKnownGroup: (id: string) => boolean): GlobalSettingsStartup | undefined {
  const presentation = runtime.view.state.presentation.getSnapshot()
  if (presentation.page.kind !== 'settings') return undefined
  const panel = runtime.view.state.surfaces.getSnapshot().panels[presentation.page.instanceId]
  if (
    !panel ||
    panel.panelId !== 'settings' ||
    panel.params.scope !== 'global' ||
    panel.binding !== 'followActive' ||
    panel.workspaceId !== null ||
    panel.sessionId !== null
  )
    return undefined
  return {
    instanceId: panel.instanceId,
    ...(typeof panel.params.section === 'string' && isKnownGroup(panel.params.section)
      ? { section: panel.params.section }
      : {}),
    sidebarOpen: presentation.sidebarOpen,
  }
}

/** Owns one endpoint lifecycle. Only initial identity discovery carries client-local Settings intent. */
export function createWebStartupRuntime(options: WebStartupRuntimeOptions) {
  let store: StoreApi<WebStartupRuntimeState> | undefined
  let unsubscribe: (() => void) | undefined
  let disposed = false
  let leases = 0
  let releaseEpoch = 0
  // A transient transport/runtime replacement must not erase unsent drafts. Keep
  // each snapshot under its authenticated Host identity so drafts never cross
  // data roots when the connection changes Hosts.
  const draftsByHost = new Map<string, DraftsState>()
  const persistDrafts = (hostId: string, drafts: DraftsState): void => {
    if (!options.draftPersistence) return
    const serialized = serializeSessionDrafts(drafts)
    if (serialized === null) return
    try {
      options.draftPersistence.write(hostId, restoreSessionDrafts(JSON.parse(serialized)) ?? {})
    } catch {
      // Draft editing remains available when device storage is unavailable.
    }
  }
  const watch = (state: WebStartupRuntimeState) => {
    const sync = () => state.appearanceEditor.sync(state.runtime.view.state.preferences.getSnapshot(), state.binding)
    unsubscribe = state.runtime.view.state.preferences.subscribe(sync)
    sync()
  }
  const ensure = () => {
    if (disposed) throw new CommandError('DISPOSED', 'Web runtime owner is disposed')
    if (store) return store
    const runtime = options.createRuntime(null)
    const binding: AppearanceEditorBinding = { endpointId: options.endpointId, generation: 1, hostId: null }
    const initial: WebStartupRuntimeState = {
      runtime,
      binding,
      appearanceEditor: createWebAppearanceEditor(options.bootstrap(), options.appearancePort(runtime), binding),
      connection: 'connecting',
    }
    store = createStore<WebStartupRuntimeState>(() => initial)
    watch(initial)
    return store
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    unsubscribe?.()
    store?.getState().runtime.dispose()
    options.disposeConnection()
  }
  return {
    // Lazy initialization avoids allocating runtimes for discarded React memo factories.
    get store() {
      return ensure()
    },
    confirmHost(hostId: string) {
      if (disposed) return false
      if (!hostId.trim()) throw new CommandError('INVALID_INPUT', 'Host identity is required')
      const target = ensure()
      const current = target.getState()
      if (current.binding.hostId === hostId) return true
      const firstIdentity = current.binding.hostId === null
      if (!firstIdentity && current.binding.hostId)
        draftsByHost.set(current.binding.hostId, current.runtime.view.state.drafts.getSnapshot())
      while (draftsByHost.size > 8) {
        const oldest = draftsByHost.keys().next().value
        if (oldest !== undefined) draftsByHost.delete(oldest)
      }
      const runtime = options.createRuntime(
        hostId,
        firstIdentity ? captureSettings(current.runtime, options.isKnownSettingsGroup) : undefined,
        draftsByHost.get(hostId) ?? options.draftPersistence?.read(hostId),
      )
      const binding: AppearanceEditorBinding = {
        endpointId: options.endpointId,
        generation: current.binding.generation + (firstIdentity ? 0 : 1),
        hostId,
      }
      const preferences = runtime.view.state.preferences.getSnapshot()
      const port = options.appearancePort(runtime)
      const appearanceEditor = firstIdentity
        ? current.appearanceEditor
        : createWebAppearanceEditor(preferences, port, binding)
      if (firstIdentity && !appearanceEditor.bind({ binding, preferences, port })) {
        runtime.dispose()
        return false
      }
      unsubscribe?.()
      const next = { runtime, binding, appearanceEditor, connection: current.connection }
      watch(next)
      if (options.draftPersistence) {
        const offDrafts = runtime.view.state.drafts.subscribe(() =>
          persistDrafts(hostId, runtime.view.state.drafts.getSnapshot()),
        )
        const previousWatch = unsubscribe
        unsubscribe = () => {
          offDrafts()
          previousWatch?.()
        }
      }
      target.setState(next, true)
      current.runtime.dispose()
      return true
    },
    setConnection(connection: ConnectionStatus) {
      if (disposed) return
      const target = ensure()
      // A socket alone is not an authenticated, confirmed Host identity.
      target.setState({
        connection: connection === 'connected' && target.getState().binding.hostId === null ? 'connecting' : connection,
      })
    },
    retain() {
      ensure()
      leases += 1
      releaseEpoch += 1
      let released = false
      return () => {
        if (released) return
        released = true
        leases -= 1
        const epoch = ++releaseEpoch
        queueMicrotask(() => {
          if (leases === 0 && epoch === releaseEpoch) dispose()
        })
      }
    },
    dispose,
  }
}
