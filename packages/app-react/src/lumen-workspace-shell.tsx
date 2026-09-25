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
  Plus,
  RefreshCw,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import {
  LumenActionMenu,
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
  type LumenSidebarActionProps,
} from '@lumen/app-ui'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import {
  createWorkspaceNavigationActions,
  defaultSessionWorkspace,
  type WorkspaceNavigationAction,
  type WorkspaceNavigationActionState,
  type WorkspaceNavigationSelection,
} from './workspace-navigation-actions'
import './lumen-workspace-shell.css'
import { SessionNavigationRow, SessionRenameRecovery, type SessionRenameLabels } from './session-navigation-row'

export interface HbarWorkspaceShellLabels {
  readonly main: string
  readonly brand: string
  readonly projectsAndSessions: string
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
  readonly openSession: (name: string) => string
  readonly sessionUpdatedAt: (timestamp: number) => string
  readonly sessionActions: (name: string) => string
  readonly renameSession: string
  readonly renameEditor: SessionRenameLabels
  readonly archiveSession: string
  readonly error: (code: string) => string
}

export interface HbarWorkspaceShellProps {
  readonly labels: HbarWorkspaceShellLabels
  readonly sidebarWidthRem: number
  readonly toolWidthRem?: number
  readonly connection: 'connected' | 'connecting' | 'pairing' | 'disconnected'
  readonly onReconnect: () => void
  readonly titlebar?: ReactNode
  readonly tool?: ReactNode
  readonly toolLabel?: string
  readonly overlay?: ReactNode
  readonly children: ReactNode
}

const PAGE_SIZE = 100

const workspaceShellIcons = {
  activity: Activity,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  command: Command,
  folder: Folder,
  'folder-open': FolderOpen,
  menu: Menu,
  'panel-close': PanelLeftClose,
  plus: Plus,
  refresh: RefreshCw,
  settings: Settings,
} satisfies Readonly<Record<string, LucideIcon>>

type WorkspaceShellIconName = keyof typeof workspaceShellIcons

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
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(navigation.workspaceId ? [navigation.workspaceId] : []),
  )
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
  const projectPickerTrigger = useRef<HTMLElement | null>(null)
  const restoreProjectPickerFocus = useRef(false)
  const navigationActions = useRef<ReturnType<typeof createWorkspaceNavigationActions> | null>(null)

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
      if (event.matches && runtime.state.presentation.getSnapshot().sidebarOpen)
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
    for (const workspaceId of expanded) if (!Object.hasOwn(sessionCursors, workspaceId)) void loadSessions(workspaceId)
  }, [expanded, loadSessions, props.connection, sessionCursors])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        void execute('app.openPanel', { panelId: 'commands' })
          .then(() => {
            if (window.matchMedia('(max-width: 63.9375rem)').matches)
              return execute('app.setSidebarVisible', { visible: false })
            return undefined
          })
          .catch(recordError)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [execute, recordError])

  const workspaces = useMemo(
    () => Object.values(directory.workspaces).sort((left, right) => left.name.localeCompare(right.name)),
    [directory],
  )
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
  const closeNarrowSidebar = async () => {
    if (window.matchMedia('(max-width: 63.9375rem)').matches) await execute('app.setSidebarVisible', { visible: false })
  }
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
  const openCommandForm = (commandId: string, parameters: Readonly<Record<string, string | boolean>> = {}) => {
    let operation: Promise<unknown> = execute('commandPalette.refresh', {})
      .then(() => execute('commandPalette.setQuery', { query: commandId }))
      .then(() => execute('commandPalette.openCommand', { commandId }))
    for (const [field, value] of Object.entries(parameters))
      operation = operation.then(() => execute('commandPalette.setParameter', { field, value }))
    operation = operation.then(() => execute('app.openPanel', { panelId: 'commands' }))
    settleNavigation(operation)
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
      : directory.workspaces[navigationAction.action.workspaceId]?.name
    : undefined
  const completeNavigation = (selection: WorkspaceNavigationSelection | null) => {
    if (!selection) return
    setProjectPicker(null)
    setWorkspacePath('')
    void closeNarrowSidebar().catch(recordError)
  }
  const runNavigationAction = (action: WorkspaceNavigationAction, sourceWorkspaceId: string | null = null) => {
    if (!connected || navigationBlocked || !navigationActions.current) return
    setActionWorkspaceId(sourceWorkspaceId)
    void navigationActions.current.run(action).then(completeNavigation).catch(recordError)
  }
  const reconcileNavigationAction = () => {
    if (!connected || !navigationActions.current) return
    void navigationActions.current.reconcile().then(completeNavigation).catch(recordError)
  }
  function showProjectPicker(intent: 'create-session' | 'open-workspace') {
    if (!connected || navigationBlocked) return
    projectPickerTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setActionWorkspaceId(null)
    setProjectPicker(intent)
  }
  const closeProjectPicker = () => {
    if (navigationBusy) return
    restoreProjectPickerFocus.current = true
    setProjectPicker(null)
  }
  const newSession = (workspaceId?: string) => {
    const target = workspaceId ?? defaultSessionWorkspace(navigation.workspaceId, directory.workspaces)
    if (target === null) showProjectPicker('create-session')
    else runNavigationAction({ kind: 'create-session', workspaceId: target }, workspaceId ?? null)
  }
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

  return (
    <LumenAppShell
      label={props.labels.main}
      titlebar={props.titlebar}
      sidebarWidthRem={props.sidebarWidthRem}
      {...(props.toolWidthRem === undefined ? {} : { toolWidthRem: props.toolWidthRem })}
      sidebarOpen={presentation.sidebarOpen}
      closeSidebarLabel={props.labels.hideSidebar}
      onCloseSidebar={() => setSidebarVisible(false)}
      header={
        <LumenFrame className="hbar-app-react-shell-header">
          <LumenIconButton label={props.labels.showSidebar} onClick={() => setSidebarVisible(true)}>
            <WorkspaceShellIcon name="menu" />
          </LumenIconButton>
          <LumenText as="strong">{props.labels.brand}</LumenText>
        </LumenFrame>
      }
      tool={props.tool}
      toolLabel={props.toolLabel}
      overlay={
        <>
          {props.overlay}
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
                          ? props.labels.createSessionInWorkspace(workspace.name)
                          : workspace.name
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
                        <LumenText as="strong">{workspace.name}</LumenText>
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
            <LumenIconButton label={props.labels.hideSidebar} onClick={() => setSidebarVisible(false)}>
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
            <LumenIconButton
              label={props.labels.openWorkspace}
              disabled={!connected || navigationBlocked}
              onClick={openWorkspace}
            >
              <WorkspaceShellIcon name="folder-open" />
            </LumenIconButton>
          }
          actions={
            <LumenFrame className="hbar-app-react-sidebar-actions">
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
            {workspaces.length === 0 && (
              <LumenText as="p">
                {loading.has('workspaces') ? props.labels.loading : props.labels.noWorkspaces}
              </LumenText>
            )}
            {workspaces.map((workspace) => {
              const isExpanded = expanded.has(workspace.id)
              const sessions = sessionsByWorkspace.get(workspace.id) ?? []
              const nextSessionCursor = sessionCursors[workspace.id]
              return (
                <LumenFrame as="section" key={workspace.id}>
                  <LumenFrame className="hbar-app-react-workspace-line">
                    <LumenButton
                      className="hbar-app-react-workspace-row"
                      size="s"
                      variant="text"
                      aria-expanded={isExpanded}
                      aria-label={
                        isExpanded
                          ? props.labels.collapseWorkspace(workspace.name)
                          : props.labels.expandWorkspace(workspace.name)
                      }
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
                        {workspace.name}
                      </LumenText>
                    </LumenButton>
                    <LumenActionMenu
                      label={props.labels.workspaceActions(workspace.name)}
                      items={[
                        {
                          id: 'new-session',
                          label: props.labels.newSessionInWorkspace,
                          disabled: !connected || navigationBlocked,
                        },
                        { id: 'files', label: props.labels.workspaceFiles },
                        { id: 'settings', label: props.labels.workspaceSettings },
                      ]}
                      onAction={(action) => {
                        if (action === 'new-session') newSession(workspace.id)
                        else if (action === 'files' || action === 'settings') openWorkspaceSurface(workspace.id, action)
                      }}
                    />
                  </LumenFrame>
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
                            selected={
                              presentation.page.kind === 'session' &&
                              navigation.workspaceId === session.workspaceId &&
                              navigation.sessionId === session.id
                            }
                            onOpen={() => openSession(session.workspaceId, session.id)}
                            onArchive={() =>
                              openCommandForm('app.archiveSession', { sessionId: session.id, archived: true })
                            }
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
}
