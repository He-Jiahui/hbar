import { CommandError, defineCommand, type CommandExecutor, type CommandRegistry } from '@hbar/commands'
import { z } from 'zod'
import type { Session } from '@hbar/contracts/directory'
import { createState, type StateReader } from './state'
import type { ClientPreferencesState, DirectoryState, NavigationState } from './types'
import type { WorkspaceTabCloseTarget } from './workspace-tab-close'

export const MAX_WORKSPACE_TABS = 32
const KEY = 'workspaceTabs'
const idSchema = z.string().min(1).max(160)
const targetSchema = z.strictObject({ id: idSchema, sessionId: idSchema, instanceKey: z.string().uuid() })
const metadata = (name: string) => ({
  id: name,
  version: 1,
  owner: 'hbar.workspace-tabs',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  scope: 'client' as const,
  category: 'app.navigation',
  visibility: 'internal' as const,
  titleKey: `commands.${name}.title`,
  descriptionKey: `commands.${name}.description`,
  surfaces: ['api'] as ('api' | 'cli' | 'tui' | 'palette')[],
})
export const workspaceTabCommands = {
  'workspaceTabs.select': defineCommand(
    metadata('workspaceTabs.select'),
    z.strictObject({ id: idSchema }),
    z.strictObject({ activeId: idSchema }),
  ),
  'workspaceTabs.move': defineCommand(
    metadata('workspaceTabs.move'),
    z.strictObject({ id: idSchema, beforeId: idSchema.nullable() }),
    z.strictObject({ revision: z.number().int().nonnegative() }),
  ),
  'workspaceTabs.capture': defineCommand(
    { ...metadata('workspaceTabs.capture'), kind: 'query' as const, stateEffect: 'none' as const },
    z.strictObject({ ids: z.array(idSchema).max(MAX_WORKSPACE_TABS) }),
    z.array(targetSchema).max(MAX_WORKSPACE_TABS),
  ),
  'workspaceTabs.retryRestore': defineCommand(
    metadata('workspaceTabs.retryRestore'),
    z.strictObject({}),
    z.strictObject({ status: z.enum(['ready', 'error']), error: z.string().nullable() }),
  ),
  'workspaceTabs.retryPersist': defineCommand(
    metadata('workspaceTabs.retryPersist'),
    z.strictObject({}),
    z.strictObject({ error: z.string().nullable() }),
  ),
}
interface SavedTab {
  readonly kind: 'session'
  readonly id: string
  readonly sessionId: string
  readonly workspaceId: string
}
export interface WorkspaceTabRef extends SavedTab {
  readonly instanceKey: string
}
export interface WorkspaceTabsState {
  readonly items: readonly WorkspaceTabRef[]
  /** Derived from navigation on each publish, not a second selection authority. */
  readonly activeId: string | null
  readonly revision: number
  readonly restoreStatus: 'loading' | 'ready' | 'error'
  readonly restoreError: string | null
  readonly persistError: string | null
}
export interface WorkspaceTabNavigationHooks {
  reserveCreation(key: string, workspaceId: string): void
  commitCreation(key: string, session: Readonly<Session>): void
  settleCreation(key: string, uncertain: boolean): void
  beforeSelect(session: Readonly<Session>): void
  commitSelected(session: Readonly<Session>): void
}
export interface WorkspaceTabsOptions {
  readonly navigation: StateReader<NavigationState>
  readonly directory: StateReader<DirectoryState>
  readonly queries: CommandExecutor
  readonly preferences: StateReader<ClientPreferencesState>
  readonly preferenceCommands: CommandExecutor
  readonly preferencesReady: Promise<void>
  readonly retryPreferencesRestore: () => Promise<ClientPreferencesState>
  readonly selectSession: (sessionId: string, workspaceId: string) => Promise<unknown>
  /** Owned navigation writer invalidates older navigations when a selected tab closes. */
  readonly commitLocalSelection: (closedId: string, next: { workspaceId: string; sessionId: string | null }) => void
  readonly onSubscriberError: (reason: unknown) => void
}

function code(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}
const OFFLINE_READ_CODES = new Set(['DISCONNECTED', 'CONNECTION_CLOSED', 'TIMEOUT', 'TIMED_OUT'])
function parseSaved(value: unknown): { readonly items: readonly SavedTab[]; readonly activeId: string | null } {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new CommandError('INVALID_PERSISTED_STATE', 'Tabs description is not an object')
  const data = value as Record<string, unknown>
  if (
    data.version !== 1 ||
    !Array.isArray(data.items) ||
    data.items.length > MAX_WORKSPACE_TABS ||
    !(data.activeId === null || typeof data.activeId === 'string')
  )
    throw new CommandError('INVALID_PERSISTED_STATE', 'Tabs description has an invalid version or count')
  const seen = new Set<string>()
  const items = data.items.map((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new CommandError('INVALID_PERSISTED_STATE', 'Tab reference is invalid')
    const record = item as Record<string, unknown>
    if (
      Object.keys(record).sort().join(',') !== 'id,kind,sessionId,workspaceId' ||
      record.kind !== 'session' ||
      typeof record.id !== 'string' ||
      !record.id ||
      record.id.length > 160 ||
      typeof record.sessionId !== 'string' ||
      record.sessionId !== record.id ||
      typeof record.workspaceId !== 'string' ||
      !record.workspaceId ||
      record.workspaceId.length > 160 ||
      seen.has(record.id)
    )
      throw new CommandError('INVALID_PERSISTED_STATE', 'Tab reference has invalid or duplicate IDs')
    seen.add(record.id)
    return { kind: 'session' as const, id: record.id, sessionId: record.sessionId, workspaceId: record.workspaceId }
  })
  if (data.activeId !== null && !seen.has(data.activeId))
    throw new CommandError('INVALID_PERSISTED_STATE', 'Saved active tab is not open')
  return { items, activeId: data.activeId as string | null }
}

/** Local open-tab projection. Session/Run facts continue to live in directory and timeline. */
export function createWorkspaceTabs(local: CommandRegistry, options: WorkspaceTabsOptions) {
  const state = createState<WorkspaceTabsState>(
    { items: [], activeId: null, revision: 0, restoreStatus: 'loading', restoreError: null, persistError: null },
    options.onSubscriberError,
  )
  const reservations = new Map<string, string>()
  const confirmedCreations = new Map<
    string,
    { readonly workspaceId: string; readonly sessionId: string; readonly instanceKey: string }
  >()
  let disposed = false
  let writeTail = Promise.resolve()
  let dirty = 0
  let savedRevision = 0
  let writeScheduled = false
  let retrySelection: { readonly tab: WorkspaceTabRef; readonly navigation: NavigationState } | null = null
  const navigationAtConstruction = options.navigation.getSnapshot()
  const current = () => state.reader.getSnapshot()
  const selected = () => {
    const id = options.navigation.getSnapshot().sessionId
    return id && current().items.some((item) => item.id === id) ? id : null
  }
  const publish = (patch: Partial<Omit<WorkspaceTabsState, 'activeId'>>) => {
    if (disposed) return
    state.replace({ ...current(), ...patch, activeId: selected() })
  }
  const navigationUnsubscribe = options.navigation.subscribe(() => {
    if (disposed) return
    const activeId = selected()
    if (current().activeId !== activeId) {
      state.replace({ ...current(), activeId, revision: current().revision + 1 })
      persist()
    }
  })
  const saved = () => ({
    version: 1,
    activeId: selected(),
    items: current().items.map(({ kind, id, sessionId, workspaceId }) => ({ kind, id, sessionId, workspaceId })),
  })
  function persist() {
    dirty = current().revision
    if (writeScheduled) return
    writeScheduled = true
    writeTail = writeTail
      .catch(() => undefined)
      .then(async () => {
        while (!disposed && savedRevision < dirty) {
          const revision = dirty
          try {
            await options.preferenceCommands.execute('preferences.set', { key: KEY, value: saved() })
            savedRevision = revision
            if (!disposed && current().revision === revision) publish({ persistError: null })
          } catch (reason) {
            if (!disposed && current().revision === revision) publish({ persistError: code(reason) })
            // A newer local revision supersedes this failed write; attempt that
            // latest complete value once without replaying the old payload.
            if (dirty === revision) break
          }
        }
        writeScheduled = false
      })
  }
  function insert(session: Readonly<Session>) {
    if (disposed) throw new CommandError('DISPOSED', 'Tabs runtime is disposed')
    if (session.archived) throw new CommandError('SESSION_ARCHIVED', 'Archived Session cannot open as a tab')
    const original = current()
    if (original.items.some((item) => item.id === session.id)) return
    if (original.items.length + reservations.size >= MAX_WORKSPACE_TABS)
      throw new CommandError('TAB_LIMIT', 'Open tab limit reached')
    const item: WorkspaceTabRef = {
      kind: 'session',
      id: session.id,
      sessionId: session.id,
      workspaceId: session.workspaceId,
      instanceKey: crypto.randomUUID(),
    }
    publish({ items: [...original.items, item], revision: original.revision + 1 })
    persist()
  }
  function reserveCreation(key: string, workspaceId: string) {
    if (disposed) throw new CommandError('DISPOSED', 'Tabs runtime is disposed')
    const confirmed = confirmedCreations.get(key)
    if (confirmed) {
      if (confirmed.workspaceId !== workspaceId)
        throw new CommandError('COMMAND_CONFLICT', 'Creation key belongs to another workspace')
      if (
        !current().items.some((item) => item.id === confirmed.sessionId && item.instanceKey === confirmed.instanceKey)
      )
        throw new CommandError('NAVIGATION_SUPERSEDED', 'Confirmed tab instance is no longer open')
      return
    }
    const existing = reservations.get(key)
    if (existing) {
      if (existing !== workspaceId)
        throw new CommandError('COMMAND_CONFLICT', 'Creation key belongs to another workspace')
      return
    }
    if (current().items.length + reservations.size >= MAX_WORKSPACE_TABS)
      throw new CommandError('TAB_LIMIT', 'Open tab limit reached')
    reservations.set(key, workspaceId)
  }
  const hooks: WorkspaceTabNavigationHooks = {
    reserveCreation,
    commitCreation(key, session) {
      const workspaceId = reservations.get(key)
      const confirmed = confirmedCreations.get(key)
      if (!workspaceId && confirmed) {
        if (
          confirmed.workspaceId === session.workspaceId &&
          confirmed.sessionId === session.id &&
          current().items.some((item) => item.id === session.id && item.instanceKey === confirmed.instanceKey)
        )
          return
        throw new CommandError('INVALID_OUTPUT', 'Confirmed creation target mismatch or closed tab')
      }
      if (!workspaceId || workspaceId !== session.workspaceId)
        throw new CommandError('INVALID_OUTPUT', 'Created Session target mismatch')
      reservations.delete(key)
      insert(session)
      const item = current().items.find((value) => value.id === session.id)
      if (!item) throw new CommandError('INVALID_OUTPUT', 'Created tab was not observed')
      confirmedCreations.set(key, { workspaceId, sessionId: session.id, instanceKey: item.instanceKey })
      if (confirmedCreations.size > 128) confirmedCreations.delete(confirmedCreations.keys().next().value!)
    },
    settleCreation(key, uncertain) {
      if (!uncertain) reservations.delete(key)
    },
    beforeSelect(session) {
      if (
        !current().items.some((item) => item.id === session.id) &&
        current().items.length + reservations.size >= MAX_WORKSPACE_TABS
      )
        throw new CommandError('TAB_LIMIT', 'Open tab limit reached')
    },
    commitSelected: insert,
  }
  function capture(ids: readonly string[]): readonly WorkspaceTabCloseTarget[] {
    const distinct = new Set(ids)
    return current()
      .items.filter((item) => distinct.has(item.id))
      .map((item) => ({ id: item.id, instanceKey: item.instanceKey, sessionId: item.sessionId }))
  }
  function move(id: string, beforeId: string | null) {
    if (disposed) throw new CommandError('DISPOSED', 'Tabs runtime is disposed')
    const before = current()
    const item = before.items.find((value) => value.id === id)
    if (!item) throw new CommandError('TAB_NOT_FOUND', 'Tab is not open')
    if (beforeId === id) return
    const remaining = before.items.filter((value) => value.id !== id)
    const index = beforeId === null ? remaining.length : remaining.findIndex((value) => value.id === beforeId)
    if (index < 0) throw new CommandError('TAB_NOT_FOUND', 'Move destination is not open')
    const items = [...remaining.slice(0, index), item, ...remaining.slice(index)]
    if (items.every((value, index) => value === before.items[index])) return
    publish({ items, revision: before.revision + 1 })
    persist()
  }
  async function closeCaptured(targets: readonly WorkspaceTabCloseTarget[], signal: AbortSignal): Promise<void> {
    if (disposed) throw new CommandError('DISPOSED', 'Tabs runtime is disposed')
    signal.throwIfAborted()
    const before = current()
    const closing = new Set(
      targets
        .filter((target) =>
          before.items.some(
            (item) =>
              item.id === target.id && item.sessionId === target.sessionId && item.instanceKey === target.instanceKey,
          ),
        )
        .map((target) => target.id),
    )
    if (!closing.size) return
    const firstClosedIndex = before.items.findIndex((item) => closing.has(item.id))
    const items = before.items.filter((item) => !closing.has(item.id))
    const nav = options.navigation.getSnapshot()
    const closedActive = nav.sessionId !== null && closing.has(nav.sessionId)
    if (nav.status === 'loading') throw new CommandError('BUSY', 'Wait for the pending navigation before closing tabs')
    if (closedActive) {
      const activeIndex = before.items.findIndex((item) => item.id === nav.sessionId)
      let nearest: WorkspaceTabRef | null = null
      // Directory is a bounded cache, not authority for older still-open tabs.
      // Revalidate each possible neighbour against the Host, at most 31 candidates.
      for (const item of [...before.items.slice(activeIndex + 1), ...before.items.slice(0, activeIndex).reverse()]) {
        if (closing.has(item.id)) continue
        signal.throwIfAborted()
        try {
          const session = await options.queries.execute('session.get', { sessionId: item.sessionId }, { signal })
          if (
            !session ||
            typeof session !== 'object' ||
            !('id' in session) ||
            session.id !== item.sessionId ||
            !('archived' in session) ||
            session.archived !== false ||
            !('workspaceId' in session) ||
            session.workspaceId !== item.workspaceId
          )
            continue
          const workspace = await options.queries.execute(
            'workspace.get',
            { workspaceId: item.workspaceId },
            { signal },
          )
          if (!workspace || typeof workspace !== 'object' || !('id' in workspace) || workspace.id !== item.workspaceId)
            continue
          nearest = item
          break
        } catch (reason) {
          signal.throwIfAborted()
          // Keep-running closes only local views. An offline neighbour must not
          // strand that action, nor may an unverified tab become active.
          if (OFFLINE_READ_CODES.has(code(reason))) break
          throw reason
        }
      }
      signal.throwIfAborted()
      if (
        current().revision !== before.revision ||
        current().items !== before.items ||
        options.navigation.getSnapshot() !== nav
      )
        throw new CommandError('BUSY', 'Tab or navigation changed while checking the close target')
      options.commitLocalSelection(
        nav.sessionId!,
        nearest
          ? { workspaceId: nearest.workspaceId, sessionId: nearest.sessionId }
          : { workspaceId: nav.workspaceId ?? before.items[firstClosedIndex]!.workspaceId, sessionId: null },
      )
    }
    publish({ items, revision: before.revision + 1 })
    persist()
  }
  async function restore(retry = false) {
    await options.preferencesReady
    if (disposed) return
    const initial = current().revision
    if (!retry && (initial !== 0 || options.navigation.getSnapshot() !== navigationAtConstruction)) {
      publish({ restoreStatus: 'ready' })
      return
    }
    const navigationAtStart = options.navigation.getSnapshot()
    const preference =
      retry && options.preferences.getSnapshot().restoreError
        ? await options.retryPreferencesRestore()
        : options.preferences.getSnapshot()
    if (disposed || current().revision !== initial || options.navigation.getSnapshot() !== navigationAtStart) {
      publish({ restoreStatus: 'ready', restoreError: null })
      return
    }
    if (preference.restoreError) {
      publish({ restoreStatus: 'error', restoreError: preference.restoreError })
      return
    }
    const value = preference.values[KEY]
    if (value === undefined) {
      publish({ restoreStatus: 'ready' })
      return
    }
    try {
      const description = parseSaved(value)
      const descriptions = description.items
      const restored: WorkspaceTabRef[] = []
      for (let offset = 0; offset < descriptions.length; offset += 4) {
        const page = descriptions.slice(offset, offset + 4)
        const outcomes = await Promise.all(
          page.map(async (item) => {
            const response = await options.queries.execute('session.get', { sessionId: item.sessionId })
            if (response === null) return null
            if (
              !response ||
              typeof response !== 'object' ||
              !('id' in response) ||
              !('workspaceId' in response) ||
              !('archived' in response) ||
              response.id !== item.id ||
              response.workspaceId !== item.workspaceId
            )
              throw new CommandError('INVALID_OUTPUT', 'Restored Session target mismatch')
            if (response.archived) return null
            const workspace = await options.queries.execute('workspace.get', { workspaceId: item.workspaceId })
            if (workspace === null) return null
            if (
              !workspace ||
              typeof workspace !== 'object' ||
              !('id' in workspace) ||
              workspace.id !== item.workspaceId
            )
              throw new CommandError('INVALID_OUTPUT', 'Restored Workspace target mismatch')
            const restoredItem: WorkspaceTabRef = { ...item, instanceKey: crypto.randomUUID() }
            return restoredItem
          }),
        )
        if (disposed || current().revision !== initial || options.navigation.getSnapshot() !== navigationAtStart) {
          publish({ restoreStatus: 'ready' })
          return
        }
        restored.push(...outcomes.filter((entry): entry is WorkspaceTabRef => entry !== null))
      }
      if (disposed || current().revision !== initial || options.navigation.getSnapshot() !== navigationAtStart) {
        publish({ restoreStatus: 'ready' })
        return
      }
      publish({ items: restored, revision: current().revision + 1, restoreError: null })
      if (restored.length !== descriptions.length) persist()
      const selectedTab =
        description.activeId === null
          ? null
          : (restored.find((item) => item.id === description.activeId) ?? restored[0] ?? null)
      if (selectedTab && (!retry || navigationAtStart === navigationAtConstruction)) {
        try {
          await options.selectSession(selectedTab.sessionId, selectedTab.workspaceId)
        } catch (reason) {
          if (
            code(reason) !== 'NAVIGATION_SUPERSEDED' &&
            !disposed &&
            options.navigation.getSnapshot().status === 'error' &&
            options.navigation.getSnapshot().sessionId === navigationAtStart.sessionId &&
            options.navigation.getSnapshot().workspaceId === navigationAtStart.workspaceId
          ) {
            retrySelection = { tab: selectedTab, navigation: options.navigation.getSnapshot() }
            publish({ restoreStatus: 'error', restoreError: code(reason) })
            return
          }
        }
      }
      publish({ restoreStatus: 'ready' })
    } catch (reason) {
      if (!disposed && current().revision === initial) publish({ restoreStatus: 'error', restoreError: code(reason) })
    }
  }
  const ready = restore()
  local.register(workspaceTabCommands['workspaceTabs.retryRestore'], async () => {
    if (disposed) throw new CommandError('DISPOSED', 'Tabs runtime is disposed')
    if (current().restoreStatus !== 'error') throw new CommandError('NOT_REQUIRED', 'Tabs restore is not failed')
    publish({ restoreStatus: 'loading', restoreError: null })
    if (retrySelection) {
      const saved = retrySelection
      retrySelection = null
      if (options.navigation.getSnapshot() === saved.navigation && current().items.includes(saved.tab)) {
        try {
          await options.selectSession(saved.tab.sessionId, saved.tab.workspaceId)
          publish({ restoreStatus: 'ready' })
        } catch (reason) {
          if (code(reason) !== 'NAVIGATION_SUPERSEDED') {
            retrySelection = { tab: saved.tab, navigation: options.navigation.getSnapshot() }
            publish({ restoreStatus: 'error', restoreError: code(reason) })
          } else publish({ restoreStatus: 'ready' })
        }
      } else publish({ restoreStatus: 'ready' })
    } else await restore(true)
    const result = current()
    return {
      status: result.restoreStatus === 'error' ? ('error' as const) : ('ready' as const),
      error: result.restoreError,
    }
  })
  local.register(workspaceTabCommands['workspaceTabs.retryPersist'], async () => {
    if (disposed) throw new CommandError('DISPOSED', 'Tabs runtime is disposed')
    if (writeScheduled) throw new CommandError('BUSY', 'Tabs preference write is pending')
    if (!current().persistError) throw new CommandError('NOT_REQUIRED', 'Tabs preference write is not failed')
    persist()
    await writeTail
    return { error: current().persistError }
  })
  local.register(workspaceTabCommands['workspaceTabs.select'], async ({ id }) => {
    const item = current().items.find((value) => value.id === id)
    if (!item) throw new CommandError('TAB_NOT_FOUND', 'Tab is not open')
    await options.selectSession(item.sessionId, item.workspaceId)
    return { activeId: id }
  })
  local.register(workspaceTabCommands['workspaceTabs.move'], ({ id, beforeId }) => {
    move(id, beforeId)
    return { revision: current().revision }
  })
  local.register(workspaceTabCommands['workspaceTabs.capture'], ({ ids }) => [...capture(ids)])
  return {
    reader: state.reader,
    hooks,
    ready,
    capture,
    move,
    closeCaptured,
    whenIdle: () => writeTail,
    async select(id: string) {
      const item = current().items.find((value) => value.id === id)
      if (!item) throw new CommandError('TAB_NOT_FOUND', 'Tab is not open')
      await options.selectSession(item.sessionId, item.workspaceId)
    },
    dispose() {
      disposed = true
      navigationUnsubscribe()
      reservations.clear()
      confirmedCreations.clear()
      state.dispose()
    },
  }
}
