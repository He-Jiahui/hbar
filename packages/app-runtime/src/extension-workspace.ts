import { CommandError, createCommandClient, type CommandRegistry } from '@hbar/commands'
import { extensionWorkspaceCommands } from '@hbar/contracts/commands/extension-workspace'
import { extensionCommands } from '@hbar/contracts/commands/extensions'
import { createState, type StateReader } from './state'
import { EXTENSION_PAGE_SIZE, extensionWorkspacePage } from './extension-workspace-model'
import { createExtensionSkillDetails } from './extension-skill-details'
import type {
  ExtensionWorkspaceEntryState,
  ExtensionCollectionReadState,
  ExtensionWorkspaceActionState,
  ExtensionWorkspaceState,
  PresentationState,
  RuntimeOptions,
  SurfaceState,
} from './types'

const MAX_PANELS = 4
const MAX_ACTIONS = 64
const MAX_COLLECTION_READS = 8
const COLLECTION_TIMEOUT_MS = 30_000
type Collection = 'plugins' | 'skills'
interface CollectionRequest {
  readonly instanceId: string
  readonly collection: Collection
  readonly target: SurfaceState['panels'][string]
  readonly controller: AbortController
  cancel(error: string, detach?: boolean): void
}
const idleCollection = (): ExtensionCollectionReadState => ({
  status: 'idle',
  hasSnapshot: false,
  error: null,
  requestInFlight: false,
})
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
  const collectionRequests = new Map<string, CollectionRequest>()
  const inFlightCollections = new Set<CollectionRequest>()
  let disposed = false
  const closed = () => disposed || isDisposed()
  const detailGenerations = new Map<string, number>()
  const detailTargets = new Map<string, SurfaceState['panels'][string]>()
  const detailRequests = new Map<string, AbortController>()
  const inFlightDetails = new Set<AbortController>()
  let skillDetails: ReturnType<typeof createExtensionSkillDetails> | null = null
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
    if (closed()) return
    const current = state.reader.getSnapshot()
    const projectedActions = Object.fromEntries(
      entry.plugins.flatMap((plugin) => {
        const action = actions.get(plugin.id)
        return action ? [[plugin.id, action]] : []
      }),
    )
    const reads = Object.values(entry.collections)
    const status = reads.some((read) => read.status === 'loading')
      ? ('loading' as const)
      : reads.some((read) => read.status === 'error')
        ? ('error' as const)
        : ('ready' as const)
    const projected = {
      ...entry,
      status,
      actions: projectedActions,
      error: entry.error === 'CAPACITY_EXCEEDED' ? entry.error : (reads.find((read) => read.error)?.error ?? null),
    }
    const entries = { ...current.entries, [entry.instanceId]: projected }
    const ids = Object.keys(entries)
    if (ids.length > MAX_PANELS)
      for (const id of ids) {
        if (id !== entry.instanceId && !surfaces.getSnapshot().panels[id]) {
          delete entries[id]
          detailGenerations.delete(id)
          detailTargets.delete(id)
          skillDetails?.drop(id)
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
    if (closed()) return
    actions.set(pluginId, action)
    for (const entry of openEntries())
      replace({
        ...entry,
        error: entry.detail?.pluginId === pluginId && entry.error === 'CAPACITY_EXCEEDED' ? null : entry.error,
      })
  }
  const publishFact = (plugin: Readonly<ExtensionWorkspaceEntryState['plugins'][number]>) => {
    for (const entry of openEntries()) {
      // This ACK confirms one plugin, not the entire collection. A pre-ACK list
      // cannot overwrite it, and its physical capacity is retained until settle.
      collectionRequests.get(`${entry.instanceId}:plugins`)?.cancel('RESULT_UNKNOWN', true)
      const latest = state.reader.getSnapshot().entries[entry.instanceId] ?? entry
      const detail = latest.detail
      const matchesDetail = detail?.pluginId === plugin.id && (detail.status === 'ready' || detail.status === 'loading')
      if (matchesDetail) {
        detailGenerations.set(entry.instanceId, ++revision)
        detailRequests.get(entry.instanceId)?.abort()
      }
      replace({
        ...latest,
        plugins: latest.plugins.map((item) => (item.id === plugin.id ? plugin : item)),
        error: latest.error === 'CAPACITY_EXCEEDED' && !matchesDetail ? latest.error : null,
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
  const physicallyReading = (instanceId: string, collection: Collection) =>
    [...inFlightCollections].some(
      (request) =>
        request.instanceId === instanceId &&
        request.collection === collection &&
        request.target === surfaces.getSnapshot().panels[instanceId],
    )
  const updateRead = (instanceId: string, collection: Collection, read: Partial<ExtensionCollectionReadState>) => {
    const entry = state.reader.getSnapshot().entries[instanceId]
    if (entry)
      replace({
        ...entry,
        collections: {
          ...entry.collections,
          [collection]: {
            ...entry.collections[collection],
            ...read,
            requestInFlight: physicallyReading(instanceId, collection),
          },
        },
      })
  }
  const readCollection = (instanceId: string, collection: Collection, signal: AbortSignal): Promise<void> => {
    const target = panel(instanceId)
    const key = `${instanceId}:${collection}`
    const previous = collectionRequests.get(key)
    // Joining is observational; the second caller's cancellation cannot cancel the owner.
    if (previous?.target === target) return Promise.resolve()
    previous?.cancel('CANCELLED', true)
    if (closed() || signal.aborted) return Promise.reject(new CommandError('CANCELLED', 'Extension read cancelled'))
    if (inFlightCollections.size >= MAX_COLLECTION_READS) {
      updateRead(instanceId, collection, { status: 'error', error: 'BUSY' })
      return Promise.reject(new CommandError('BUSY', 'Extension collection read capacity is exhausted'))
    }
    const controller = new AbortController()
    const logical = Promise.withResolvers<void>()
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const current = () =>
      !closed() && collectionRequests.get(key) === request && surfaces.getSnapshot().panels[instanceId] === target
    const finish = (reason?: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', aborted)
      if (reason !== undefined) {
        if (current()) updateRead(instanceId, collection, { status: 'error', error: code(reason) })
        logical.reject(failure(reason))
      } else logical.resolve()
    }
    const request: CollectionRequest = {
      instanceId,
      collection,
      target,
      controller,
      cancel(error, detach = false) {
        finish(new CommandError(error, 'Extension collection read was interrupted'))
        if (detach && collectionRequests.get(key) === request) collectionRequests.delete(key)
        controller.abort()
      },
    }
    const aborted = () => request.cancel('CANCELLED')
    collectionRequests.set(key, request)
    inFlightCollections.add(request)
    updateRead(instanceId, collection, { status: 'loading', error: null })
    signal.addEventListener('abort', aborted, { once: true })
    timer = setTimeout(() => request.cancel('TIMEOUT'), COLLECTION_TIMEOUT_MS)
    const execute = async () => {
      try {
        if (!current() || signal.aborted || settled) {
          request.cancel('CANCELLED')
          return
        }
        const commandClient = requireClient()
        const result =
          collection === 'plugins'
            ? { collection, items: await commandClient.execute('plugin.list', {}, { signal: controller.signal }) }
            : { collection, items: await commandClient.execute('skill.list', {}, { signal: controller.signal }) }
        if (!current() || settled) return
        if (new Set(result.items.map((item) => item.id)).size !== result.items.length)
          throw new CommandError('INVALID_OUTPUT', 'Extension identifiers must be unique')
        const latest = state.reader.getSnapshot().entries[instanceId]
        if (!latest) return
        const read: ExtensionCollectionReadState = {
          status: 'ready',
          hasSnapshot: true,
          error: null,
          requestInFlight: true,
        }
        if (result.collection === 'plugins') {
          const plugins = result.items
          const detail = latest.detail
          const selected = detail ? plugins.find((item) => item.id === detail.pluginId) : null
          replace({
            ...latest,
            plugins,
            collections: { ...latest.collections, plugins: read },
            detail:
              detail?.status === 'ready'
                ? { ...detail, status: selected ? 'ready' : 'missing', plugin: selected ?? null, error: null }
                : detail,
          })
        } else {
          const next = { ...latest, skills: result.items, collections: { ...latest.collections, skills: read } }
          replace(skillDetails?.reconcile(next) ?? next)
        }
        finish()
      } catch (reason) {
        finish(reason)
      } finally {
        inFlightCollections.delete(request)
        if (collectionRequests.get(key) === request) collectionRequests.delete(key)
        // A superseded physical completion may release capacity, never replace its successor's facts.
        updateRead(instanceId, collection, {})
      }
    }
    void execute()
    return logical.promise
  }
  const load = async (instanceId: string, collection: Collection | undefined, signal: AbortSignal) => {
    panel(instanceId)
    if (!state.reader.getSnapshot().entries[instanceId])
      replace({
        instanceId,
        status: 'loading',
        plugins: [],
        skills: [],
        actions: {},
        error: null,
        collections: { plugins: idleCollection(), skills: idleCollection() },
        queries: { plugins: '', skills: '' },
        pluginPage: 0,
        skillPage: 0,
        selectedPluginId: null,
        detail: null,
        selectedSkillId: null,
        skillDetail: null,
      })
    const results = await Promise.allSettled(
      (collection ? [collection] : (['plugins', 'skills'] as const)).map((name) =>
        readCollection(instanceId, name, signal),
      ),
    )
    const rejected = results.find((result) => result.status === 'rejected')
    if (rejected?.status === 'rejected') throw failure(rejected.reason)
    return summary(entryFor(instanceId))
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
      return !closed() &&
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
  const invalidateCollections = () => {
    const page = presentation.getSnapshot().page
    for (const request of collectionRequests.values()) {
      if (
        surfaces.getSnapshot().panels[request.instanceId] === request.target &&
        page.kind === 'settings' &&
        page.instanceId === request.instanceId
      )
        continue
      request.cancel('CANCELLED', true)
      updateRead(request.instanceId, request.collection, { status: 'error', error: 'CANCELLED' })
    }
  }
  const unsubscribeSurfaces = surfaces.subscribe(() => {
    invalidateCollections()
    invalidateDetails()
    skillDetails?.invalidate()
  })
  const unsubscribePresentation = presentation.subscribe(() => {
    invalidateCollections()
    invalidateDetails()
    skillDetails?.invalidate()
  })
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
      if (closed()) throw new CommandError('RESULT_UNKNOWN', 'Plugin operation outlived this runtime')
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

  skillDetails = createExtensionSkillDetails({
    local,
    options,
    surfaces,
    presentation,
    panel,
    entryFor,
    replace,
    summary,
    isDisposed,
  })

  local.register(extensionWorkspaceCommands['extensionWorkspace.refresh'], ({ instanceId, collection }, context) =>
    load(instanceId, collection, context.signal),
  )
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
  local.register(extensionWorkspaceCommands['extensionWorkspace.setQuery'], ({ instanceId, query, collection }) => {
    const entry = entryFor(instanceId)
    const next = {
      ...entry,
      queries: collection ? { ...entry.queries, [collection]: query } : { plugins: query, skills: query },
      ...(collection === 'plugins'
        ? { pluginPage: 0 }
        : collection === 'skills'
          ? { skillPage: 0 }
          : { pluginPage: 0, skillPage: 0 }),
    }
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
      disposed = true
      unsubscribeSurfaces()
      unsubscribePresentation()
      for (const request of inFlightCollections) request.cancel('CANCELLED', true)
      collectionRequests.clear()
      detailGenerations.clear()
      detailTargets.clear()
      for (const controller of inFlightDetails) controller.abort()
      detailRequests.clear()
      inFlightDetails.clear()
      skillDetails?.dispose()
      skillDetails = null
      actions.clear()
      state.dispose()
    },
  }
}
