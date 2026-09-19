import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  HbarAppUiAppShell,
  HbarAppUiAppSidebar,
  HbarAppUiShellIcon,
  HbarAppUiSidebarAction,
} from 'hbar-app-ui/workbench'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import './workspace-shell.css'

export interface HbarWorkspaceShellLabels {
  readonly main: string
  readonly brand: string
  readonly projectsAndSessions: string
  readonly noWorkspaces: string
  readonly noSessions: string
  readonly loading: string
  readonly loadMore: string
  readonly newSession: string
  readonly commands: string
  readonly commandShortcut: string
  readonly openWorkspace: string
  readonly status: string
  readonly extensions: string
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
  readonly openSession: (name: string) => string
  readonly sessionUpdatedAt: (timestamp: number) => string
  readonly error: (code: string) => string
}

export interface HbarWorkspaceShellProps {
  readonly labels: HbarWorkspaceShellLabels
  readonly sidebarWidthRem: number
  readonly connection: 'connected' | 'connecting' | 'pairing' | 'disconnected'
  readonly onReconnect: () => void
  readonly children: ReactNode
}

const PAGE_SIZE = 100

export function HbarWorkspaceShell(props: HbarWorkspaceShellProps) {
  const runtime = useHbarRuntime()
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const directory = useHbarRuntimeState(runtime.state.directory)
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(navigation.workspaceId ? [navigation.workspaceId] : []),
  )
  const [workspaceCursor, setWorkspaceCursor] = useState<string | null | undefined>()
  const [sessionCursors, setSessionCursors] = useState<Readonly<Record<string, string | null | undefined>>>({})
  const [loading, setLoading] = useState<ReadonlySet<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)

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
  const openCommand = (query?: string) => {
    let operation: Promise<unknown> = execute('app.openPanel', { panelId: 'commands' })
    if (query)
      operation = operation
        .then(() => execute('commandPalette.refresh', {}))
        .then(() => execute('commandPalette.setQuery', { query }))
    settleNavigation(operation)
  }
  const openWorkspace = () => {
    openCommand('workspace.open')
  }
  const openSession = (sessionId: string) => {
    void execute('app.setSession', { sessionId })
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
    props.connection === 'connected' ? 'positive' : props.connection === 'disconnected' ? 'danger' : 'warning'

  return (
    <HbarAppUiAppShell
      label={props.labels.main}
      sidebarWidthRem={props.sidebarWidthRem}
      sidebarOpen={presentation.sidebarOpen}
      closeSidebarLabel={props.labels.hideSidebar}
      onCloseSidebar={() => setSidebarVisible(false)}
      header={
        <div className="hbar-app-react-shell-header">
          <button
            type="button"
            className="hbar-app-react-icon-action"
            aria-label={props.labels.showSidebar}
            title={props.labels.showSidebar}
            onClick={() => setSidebarVisible(true)}
          >
            <HbarAppUiShellIcon name="menu" />
          </button>
          <strong>{props.labels.brand}</strong>
        </div>
      }
      sidebar={
        <HbarAppUiAppSidebar
          brand={props.labels.brand}
          title={props.labels.projectsAndSessions}
          emptyLabel={loading.has('workspaces') ? props.labels.loading : props.labels.noWorkspaces}
          status={{ label: props.labels.server, value: serverValue, tone: serverTone }}
          brandAction={
            <button
              type="button"
              className="hbar-app-react-icon-action"
              aria-label={props.labels.hideSidebar}
              title={props.labels.hideSidebar}
              onClick={() => setSidebarVisible(false)}
            >
              <HbarAppUiShellIcon name="panel-close" />
            </button>
          }
          primaryActions={
            <div className="hbar-app-react-sidebar-primary">
              <HbarAppUiSidebarAction
                icon="plus"
                label={props.labels.newSession}
                onClick={() => openCommand('session.create')}
              />
              <HbarAppUiSidebarAction
                icon="command"
                label={props.labels.commands}
                detail={props.labels.commandShortcut}
                selected={presentation.modalInstanceId === 'commands'}
                onClick={() => openPanel('commands')}
              />
            </div>
          }
          treeAction={
            <button
              type="button"
              className="hbar-app-react-icon-action"
              aria-label={props.labels.openWorkspace}
              title={props.labels.openWorkspace}
              disabled={props.connection !== 'connected'}
              onClick={openWorkspace}
            >
              <HbarAppUiShellIcon name="folder-open" />
            </button>
          }
          actions={
            <div className="hbar-app-react-sidebar-actions">
              {props.connection !== 'connected' && (
                <HbarAppUiSidebarAction icon="refresh" label={props.labels.reconnect} onClick={props.onReconnect} />
              )}
              <HbarAppUiSidebarAction
                icon="activity"
                label={props.labels.status}
                selected={presentation.page.kind === 'status'}
                onClick={() => settleNavigation(execute('app.openStatus', { section: 'dashboard' }))}
              />
              <HbarAppUiSidebarAction
                icon="puzzle"
                label={props.labels.extensions}
                selected={surfaces.focusedPanelId === 'extensions'}
                onClick={() => openPanel('extensions')}
              />
              <HbarAppUiSidebarAction
                icon="settings"
                label={props.labels.settings}
                selected={presentation.page.kind === 'settings'}
                onClick={() => settleNavigation(execute('app.openSettings', { scope: 'global' }))}
              />
            </div>
          }
        >
          <nav className="hbar-app-react-project-tree" aria-label={props.labels.projectsAndSessions}>
            {workspaces.length === 0 && (
              <p>{loading.has('workspaces') ? props.labels.loading : props.labels.noWorkspaces}</p>
            )}
            {workspaces.map((workspace) => {
              const isExpanded = expanded.has(workspace.id)
              const sessions = sessionsByWorkspace.get(workspace.id) ?? []
              const nextSessionCursor = sessionCursors[workspace.id]
              return (
                <section key={workspace.id}>
                  <button
                    type="button"
                    className="hbar-app-react-workspace-row"
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
                    <HbarAppUiShellIcon name={isExpanded ? 'chevron-down' : 'chevron-right'} tier="sm" />
                    <HbarAppUiShellIcon name={isExpanded ? 'folder-open' : 'folder'} />
                    <strong>{workspace.name}</strong>
                  </button>
                  {isExpanded && (
                    <div className="hbar-app-react-session-list">
                      {loading.has(workspace.id) && sessions.length === 0 ? (
                        <p>{props.labels.loading}</p>
                      ) : sessions.length === 0 ? (
                        <p>{props.labels.noSessions}</p>
                      ) : (
                        sessions.map((session) => (
                          <button
                            key={session.id}
                            type="button"
                            aria-current={navigation.sessionId === session.id ? 'page' : undefined}
                            aria-label={props.labels.openSession(session.title)}
                            title={session.title}
                            onClick={() => openSession(session.id)}
                          >
                            <HbarAppUiShellIcon name="message" tier="sm" />
                            <span className="hbar-app-react-session-label">
                              <strong>{session.title}</strong>
                              <small>{props.labels.sessionUpdatedAt(session.updatedAt)}</small>
                            </span>
                          </button>
                        ))
                      )}
                      {nextSessionCursor && (
                        <button
                          type="button"
                          className="hbar-app-react-load-more"
                          onClick={() => void loadSessions(workspace.id, nextSessionCursor)}
                        >
                          {props.labels.loadMore}
                        </button>
                      )}
                    </div>
                  )}
                </section>
              )
            })}
            {workspaceCursor && (
              <button
                type="button"
                className="hbar-app-react-load-more"
                onClick={() => void loadWorkspaces(workspaceCursor)}
              >
                {props.labels.loadMore}
              </button>
            )}
          </nav>
          {error && <p role="alert">{props.labels.error(error)}</p>}
        </HbarAppUiAppSidebar>
      }
    >
      {props.children}
    </HbarAppUiAppShell>
  )
}
