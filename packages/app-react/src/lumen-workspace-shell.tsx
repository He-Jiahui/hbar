import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Command,
  Folder,
  FolderOpen,
  Menu,
  PanelLeftClose,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SquarePen,
  type LucideIcon,
} from 'lucide-react'
import {
  LumenAppShell,
  LumenAppSidebar,
  LumenButton,
  LumenDialog,
  LumenFormField,
  LumenFrame,
  LumenIcon,
  LumenIconButton,
  LumenInput,
  LumenSidebarAction,
  LumenText,
  type LumenIconTier,
  type LumenAppShellProps,
  type LumenToolPresentation,
  type LumenSidebarActionProps,
} from '@lumen/app-ui'
import { sortPinnedWorkspaces, workspaceDisplayName } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { HbarSessionStopNotice, HbarSessionStopProvider, type SessionStopLabels } from './session-stop'
import {
  createWorkspaceNavigationActions,
  defaultSessionWorkspace,
  type WorkspaceNavigationAction,
  type WorkspaceNavigationActionState,
  type WorkspaceNavigationSelection,
} from './workspace-navigation-actions'
import './lumen-workspace-shell.css'
import {
  WorkspaceProjectMenu,
  WorkspaceOrganizationFeedback,
  type WorkspaceOrganizationLabels,
} from './workspace-organization'
import { useWorkspaceOrganizationFocus } from './workspace-organization-focus'
import {
  WorkspaceDisplayNameDialog,
  WorkspaceDisplayNameFeedback,
  type WorkspaceDisplayNamesLabels,
} from './workspace-display-names'
import { useWorkspaceDisplayNameFocus } from './workspace-display-name-focus'
import { SessionNavigationRow, SessionRenameRecovery, type SessionRenameLabels } from './session-navigation-row'
import { ArchivedSessions, SessionArchiveRecovery, type SessionArchiveLabels } from './session-archive'
import { useSessionRosterRefresh } from './session-roster-refresh'
import { SessionRosterFeedback, type SessionRosterRefreshLabels } from './session-roster-feedback'
import {
  canFocusWorkspaceElement,
  getWorkspaceToolFocusSnapshot,
  shouldCollapseWorkspaceSidebar,
  useWorkspaceToolFocus,
} from './workspace-tool-focus'

export interface HbarWorkspaceShellLabels {
  readonly stop: SessionStopLabels
  readonly main: string
  readonly brand: string
  readonly projectsAndSessions: string
  readonly organization: WorkspaceOrganizationLabels
  readonly displayNames: WorkspaceDisplayNamesLabels
  readonly noWorkspaces: string
  readonly noSessions: string
  readonly loading: string
  readonly loadMore: string
  readonly newSession: string
  readonly creatingSession: string
  readonly creationUnknown: string
  readonly reconcileCreation: string
  readonly chooseWorkspace: string
  readonly chooseWorkspaceDescription: string
  readonly workspacePath: string
  readonly workspacePathHint: string
  readonly addWorkspace: string
  readonly openingWorkspace: string
  readonly cancel: string
  readonly createSessionInWorkspace: (name: string) => string
  readonly commands: string
  readonly commandShortcut: string
  readonly searchChats: string
  readonly searchShortcut: string
  readonly roster: SessionRosterRefreshLabels
  readonly openWorkspace: string
  readonly status: string
  readonly settings: string
  readonly server: string
  readonly connected: string
  readonly pairing: string
  readonly disconnected: string
  readonly reconnect: string
  readonly showSidebar: string
  readonly hideSidebar: string
  readonly expandWorkspace: (name: string) => string
  readonly collapseWorkspace: (name: string) => string
  readonly workspaceActions: (name: string) => string
  readonly newSessionInWorkspace: string
  readonly workspaceFiles: string
  readonly workspaceSettings: string
  readonly pinWorkspace: string
  readonly unpinWorkspace: string
  readonly pinnedWorkspace: (name: string) => string
  readonly pinningWorkspace: string
  readonly pinSaved: string
  readonly pinRemoved: string
  readonly pinVolatile: string
  readonly pinUnknown: string
  readonly pinCheck: string
  readonly pinFailure: (code: string) => string
  readonly pinRestoreFailure: (code: string) => string
  readonly pinRetryRestore: string
  readonly openSession: (name: string) => string
  readonly sessionUpdatedAt: (timestamp: number, now?: number) => string
  readonly sessionUpdatedAtFull: (timestamp: number) => string
  readonly sessionActions: (name: string) => string
  readonly renameSession: string
  readonly renameEditor: SessionRenameLabels
  readonly archiveSession: string
  readonly archive: SessionArchiveLabels
  readonly error: (code: string) => string
}

export interface HbarWorkspaceShellProps {
  readonly labels: HbarWorkspaceShellLabels
  readonly sidebarWidthRem: number
  readonly sidebarLayout?: LumenAppShellProps['sidebarLayout']
  readonly sidebarResize?: LumenAppShellProps['sidebarResize']
  readonly sidebarFeedback?: ReactNode
  readonly toolWidthRem?: number
  readonly toolLayout?: LumenAppShellProps['toolLayout']
  readonly toolResize?: LumenAppShellProps['toolResize']
  readonly mainRef?: LumenAppShellProps['mainRef']
  readonly toolRef?: LumenAppShellProps['toolRef']
  readonly resizeRef?: LumenAppShellProps['resizeRef']
  readonly onToolPresentationChange?: LumenAppShellProps['onToolPresentationChange']
  readonly connection: 'connected' | 'connecting' | 'pairing' | 'disconnected'
  readonly onReconnect: () => void
  readonly titlebar?: ReactNode
  readonly tool?: ReactNode
  readonly toolLabel?: string
  readonly overlay?: ReactNode
  readonly children: ReactNode
}

const PAGE_SIZE = 100
const EMPTY_HIDDEN_IDS: readonly string[] = Object.freeze([])

function forwardShellRef(ref: LumenAppShellProps['mainRef'], node: HTMLElement | null): (() => void) | undefined {
  if (typeof ref === 'function') {
    const cleanup = ref(node)
    if (typeof cleanup === 'function')
      return () => {
        cleanup()
      }
    return undefined
  }
  if (ref) ref.current = node
  return undefined
}

const workspaceShellIcons = {
  activity: Activity,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  command: Command,
  folder: Folder,
  'folder-open': FolderOpen,
  menu: Menu,
  'panel-close': PanelLeftClose,
  pin: Pin,
  plus: Plus,
  refresh: RefreshCw,
  search: Search,
  settings: Settings,
  'new-session': SquarePen,
} satisfies Readonly<Record<string, LucideIcon>>

type WorkspaceShellIconName = keyof typeof workspaceShellIcons

export function workspaceShellShortcut(
  event: Pick<
    KeyboardEvent,
    'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'isComposing' | 'keyCode' | 'repeat' | 'defaultPrevented'
  >,
  topLayerOpen: boolean,
): 'chat-search' | 'commands' | null {
  if (
    topLayerOpen ||
    event.defaultPrevented ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.repeat ||
    event.altKey ||
    event.ctrlKey === event.metaKey
  )
    return null
  const key = event.key.toLowerCase()
  if (key === 'k' && !event.shiftKey) return 'chat-search'
  if (key === 'p' && event.shiftKey) return 'commands'
  return null
}

function WorkspaceShellIcon({
  name,
  tier = 'md',
}: {
  readonly name: WorkspaceShellIconName
  readonly tier?: LumenIconTier
}) {
  return <LumenIcon icon={workspaceShellIcons[name]} tier={tier} />
}

function WorkspaceSidebarAction({
  icon,
  ...props
}: Omit<LumenSidebarActionProps, 'icon'> & { readonly icon: WorkspaceShellIconName }) {
  return <LumenSidebarAction {...props} icon={<WorkspaceShellIcon name={icon} />} />
}

function NavigationActionFeedback({
  state,
  labels,
  connected,
  targetName,
  onReconcile,
}: {
  readonly state: WorkspaceNavigationActionState
  readonly labels: HbarWorkspaceShellLabels
  readonly connected: boolean
  readonly targetName?: string | undefined
  readonly onReconcile: () => void
}) {
  if (state.status === 'idle') return null
  return (
    <LumenFrame className="hbar-app-react-navigation-feedback">
      {targetName && <LumenText as="small">{targetName}</LumenText>}
      <LumenText as="p" role={state.status === 'submitting' ? 'status' : 'alert'}>
        {state.status === 'submitting'
          ? state.action?.kind === 'create-session'
            ? labels.creatingSession
            : labels.openingWorkspace
          : state.status === 'unknown'
            ? labels.creationUnknown
            : labels.error(state.error ?? 'EXECUTION_FAILED')}
      </LumenText>
      {state.status === 'unknown' && (
        <LumenButton size="s" variant="outlined" disabled={!connected} onClick={onReconcile}>
          {labels.reconcileCreation}
        </LumenButton>
      )}
    </LumenFrame>
  )
}

export function HbarWorkspaceShell(props: HbarWorkspaceShellProps) {
  const runtime = useHbarRuntime()
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const directory = useHbarRuntimeState(runtime.state.directory)
  const workspacePins = useHbarRuntimeState(runtime.state.workspacePins)
  const organization = useHbarRuntimeState(runtime.state.workspaceOrganization)
  const displayNames = useHbarRuntimeState(runtime.state.workspaceDisplayNames)
  const organizationMenuRef = useRef<HTMLDivElement | null>(null)
  const hiddenWorkspaceIds = organization.snapshot?.hiddenWorkspaceIds ?? EMPTY_HIDDEN_IDS
  const captureHideFocus = useWorkspaceOrganizationFocus(
    runtime,
    hiddenWorkspaceIds,
    organization.action.status === 'failed',
    organizationMenuRef,
  )
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const rosterRefresh = useHbarRuntimeState(runtime.state.sessionRosterRefresh)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const workspaceTabs = useHbarRuntimeState(runtime.state.workspaceTabs)
  const mainRef = useRef<HTMLElement | null>(null)
  const toolRef = useRef<HTMLElement | null>(null)
  const sidebarFocusRef = useRef<HTMLButtonElement | null>(null)
  const sidebarShowFocusRef = useRef<HTMLButtonElement | null>(null)
  const captureDisplayNameFocus = useWorkspaceDisplayNameFocus(
    runtime,
    displayNames.editor?.open ?? false,
    organizationMenuRef,
    sidebarShowFocusRef,
    mainRef,
  )
  const sidebarFocusOwner = useRef(runtime)
  sidebarFocusOwner.current = runtime
  const reportSidebarFocusUnavailable = props.sidebarResize?.onFocusUnavailable
  const onSidebarFocusUnavailable = useCallback(() => {
    reportSidebarFocusUnavailable?.()
    // The shared control reports only its own lost focus. Wait for the sidebar
    // visibility commit, then keep any newer deliberate focus or native modal.
    queueMicrotask(() => {
      if (sidebarFocusOwner.current !== runtime || document.querySelector('dialog:modal')) return
      const active = document.activeElement
      if (active instanceof HTMLElement && active !== document.body && canFocusWorkspaceElement(active)) return
      for (const node of [sidebarFocusRef.current, sidebarShowFocusRef.current, toolRef.current, mainRef.current]) {
        if (!node || !canFocusWorkspaceElement(node)) continue
        node.focus({ preventScroll: true })
        return
      }
    })
  }, [runtime, reportSidebarFocusUnavailable])
  const resizeRef = useRef<HTMLElement | null>(null)
  const [toolPresentation, setToolPresentation] = useState<LumenToolPresentation>('none')
  const [toolFocusError, setToolFocusError] = useState<{ key: string; code: string } | null>(null)
  const focusSnapshot = getWorkspaceToolFocusSnapshot(
    navigation,
    presentation,
    surfaces,
    workspaceTabs,
    Boolean(props.tool && props.toolLayout),
    toolPresentation,
  )
  useWorkspaceToolFocus(runtime, {
    enabled: Boolean(props.tool && props.toolLayout),
    mainRef,
    toolRef,
    sidebarRef: sidebarFocusRef,
    resizeRef,
    presentation: toolPresentation,
    onError: (target, code) => setToolFocusError({ key: target.key, code }),
  })
  const attachMain = useCallback(
    (node: HTMLElement | null) => {
      mainRef.current = node
      const cleanup = forwardShellRef(props.mainRef, node)
      return () => {
        mainRef.current = null
        if (typeof cleanup === 'function') cleanup()
        else forwardShellRef(props.mainRef, null)
      }
    },
    [props.mainRef],
  )
  const attachTool = useCallback(
    (node: HTMLElement | null) => {
      toolRef.current = node
      const cleanup = forwardShellRef(props.toolRef, node)
      return () => {
        toolRef.current = null
        if (typeof cleanup === 'function') cleanup()
        else forwardShellRef(props.toolRef, null)
      }
    },
    [props.toolRef],
  )
  const attachResize = useCallback(
    (node: HTMLElement | null) => {
      resizeRef.current = node
      const cleanup = forwardShellRef(props.resizeRef, node)
      return () => {
        resizeRef.current = null
        if (typeof cleanup === 'function') cleanup()
        else forwardShellRef(props.resizeRef, null)
      }
    },
    [props.resizeRef],
  )
  const reportToolPresentation = props.onToolPresentationChange
  const onToolPresentationChange = useCallback(
    (mode: LumenToolPresentation) => {
      setToolPresentation(mode)
      reportToolPresentation?.(mode)
    },
    [reportToolPresentation],
  )
  useEffect(() => setToolFocusError(null), [focusSnapshot.target?.key])
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(navigation.workspaceId ? [navigation.workspaceId] : []),
  )
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
  const [sessionCursors, setSessionCursors] = useState<Readonly<Record<string, string | null | undefined>>>({})
  const [loading, setLoading] = useState<ReadonlySet<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)
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

  const execute = runtime.commands.execute
  const recordError = useCallback((reason: unknown) => {
    setError(reason instanceof Error ? reason.message : String(reason))
  }, [])
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
    [execute, navigation.workspaceId],
  )

  const loadSessions = useCallback(
    async (workspaceId: string, after?: string) => {
      setLoading((current) => new Set(current).add(workspaceId))
      setError(null)
      try {
        const page = await execute('session.list', { workspaceId, after, limit: PAGE_SIZE })
        setSessionCursors((current) => ({ ...current, [workspaceId]: page.nextCursor }))
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason))
      } finally {
        setLoading((current) => new Set([...current].filter((id) => id !== workspaceId)))
      }
    },
    [execute],
  )

  useEffect(() => {
    if (props.connection === 'connected') void loadWorkspaces()
  }, [loadWorkspaces, props.connection])

  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 63.9375rem)')
    const closeNarrowSidebar = (event: MediaQueryListEvent | MediaQueryList) => {
      if (
        shouldCollapseWorkspaceSidebar(
          event.matches,
          runtime.state.presentation.getSnapshot().sidebarOpen,
          document.querySelector('dialog:modal') !== null,
        )
      )
        void execute('app.setSidebarVisible', { visible: false }).catch(recordError)
    }
    closeNarrowSidebar(narrow)
    narrow.addEventListener('change', closeNarrowSidebar)
    return () => narrow.removeEventListener('change', closeNarrowSidebar)
  }, [execute, recordError, runtime.state.presentation])

  useEffect(() => {
    if (navigation.workspaceId)
      setExpanded((current) =>
        current.has(navigation.workspaceId!) ? current : new Set(current).add(navigation.workspaceId!),
      )
  }, [navigation.workspaceId])

  useEffect(() => {
    if (props.connection !== 'connected') return
    for (const workspaceId of visibleExpanded)
      if (!Object.hasOwn(sessionCursors, workspaceId)) void loadSessions(workspaceId)
  }, [visibleExpanded, loadSessions, props.connection, sessionCursors])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const panelId = workspaceShellShortcut(
        event,
        Boolean(document.querySelector('dialog:modal, [popover]:popover-open')),
      )
      if (!panelId) return
      event.preventDefault()
      void execute('app.openPanel', { panelId })
        .then(() => {
          if (window.matchMedia('(max-width: 63.9375rem)').matches)
            return execute('app.setSidebarVisible', { visible: false })
          return undefined
        })
        .catch(recordError)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [execute, recordError])

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
    const hidden = new Set(hiddenWorkspaceIds)
    return workspaces.filter((workspace) => !hidden.has(workspace.id))
  }, [hiddenWorkspaceIds, workspaces, organizationInitializing])
  const organizationBusy =
    organization.requestInFlight || ['submitting', 'unknown', 'reconciling'].includes(organization.action.status)
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
    const result = new Map<string, (typeof directory.sessions)[string][]>()
    for (const session of Object.values(directory.sessions)) {
      if (session.archived) continue
      const items = result.get(session.workspaceId) ?? []
      items.push(session)
      result.set(session.workspaceId, items)
    }
    for (const items of result.values()) items.sort((left, right) => right.updatedAt - left.updatedAt)
    return result
  }, [directory])

  const setSidebarVisible = (visible: boolean) => void execute('app.setSidebarVisible', { visible }).catch(recordError)
  const closeNarrowSidebar = useCallback(async () => {
    if (window.matchMedia('(max-width: 63.9375rem)').matches) await execute('app.setSidebarVisible', { visible: false })
  }, [execute])
  const settleNavigation = (operation: Promise<unknown>) => void operation.then(closeNarrowSidebar).catch(recordError)
  const openPanel = (panelId: string) => settleNavigation(execute('app.openPanel', { panelId }))
  const openWorkspaceSurface = (workspaceId: string, surface: 'files' | 'settings') => {
    setWorkspaceActionError(null)
    const operation =
      surface === 'files'
        ? execute('app.openPanel', { panelId: 'files', workspaceId, binding: 'pinned' })
        : execute('app.openSettings', { scope: 'workspace', targetId: workspaceId, workspaceId, binding: 'pinned' })
    void operation.then(closeNarrowSidebar).catch((reason: unknown) => {
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
      void closeNarrowSidebar().catch(recordError)
    },
    [closeNarrowSidebar, recordError],
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
      const target = workspaceId ?? defaultSessionWorkspace(navigation.workspaceId, directory.workspaces)
      if (target === null) showProjectPicker('create-session')
      else runNavigationAction({ kind: 'create-session', workspaceId: target }, workspaceId ?? null)
    },
    [directory.workspaces, navigation.workspaceId, runNavigationAction, showProjectPicker],
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
  const openSession = (workspaceId: string, sessionId: string) => {
    void execute('app.setSession', { workspaceId, sessionId })
      .then(() => {
        return closeNarrowSidebar()
      })
      .catch(recordError)
  }
  const serverValue =
    props.connection === 'connected'
      ? props.labels.connected
      : props.connection === 'pairing'
        ? props.labels.pairing
        : props.connection === 'connecting'
          ? props.labels.loading
          : props.labels.disconnected
  const serverTone =
    props.connection === 'connected' ? 'success' : props.connection === 'disconnected' ? 'danger' : 'warning'

  const shell = (
    <LumenAppShell
      label={props.labels.main}
      titlebar={props.titlebar}
      sidebarWidthRem={props.sidebarWidthRem}
      sidebarLayout={props.sidebarLayout}
      sidebarResize={
        props.sidebarResize ? { ...props.sidebarResize, onFocusUnavailable: onSidebarFocusUnavailable } : undefined
      }
      {...(props.toolWidthRem === undefined ? {} : { toolWidthRem: props.toolWidthRem })}
      toolLayout={props.toolLayout}
      toolResize={props.toolResize}
      mainRef={attachMain}
      toolRef={attachTool}
      resizeRef={attachResize}
      onToolPresentationChange={onToolPresentationChange}
      sidebarOpen={presentation.sidebarOpen}
      closeSidebarLabel={props.labels.hideSidebar}
      onCloseSidebar={() => setSidebarVisible(false)}
      header={
        <LumenFrame className="hbar-app-react-shell-header">
          <LumenIconButton
            ref={sidebarShowFocusRef}
            label={props.labels.showSidebar}
            onClick={() => setSidebarVisible(true)}
          >
            <WorkspaceShellIcon name="menu" />
          </LumenIconButton>
          <LumenText as="strong">{props.labels.brand}</LumenText>
        </LumenFrame>
      }
      tool={
        props.tool ? (
          <LumenFrame className="hbar-app-react-tool-content">
            {props.tool}
            <HbarSessionStopNotice region="tool" />
            {toolFocusError && toolFocusError.key === focusSnapshot.target?.key && (
              <LumenText as="p" role="alert" className="hbar-app-react-tool-focus-error">
                {props.labels.error(toolFocusError.code)}
              </LumenText>
            )}
          </LumenFrame>
        ) : (
          props.tool
        )
      }
      toolLabel={props.toolLabel}
      overlay={
        <>
          {props.overlay}
          <WorkspaceDisplayNameDialog
            owner={runtime}
            state={displayNames}
            connected={connected}
            labels={props.labels.displayNames}
            onEdit={(input) => {
              void execute('workspaceAlias.edit', input).catch(() => undefined)
            }}
            onClose={(input) => {
              void execute('workspaceAlias.close', input).catch(() => undefined)
            }}
            onSave={(input) => execute('workspaceAlias.save', input).then(() => undefined)}
            onReset={(input) => execute('workspaceAlias.reset', input).then(() => undefined)}
            onRebase={(input) => execute('workspaceAlias.rebase', input).then(() => undefined)}
            onRefresh={() => execute('workspaceAlias.refresh', {}).then(() => undefined)}
            onReconcile={() => execute('workspaceAlias.reconcile', {}).then(() => undefined)}
          />
          {projectPicker && (
            <LumenDialog
              open
              title={projectPicker === 'create-session' ? props.labels.chooseWorkspace : props.labels.openWorkspace}
              closeLabel={props.labels.cancel}
              onClose={closeProjectPicker}
              className="hbar-app-react-workspace-picker"
              footer={
                <LumenButton variant="text" disabled={navigationBusy} onClick={closeProjectPicker}>
                  {props.labels.cancel}
                </LumenButton>
              }
            >
              <LumenText as="p">{props.labels.chooseWorkspaceDescription}</LumenText>
              <LumenFrame className="hbar-app-react-workspace-picker-list">
                {workspaces.length === 0 ? (
                  <LumenText as="p">
                    {loading.has('workspaces') ? props.labels.loading : props.labels.noWorkspaces}
                  </LumenText>
                ) : (
                  workspaces.map((workspace, index) => (
                    <LumenButton
                      key={workspace.id}
                      variant="text"
                      className="hbar-app-react-workspace-picker-item"
                      autoFocus={index === 0}
                      disabled={!connected || navigationBlocked}
                      aria-label={
                        projectPicker === 'create-session'
                          ? props.labels.createSessionInWorkspace(
                              workspaceDisplayName(workspace, displayNames.snapshot),
                            )
                          : workspaceDisplayName(workspace, displayNames.snapshot)
                      }
                      onClick={() =>
                        runNavigationAction({
                          kind: projectPicker === 'create-session' ? 'create-session' : 'select-workspace',
                          workspaceId: workspace.id,
                        })
                      }
                    >
                      <WorkspaceShellIcon name="folder" />
                      <LumenFrame>
                        <LumenText as="strong">{workspaceDisplayName(workspace, displayNames.snapshot)}</LumenText>
                        <LumenText as="small">{workspace.path}</LumenText>
                      </LumenFrame>
                    </LumenButton>
                  ))
                )}
                {workspaceCursor && (
                  <LumenButton
                    variant="text"
                    disabled={!connected || loading.has('workspaces') || navigationBlocked}
                    onClick={() => void loadWorkspaces(workspaceCursor)}
                  >
                    {props.labels.loadMore}
                  </LumenButton>
                )}
              </LumenFrame>
              <LumenFrame as="form" className="hbar-app-react-workspace-picker-form" onSubmit={addWorkspace}>
                <LumenFormField
                  controlId="hbar-workspace-path"
                  label={props.labels.workspacePath}
                  description={props.labels.workspacePathHint}
                >
                  <LumenInput
                    id="hbar-workspace-path"
                    autoFocus={workspaces.length === 0}
                    value={workspacePath}
                    maxLength={4000}
                    disabled={!connected || navigationBlocked}
                    onChange={(event) => setWorkspacePath(event.currentTarget.value)}
                  />
                </LumenFormField>
                <LumenButton type="submit" disabled={!connected || navigationBlocked || !workspacePath.trim()}>
                  {props.labels.addWorkspace}
                </LumenButton>
              </LumenFrame>
              <NavigationActionFeedback
                state={navigationAction}
                labels={props.labels}
                connected={connected}
                targetName={actionTargetName}
                onReconcile={reconcileNavigationAction}
              />
              {error && (
                <LumenText as="p" role="alert">
                  {props.labels.error(error)}
                </LumenText>
              )}
            </LumenDialog>
          )}
        </>
      }
      sidebar={
        <LumenAppSidebar
          brand={props.labels.brand}
          title={props.labels.projectsAndSessions}
          emptyLabel={loading.has('workspaces') ? props.labels.loading : props.labels.noWorkspaces}
          status={{ label: props.labels.server, value: serverValue, tone: serverTone }}
          brandAction={
            <LumenIconButton
              ref={sidebarFocusRef}
              label={props.labels.hideSidebar}
              onClick={() => setSidebarVisible(false)}
            >
              <WorkspaceShellIcon name="panel-close" />
            </LumenIconButton>
          }
          primaryActions={
            <LumenFrame className="hbar-app-react-sidebar-primary">
              <WorkspaceSidebarAction
                icon="plus"
                label={props.labels.newSession}
                size="l"
                variant="outlined"
                disabled={!connected || navigationBlocked}
                onClick={() => newSession()}
              />
              {!projectPicker && actionWorkspaceId === null && (
                <NavigationActionFeedback
                  state={navigationAction}
                  labels={props.labels}
                  connected={connected}
                  targetName={actionTargetName}
                  onReconcile={reconcileNavigationAction}
                />
              )}
              <LumenFrame className="hbar-app-react-sidebar-query-actions">
                <WorkspaceSidebarAction
                  icon="search"
                  label={props.labels.searchChats}
                  detail={props.labels.searchShortcut}
                  selected={presentation.modalInstanceId === 'chat-search'}
                  onClick={() => openPanel('chat-search')}
                />
                <LumenIconButton
                  className="hbar-app-react-roster-refresh"
                  label={props.labels.roster.refreshExpanded}
                  loading={rosterBusy}
                  disabled={!connected || visibleExpanded.size === 0 || rosterBusy}
                  onClick={() => refreshRoster()}
                >
                  <WorkspaceShellIcon name="refresh" />
                </LumenIconButton>
              </LumenFrame>
              <WorkspaceSidebarAction
                icon="command"
                label={props.labels.commands}
                detail={props.labels.commandShortcut}
                selected={presentation.modalInstanceId === 'commands'}
                onClick={() => openPanel('commands')}
              />
            </LumenFrame>
          }
          treeAction={
            <LumenFrame className="hbar-app-react-project-organization-actions">
              <WorkspaceProjectMenu
                header
                menuRef={organizationMenuRef}
                label={props.labels.organization.menu}
                items={[
                  ...(hiddenWorkspaceIds.length
                    ? [
                        {
                          id: 'restore',
                          label: props.labels.organization.restore(hiddenWorkspaceIds.length),
                          disabled: !organizationCanWrite,
                        },
                      ]
                    : []),
                  {
                    id: 'refresh',
                    label: props.labels.organization.refresh,
                    disabled: !connected || organization.status === 'unavailable' || organizationBusy,
                  },
                ]}
                onAction={(id) => {
                  if (id === 'restore') restoreHiddenWorkspaces()
                  else refreshOrganization()
                }}
              />
              <LumenIconButton
                label={props.labels.openWorkspace}
                disabled={!connected || navigationBlocked}
                onClick={openWorkspace}
              >
                <WorkspaceShellIcon name="folder-open" />
              </LumenIconButton>
            </LumenFrame>
          }
          actions={
            <LumenFrame className="hbar-app-react-sidebar-actions">
              {props.sidebarFeedback}
              {props.connection !== 'connected' && (
                <WorkspaceSidebarAction icon="refresh" label={props.labels.reconnect} onClick={props.onReconnect} />
              )}
              <WorkspaceSidebarAction
                icon="activity"
                label={props.labels.status}
                selected={presentation.page.kind === 'status'}
                onClick={() => settleNavigation(execute('app.openStatus', { section: 'dashboard' }))}
              />
              <WorkspaceSidebarAction
                icon="settings"
                label={props.labels.settings}
                selected={presentation.page.kind === 'settings'}
                onClick={() => settleNavigation(execute('app.openSettings', { scope: 'global' }))}
              />
            </LumenFrame>
          }
        >
          <LumenFrame as="nav" className="hbar-app-react-project-tree" aria-label={props.labels.projectsAndSessions}>
            <WorkspaceDisplayNameFeedback
              state={displayNames}
              connected={connected}
              labels={props.labels.displayNames}
              onOpen={editWorkspace}
              onRefresh={() => execute('workspaceAlias.refresh', {}).then(() => undefined)}
              onReconcile={() => execute('workspaceAlias.reconcile', {}).then(() => undefined)}
            />
            <WorkspaceOrganizationFeedback
              state={organization}
              labels={props.labels.organization}
              targetName={organizationTargetName}
              connected={connected}
              onRefresh={refreshOrganization}
              onReconcile={reconcileOrganization}
            />
            {workspacePins.status === 'error' && (
              <LumenFrame className="hbar-app-react-pin-feedback" role="alert">
                <LumenText as="p">{props.labels.pinRestoreFailure(workspacePins.error ?? 'UNKNOWN')}</LumenText>
                <LumenButton size="s" variant="outlined" onClick={retryWorkspacePins}>
                  {props.labels.pinRetryRestore}
                </LumenButton>
              </LumenFrame>
            )}
            {!organizationInitializing && sidebarWorkspaces.length === 0 && (
              <LumenText as="p">
                {loading.has('workspaces')
                  ? props.labels.loading
                  : hiddenWorkspaceIds.length
                    ? props.labels.organization.allHidden
                    : props.labels.noWorkspaces}
              </LumenText>
            )}
            {sidebarWorkspaces.map((workspace) => {
              const displayName = workspaceDisplayName(workspace, displayNames.snapshot)
              const isExpanded = expanded.has(workspace.id)
              const isPinned = workspacePins.ids.includes(workspace.id)
              const sessions = sessionsByWorkspace.get(workspace.id) ?? []
              const nextSessionCursor = sessionCursors[workspace.id]
              return (
                <LumenFrame as="section" key={workspace.id} data-workspace-id={workspace.id}>
                  <LumenFrame className="hbar-app-react-workspace-line">
                    <LumenButton
                      className="hbar-app-react-workspace-row"
                      size="s"
                      variant="text"
                      aria-expanded={isExpanded}
                      aria-label={`${
                        isExpanded
                          ? props.labels.collapseWorkspace(displayName)
                          : props.labels.expandWorkspace(displayName)
                      }${isPinned ? ` · ${props.labels.pinnedWorkspace(displayName)}` : ''}`}
                      title={workspace.path}
                      onClick={() =>
                        setExpanded((current) => {
                          const next = new Set(current)
                          if (next.has(workspace.id)) next.delete(workspace.id)
                          else next.add(workspace.id)
                          return next
                        })
                      }
                    >
                      <WorkspaceShellIcon name={isExpanded ? 'chevron-down' : 'chevron-right'} tier="sm" />
                      <WorkspaceShellIcon name={isExpanded ? 'folder-open' : 'folder'} />
                      <LumenText size="s" variant="label">
                        {displayName}
                      </LumenText>
                      {isPinned && (
                        <LumenText
                          as="span"
                          className="hbar-app-react-workspace-pin"
                          title={props.labels.pinnedWorkspace(displayName)}
                        >
                          <WorkspaceShellIcon name="pin" tier="sm" />
                        </LumenText>
                      )}
                    </LumenButton>
                    <WorkspaceProjectMenu
                      label={props.labels.workspaceActions(displayName)}
                      items={[
                        {
                          id: 'edit',
                          label: props.labels.displayNames.title,
                          disabled:
                            displayNames.status === 'unavailable' ||
                            (displayNameBusy && displayNames.editor?.workspaceId !== workspace.id),
                        },
                        { id: 'files', label: props.labels.workspaceFiles },
                        { id: 'settings', label: props.labels.workspaceSettings },
                        {
                          id: 'pin',
                          label: isPinned ? props.labels.unpinWorkspace : props.labels.pinWorkspace,
                          disabled: pinBusy || workspacePins.status !== 'ready',
                        },
                        { id: 'archived', label: props.labels.archive.openList(displayName), disabled: !connected },
                        {
                          id: 'refresh',
                          label: props.labels.roster.refreshWorkspace(displayName),
                          disabled: !connected || rosterRefresh.entries[workspace.id]?.status === 'loading',
                        },
                        { id: 'hide', label: props.labels.organization.hide, disabled: !organizationCanWrite },
                      ]}
                      onAction={(action) => {
                        if (action === 'edit') editWorkspace({ workspaceId: workspace.id })
                        else if (action === 'files' || action === 'settings') openWorkspaceSurface(workspace.id, action)
                        else if (action === 'pin') toggleWorkspacePin(workspace.id)
                        else if (action === 'refresh') refreshRoster(workspace.id)
                        else if (action === 'hide') hideWorkspace(workspace.id)
                        else if (action === 'archived')
                          void execute('archivedSessions.open', { workspaceId: workspace.id }).catch(recordError)
                      }}
                    />
                    <LumenIconButton
                      className="hbar-app-react-project-new-session"
                      label={props.labels.createSessionInWorkspace(displayName)}
                      disabled={!connected || navigationBlocked}
                      loading={navigationBusy && actionWorkspaceId === workspace.id}
                      onClick={() => newSession(workspace.id)}
                    >
                      <WorkspaceShellIcon name="new-session" />
                    </LumenIconButton>
                  </LumenFrame>
                  <SessionRosterFeedback
                    entry={rosterRefresh.entries[workspace.id]}
                    labels={props.labels.roster}
                    connected={connected}
                    onRefresh={() => refreshRoster(workspace.id)}
                  />
                  {actionWorkspaceId === workspace.id && (
                    <NavigationActionFeedback
                      state={navigationAction}
                      labels={props.labels}
                      connected={connected}
                      onReconcile={reconcileNavigationAction}
                    />
                  )}
                  {workspaceActionError?.workspaceId === workspace.id && (
                    <LumenText as="p" role="alert" tone="danger">
                      {props.labels.error(workspaceActionError.code)}
                    </LumenText>
                  )}
                  {workspacePins.action.workspaceId === workspace.id && workspacePins.action.status !== 'idle' && (
                    <LumenFrame
                      className="hbar-app-react-pin-feedback"
                      role={
                        workspacePins.action.status === 'submitting'
                          ? 'status'
                          : workspacePins.action.status === 'failed' || workspacePins.action.status === 'unknown'
                            ? 'alert'
                            : undefined
                      }
                    >
                      <LumenText as="p">
                        {workspacePins.action.status === 'submitting'
                          ? props.labels.pinningWorkspace
                          : workspacePins.action.status === 'unknown'
                            ? props.labels.pinUnknown
                            : workspacePins.action.status === 'failed'
                              ? props.labels.pinFailure(workspacePins.action.error ?? 'UNKNOWN')
                              : workspacePins.action.persisted
                                ? isPinned
                                  ? props.labels.pinSaved
                                  : props.labels.pinRemoved
                                : props.labels.pinVolatile}
                      </LumenText>
                      {workspacePins.action.status === 'unknown' && (
                        <LumenButton size="s" variant="outlined" onClick={() => checkWorkspacePin(workspace.id)}>
                          {props.labels.pinCheck}
                        </LumenButton>
                      )}
                    </LumenFrame>
                  )}
                  <ArchivedSessions
                    workspaceId={workspace.id}
                    workspaceName={displayName}
                    labels={props.labels.archive}
                    connected={connected}
                  />
                  {isExpanded && (
                    <LumenFrame className="hbar-app-react-session-list">
                      {loading.has(workspace.id) && sessions.length === 0 ? (
                        <LumenText as="p">{props.labels.loading}</LumenText>
                      ) : sessions.length === 0 ? (
                        <LumenText as="p">{props.labels.noSessions}</LumenText>
                      ) : (
                        sessions.map((session) => (
                          <SessionNavigationRow
                            key={session.id}
                            session={session}
                            connected={props.connection === 'connected'}
                            labels={props.labels}
                            now={sessionTimeNow}
                            selected={
                              presentation.page.kind === 'session' &&
                              navigation.workspaceId === session.workspaceId &&
                              navigation.sessionId === session.id
                            }
                            onOpen={() => openSession(session.workspaceId, session.id)}
                          />
                        ))
                      )}
                      {nextSessionCursor && (
                        <LumenButton
                          className="hbar-app-react-load-more"
                          size="s"
                          tone="primary"
                          variant="text"
                          onClick={() => void loadSessions(workspace.id, nextSessionCursor)}
                        >
                          {props.labels.loadMore}
                        </LumenButton>
                      )}
                    </LumenFrame>
                  )}
                </LumenFrame>
              )
            })}
            {workspaceCursor && (
              <LumenButton
                className="hbar-app-react-load-more"
                size="s"
                tone="primary"
                variant="text"
                onClick={() => void loadWorkspaces(workspaceCursor)}
              >
                {props.labels.loadMore}
              </LumenButton>
            )}
          </LumenFrame>
          <SessionRenameRecovery labels={props.labels.renameEditor} connected={props.connection === 'connected'} />
          <SessionArchiveRecovery labels={props.labels.archive} connected={connected} expandedWorkspaces={expanded} />
          {error && (
            <LumenText as="p" role="alert">
              {props.labels.error(error)}
            </LumenText>
          )}
        </LumenAppSidebar>
      }
    >
      {props.children}
    </LumenAppShell>
  )
  return (
    <HbarSessionStopProvider
      labels={props.labels.stop}
      connected={props.connection === 'connected'}
      mainRef={mainRef}
      toolRef={toolRef}
      toolPresentation={toolPresentation}
    >
      {shell}
    </HbarSessionStopProvider>
  )
}
