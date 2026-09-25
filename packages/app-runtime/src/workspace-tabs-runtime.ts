import { CommandError, defineCommand, type CommandExecutor, type CommandRegistry } from '@hbar/commands'
import { z } from 'zod'
import type { Session } from '@hbar/contracts/directory'
import { createState, type StateReader } from './state'
import type { ClientPreferencesState, DirectoryState, NavigationState, SurfaceState } from './types'
import type { WorkspaceTabCloseTarget } from './workspace-tab-close'

export const MAX_WORKSPACE_TABS = 32
const KEY = 'workspaceTabs'
const idSchema = z.string().min(1).max(160)
const targetSchema = z.strictObject({ id: idSchema, sessionId: idSchema.nullable(), instanceKey: z.string().uuid() })
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
  'workspaceTabs.openWorkbench': defineCommand(
    metadata('workspaceTabs.openWorkbench'),
    z.strictObject({ panelInstanceId: idSchema, sourceSessionId: idSchema.nullable(), workspaceId: idSchema }),
    z.strictObject({ id: idSchema }),
  ),
  'workspaceTabs.returnToSource': defineCommand(
    metadata('workspaceTabs.returnToSource'),
    z.strictObject({ id: idSchema, instanceKey: z.string().uuid() }),
    z.strictObject({ activeId: idSchema.nullable() }),
  ),
}
interface SessionTabDescription {
  readonly kind: 'session'
  readonly id: string
  readonly sessionId: string
  readonly workspaceId: string
}
export interface SessionTabRef extends SessionTabDescription {
  readonly instanceKey: string
}
export interface WorkbenchTabRef {
  readonly kind: 'workbench'
  readonly id: string
  readonly instanceKey: string
  readonly panelInstanceId: string
  readonly sourceSessionId: string | null
  readonly workspaceId: string
}
export type WorkspaceTabRef = SessionTabRef | WorkbenchTabRef
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
  commitWorkspaceSelection(): void
}
export interface WorkspaceTabsOptions {
  readonly navigation: StateReader<NavigationState>
  readonly directory: StateReader<DirectoryState>
  readonly surfaces: StateReader<SurfaceState>
  readonly queries: CommandExecutor
  readonly preferences: StateReader<ClientPreferencesState>
  readonly preferenceCommands: CommandExecutor
  readonly preferencesReady: Promise<void>
  readonly retryPreferencesRestore: () => Promise<ClientPreferencesState>
  readonly selectSession: (sessionId: string, workspaceId: string) => Promise<unknown>
  /** Owned navigation writer invalidates older navigations when a selected tab closes. */
  readonly commitLocalSelection: (
    closedId: string | null,
    next: { workspaceId: string; sessionId: string | null },
  ) => void
  readonly onSubscriberError: (reason: unknown) => void
}

function code(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}
const OFFLINE_READ_CODES = new Set(['DISCONNECTED', 'CONNECTION_CLOSED', 'TIMEOUT', 'TIMED_OUT'])
function parseSaved(value: unknown): {
  readonly items: readonly SessionTabDescription[]
  readonly activeId: string | null
  readonly activeWorkspaceId: string | null
} {
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
  const activeWorkspaceId = data.activeWorkspaceId
  if (
    activeWorkspaceId !== undefined &&
    (typeof activeWorkspaceId !== 'string' ||
      !activeWorkspaceId ||
      activeWorkspaceId.length > 160 ||
      data.activeId !== null)
  )
    throw new CommandError('INVALID_PERSISTED_STATE', 'Saved detached Workspace target is invalid')
  return {
    items,
    activeId: data.activeId as string | null,
    activeWorkspaceId: (activeWorkspaceId as string | undefined) ?? null,
  }
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
  let retrySelection: { readonly tab: SessionTabRef; readonly navigation: NavigationState } | null = null
  let focusedWorkbenchId: string | null = null
  let restoredWorkspaceId: string | null = null
  const navigationAtConstruction = options.navigation.getSnapshot()
  const current = () => state.reader.getSnapshot()
  const selected = (items: readonly WorkspaceTabRef[] = current().items) => {
    if (focusedWorkbenchId && items.some((item) => item.id === focusedWorkbenchId)) return focusedWorkbenchId
    const id = options.navigation.getSnapshot().sessionId
    return id && items.some((item) => item.kind === 'session' && item.id === id) ? id : null
  }
  const publish = (patch: Partial<Omit<WorkspaceTabsState, 'activeId'>>) => {
    if (disposed) return
    state.replace({ ...current(), ...patch, activeId: selected(patch.items ?? current().items) })
  }
  const navigationUnsubscribe = options.navigation.subscribe(() => {
    if (disposed) return
    const nav = options.navigation.getSnapshot()
    if (restoredWorkspaceId && (nav.workspaceId !== restoredWorkspaceId || nav.sessionId !== null))
      restoredWorkspaceId = null
    const activeId = selected()
    if (current().activeId !== activeId) {
      state.replace({ ...current(), activeId, revision: current().revision + 1 })
      persist()
    }
  })
  const surfaceUnsubscribe = options.surfaces.subscribe(() => {
    if (disposed || !current().items.some((item) => item.kind === 'workbench')) return
    const items = current().items.filter((item) => {
      if (item.kind === 'session') return true
      const panel = options.surfaces.getSnapshot().panels[item.panelInstanceId]
      return Boolean(
        panel?.panelId === 'files' &&
        panel.binding === 'pinned' &&
        panel.workspaceId === item.workspaceId &&
        panel.sessionId === item.sourceSessionId,
      )
    })
    if (items.length === current().items.length) return
    if (focusedWorkbenchId && !items.some((item) => item.id === focusedWorkbenchId)) focusedWorkbenchId = null
    publish({ items, revision: current().revision + 1 })
    persist()
  })
  const saved = () => {
    const active = current().items.find((item) => item.id === selected())
    const id = active?.kind === 'workbench' ? active.sourceSessionId : active?.id
    const workspaceFallback =
      active?.kind === 'workbench' && active.sourceSessionId === null
        ? active.workspaceId
        : selected() === null && options.navigation.getSnapshot().workspaceId === restoredWorkspaceId
          ? restoredWorkspaceId
          : null
    return {
      version: 1,
      activeId: workspaceFallback
        ? null
        : current().items.some((item) => item.kind === 'session' && item.id === id)
          ? id
          : (current().items.find((item) => item.kind === 'session')?.id ?? null),
      ...(workspaceFallback ? { activeWorkspaceId: workspaceFallback } : {}),
      items: current()
        .items.filter((item): item is SessionTabRef => item.kind === 'session')
        .map(({ kind, id, sessionId, workspaceId }) => ({ kind, id, sessionId, workspaceId })),
    }
  }
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
    const item: SessionTabRef = {
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
    commitSelected(session) {
      insert(session)
      if (focusedWorkbenchId) {
        focusedWorkbenchId = null
        publish({ revision: current().revision + 1 })
        persist()
      }
    },
    commitWorkspaceSelection() {
      if (!focusedWorkbenchId) return
      focusedWorkbenchId = null
      publish({ revision: current().revision + 1 })
      persist()
    },
  }
  function workbenchPanel(ref: WorkbenchTabRef) {
    const panel = options.surfaces.getSnapshot().panels[ref.panelInstanceId]
    return Boolean(
      panel?.panelId === 'files' &&
      panel.binding === 'pinned' &&
      panel.workspaceId === ref.workspaceId &&
      panel.sessionId === ref.sourceSessionId,
    )
  }
  function openWorkbench(panelInstanceId: string, sourceSessionId: string | null, workspaceId: string) {
    if (disposed) throw new CommandError('DISPOSED', 'Tabs runtime is disposed')
    const panel = options.surfaces.getSnapshot().panels[panelInstanceId]
    if (
      !panel ||
      panel.panelId !== 'files' ||
      panel.binding !== 'pinned' ||
      panel.workspaceId !== workspaceId ||
      panel.sessionId !== sourceSessionId
    )
      throw new CommandError('TARGET_CHANGED', 'Files panel is not pinned to the requested source')
    const existing = current().items.find(
      (item): item is WorkbenchTabRef => item.kind === 'workbench' && item.panelInstanceId === panelInstanceId,
    )
    if (existing) {
      if (existing.sourceSessionId !== sourceSessionId || existing.workspaceId !== workspaceId)
        throw new CommandError('COMMAND_CONFLICT', 'Workbench panel belongs to another source')
      if (focusedWorkbenchId !== existing.id) {
        focusedWorkbenchId = existing.id
        publish({ revision: current().revision + 1 })
        persist()
      }
      return existing.id
    }
    if (
      sourceSessionId !== null &&
      !current().items.some((item) => item.kind === 'session' && item.id === sourceSessionId)
    )
      throw new CommandError('TAB_NOT_FOUND', 'Source Session tab is not open')
    if (current().items.length + reservations.size >= MAX_WORKSPACE_TABS)
      throw new CommandError('TAB_LIMIT', 'Open tab limit reached')
    let id: string | null = null
    for (let attempt = 0; attempt < 4; attempt++) {
      const candidate = `__workbench__${crypto.randomUUID()}`
      if (!current().items.some((entry) => entry.id === candidate)) {
        id = candidate
        break
      }
    }
    if (!id) throw new CommandError('COMMAND_CONFLICT', 'Cannot allocate a distinct Workbench tab')
    const item: WorkbenchTabRef = {
      kind: 'workbench',
      id,
      instanceKey: crypto.randomUUID(),
      panelInstanceId,
      sourceSessionId,
      workspaceId,
    }
    restoredWorkspaceId = null
    focusedWorkbenchId = item.id
    publish({ items: [...current().items, item], revision: current().revision + 1 })
    persist()
    return item.id
  }
  function capture(ids: readonly string[]): readonly WorkspaceTabCloseTarget[] {
    const distinct = new Set(ids)
    return current()
      .items.filter((item) => distinct.has(item.id))
      .map((item) => ({
        id: item.id,
        instanceKey: item.instanceKey,
        sessionId: item.kind === 'session' ? item.sessionId : null,
      }))
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
              item.id === target.id &&
              item.instanceKey === target.instanceKey &&
              (item.kind === 'session' ? item.sessionId === target.sessionId : target.sessionId === null),
          ),
        )
        .map((target) => target.id),
    )
    if (!closing.size) return
    const firstClosedIndex = before.items.findIndex((item) => closing.has(item.id))
    const items = before.items.filter((item) => !closing.has(item.id))
    const nav = options.navigation.getSnapshot()
    const activeId = selected()
    const closedActive = activeId !== null && closing.has(activeId)
    const closedNavigationSession = nav.sessionId !== null && closing.has(nav.sessionId)
    if (nav.status === 'loading') throw new CommandError('BUSY', 'Wait for the pending navigation before closing tabs')
    if (closedActive || closedNavigationSession) {
      const activeIndex = before.items.findIndex((item) => item.id === (closedActive ? activeId : nav.sessionId))
      let nearest: WorkspaceTabRef | null = null
      // Directory is a bounded cache, not authority for older still-open tabs.
      // Revalidate each possible neighbour against the Host, at most 31 candidates.
      for (const item of [...before.items.slice(activeIndex + 1), ...before.items.slice(0, activeIndex).reverse()]) {
        if (closing.has(item.id)) continue
        if (item.kind === 'workbench') {
          if (closedActive && workbenchPanel(item)) {
            nearest = item
            break
          }
          continue
        }
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
      if (closedActive) focusedWorkbenchId = nearest?.kind === 'workbench' ? nearest.id : null
      if (nearest?.kind === 'session') {
        options.commitLocalSelection(nav.sessionId, {
          workspaceId: nearest.workspaceId,
          sessionId: nearest.sessionId,
        })
      } else if (closedNavigationSession || nearest === null) {
        options.commitLocalSelection(nav.sessionId, {
          workspaceId: nav.workspaceId ?? before.items[firstClosedIndex]!.workspaceId,
          sessionId: null,
        })
      }
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
      const restored: SessionTabRef[] = []
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
            const restoredItem: SessionTabRef = { ...item, instanceKey: crypto.randomUUID() }
            return restoredItem
          }),
        )
        if (disposed || current().revision !== initial || options.navigation.getSnapshot() !== navigationAtStart) {
          publish({ restoreStatus: 'ready' })
          return
        }
        restored.push(...outcomes.filter((entry): entry is SessionTabRef => entry !== null))
      }
      if (disposed || current().revision !== initial || options.navigation.getSnapshot() !== navigationAtStart) {
        publish({ restoreStatus: 'ready' })
        return
      }
      publish({ items: restored, revision: current().revision + 1, restoreError: null })
      let needsPersist = restored.length !== descriptions.length
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
      if (description.activeWorkspaceId && (!retry || navigationAtStart === navigationAtConstruction)) {
        const restoredRevision = current().revision
        try {
          const workspace = await options.queries.execute('workspace.get', {
            workspaceId: description.activeWorkspaceId,
          })
          if (
            disposed ||
            current().revision !== restoredRevision ||
            options.navigation.getSnapshot() !== navigationAtStart
          ) {
            publish({ restoreStatus: 'ready' })
            return
          }
          if (workspace === null) needsPersist = true
          else if (
            !workspace ||
            typeof workspace !== 'object' ||
            !('id' in workspace) ||
            workspace.id !== description.activeWorkspaceId
          )
            throw new CommandError('INVALID_OUTPUT', 'Detached Workspace target mismatch')
          else {
            restoredWorkspaceId = description.activeWorkspaceId
            options.commitLocalSelection(navigationAtStart.sessionId, {
              workspaceId: description.activeWorkspaceId,
              sessionId: null,
            })
          }
        } catch (reason) {
          if (
            !disposed &&
            current().revision === restoredRevision &&
            options.navigation.getSnapshot() === navigationAtStart
          )
            publish({ restoreStatus: 'error', restoreError: code(reason) })
          else publish({ restoreStatus: 'ready' })
          return
        }
      }
      if (needsPersist) persist()
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
  async function select(id: string) {
    const item = current().items.find((value) => value.id === id)
    if (!item) throw new CommandError('TAB_NOT_FOUND', 'Tab is not open')
    if (item.kind === 'workbench') {
      if (!workbenchPanel(item)) throw new CommandError('TARGET_CHANGED', 'Files panel is no longer pinned')
      if (options.navigation.getSnapshot().status === 'loading')
        throw new CommandError('BUSY', 'Navigation is in progress')
      if (focusedWorkbenchId !== id) {
        focusedWorkbenchId = id
        publish({ revision: current().revision + 1 })
        persist()
      }
    } else await options.selectSession(item.sessionId, item.workspaceId)
    return { activeId: id }
  }
  local.register(workspaceTabCommands['workspaceTabs.select'], ({ id }) => select(id))
  local.register(workspaceTabCommands['workspaceTabs.move'], ({ id, beforeId }) => {
    move(id, beforeId)
    return { revision: current().revision }
  })
  local.register(workspaceTabCommands['workspaceTabs.capture'], ({ ids }) => [...capture(ids)])
  local.register(
    workspaceTabCommands['workspaceTabs.openWorkbench'],
    ({ panelInstanceId, sourceSessionId, workspaceId }) => ({
      id: openWorkbench(panelInstanceId, sourceSessionId, workspaceId),
    }),
  )
  local.register(workspaceTabCommands['workspaceTabs.returnToSource'], async ({ id, instanceKey }, execution) => {
    if (disposed) throw new CommandError('DISPOSED', 'Tabs runtime is disposed')
    const item = current().items.find(
      (candidate): candidate is WorkbenchTabRef => candidate.kind === 'workbench' && candidate.id === id,
    )
    if (!item || item.instanceKey !== instanceKey) throw new CommandError('TAB_NOT_FOUND', 'Workbench tab changed')
    if (selected() !== item.id) throw new CommandError('COMMAND_CONFLICT', 'Workbench is no longer active')
    if (item.sourceSessionId === null) {
      const nav = options.navigation.getSnapshot()
      if (nav.status === 'loading') throw new CommandError('BUSY', 'Navigation is in progress')
      focusedWorkbenchId = null
      restoredWorkspaceId = item.workspaceId
      options.commitLocalSelection(nav.sessionId, { workspaceId: item.workspaceId, sessionId: null })
      publish({ items: current().items.filter((candidate) => candidate !== item), revision: current().revision + 1 })
      persist()
      return { activeId: selected() }
    }
    const source = current().items.find(
      (candidate): candidate is SessionTabRef =>
        candidate.kind === 'session' &&
        candidate.id === item.sourceSessionId &&
        candidate.workspaceId === item.workspaceId,
    )
    if (source) {
      try {
        await options.selectSession(source.sessionId, source.workspaceId)
        // Navigation owns the source selection and a successful Host validation.
        await closeCaptured([{ id, instanceKey, sessionId: null }], execution.signal ?? new AbortController().signal)
        return { activeId: selected() }
      } catch (reason) {
        if (!['SESSION_NOT_FOUND', 'SESSION_ARCHIVED', 'WORKSPACE_NOT_FOUND'].includes(code(reason))) throw reason
      }
    }
    await closeCaptured([{ id, instanceKey, sessionId: null }], execution.signal ?? new AbortController().signal)
    return { activeId: selected() }
  })
  return {
    reader: state.reader,
    hooks,
    ready,
    capture,
    move,
    closeCaptured,
    whenIdle: () => writeTail,
    select: async (id: string) => {
      await select(id)
    },
    dispose() {
      disposed = true
      navigationUnsubscribe()
      surfaceUnsubscribe()
      reservations.clear()
      confirmedCreations.clear()
      state.dispose()
    },
  }
}
