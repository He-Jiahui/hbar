import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  SESSION_ARCHIVE_BATCH_MAX_ITEMS,
  orderWorkspaceActivityIds,
  sortPinnedWorkspaces,
  workspaceDisplayName,
} from '@hbar/app-runtime'
import type { Session } from '@hbar/contracts/directory'
import { WORKSPACE_VIEWPORT_MEDIA } from './responsive-contract'

import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import {
  createWorkspaceNavigationActions,
  type WorkspaceNavigationAction,
  type WorkspaceNavigationActionState,
  type WorkspaceNavigationSelection,
} from './workspace-navigation-actions'
import { useWorkspaceOrganizationFocus } from './workspace-organization-focus'
import { useWorkspaceProjectReorder } from './workspace-project-reorder'
import { buildSidebarTimeGroups } from './sidebar-time-groups'
import { useWorkspaceDisplayNameFocus } from './workspace-display-name-focus'
import { useSessionRosterRefresh } from './session-roster-refresh'
import { shouldCollapseWorkspaceSidebar } from './workspace-tool-focus'
import { workspaceShellShortcut } from './workspace-shell-shortcut'
import type { WorkspaceSidebarProps } from './workspace-shell-contract'
import { useWorkspaceSidebarMessages } from './workspace-shell-messages'
const PAGE_SIZE = 100
const EMPTY_HIDDEN_IDS: readonly string[] = Object.freeze([])
export function useWorkspaceSidebar(props: WorkspaceSidebarProps) {
  const { t } = useWorkspaceSidebarMessages()
  const {
    setSidebarViewportNarrow,
    sidebarChoiceRevision,
    mainRef,
    sidebarShowFocusRef,
    setError,
    execute,
    recordError,
  } = props.bridge
  const runtime = useHbarRuntime()
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const directory = useHbarRuntimeState(runtime.state.directory)
  const workspacePins = useHbarRuntimeState(runtime.state.workspacePins)
  const workspaceActivity = useHbarRuntimeState(runtime.state.workspaceActivity)
  const agentTree = useHbarRuntimeState(runtime.state.sessionAgentTree)
  const timeView = workspaceActivity.organization === 'time'
  const activityPreferenceBusy = ['loading', 'saving', 'submitting'].includes(
    workspaceActivity.organizationPreferenceStatus,
  )
  useEffect(() => {
    if (props.connection !== 'connected') return
    void runtime.commands.execute('workspaceActivity.setLocale', { locale: props.locale ?? 'en-US' }).catch(() => {
      // The activity owner retains its confirmed page and localized retry.
    })
  }, [props.locale, props.connection, runtime])
  const organization = useHbarRuntimeState(runtime.state.workspaceOrganization)
  const displayNames = useHbarRuntimeState(runtime.state.workspaceDisplayNames)
  const organizationMenuRef = useRef<HTMLDivElement | null>(null)
  const sidebarTreeRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    // Changing list organization starts at its heading; live row updates keep the scroll position.
    sidebarTreeRef.current?.scrollIntoView({ block: 'start', inline: 'nearest' })
  }, [workspaceActivity.organization])
  const hiddenWorkspaceIds = organization.snapshot?.hiddenWorkspaceIds ?? EMPTY_HIDDEN_IDS
  const captureHideFocus = useWorkspaceOrganizationFocus(
    runtime,
    hiddenWorkspaceIds,
    organization.action.status === 'failed',
    organizationMenuRef,
  )
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const sidebarViewportOwner = useRef<{ owner: typeof runtime; narrow: boolean } | null>(null)
  const rosterRefresh = useHbarRuntimeState(runtime.state.sessionRosterRefresh)
  const sessionArchive = useHbarRuntimeState(runtime.state.sessionArchive)
  const captureDisplayNameFocus = useWorkspaceDisplayNameFocus(
    runtime,
    displayNames.editor?.open ?? false,
    organizationMenuRef,
    sidebarShowFocusRef,
    mainRef,
  )
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(navigation.workspaceId ? [navigation.workspaceId] : []),
  )
  useEffect(() => {
    const workspaceId = agentTree.revealedRoot?.workspaceId
    if (workspaceId) setExpanded((prior) => (prior.has(workspaceId) ? prior : new Set([...prior, workspaceId])))
  }, [agentTree.revealedRoot?.workspaceId])
  const visibleExpanded = useMemo(() => {
    const hidden = new Set(hiddenWorkspaceIds)
    return new Set([...expanded].filter((id) => !hidden.has(id)))
  }, [expanded, hiddenWorkspaceIds])
  const refreshRoster = useSessionRosterRefresh(
    runtime,
    visibleExpanded,
    props.connection === 'connected',
    presentation.sidebarOpen,
  )
  const rosterBusy = Object.values(rosterRefresh.entries).some((entry) => entry.status === 'loading')
  const [workspaceCursor, setWorkspaceCursor] = useState<string | null | undefined>()
  const [loading, setLoading] = useState<ReadonlySet<string>>(() => new Set())
  const [workspaceActionError, setWorkspaceActionError] = useState<{ workspaceId: string; code: string } | null>(null)
  const [navigationAction, setNavigationAction] = useState<WorkspaceNavigationActionState>({
    status: 'idle',
    action: null,
    error: null,
  })
  const [actionWorkspaceId, setActionWorkspaceId] = useState<string | null>(null)
  const [projectPicker, setProjectPicker] = useState<'create-session' | 'open-workspace' | null>(null)
  const [workspacePath, setWorkspacePath] = useState('')
  const [sessionTimeNow, setSessionTimeNow] = useState(Date.now)
  const [batchSelecting, setBatchSelecting] = useState(false)
  const [batchSelection, setBatchSelection] = useState<
    ReadonlyMap<string, { readonly workspaceId: string; readonly sessionId: string }>
  >(new Map())
  const batchSelectionRef = useRef(batchSelection)
  const [batchLimitReached, setBatchLimitReached] = useState(false)
  const batchToolbarRef = useRef<HTMLButtonElement | null>(null)
  const projectPickerTrigger = useRef<HTMLElement | null>(null)
  const restoreProjectPickerFocus = useRef(false)
  const navigationActions = useRef<ReturnType<typeof createWorkspaceNavigationActions> | null>(null)
  useEffect(() => {
    const timer = window.setInterval(() => setSessionTimeNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if (projectPicker !== null || !restoreProjectPickerFocus.current) return
    restoreProjectPickerFocus.current = false
    const trigger = projectPickerTrigger.current
    if (trigger?.isConnected && trigger.getClientRects().length > 0) trigger.focus()
  }, [projectPicker])
  useEffect(() => {
    const actions = createWorkspaceNavigationActions(runtime, setNavigationAction)
    navigationActions.current = actions
    setNavigationAction(actions.getSnapshot())
    return () => {
      actions.dispose()
      if (navigationActions.current === actions) navigationActions.current = null
    }
  }, [runtime])
  const loadWorkspaces = useCallback(
    async (after?: string) => {
      setLoading((current) => new Set(current).add('workspaces'))
      setError(null)
      try {
        const page = await execute('workspace.list', { after, limit: PAGE_SIZE })
        setWorkspaceCursor(page.nextCursor)
        if (!after && navigation.workspaceId === null && page.items[0])
          setExpanded((current) => new Set(current).add(page.items[0]!.id))
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason))
      } finally {
        setLoading((current) => new Set([...current].filter((id) => id !== 'workspaces')))
      }
    },
    [execute, navigation.workspaceId, setError],
  )
  const loadSessions = useCallback(
    async (workspaceId: string, more = false) => {
      try {
        if (more) await execute('workspaceActivity.loadMore', { scope: 'sessions', workspaceId })
        else await execute('workspaceActivity.refresh', { workspaceId })
      } catch {
        // The captured group's activity owner retains its rows and footer retry.
      }
    },
    [execute],
  )
  useEffect(() => {
    if (props.connection !== 'connected') return
    void execute('workspaceActivity.refresh', {}).catch(() => {
      // Last confirmed order and its retry remain in the sidebar.
    })
  }, [execute, props.connection])
  useEffect(() => {
    if (props.connection === 'connected' && projectPicker) void loadWorkspaces()
  }, [loadWorkspaces, projectPicker, props.connection])
  useLayoutEffect(() => {
    const narrow = window.matchMedia(WORKSPACE_VIEWPORT_MEDIA.narrowShell)
    const closeNarrowSidebar = (event: MediaQueryListEvent | MediaQueryList) => {
      const previous = sidebarViewportOwner.current
      const enteredNarrow = previous?.owner !== runtime || previous.narrow !== event.matches
      sidebarViewportOwner.current = { owner: runtime, narrow: event.matches }
      setSidebarViewportNarrow(event.matches)
      if (
        enteredNarrow &&
        shouldCollapseWorkspaceSidebar(
          event.matches,
          runtime.state.presentation.getSnapshot().sidebarOpen,
          document.querySelector('dialog:modal') !== null,
        )
      )
        void execute(previous?.owner !== runtime ? 'app.initializeSidebar' : 'app.setSidebarVisible', {
          visible: false,
        }).catch(recordError)
    }
    closeNarrowSidebar(narrow)
    narrow.addEventListener('change', closeNarrowSidebar)
    return () => narrow.removeEventListener('change', closeNarrowSidebar)
  }, [execute, recordError, runtime, runtime.state.presentation, setSidebarViewportNarrow])
  useEffect(() => {
    if (navigation.workspaceId)
      setExpanded((current) =>
        current.has(navigation.workspaceId!) ? current : new Set(current).add(navigation.workspaceId!),
      )
  }, [navigation.workspaceId])
  useEffect(() => {
    if (props.connection !== 'connected' || timeView) return
    const pending = Object.values(workspaceActivity.sessions).filter((page) => page.status === 'loading').length
    const missing = [...visibleExpanded].filter((id) => !Object.hasOwn(workspaceActivity.sessions, id))
    for (const workspaceId of missing.slice(0, Math.max(0, 2 - pending))) void loadSessions(workspaceId)
  }, [visibleExpanded, loadSessions, props.connection, timeView, workspaceActivity.sessions])
  useEffect(() => {
    const first = workspaceActivity.workspaces.items[0]?.workspaceId
    if (navigation.workspaceId === null && first) setExpanded((current) => (current.size ? current : new Set([first])))
  }, [navigation.workspaceId, workspaceActivity.workspaces.items])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = workspaceShellShortcut(
        event,
        Boolean(document.querySelector('dialog:modal, [popover]:popover-open')),
      )
      if (!shortcut) return
      event.preventDefault()
      const choiceRevision = sidebarChoiceRevision.current
      void (
        shortcut === 'settings'
          ? execute('app.openSettings', { scope: 'global' })
          : execute('app.openPanel', { panelId: shortcut })
      )
        .then(() => {
          if (choiceRevision === sidebarChoiceRevision.current && window.matchMedia(WORKSPACE_VIEWPORT_MEDIA.narrowShell).matches)
            return execute('app.setSidebarVisible', { visible: false })
          return undefined
        })
        .catch(recordError)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [execute, recordError, sidebarChoiceRevision])
  const workspaces = useMemo(
    () =>
      sortPinnedWorkspaces(directory, workspacePins, (workspace) =>
        workspaceDisplayName(workspace, displayNames.snapshot),
      ),
    [directory, workspacePins, displayNames.snapshot],
  )
  const displayNameFor = (workspaceId: string) => {
    const workspace = directory.workspaces[workspaceId] ?? workspacePins.resolved[workspaceId]
    return workspace ? workspaceDisplayName(workspace, displayNames.snapshot) : workspaceId
  }
  const editWorkspace = ({ workspaceId }: { workspaceId: string }) => {
    captureDisplayNameFocus(workspaceId)
    void execute('workspaceAlias.open', { workspaceId }).catch(() => {
      // The original unresolved editor remains accessible from its stable feedback entry.
    })
  }
  const displayNameBusy =
    displayNames.requestInFlight || ['submitting', 'unknown', 'reconciling'].includes(displayNames.action.status)
  const organizationInitializing = organization.status === 'loading' && organization.snapshot === null
  const sidebarWorkspaces = useMemo(() => {
    if (organizationInitializing) return []
    const ids = [...orderWorkspaceActivityIds(workspaceActivity, workspacePins, hiddenWorkspaceIds)]
    const revealed = agentTree.revealedRoot?.workspaceId
    if (revealed && !hiddenWorkspaceIds.includes(revealed) && !ids.includes(revealed)) ids.push(revealed)
    return ids
      .map((id) => directory.workspaces[id] ?? workspacePins.resolved[id])
      .filter((workspace) => workspace !== undefined)
  }, [
    hiddenWorkspaceIds,
    workspaceActivity,
    workspacePins,
    directory.workspaces,
    organizationInitializing,
    agentTree.revealedRoot,
  ])
  const organizationBusy =
    organization.requestInFlight || ['submitting', 'unknown', 'reconciling'].includes(organization.action.status)
  const manualProjectView = workspaceActivity.organization === 'recentProject'
  const projectReorderEnabled =
    manualProjectView &&
    !activityPreferenceBusy &&
    !organizationBusy &&
    !batchSelecting &&
    workspacePins.status === 'ready' &&
    !['submitting', 'unknown'].includes(workspacePins.action.status) &&
    workspaceActivity.organizationPreferenceStatus === 'ready' &&
    workspaceActivity.workspaces.status === 'ready'
  const sidebarOrder = orderWorkspaceActivityIds(workspaceActivity, workspacePins, hiddenWorkspaceIds)
  const moveProject = (
    sourceId: string,
    targetId: string,
    placement: 'before' | 'after',
    expectedOrder: readonly string[],
  ) => {
    if (!projectReorderEnabled) return
    void execute('workspaceActivity.moveProject', {
      sourceWorkspaceId: sourceId,
      targetWorkspaceId: targetId,
      placement,
      expectedOrder: [...expectedOrder],
      expectedSortBy: workspaceActivity.sortBy,
    }).catch(() => {
      // Confirmed order and failure/retry stay in the existing sidebar preference owner.
    })
  }
  const projectReorder = useWorkspaceProjectReorder({
    enabled: projectReorderEnabled,
    workspaceIds: sidebarOrder,
    pinnedIds: workspacePins.ids,
    onMove: moveProject,
  })
  const organizationCanWrite = props.connection === 'connected' && organization.status === 'ready' && !organizationBusy
  const organizationTarget = organization.action.request?.change
  const organizationTargetName =
    organizationTarget?.kind === 'setHidden' ? displayNameFor(organizationTarget.workspaceId) : null
  const hideWorkspace = (workspaceId: string) => {
    if (!organizationCanWrite || !organization.snapshot) return
    captureHideFocus(workspaceId)
    void execute('workspaceSidebar.setHidden', {
      workspaceId,
      expectedHidden: false,
      hidden: true,
      expectedRevision: organization.snapshot.revision,
    }).catch(() => {
      // The organization owner keeps the original request and its error beside the stable title.
    })
  }
  const restoreHiddenWorkspaces = () => {
    if (!organizationCanWrite || !organization.snapshot) return
    void execute('workspaceSidebar.restoreHidden', { expectedRevision: organization.snapshot.revision }).catch(() => {
      // An uncertain write remains locked until its original receipt can be read.
    })
  }
  const refreshOrganization = () => {
    void execute('workspaceSidebar.refresh', {}).catch(() => {
      // Preserve the last confirmed snapshot and render this read failure locally.
    })
  }
  const refreshSidebar = () => {
    refreshOrganization()
    void execute('workspaceActivity.refresh', {}).catch(() => {
      // The activity owner keeps confirmed rows and the local retry on a read failure.
    })
  }
  const refreshProjectSessions = (workspaceId?: string) => {
    refreshRoster(workspaceId)
    void execute('workspaceActivity.refresh', workspaceId ? { workspaceId } : {}).catch(() => {
      // Sorted pages have their own local read status, independent of roster reconciliation.
    })
  }
  const reconcileOrganization = () => {
    void execute('workspaceSidebar.reconcile', {}).catch(() => {
      // An unsuccessful receipt read cannot authorize a new mutation.
    })
  }
  const pinBusy = workspacePins.action.status === 'submitting' || workspacePins.action.status === 'unknown'
  const toggleWorkspacePin = (workspaceId: string) => {
    void execute('workspacePins.toggle', {
      workspaceId,
      expectedPinned: workspacePins.ids.includes(workspaceId),
    }).catch(() => {
      // The command projects its error onto the targeted row.
    })
  }
  const checkWorkspacePin = (workspaceId: string) => {
    void execute('workspacePins.reconcile', { workspaceId }).catch(() => {
      // An unreadable preference remains uncertain; the row stays locked.
    })
  }
  const retryWorkspacePins = () => {
    void execute('workspacePins.refresh', {}).catch(recordError)
  }
  const sessionsByWorkspace = useMemo(() => {
    const result = new Map<string, Readonly<Session>[]>()
    for (const [workspaceId, page] of Object.entries(workspaceActivity.sessions))
      result.set(
        workspaceId,
        page.sessionIds.flatMap((id) => {
          const session = directory.sessions[id]
          return session && !session.archived && session.workspaceId === workspaceId ? [session] : []
        }),
      )
    const root = agentTree.revealedRoot && directory.sessions[agentTree.revealedRoot.sessionId]
    if (root && !root.archived) {
      const items = result.get(root.workspaceId) ?? []
      if (!items.some((item) => item.id === root.id)) result.set(root.workspaceId, [...items, root])
    }
    return result
  }, [directory.sessions, workspaceActivity.sessions, agentTree.revealedRoot])
  const timelineItems = useMemo(() => {
    const items = workspaceActivity.timeline.items.filter((item) => {
      const session = directory.sessions[item.sessionId]
      return session && !session.archived && !hiddenWorkspaceIds.includes(item.workspaceId)
    })
    const root = agentTree.revealedRoot
    const session = root && directory.sessions[root.sessionId]
    const workspace = root && directory.workspaces[root.workspaceId]
    if (
      root &&
      session &&
      !session.archived &&
      workspace &&
      !hiddenWorkspaceIds.includes(workspace.id) &&
      !items.some((item) => item.sessionId === root.sessionId)
    )
      items.push({ ...root, displayName: workspaceDisplayName(workspace, displayNames.snapshot) })
    return items
  }, [
    workspaceActivity.timeline.items,
    directory.sessions,
    directory.workspaces,
    hiddenWorkspaceIds,
    agentTree.revealedRoot,
    displayNames,
  ])
  const timelineById = useMemo(() => new Map(timelineItems.map((item) => [item.sessionId, item])), [timelineItems])
  const timeGroups = useMemo(
    () =>
      buildSidebarTimeGroups(
        timelineItems.map((item) => ({
          id: item.sessionId,
          updatedAt: directory.sessions[item.sessionId]!.updatedAt,
          active: item.execution.activeCount > 0,
        })),
        sessionTimeNow,
      ),
    [timelineItems, directory.sessions, sessionTimeNow],
  )
  const batchSelectedTargets = Array.from(batchSelection.values())
  const clearBatchSelection = () => {
    const next = new Map<string, { readonly workspaceId: string; readonly sessionId: string }>()
    batchSelectionRef.current = next
    setBatchSelection(next)
    setBatchLimitReached(false)
  }
  const exitBatchSelection = () => {
    setBatchSelecting(false)
    clearBatchSelection()
  }
  const toggleBatchSession = (workspaceId: string, sessionId: string) => {
    const key = `${workspaceId}\u0000${sessionId}`
    const current = batchSelectionRef.current
    if (current.has(key)) {
      const next = new Map(current)
      next.delete(key)
      batchSelectionRef.current = next
      setBatchSelection(next)
      setBatchLimitReached(false)
      return
    }
    if (current.size >= SESSION_ARCHIVE_BATCH_MAX_ITEMS) {
      setBatchLimitReached(true)
      return
    }
    const next = new Map(current).set(key, { workspaceId, sessionId })
    batchSelectionRef.current = next
    setBatchSelection(next)
    setBatchLimitReached(false)
  }
  const closeNarrowSidebar = useCallback(async () => {
    if (window.matchMedia(WORKSPACE_VIEWPORT_MEDIA.narrowShell).matches) await execute('app.setSidebarVisible', { visible: false })
  }, [execute])
  const closeAfterNavigation = () => {
    const revision = sidebarChoiceRevision.current
    return () => {
      if (revision !== sidebarChoiceRevision.current) return
      return closeNarrowSidebar()
    }
  }
  const settleNavigation = (operation: Promise<unknown>) =>
    void operation.then(closeAfterNavigation()).catch(recordError)
  const openPanel = (panelId: string) => settleNavigation(execute('app.openPanel', { panelId }))
  const openWorkspaceSurface = (workspaceId: string, surface: 'files' | 'settings' | 'run-board' | 'schedules') => {
    setWorkspaceActionError(null)
    const operation =
      surface === 'settings'
        ? execute('app.openSettings', { scope: 'workspace', targetId: workspaceId, workspaceId, binding: 'pinned' })
        : execute('app.openPanel', { panelId: surface, workspaceId, binding: 'pinned' })
    void operation.then(closeAfterNavigation()).catch((reason: unknown) => {
      setWorkspaceActionError({ workspaceId, code: reason instanceof Error ? reason.message : String(reason) })
    })
  }
  const openWorkspace = () => {
    showProjectPicker('open-workspace')
  }
  const navigationBusy = navigationAction.status === 'submitting'
  const navigationBlocked = navigationBusy || navigationAction.status === 'unknown'
  const connected = props.connection === 'connected'
  const actionTargetName = navigationAction.action
    ? navigationAction.action.kind === 'open-workspace'
      ? navigationAction.action.path
      : displayNameFor(navigationAction.action.workspaceId)
    : undefined
  const completeNavigation = useCallback(
    (selection: WorkspaceNavigationSelection | null) => {
      if (!selection) return
      setProjectPicker(null)
      setWorkspacePath('')
      void execute('workspaceActivity.refresh', {}).catch(() => {
        // Include newly registered empty projects without changing the successful navigation result.
      })
      void closeNarrowSidebar().catch(recordError)
    },
    [closeNarrowSidebar, execute, recordError],
  )
  const runNavigationAction = useCallback(
    (action: WorkspaceNavigationAction, sourceWorkspaceId: string | null = null) => {
      if (!connected || navigationBlocked || !navigationActions.current) return
      setActionWorkspaceId(sourceWorkspaceId)
      void navigationActions.current.run(action).then(completeNavigation).catch(recordError)
    },
    [completeNavigation, connected, navigationBlocked, recordError],
  )
  const reconcileNavigationAction = () => {
    if (!connected || !navigationActions.current) return
    void navigationActions.current.reconcile().then(completeNavigation).catch(recordError)
  }
  const showProjectPicker = useCallback(
    (intent: 'create-session' | 'open-workspace') => {
      if (!connected || navigationBlocked) return
      projectPickerTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setActionWorkspaceId(null)
      setProjectPicker(intent)
    },
    [connected, navigationBlocked],
  )
  const closeProjectPicker = () => {
    if (navigationBusy) return
    restoreProjectPickerFocus.current = true
    setProjectPicker(null)
  }
  const newSession = useCallback(
    (workspaceId?: string) => {
      if (workspaceId === undefined) showProjectPicker('create-session')
      else runNavigationAction({ kind: 'create-session', workspaceId }, workspaceId)
    },
    [runNavigationAction, showProjectPicker],
  )
  useEffect(() => {
    const onNewSessionShortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== 'n'
      )
        return
      event.preventDefault()
      event.stopPropagation()
      const visibleDialog = [...document.querySelectorAll('dialog[open], [role="dialog"]')].some(
        (element) => element.getClientRects().length > 0,
      )
      if (projectPicker || presentation.modalInstanceId || visibleDialog) return
      newSession()
    }
    window.addEventListener('keydown', onNewSessionShortcut, { capture: true })
    return () => window.removeEventListener('keydown', onNewSessionShortcut, { capture: true })
  }, [newSession, presentation.modalInstanceId, projectPicker])
  const addWorkspace = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!workspacePath.trim()) return
    runNavigationAction({
      kind: 'open-workspace',
      path: workspacePath,
      createSession: projectPicker === 'create-session',
    })
  }
  const openFolders = (workspaceId?: string, path?: string, browse = false) => {
    const createSession = projectPicker === 'create-session'
    const targetPath =
      path?.trim() ||
      (browse && navigation.workspaceId ? directory.workspaces[navigation.workspaceId]?.path : undefined)
    closeProjectPicker()
    void execute('workspaceFolders.open', {
      ...(workspaceId ? { workspaceId } : {}),
      ...(targetPath ? { path: targetPath } : {}),
      ...(!workspaceId && createSession ? { createSession: true } : {}),
      ...(browse ? { browse: true } : {}),
    }).catch(recordError)
  }
  const openSession = (workspaceId: string, sessionId: string) => {
    void execute('app.setSession', { workspaceId, sessionId }).then(closeAfterNavigation()).catch(recordError)
  }
  const serverValue =
    props.connection === 'connected'
      ? t('connected')
      : props.connection === 'pairing'
        ? t('pairing')
        : props.connection === 'connecting'
          ? t('loading')
          : t('disconnected')
  const serverTone: 'success' | 'warning' = props.connection === 'connected' ? 'success' : 'warning'
  const shellSlots = props.slots
  return {
    runtime,
    navigation,
    directory,
    workspacePins,
    workspaceActivity,
    agentTree,
    timeView,
    activityPreferenceBusy,
    organization,
    displayNames,
    organizationMenuRef,
    sidebarTreeRef,
    hiddenWorkspaceIds,
    presentation,
    rosterRefresh,
    sessionArchive,
    expanded,
    setExpanded,
    visibleExpanded,
    rosterBusy,
    workspaceCursor,
    setWorkspaceCursor,
    loading,
    setLoading,
    workspaceActionError,
    setWorkspaceActionError,
    navigationAction,
    setNavigationAction,
    actionWorkspaceId,
    setActionWorkspaceId,
    projectPicker,
    setProjectPicker,
    workspacePath,
    setWorkspacePath,
    sessionTimeNow,
    setSessionTimeNow,
    batchSelecting,
    setBatchSelecting,
    batchSelection,
    setBatchSelection,
    batchLimitReached,
    setBatchLimitReached,
    batchToolbarRef,
    loadWorkspaces,
    loadSessions,
    workspaces,
    displayNameFor,
    editWorkspace,
    displayNameBusy,
    organizationInitializing,
    sidebarWorkspaces,
    organizationBusy,
    manualProjectView,
    projectReorderEnabled,
    sidebarOrder,
    moveProject,
    projectReorder,
    organizationCanWrite,
    organizationTargetName,
    hideWorkspace,
    restoreHiddenWorkspaces,
    refreshOrganization,
    refreshSidebar,
    refreshProjectSessions,
    reconcileOrganization,
    pinBusy,
    toggleWorkspacePin,
    checkWorkspacePin,
    retryWorkspacePins,
    sessionsByWorkspace,
    timelineItems,
    timelineById,
    timeGroups,
    batchSelectedTargets,
    clearBatchSelection,
    exitBatchSelection,
    toggleBatchSession,
    settleNavigation,
    openPanel,
    openWorkspaceSurface,
    openWorkspace,
    navigationBusy,
    navigationBlocked,
    connected,
    actionTargetName,
    runNavigationAction,
    reconcileNavigationAction,
    closeProjectPicker,
    newSession,
    addWorkspace,
    openFolders,
    openSession,
    serverValue,
    serverTone,
    shellSlots,
  }
}
