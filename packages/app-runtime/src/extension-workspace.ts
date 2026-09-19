import { CommandError, createCommandClient, type CommandRegistry } from '@hbar/commands'
import { extensionWorkspaceCommands } from '@hbar/contracts/commands/extension-workspace'
import { extensionCommands } from '@hbar/contracts/commands/extensions'
import { createState, type StateReader } from './state'
import type { ExtensionWorkspaceEntryState, ExtensionWorkspaceState, RuntimeOptions, SurfaceState } from './types'

const MAX_PANELS = 4
const UNKNOWN_CODES = new Set(['RESULT_UNKNOWN', 'DISCONNECTED', 'TIMEOUT'])

function code(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

function failure(reason: unknown): CommandError {
  if (reason instanceof CommandError) return reason
  return new CommandError(code(reason), reason instanceof Error ? reason.message : 'Extension operation failed')
}

export function createExtensionWorkspace(
  local: CommandRegistry,
  options: RuntimeOptions,
  surfaces: StateReader<SurfaceState>,
  onSubscriberError: (error: unknown) => void,
  isDisposed: () => boolean,
) {
  const state = createState<ExtensionWorkspaceState>({ entries: {} }, onSubscriberError)
  const client = options.extensions ? createCommandClient(extensionCommands, options.extensions) : null
  const generations = new Map<string, number>()

  const panel = (instanceId: string) => {
    const value = surfaces.getSnapshot().panels[instanceId]
    if (!value || (value.panelId !== 'extensions' && value.panelId !== 'settings'))
      throw new CommandError('COMMAND_NOT_FOUND', 'Extension settings are not open')
    return value
  }
  const requireClient = () => {
    if (!client) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Extension commands are unavailable')
    return client
  }
  const replace = (entry: ExtensionWorkspaceEntryState) => {
    const current = state.reader.getSnapshot()
    const entries = { ...current.entries, [entry.instanceId]: entry }
    const ids = Object.keys(entries)
    if (ids.length > MAX_PANELS)
      for (const id of ids) {
        if (id !== entry.instanceId && !surfaces.getSnapshot().panels[id]) {
          delete entries[id]
          break
        }
      }
    state.replace({ entries })
  }
  const summary = (entry: ExtensionWorkspaceEntryState) => ({
    instanceId: entry.instanceId,
    status: entry.status,
    pluginCount: entry.plugins.length,
    skillCount: entry.skills.length,
    error: entry.error ?? Object.values(entry.actions).find((action) => action.error)?.error ?? null,
  })
  const load = async (instanceId: string) => {
    panel(instanceId)
    const previous = state.reader.getSnapshot().entries[instanceId]
    const generation = (generations.get(instanceId) ?? 0) + 1
    generations.set(instanceId, generation)
    const loading: ExtensionWorkspaceEntryState = {
      instanceId,
      status: 'loading',
      plugins: previous?.plugins ?? [],
      skills: previous?.skills ?? [],
      actions: previous?.actions ?? {},
      error: null,
    }
    replace(loading)
    try {
      const [plugins, skills] = await Promise.all([
        requireClient().execute('plugin.list', {}),
        requireClient().execute('skill.list', {}),
      ])
      if (isDisposed() || generations.get(instanceId) !== generation)
        throw new CommandError('RESULT_UNKNOWN', 'Extension refresh was superseded')
      const ready: ExtensionWorkspaceEntryState = {
        instanceId,
        status: 'ready',
        plugins,
        skills,
        actions: {},
        error: null,
      }
      replace(ready)
      return summary(ready)
    } catch (reason) {
      if (isDisposed() || generations.get(instanceId) !== generation) throw reason
      const failed = { ...loading, status: 'error' as const, error: code(reason) }
      replace(failed)
      throw failure(reason)
    }
  }
  const setEnabled = async (instanceId: string, pluginId: string, enabled: boolean) => {
    panel(instanceId)
    const entry = state.reader.getSnapshot().entries[instanceId]
    const plugin = entry?.plugins.find((item) => item.id === pluginId)
    if (!entry || !plugin) throw new CommandError('COMMAND_NOT_FOUND', 'Plugin is not available in this panel')
    const action = entry.actions[pluginId]
    if (action?.status === 'submitting' || action?.status === 'unknown')
      throw new CommandError('BUSY', 'Reconcile the pending plugin operation before retrying')
    if (plugin.required && !enabled) throw new CommandError('INVALID_INPUT', 'Required plugins cannot be disabled')
    replace({ ...entry, actions: { ...entry.actions, [pluginId]: { status: 'submitting', error: null } } })
    try {
      const plugins = await requireClient().execute(enabled ? 'plugin.enable' : 'plugin.disable', { id: pluginId })
      const latest = state.reader.getSnapshot().entries[instanceId] ?? entry
      const next: ExtensionWorkspaceEntryState = {
        ...latest,
        status: 'ready',
        plugins,
        actions: { ...latest.actions, [pluginId]: { status: 'succeeded', error: null } },
        error: null,
      }
      replace(next)
      return summary(next)
    } catch (reason) {
      const latest = state.reader.getSnapshot().entries[instanceId] ?? entry
      const error = code(reason)
      const failed = {
        ...latest,
        actions: {
          ...latest.actions,
          [pluginId]: { status: UNKNOWN_CODES.has(error) ? ('unknown' as const) : ('failed' as const), error },
        },
      }
      replace(failed)
      throw failure(reason)
    }
  }

  local.register(extensionWorkspaceCommands['extensionWorkspace.refresh'], ({ instanceId }) => load(instanceId))
  local.register(extensionWorkspaceCommands['extensionWorkspace.setEnabled'], ({ instanceId, pluginId, enabled }) =>
    setEnabled(instanceId, pluginId, enabled),
  )
  return {
    reader: state.reader,
    dispose() {
      generations.clear()
      state.dispose()
    },
  }
}
