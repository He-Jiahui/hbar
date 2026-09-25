import { CommandError, createCommandClient, type CommandRegistry } from '@hbar/commands'
import { extensionWorkspaceCommands } from '@hbar/contracts/commands/extension-workspace'
import { extensionCommands } from '@hbar/contracts/commands/extensions'
import { createState, type StateReader } from './state'
import { EXTENSION_PAGE_SIZE, extensionWorkspacePage } from './extension-workspace-model'
import type {
  ExtensionWorkspaceEntryState,
  ExtensionWorkspaceState,
  PresentationState,
  RuntimeOptions,
  SurfaceState,
} from './types'

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
  presentation: StateReader<PresentationState>,
  onSubscriberError: (error: unknown) => void,
  isDisposed: () => boolean,
) {
  const state = createState<ExtensionWorkspaceState>({ entries: {} }, onSubscriberError)
  const client = options.extensions ? createCommandClient(extensionCommands, options.extensions) : null
  const generations = new Map<string, number>()
  const detailGenerations = new Map<string, number>()
  const detailTargets = new Map<string, SurfaceState['panels'][string]>()
  const detailRequests = new Map<string, AbortController>()
  const inFlightDetails = new Set<AbortController>()
  let revision = 0

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
    if (isDisposed()) return
    const current = state.reader.getSnapshot()
    const entries = { ...current.entries, [entry.instanceId]: entry }
    const ids = Object.keys(entries)
    if (ids.length > MAX_PANELS)
      for (const id of ids) {
        if (id !== entry.instanceId && !surfaces.getSnapshot().panels[id]) {
          delete entries[id]
          generations.delete(id)
          detailGenerations.delete(id)
          detailTargets.delete(id)
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
    const target = panel(instanceId)
    const previous = state.reader.getSnapshot().entries[instanceId]
    if (previous?.status === 'loading') return summary(previous)
    const generation = ++revision
    generations.set(instanceId, generation)
    const loading: ExtensionWorkspaceEntryState = {
      instanceId,
      status: 'loading',
      plugins: previous?.plugins ?? [],
      skills: previous?.skills ?? [],
      actions: previous?.actions ?? {},
      error: null,
      query: previous?.query ?? '',
      pluginPage: previous?.pluginPage ?? 0,
      skillPage: previous?.skillPage ?? 0,
      selectedPluginId: previous?.selectedPluginId ?? null,
      detail: previous?.detail ?? null,
    }
    replace(loading)
    try {
      const [plugins, skills] = await Promise.all([
        requireClient().execute('plugin.list', {}),
        requireClient().execute('skill.list', {}),
      ])
      if (
        isDisposed() ||
        generations.get(instanceId) !== generation ||
        surfaces.getSnapshot().panels[instanceId] !== target
      )
        throw new CommandError('RESULT_UNKNOWN', 'Extension refresh was superseded')
      if (
        new Set(plugins.map((item) => item.id)).size !== plugins.length ||
        new Set(skills.map((item) => item.id)).size !== skills.length
      )
        throw new CommandError('INVALID_OUTPUT', 'Extension identifiers must be unique')
      const ready: ExtensionWorkspaceEntryState = {
        ...(state.reader.getSnapshot().entries[instanceId] ?? loading),
        status: 'ready',
        plugins,
        skills,
        actions: {},
        error: null,
      }
      replace(ready)
      return summary(ready)
    } catch (reason) {
      if (
        isDisposed() ||
        generations.get(instanceId) !== generation ||
        surfaces.getSnapshot().panels[instanceId] !== target
      )
        throw reason
      const failed = {
        ...(state.reader.getSnapshot().entries[instanceId] ?? loading),
        status: 'error' as const,
        error: code(reason),
      }
      replace(failed)
      throw failure(reason)
    }
  }
  const entryFor = (instanceId: string) => {
    panel(instanceId)
    const entry = state.reader.getSnapshot().entries[instanceId]
    if (!entry) throw new CommandError('COMMAND_NOT_FOUND', 'Extension list has not been loaded')
    return entry
  }
  const inspect = async (instanceId: string, pluginId: string) => {
    const target = panel(instanceId)
    const entry = entryFor(instanceId)
    if (!entry.plugins.some((plugin) => plugin.id === pluginId))
      throw new CommandError('COMMAND_NOT_FOUND', 'Plugin is not available in this list')
    if (entry.detail?.pluginId === pluginId && entry.detail.status === 'loading') return summary(entry)
    const generation = ++revision
    detailGenerations.set(instanceId, generation)
    detailTargets.set(instanceId, target)
    replace({
      ...entry,
      selectedPluginId: pluginId,
      detail: { pluginId, status: 'loading', plugin: null, error: null },
    })
    detailRequests.get(instanceId)?.abort()
    const controller = new AbortController()
    const current = () => {
      const latest = state.reader.getSnapshot().entries[instanceId]
      return !isDisposed() &&
        detailGenerations.get(instanceId) === generation &&
        surfaces.getSnapshot().panels[instanceId] === target &&
        latest?.detail?.pluginId === pluginId
        ? latest
        : null
    }
    try {
      if (inFlightDetails.size >= 8) throw new CommandError('BUSY', 'Plugin detail read capacity is exhausted')
      detailRequests.set(instanceId, controller)
      inFlightDetails.add(controller)
      const plugin = await requireClient().execute('plugin.inspect', { id: pluginId }, { signal: controller.signal })
      const latest = current()
      if (!latest) throw new CommandError('CANCELLED', 'Plugin detail request was superseded')
      if (plugin && plugin.id !== pluginId)
        throw new CommandError('INVALID_OUTPUT', 'Plugin detail belongs to another plugin')
      const next: ExtensionWorkspaceEntryState = {
        ...latest,
        detail: { pluginId, status: plugin ? 'ready' : 'missing', plugin, error: null },
      }
      replace(next)
      return summary(next)
    } catch (reason) {
      const latest = current()
      if (latest) replace({ ...latest, detail: { pluginId, status: 'error', plugin: null, error: code(reason) } })
      throw failure(reason)
    } finally {
      inFlightDetails.delete(controller)
      if (detailRequests.get(instanceId) === controller) detailRequests.delete(instanceId)
    }
  }
  const invalidateDetails = () => {
    const page = presentation.getSnapshot().page
    for (const [instanceId, target] of detailTargets) {
      if (
        surfaces.getSnapshot().panels[instanceId] === target &&
        page.kind === 'settings' &&
        page.instanceId === instanceId
      )
        continue
      detailGenerations.set(instanceId, ++revision)
      detailTargets.delete(instanceId)
      detailRequests.get(instanceId)?.abort()
      const entry = state.reader.getSnapshot().entries[instanceId]
      if (entry?.detail?.status === 'loading')
        replace({ ...entry, detail: { ...entry.detail, status: 'error', plugin: null, error: 'CANCELLED' } })
    }
  }
  const unsubscribeSurfaces = surfaces.subscribe(invalidateDetails)
  const unsubscribePresentation = presentation.subscribe(invalidateDetails)
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
  local.register(extensionWorkspaceCommands['extensionWorkspace.inspect'], ({ instanceId, pluginId }) =>
    inspect(instanceId, pluginId),
  )
  local.register(extensionWorkspaceCommands['extensionWorkspace.back'], ({ instanceId }) => {
    const entry = entryFor(instanceId)
    detailGenerations.set(instanceId, ++revision)
    detailTargets.delete(instanceId)
    detailRequests.get(instanceId)?.abort()
    const next = { ...entry, detail: null }
    replace(next)
    return summary(next)
  })
  local.register(extensionWorkspaceCommands['extensionWorkspace.setQuery'], ({ instanceId, query }) => {
    const next = { ...entryFor(instanceId), query, pluginPage: 0, skillPage: 0 }
    replace(next)
    return summary(next)
  })
  local.register(extensionWorkspaceCommands['extensionWorkspace.setPage'], ({ instanceId, collection, page }) => {
    const entry = entryFor(instanceId)
    const projected = extensionWorkspacePage(entry)
    const count = collection === 'plugins' ? projected.pluginCount : projected.skillCount
    const boundedPage = Math.min(page, Math.max(0, Math.ceil(count / EXTENSION_PAGE_SIZE) - 1))
    const next = { ...entry, ...(collection === 'plugins' ? { pluginPage: boundedPage } : { skillPage: boundedPage }) }
    replace(next)
    return summary(next)
  })
  local.register(extensionWorkspaceCommands['extensionWorkspace.setEnabled'], ({ instanceId, pluginId, enabled }) =>
    setEnabled(instanceId, pluginId, enabled),
  )
  return {
    reader: state.reader,
    dispose() {
      unsubscribeSurfaces()
      unsubscribePresentation()
      generations.clear()
      detailGenerations.clear()
      detailTargets.clear()
      for (const controller of inFlightDetails) controller.abort()
      detailRequests.clear()
      inFlightDetails.clear()
      state.dispose()
    },
  }
}
