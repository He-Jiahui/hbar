import { CommandError, defineCommand, type CommandRegistry } from '@hbar/commands'
import { z } from 'zod'
import { createState, type StateReader } from './state'
import { MAX_WORKSPACE_TABS, type WorkspaceTabsState } from './workspace-tabs-runtime'
import type { NavigationState, PresentationState, SurfaceState } from './types'

const id = z.string().min(1).max(160)
const toolKind = z.enum(['files', 'monitoring', 'agents', 'goals'])
type ToolKind = z.output<typeof toolKind>
const target = z.strictObject({
  panelId: toolKind,
  workspaceId: id,
  sessionId: id,
  // A retired tab may leave its selected reading view mounted, including after explicit Restore.
  sourceTabInstanceKey: z.string().uuid().nullable(),
})
const result = z.strictObject({ instanceId: id, visible: z.boolean() })
const metadata = (name: string) => ({
  id: name,
  version: 1,
  owner: 'hbar.session-tools',
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
export const sessionToolCommands = {
  'sessionTools.open': defineCommand(metadata('sessionTools.open'), target, result),
  'sessionTools.toggle': defineCommand(metadata('sessionTools.toggle'), target, result),
}
interface Owner {
  readonly workspaceId: string
  readonly sessionId: string
  readonly panels: Readonly<Partial<Record<ToolKind, string>>>
  readonly selected: string | null
}
interface SessionToolsOptions {
  readonly navigation: StateReader<NavigationState>
  readonly tabs: StateReader<WorkspaceTabsState>
  readonly surfaces: ReturnType<typeof createState<SurfaceState>>
  readonly presentation: ReturnType<typeof createState<PresentationState>>
  readonly canRender: (panelId: ToolKind) => boolean
  readonly isArchived: (workspaceId: string, sessionId: string) => boolean
  /** Read-only domain port: dirty, in-flight and uncertain data cannot be evicted. */
  readonly isProtected: (instanceId: string) => boolean
  readonly onSubscriberError: (reason: unknown) => void
}

/** Bounded ephemeral UI ownership, not a second copy of tool data or Host facts. */
export function createSessionTools(local: CommandRegistry, options: SessionToolsOptions) {
  const { surfaces, presentation } = options
  const state = createState<readonly Owner[]>([], options.onSubscriberError)
  let previousTabs = options.tabs.getSnapshot().items
  let disposed = false

  function previewOpened(instanceId: string): void {
    if (disposed) return
    const panel = surfaces.reader.getSnapshot().panels[instanceId]
    if (!panel?.sessionTool || panel.panelId !== 'files' || !panel.sessionId || !panel.workspaceId) return
    const items = options.tabs.getSnapshot().items
    if (
      options.isArchived(panel.workspaceId, panel.sessionId) ||
      !items.some(
        (tab) => tab.kind === 'session' && tab.sessionId === panel.sessionId && tab.workspaceId === panel.workspaceId,
      ) ||
      !items.some(
        (tab) =>
          tab.kind === 'workbench' &&
          tab.panelInstanceId === instanceId &&
          tab.sourceSessionId === panel.sessionId &&
          tab.workspaceId === panel.workspaceId,
      )
    )
      return
    const owners = state.reader.getSnapshot()
    const owner = owners.find(
      (item) =>
        item.sessionId === panel.sessionId &&
        item.workspaceId === panel.workspaceId &&
        item.panels.files === instanceId,
    )
    if (!owner || owner.selected === instanceId) return
    // Opening inside Workbench remembers its source dock without mounting a second view beside it.
    state.replace(owners.map((item) => (item === owner ? { ...item, selected: instanceId } : item)))
  }

  function hide(instanceId: string): { instanceId: string; closed: boolean } | null {
    if (!surfaces.reader.getSnapshot().panels[instanceId]?.sessionTool) return null
    const owners = state.reader.getSnapshot()
    const current = presentation.reader.getSnapshot()
    const closed =
      owners.some((owner) => owner.selected === instanceId) ||
      current.toolInstanceId === instanceId ||
      current.returnContext?.toolInstanceId === instanceId
    if (!closed) return { instanceId, closed: false }
    state.replace(owners.map((owner) => (owner.selected === instanceId ? { ...owner, selected: null } : owner)))
    const next = {
      ...current,
      toolInstanceId: current.toolInstanceId === instanceId ? null : current.toolInstanceId,
      returnContext:
        current.returnContext?.toolInstanceId === instanceId
          ? { ...current.returnContext, toolInstanceId: null }
          : current.returnContext,
    }
    presentation.replace(next)
    const snapshot = surfaces.reader.getSnapshot()
    if (snapshot.focusedPanelId === instanceId)
      surfaces.replace({
        ...snapshot,
        focusedPanelId:
          next.modalInstanceId ?? next.toolInstanceId ?? (next.page.kind === 'session' ? null : next.page.instanceId),
      })
    return { instanceId, closed: true }
  }

  function reserve(workspaceId: string, sessionId: string): Owner {
    const owners = state.reader.getSnapshot()
    const existing = owners.find((owner) => owner.workspaceId === workspaceId && owner.sessionId === sessionId)
    if (existing) return existing
    if (owners.length < MAX_WORKSPACE_TABS) return { workspaceId, sessionId, panels: {}, selected: null }
    const tabs = options.tabs.getSnapshot().items
    const active = options.navigation.getSnapshot()
    const current = presentation.reader.getSnapshot()
    const victim = owners.find((owner) => {
      const panelIds = Object.values(owner.panels)
      return (
        !(active.workspaceId === owner.workspaceId && active.sessionId === owner.sessionId) &&
        !tabs.some((tab) =>
          tab.kind === 'session'
            ? tab.workspaceId === owner.workspaceId && tab.sessionId === owner.sessionId
            : panelIds.includes(tab.panelInstanceId),
        ) &&
        !panelIds.some(
          (panelId) =>
            panelId === current.toolInstanceId ||
            panelId === current.returnContext?.toolInstanceId ||
            options.isProtected(panelId),
        )
      )
    })
    if (!victim) throw new CommandError('BUSY', 'Close an unused session and save or discard its tool drafts first')
    state.replace(owners.filter((owner) => owner !== victim))
    const ids = new Set(Object.values(victim.panels))
    const snapshot = surfaces.reader.getSnapshot()
    surfaces.replace({
      ...snapshot,
      panels: Object.fromEntries(Object.entries(snapshot.panels).filter(([panelId]) => !ids.has(panelId))),
      focusedPanelId: snapshot.focusedPanelId && ids.has(snapshot.focusedPanelId) ? null : snapshot.focusedPanelId,
    })
    return { workspaceId, sessionId, panels: {}, selected: null }
  }

  async function open(input: z.output<typeof target>, toggle: boolean) {
    const active = options.navigation.getSnapshot()
    const tabs = options.tabs.getSnapshot()
    const tab = tabs.items.find(
      (item) => item.kind === 'session' && item.workspaceId === input.workspaceId && item.sessionId === input.sessionId,
    )
    if (
      active.status === 'loading' ||
      active.workspaceId !== input.workspaceId ||
      active.sessionId !== input.sessionId ||
      (tab?.instanceKey ?? null) !== input.sourceTabInstanceKey ||
      tabs.items.some((item) => item.id === tabs.activeId && item.kind === 'workbench')
    )
      throw new CommandError('COMMAND_CONFLICT', 'The source session is no longer selected')
    if (!options.canRender(input.panelId))
      throw new CommandError('CAPABILITY_UNAVAILABLE', `This runtime cannot render panel: ${input.panelId}`)
    const owner = reserve(input.workspaceId, input.sessionId)
    const instanceId = owner.panels[input.panelId] ?? `session-tool:${crypto.randomUUID()}`
    const current = presentation.reader.getSnapshot()
    if (toggle && current.page.kind === 'session' && current.toolInstanceId === instanceId) {
      hide(instanceId)
      return { instanceId, visible: false }
    }
    const workbench = options.tabs
      .getSnapshot()
      .items.find((item) => item.kind === 'workbench' && item.panelInstanceId === instanceId)
    if (workbench) {
      // One tool has one view owner: its source entry locates the expanded view, not a duplicate dock.
      await local.execute('workspaceTabs.select', { id: workbench.id })
      return { instanceId, visible: false }
    }
    state.replace([
      ...state.reader.getSnapshot().filter((item) => item !== owner),
      { ...owner, panels: { ...owner.panels, [input.panelId]: instanceId }, selected: instanceId },
    ])
    const snapshot = surfaces.reader.getSnapshot()
    const panel = snapshot.panels[instanceId] ?? {
      instanceId,
      panelId: input.panelId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      binding: 'pinned' as const,
      sessionTool: true as const,
      params: {},
    }
    surfaces.replace({ ...snapshot, panels: { ...snapshot.panels, [instanceId]: panel }, focusedPanelId: instanceId })
    presentation.replace({
      ...current,
      page: { kind: 'session' },
      toolInstanceId: instanceId,
      modalInstanceId: null,
      returnContext: null,
    })
    return { instanceId, visible: true }
  }
  local.register(sessionToolCommands['sessionTools.open'], (input) => open(input, false))
  local.register(sessionToolCommands['sessionTools.toggle'], (input) => open(input, true))

  const offTabs = options.tabs.subscribe(() => {
    const tabs = options.tabs.getSnapshot()
    const items = tabs.items
    const before = previousTabs
    previousTabs = items
    for (const tab of before) {
      if (
        tab.kind !== 'session' ||
        items.some((item) => item.kind === 'session' && item.instanceKey === tab.instanceKey)
      )
        continue
      const owner = state.reader
        .getSnapshot()
        .find((item) => item.workspaceId === tab.workspaceId && item.sessionId === tab.sessionId)
      if (owner?.selected) {
        const active = options.navigation.getSnapshot()
        if (
          active.workspaceId === owner.workspaceId &&
          active.sessionId === owner.sessionId &&
          options.isArchived(owner.workspaceId, owner.sessionId)
        ) {
          // Observational archive retires the tab, not its loaded reading position.
          // Preserve the current page/return context, but never auto-reopen after leaving.
          state.replace(state.reader.getSnapshot().map((item) => (item === owner ? { ...item, selected: null } : item)))
        } else hide(owner.selected)
      }
    }
    for (const tab of items)
      if (
        tab.kind === 'workbench' &&
        !before.some((item) => item.kind === 'workbench' && item.instanceKey === tab.instanceKey)
      )
        hide(tab.panelInstanceId)
    const current = presentation.reader.getSnapshot()
    if (
      items.some((tab) => tab.kind === 'workbench' && tab.id === tabs.activeId) &&
      current.toolInstanceId &&
      surfaces.reader.getSnapshot().panels[current.toolInstanceId]?.sessionTool
    ) {
      // A workbench owns the main area. Suspend another session's dock without forgetting it.
      presentation.replace({ ...current, toolInstanceId: null })
      const snapshot = surfaces.reader.getSnapshot()
      if (snapshot.focusedPanelId === current.toolInstanceId)
        surfaces.replace({ ...snapshot, focusedPanelId: current.modalInstanceId })
    }
  })

  return {
    hide,
    previewOpened,
    navigationTool(target: NavigationState, current: PresentationState): string | null {
      const override = current.toolInstanceId ?? current.returnContext?.toolInstanceId
      // Explicit generic/project panels preserve their documented follow/pinned semantics.
      if (override && !surfaces.reader.getSnapshot().panels[override]?.sessionTool) return override
      const owner = state.reader
        .getSnapshot()
        .find((item) => item.workspaceId === target.workspaceId && item.sessionId === target.sessionId)
      return owner?.selected ?? null
    },
    dispose() {
      disposed = true
      offTabs()
      state.dispose()
    },
  }
}
