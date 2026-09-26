import { CommandError, createCommandClient, type CommandRegistry } from '@hbar/commands'
import { extensionWorkspaceCommands } from '@hbar/contracts/commands/extension-workspace'
import { extensionCommands } from '@hbar/contracts/commands/extensions'
import { createState, type StateReader } from './state'
import { EXTENSION_PAGE_SIZE, extensionWorkspacePage } from './extension-workspace-model'
import type {
  ExtensionWorkspaceEntryState,
  ExtensionWorkspaceActionState,
  ExtensionWorkspaceState,
  PresentationState,
  RuntimeOptions,
  SurfaceState,
} from './types'

const MAX_PANELS = 4
const MAX_ACTIONS = 64
const REJECTED_CODES = new Set([
  'BUSY',
  'NOT_FOUND',
  'REQUIRED_PLUGIN',
  'RESTART_REQUIRED',
  'PLUGIN_DEPENDENCY',
  'PLUGIN_VERSION',
  'PLUGIN_CYCLE',
  'INVALID_INPUT',
  'PERMISSION_DENIED',
  'UNAUTHORIZED',
  'COMMAND_NOT_FOUND',
  'CAPABILITY_UNAVAILABLE',
])

function code(reason: unknown): string {
  return reason &&
    typeof reason === 'object' &&
    'code' in reason &&
    typeof reason.code === 'string' &&
    /^[A-Z][A-Z0-9_]{0,63}$/.test(reason.code)
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
  const loadTargets = new Map<
    string,
    { readonly target: SurfaceState['panels'][string]; readonly generation: number }
  >()
  const detailGenerations = new Map<string, number>()
  const detailTargets = new Map<string, SurfaceState['panels'][string]>()
  const detailRequests = new Map<string, AbortController>()
  const inFlightDetails = new Set<AbortController>()
  // One Host-plugin action owner; panel actions are projections, not independent write locks.
  // Unknown operations cannot be evicted or unlocked by observing a current value.
  const actions = new Map<string, Readonly<ExtensionWorkspaceActionState>>()
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
    const projectedActions = Object.fromEntries(
      entry.plugins.flatMap((plugin) => {
        const action = actions.get(plugin.id)
        return action ? [[plugin.id, action]] : []
      }),
    )
    const entries = { ...current.entries, [entry.instanceId]: { ...entry, actions: projectedActions } }
    const ids = Object.keys(entries)
    if (ids.length > MAX_PANELS)
      for (const id of ids) {
        if (id !== entry.instanceId && !surfaces.getSnapshot().panels[id]) {
          delete entries[id]
          generations.delete(id)
          loadTargets.delete(id)
          detailGenerations.delete(id)
          detailTargets.delete(id)
          break
        }
      }
    state.replace({ entries })
  }
  const openEntries = () =>
    Object.values(state.reader.getSnapshot().entries).filter((entry) => {
      const surface = surfaces.getSnapshot().panels[entry.instanceId]
      return surface && (surface.panelId === 'settings' || surface.panelId === 'extensions')
    })
  const publishAction = (pluginId: string, action: Readonly<ExtensionWorkspaceActionState>) => {
    if (isDisposed()) return
    actions.set(pluginId, action)
    for (const entry of openEntries())
      replace({
        ...entry,
        error: entry.detail?.pluginId === pluginId && entry.error === 'CAPACITY_EXCEEDED' ? null : entry.error,
      })
  }
  const publishFact = (plugin: Readonly<ExtensionWorkspaceEntryState['plugins'][number]>) => {
    for (const entry of openEntries()) {
      generations.set(entry.instanceId, ++revision)
      const detail = entry.detail
      const matchesDetail = detail?.pluginId === plugin.id && (detail.status === 'ready' || detail.status === 'loading')
      if (matchesDetail) {
        detailGenerations.set(entry.instanceId, ++revision)
        detailRequests.get(entry.instanceId)?.abort()
      }
      replace({
        ...entry,
        status: 'ready',
        plugins: entry.plugins.map((item) => (item.id === plugin.id ? plugin : item)),
        error: entry.error === 'CAPACITY_EXCEEDED' && !matchesDetail ? entry.error : null,
        detail: matchesDetail ? { ...detail, status: 'ready', plugin, error: null } : detail,
      })
    }
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
    if (previous?.status === 'loading' && loadTargets.get(instanceId)?.target === target) return summary(previous)
    const generation = ++revision
    generations.set(instanceId, generation)
    const readTarget = { target, generation }
    loadTargets.set(instanceId, readTarget)
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
      const latest = state.reader.getSnapshot().entries[instanceId] ?? loading
      const detail = latest.detail
      const selected = detail ? plugins.find((plugin) => plugin.id === detail.pluginId) : null
      const ready: ExtensionWorkspaceEntryState = {
        ...latest,
        status: 'ready',
        plugins,
        skills,
        actions: loading.actions,
        detail:
          detail?.status === 'ready'
            ? { ...detail, status: selected ? 'ready' : 'missing', plugin: selected ?? null, error: null }
            : detail,
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
    } finally {
      if (loadTargets.get(instanceId) === readTarget) loadTargets.delete(instanceId)
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
      error: entry.error === 'CAPACITY_EXCEEDED' ? null : entry.error,
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
        plugins: plugin ? latest.plugins.map((item) => (item.id === pluginId ? plugin : item)) : latest.plugins,
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
    const action = actions.get(pluginId)
    if (action?.status === 'submitting' || action?.status === 'unknown')
      throw new CommandError('BUSY', 'The previous plugin operation has not been confirmed')
    if (plugin.required && !enabled) throw new CommandError('INVALID_INPUT', 'Required plugins cannot be disabled')
    const commandClient = requireClient()
    if (!actions.has(pluginId) && actions.size >= MAX_ACTIONS) {
      const settled = [...actions].find(([, action]) => action.status === 'failed' || action.status === 'succeeded')
      if (!settled) {
        if (!entry.detail || entry.detail.pluginId === pluginId) replace({ ...entry, error: 'CAPACITY_EXCEEDED' })
        throw new CommandError('CAPACITY_EXCEEDED', 'Plugin operation capacity is exhausted')
      }
      actions.delete(settled[0])
    }
    publishAction(pluginId, { status: 'submitting', error: null })
    try {
      const plugins = await commandClient.execute(enabled ? 'plugin.enable' : 'plugin.disable', { id: pluginId })
      if (isDisposed()) throw new CommandError('RESULT_UNKNOWN', 'Plugin operation outlived this runtime')
      const changed = plugins.find((item) => item.id === pluginId)
      if (
        new Set(plugins.map((item) => item.id)).size !== plugins.length ||
        !changed ||
        changed.status !== (enabled ? 'active' : 'disabled') ||
        changed.version !== plugin.version ||
        changed.packageName !== plugin.packageName ||
        changed.path !== plugin.path ||
        changed.projectId !== plugin.projectId ||
        changed.installScope !== plugin.installScope
      )
        throw new CommandError('INVALID_OUTPUT', 'Plugin operation response does not confirm the captured target')
      publishAction(pluginId, { status: 'succeeded', error: null })
      // The unversioned full reply may contain stale facts for another concurrent plugin action.
      publishFact(changed)
      return summary(state.reader.getSnapshot().entries[instanceId] ?? entry)
    } catch (reason) {
      const error = code(reason)
      // Only an explicit rejection is retryable. Generic/transport/malformed replies stay unknown.
      publishAction(pluginId, { status: REJECTED_CODES.has(error) ? 'failed' : 'unknown', error })
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
    const next = { ...entry, detail: null, error: entry.error === 'CAPACITY_EXCEEDED' ? null : entry.error }
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
      loadTargets.clear()
      detailGenerations.clear()
      detailTargets.clear()
      for (const controller of inFlightDetails) controller.abort()
      detailRequests.clear()
      inFlightDetails.clear()
      actions.clear()
      state.dispose()
    },
  }
}
