import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Actions, BorderNode, DockLocation, Layout, Model, TabNode } from 'flexlayout-react'
import {
  Activity,
  Archive,
  BarChart3,
  Brain,
  CheckCircle2,
  CircleHelp,
  CircleX,
  Clock3,
  FileSearch,
  Folder,
  FolderOpen,
  GitBranch,
  Globe,
  LayoutGrid,
  LoaderCircle,
  MessageSquare,
  ListChecks,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  PinOff,
  Pencil,
  Plus,
  Search,
  Settings2,
  TerminalSquare,
  Target,
  Wrench,
  X,
} from 'lucide-react'
import type { GitWorktreeInfo, Session, ToolWindowDock, ToolWindowIcon } from '@hbar/contracts'
import {
  client,
  connectHost,
  openSession,
  refreshCatalog,
  report,
  useCatalog,
  useConnection,
  useNotice,
  useSessions,
  useSessionSummaries,
  useGitState,
  useWorkbench,
} from './stores'
import { platform } from './platform'
import Chat from './Chat'
import Settings, { Modal } from './Settings'
import Markdown from './Markdown'
import { syncUIPlugins, useUIPlugins } from './ui-plugins'
import { FloatingSurface } from './FloatingLayer'
import { permissionPreset } from './permissions'
import { defaultLayout, restoreLayout, versionedLayout } from './workbench/layout'
import PairingPage from './PairingPage'
import { BrowserPanel, InsightsPanel, PlanPanel, SessionInspectorPanel } from './SessionTools'
import CommandPalette, { type PaletteCommand } from './CommandPalette'
import Diagnose from './DiagnosePanel'
import SpotlightCard from './react-bits/SpotlightCard'
import LineSidebar from './react-bits/LineSidebar'
import GlassSurface from './react-bits/GlassSurface'
import AnimatedList from './react-bits/AnimatedList'
import ActivityPanel from './ActivityPanel'
import GitPanel from './GitPanel'
import WorkbenchHeader from './workbench/WorkbenchHeader'
import { MobileNavigation, MobileToolMenu, WorkbenchToolRails } from './workbench/WorkbenchNavigation'
import WorkbenchStatusBar from './workbench/WorkbenchStatusBar'
import { FileNavigation, FileViewer } from './FileNavigation'
import SystemTerminalPanel from './SystemTerminalPanel'
import ThemeRuntimeSync from './ThemeRuntimeSync'
import type { ToolWindowProps } from '@hbar/ui-sdk'
import ReferenceGallery from './react-bits/reference/ReferenceGallery'
import { referenceAttributes } from './react-bits'
import { useLocale } from './locale'
import 'flexlayout-react/style/dark.css'
const DIAGNOSE_PANEL_ID = 'diagnose-right'
const DEFAULT_TOOL_RAIL_ORDER = [
  'browser',
  'git',
  'inspector',
  'plan',
  'insights',
  'activity',
  'diagnose',
] as const
const BUILTIN_TOOL_IDS = new Set(['browser', 'git', 'inspector', 'plan', 'insights', 'activity', 'diagnose', 'diagnose-right'])
const TOOL_WINDOW_TAB_ICONS: Partial<Record<ToolWindowIcon, typeof LayoutGrid>> = {
  activity: Activity,
  'bar-chart-3': BarChart3,
  'circle-help': CircleHelp,
  'file-search': FileSearch,
  folder: Folder,
  'git-branch': GitBranch,
  globe: Globe,
  'layout-grid': LayoutGrid,
  'list-checks': ListChecks,
  'message-square': MessageSquare,
  'terminal-square': TerminalSquare,
  wrench: Wrench,
}
const SIDEBAR_MIN_WIDTH = 220
const SIDEBAR_MAX_WIDTH = 360
const MOBILE_VIEW_BY_COMPONENT: Record<string, string> = {
  activity: 'activity',
  git: 'git',
  settings: 'settings',
  diagnose: 'diagnose',
  browser: 'browser',
  inspector: 'inspector',
  plan: 'plan',
  insights: 'insights',
  file: 'file',
  plugin: 'plugin',
}

function normalizeWorkspacePath(value: string): string {
  const normalized = value.trim().replaceAll('\\', '/')
  const driveRoot = /^[A-Za-z]:\//.test(normalized) ? normalized.slice(0, 3) : normalized.startsWith('/') ? '/' : ''
  const body = driveRoot ? normalized.slice(driveRoot.length) : normalized
  const segments: string[] = []
  for (const segment of body.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  const result = segments.length ? `${driveRoot}${segments.join('/')}`.replace(/\/$/, '') : driveRoot
  return result || driveRoot || '.'
}

function workspacePathKey(value: string): string {
  return normalizeWorkspacePath(value).toLocaleLowerCase()
}

type SessionTabConfig = { sessionId?: string }

function conversationTabs(model: Model): TabNode[] {
  const tabs: TabNode[] = []
  model.visitNodes((node) => {
    if (node instanceof TabNode && node.getComponent() === 'conversation') tabs.push(node)
  })
  return tabs
}

function sessionIdFromTab(tab: TabNode): string | undefined {
  const config = tab.getConfig() as SessionTabConfig | undefined
  return typeof config?.sessionId === 'string' && config.sessionId.length > 0 ? config.sessionId : undefined
}

function sessionTabConfig(tab: TabNode): SessionTabConfig {
  const config = tab.getConfig() as SessionTabConfig | undefined
  return config ?? {}
}

function ensureWelcomeTab(model: Model, label: string): string | undefined {
  const existing = conversationTabs(model).find((tab) => !sessionIdFromTab(tab))
  if (existing) return existing.getId()

  const id = model.getNodeById('welcome') ? 'welcome:fallback' : 'welcome'
  const parentId = model.getNodeById('main') ? 'main' : model.getActiveTabset()?.getId()
  if (!parentId) return undefined
  model.doAction(
    Actions.addNode(
      { type: 'tab', id, name: label, component: 'conversation', enableClose: false },
      parentId,
      DockLocation.CENTER,
      -1,
    ),
  )
  return id
}

function selectedLayoutTab(model: Model): TabNode | undefined {
  const active = model.getActiveTabset()?.getSelectedNode()
  if (active instanceof TabNode) return active
  const first = model.getFirstTabSet()?.getSelectedNode()
  return first instanceof TabNode ? first : undefined
}

function Sessions({
  onSelect,
  onNew,
  onAddWorkspace,
  creating = false,
}: {
  onSelect(id: string): void
  onNew(): void
  onAddWorkspace(): void
  creating?: boolean
}) {
  type SessionActionKind = 'fork' | 'archive'
  const { t } = useLocale()
  const [search, setSearch] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)
  const [sessionActions, setSessionActions] = useState<Record<string, SessionActionKind>>({})
  const sessionActionIds = useRef(new Set<string>())
  const data = useCatalog((state) => state.data),
    selected = useWorkbench((state) => state.activeSession),
    archived = useWorkbench((state) => state.showArchived),
    pinnedSessionIds = useWorkbench((state) => state.pinnedSessionIds),
    pinnedWorkspaceIds = useWorkbench((state) => state.pinnedWorkspaceIds)
  const snapshots = useSessions((state) => state.snapshots)
  const summaries = useSessionSummaries((state) => state.byId)
  const gitRevision = useGitState((state) => state.revision)
  const changedGitCwds = useGitState((state) => state.changedCwds)
  const [workspaceBranches, setWorkspaceBranches] = useState<Record<string, string | null>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: 'workspace' | 'session'; id: string } | null>(null)
  const sessions = data?.sessions ?? []
  const workspaces = useMemo(() => data?.workspaces ?? [], [data?.workspaces])
  useEffect(() => {
    let cancelled = false
    const connection = client()
    const known = new Set(workspaces.map((workspace) => workspace.id))
    const normalizePath = (path: string) => path.replaceAll('\\', '/').replace(/\/$/, '').toLocaleLowerCase()
    const invalidated = new Set(changedGitCwds.map(normalizePath))
    const targets = workspaces.filter(
      (workspace) =>
        !(workspace.id in workspaceBranches) ||
        (gitRevision > 0 && invalidated.has(normalizePath(workspace.path))),
    )
    const retainKnown = (current: Record<string, string | null>) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => known.has(id)))
    const sameBranches = (left: Record<string, string | null>, right: Record<string, string | null>) =>
      Object.keys(left).length === Object.keys(right).length &&
      Object.entries(left).every(([id, branch]) => right[id] === branch)
    if (!targets.length) {
      setWorkspaceBranches((current) => {
        const next = retainKnown(current)
        return sameBranches(current, next) ? current : next
      })
      return () => {
        cancelled = true
      }
    }
    const entries: Array<readonly [string, string | null]> = []
    let cursor = 0
    async function worker() {
      while (!cancelled) {
        const workspace = targets[cursor++]
        if (!workspace) return
        try {
          const info = await connection.call('git.status', { cwd: workspace.path })
          entries.push([workspace.id, info.root ? info.branch ?? t('detachedHead') : null])
        } catch {
          entries.push([workspace.id, null])
        }
      }
    }
    void Promise.all(Array.from({ length: Math.min(8, targets.length) }, () => worker())).then(() => {
      if (cancelled || useConnection.getState().client !== connection) return
      setWorkspaceBranches((current) => {
        const next = {
          ...retainKnown(current),
        ...Object.fromEntries(entries),
        }
        return sameBranches(current, next) ? current : next
      })
    })
    return () => {
      cancelled = true
    }
  }, [changedGitCwds, gitRevision, t, workspaces, workspaceBranches])
  const visibleSessions = sessions.filter((s) => s.archived === archived && s.title.toLowerCase().includes(search.toLowerCase()))
  const pinnedSessions = visibleSessions.filter((s) => pinnedSessionIds.includes(s.id))
  const pinnedWorkspaces = workspaces.filter((workspace) => pinnedWorkspaceIds.includes(workspace.id))
  function sessionMeta(session: Session) {
    const snapshot = snapshots[session.id]
    const run = snapshot?.runs.find((item) => ['running', 'waiting_approval', 'queued'].includes(item.status))
    const summary = summaries[session.id]
    const activity = summary?.activity ?? (run?.status === 'waiting_approval' ? 'waiting_approval' : run?.status === 'queued' ? 'queued' : run ? 'thinking' : 'idle')
    const labels: Record<string, string> = {
      idle: t('idleStatus'), queued: t('queuedStatus'), thinking: t('thinkingStatus'), tool: t('toolStatus'), reading: t('readingStatus'),
      output: t('outputStatus'), goal: t('goalStatus'), plan: t('planStatus'), waiting_approval: t('waitingApprovalStatus'),
      completed: t('completed'), failed: t('failed'), cancelled: t('cancelledStatus'),
    }
    const icons: Record<string, typeof Activity> = {
      idle: Clock3, queued: Clock3, thinking: Brain, tool: Wrench, reading: FileSearch, output: MessageSquare,
      goal: Target, plan: ListChecks, waiting_approval: Clock3, completed: CheckCircle2, failed: CircleX,
      cancelled: CircleX,
    }
    return { snapshot, summary, activity, status: labels[activity] ?? t('ready'), StatusIcon: icons[activity] ?? Activity, branch: workspaceBranches[session.workspaceId] }
  }
  function renderSessionDetails(session: Session) {
    const meta = sessionMeta(session)
    const StatusIcon = meta.StatusIcon
    const workspace = workspaces.find((item) => item.id === session.workspaceId)
    const responseAt = meta.summary?.lastResponseAt ?? null
    const responseLabel = responseAt ? new Date(responseAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : t('noResponse')
    return <>
      <span className="session-leading-icon" aria-hidden="true">{pinnedSessionIds.includes(session.id) ? <Pin size={14} /> : <MessageSquare size={14} />}</span>
      <div>
        <span>{session.title}</span>
        <small title={meta.branch ? `${workspace?.path ?? workspace?.name ?? t('unknownWorkspace')} · ${meta.branch}` : t('noGitBranch')}>{workspace?.name ?? t('unknownWorkspace')} · {meta.branch ? `${t('branchLabel')} · ${meta.branch}` : t('noGitBranch')}</small>
      </div>
      <span className={`session-status-indicator session-status-${meta.activity}`} title={meta.status} aria-label={meta.status}><StatusIcon size={13} /></span>
      <small className="session-last-response" title={responseAt ? new Date(responseAt).toLocaleString() : undefined}>{t('lastResponse')} {responseLabel}</small>
    </>
  }
  const openMenu = (event: React.MouseEvent, type: 'workspace' | 'session', id: string) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({ x: event.clientX, y: event.clientY, type, id })
  }
  const togglePinned = (type: 'workspace' | 'session', id: string) => {
    const key = type === 'workspace' ? 'pinnedWorkspaceIds' : 'pinnedSessionIds'
    useWorkbench.setState((state) => ({ [key]: state[key].includes(id) ? state[key].filter((item) => item !== id) : [...state[key], id] }))
    setContextMenu(null)
  }
  function startRename(event: React.MouseEvent, session: Session) {
    event.preventDefault()
    event.stopPropagation()
    setRenamingId(session.id)
    setRenameValue(session.title)
  }
  async function finishRename() {
    const id = renamingId
    const title = renameValue.trim()
    if (!id || renameBusy) return
    if (!title) {
      setRenamingId(null)
      setRenameValue('')
      return
    }
    const session = data?.sessions.find((item) => item.id === id)
    if (!session || title === session.title) {
      setRenamingId(null)
      setRenameValue('')
      return
    }
    setRenameBusy(true)
    try {
      await client().call('session.rename', { sessionId: id, title })
      await refreshCatalog()
      setRenamingId(null)
      setRenameValue('')
    } catch (error) {
      report(error)
    } finally {
      setRenameBusy(false)
    }
  }
  async function fork(session: Session) {
    if (sessionActionIds.current.has(session.id)) return
    sessionActionIds.current.add(session.id)
    setSessionActions((current) => ({ ...current, [session.id]: 'fork' }))
    try {
      const child = await client().call('session.fork', { sessionId: session.id })
      await refreshCatalog()
      onSelect(child.id)
    } catch (error) {
      report(error)
    } finally {
      sessionActionIds.current.delete(session.id)
      setSessionActions((current) => {
        if (!current[session.id]) return current
        const next = { ...current }
        delete next[session.id]
        return next
      })
    }
  }
  async function toggleArchive(session: Session) {
    if (sessionActionIds.current.has(session.id)) return
    sessionActionIds.current.add(session.id)
    setSessionActions((current) => ({ ...current, [session.id]: 'archive' }))
    try {
      await client().call('session.archive', { sessionId: session.id, archived: !archived })
      await refreshCatalog()
    } catch (error) {
      report(error)
    } finally {
      sessionActionIds.current.delete(session.id)
      setSessionActions((current) => {
        if (!current[session.id]) return current
        const next = { ...current }
        delete next[session.id]
        return next
      })
    }
  }
  return (
    <div
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/app-sidebar', 'bootstrap-shell')}
      className="session-nav"
      onClick={() => contextMenu && setContextMenu(null)}
    >
      <div className="sidebar-heading">
        <strong>{archived ? t('archived') : t('sessions')}</strong>
        <div>
          {!archived && <button title={t('newWorkspace')} aria-label={t('newWorkspace')} onClick={onAddWorkspace}><Plus size={15} /></button>}
          <button
            title={archived ? t('activeSessions') : t('archivedSessions')}
            aria-label={archived ? t('activeSessions') : t('archivedSessions')}
            className={archived ? 'selected' : ''}
            onClick={() => useWorkbench.setState({ showArchived: !archived })}
          >
            <Archive size={15} />
          </button>
        </div>
      </div>
      <div className="search-field">
        <Search size={13} />
        <input
          placeholder={t('searchSessions')}
          aria-label={t('searchSessions')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <LineSidebar
        {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/app-sidebar', 'bootstrap-shell')}
        className="session-line-sidebar"
        activeId={selected}
        itemSelector="[data-session-line-item]"
      >
        {(pinnedWorkspaces.length > 0 || pinnedSessions.length > 0) && (
          <section className="session-pinned-section" aria-label={t('pinnedArea')}>
            <div className="session-group-heading"><Pin size={12} />{t('pinned')}</div>
            {pinnedWorkspaces.map((workspace) => (
              <button key={workspace.id} className="workspace-item pinned" onContextMenu={(event) => openMenu(event, 'workspace', workspace.id)} onClick={() => useWorkbench.setState({ workspaceId: workspace.id })}>
                <Folder size={14} /><span>{workspace.name}</span><Pin size={11} />
              </button>
            ))}
            {pinnedSessions.map((session) => (
              <button data-session-line-item data-line-id={session.id} key={session.id} className={`session-item-pinned${selected === session.id ? ' selected' : ''}`} onContextMenu={(event) => openMenu(event, 'session', session.id)} onClick={() => onSelect(session.id)}>
                <span className="session-line-marker" aria-hidden="true" />
                {renderSessionDetails(session)}
              </button>
            ))}
          </section>
        )}
        <AnimatedList
          className="session-list"
          viewportClassName="session-list-viewport"
          aria-label={archived ? t('archivedSessions') : t('sessions')}
        >
        {workspaces.map((workspace) => {
          const workspaceSessions = visibleSessions.filter((session) => session.workspaceId === workspace.id)
          if (!workspaceSessions.length && search) return null
          const isExpanded = expanded[workspace.id] ?? true
          return (
            <section className={`workspace-group${pinnedWorkspaceIds.includes(workspace.id) ? ' pinned' : ''}`} key={workspace.id}>
              <div className="workspace-heading" onContextMenu={(event) => openMenu(event, 'workspace', workspace.id)}>
                <button className="workspace-toggle" onClick={() => setExpanded((current) => ({ ...current, [workspace.id]: !isExpanded }))}>
                  <Folder size={14} /><strong>{workspace.name}</strong><span>{workspaceSessions.length}</span>
                </button>
                <div className="workspace-actions">
                  <button title={t('pinnedWorkspace')} aria-label={`${t('pinnedWorkspace')} ${workspace.name}`} onClick={() => togglePinned('workspace', workspace.id)}>{pinnedWorkspaceIds.includes(workspace.id) ? <PinOff size={12} /> : <Pin size={12} />}</button>
                  <button title={t('newSession')} aria-label={t('newSessionInWorkspace').replace('{workspace}', workspace.name)} disabled={creating} onClick={() => { useWorkbench.setState({ workspaceId: workspace.id }); onNew() }}><Plus size={13} /></button>
                </div>
              </div>
              {isExpanded && workspaceSessions.map((session) => (
                <SpotlightCard data-session-line-item data-line-id={session.id} className={`session-item ${selected === session.id ? 'selected' : ''}`} key={session.id} spotlightColor="color-mix(in srgb, var(--rb-accent) 34%, transparent)" onContextMenu={(event) => openMenu(event, 'session', session.id)}>
                  <span className="session-line-marker" aria-hidden="true" />
                  {renamingId === session.id ? (
              <input
                className="session-rename-input"
                aria-label={`${t('rename')} ${session.title}`}
                value={renameValue}
                autoFocus
                disabled={renameBusy}
                onChange={(event) => setRenameValue(event.target.value)}
                onBlur={() => void finishRename()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void finishRename()
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    setRenamingId(null)
                    setRenameValue('')
                  }
                }}
              />
              ) : (
              <button className="session-select" onClick={() => onSelect(session.id)}>
                {renderSessionDetails(session)}
              </button>
                  )}
            <div className="session-row-actions">
              <button
                title={pinnedSessionIds.includes(session.id) ? `${t('unpinSession')} ` : t('pinSession')}
                aria-label={`${pinnedSessionIds.includes(session.id) ? t('unpinSession') : t('pinSession')} ${session.title}`}
                onClick={() => togglePinned('session', session.id)}
              >
                {pinnedSessionIds.includes(session.id) ? <PinOff size={12} /> : <Pin size={12} />}
              </button>
              <button
                title={t('renameSession')}
                aria-label={`${t('rename')} ${session.title}`}
                disabled={renameBusy || Boolean(sessionActions[session.id])}
                onClick={(event) => startRename(event, session)}
              >
                <Pencil size={12} />
              </button>
              <button
                title={t('createBranch')}
                aria-label={`${t('createBranch')} ${session.title}`}
                disabled={Boolean(sessionActions[session.id])}
                onClick={() => void fork(session)}
              >
                {sessionActions[session.id] === 'fork' ? (
                  <LoaderCircle size={12} className="spinning" />
                ) : (
                  <GitBranch size={12} />
                )}
              </button>
              <button
                title={archived ? `${t('restore')} ${t('sessions')}` : `${t('archive')} ${t('sessions')}`}
                aria-label={`${archived ? t('restore') : t('archive')} ${session.title}`}
                disabled={Boolean(sessionActions[session.id])}
                onClick={() => void toggleArchive(session)}
              >
                {sessionActions[session.id] === 'archive' ? (
                  <LoaderCircle size={12} className="spinning" />
                ) : (
                  <Archive size={12} />
                )}
              </button>
            </div>
              </SpotlightCard>
              ))}
            </section>
          )
        })}
          {!visibleSessions.length && (
            <div className="empty-nav">{search ? t('noMatchingSessions') : archived ? t('noArchivedSessions') : t('noSessions')}</div>
          )}
        </AnimatedList>
      </LineSidebar>
      {contextMenu && <SessionContextMenu menu={contextMenu} sessions={sessions} onClose={() => setContextMenu(null)} onTogglePinned={togglePinned} onRename={(id) => { const session = sessions.find((item) => item.id === id); if (session) { setRenamingId(id); setRenameValue(session.title) }; setContextMenu(null) }} onArchive={(id) => { const session = sessions.find((item) => item.id === id); if (session) void toggleArchive(session); setContextMenu(null) }} />}
    </div>
  )
}

function SessionContextMenu({ menu, sessions, onClose, onTogglePinned, onRename, onArchive }: { menu: { x: number; y: number; type: 'workspace' | 'session'; id: string }; sessions: readonly Session[]; onClose(): void; onTogglePinned(type: 'workspace' | 'session', id: string): void; onRename(id: string): void; onArchive(id: string): void }) {
  const { t } = useLocale()
  const session = sessions.find((item) => item.id === menu.id)
  return <FloatingSurface
    mode="point"
    anchorPoint={{ x: menu.x, y: menu.y }}
    open
    onClose={onClose}
    placement="below"
    className="session-context-menu"
    role="menu"
    aria-label={t('sessionOptions')}
    onClick={(event) => event.stopPropagation()}
  >
    <button role="menuitem" onClick={() => onTogglePinned(menu.type, menu.id)}><Pin size={14} />{menu.type === 'session' ? t('pinSession') : t('pinWorkspace')}</button>
    {menu.type === 'session' && session && <><button role="menuitem" onClick={() => onRename(session.id)}><Pencil size={14} />{t('rename')}</button><button role="menuitem" onClick={() => onArchive(session.id)}><Archive size={14} />{session.archived ? t('restoreSession') : t('archiveSession')}</button></>}
  </FloatingSurface>
}

function DockTargetOverlay({ allowedDocks, onDrop }: { allowedDocks: readonly ToolWindowDock[]; onDrop(dock: ToolWindowDock): void }) {
  const { t } = useLocale()
  const targets: Array<{ dock: ToolWindowDock; label: string; className: string }> = [
    { dock: 'top', label: t('dockTop'), className: 'dock-target-top' },
    { dock: 'left', label: t('dockLeft'), className: 'dock-target-left' },
    { dock: 'editor', label: t('dockEditor'), className: 'dock-target-editor' },
    { dock: 'right', label: t('dockRight'), className: 'dock-target-right' },
    { dock: 'bottom', label: t('dockBottom'), className: 'dock-target-bottom' },
    { dock: 'window', label: t('dockWindow'), className: 'dock-target-window' },
  ]
  return (
    <div className="dock-target-overlay" role="presentation">
      {targets.filter((target) => allowedDocks.includes(target.dock)).map((target) => (
        <button
          type="button"
          key={target.dock}
          className={`dock-target ${target.className}`}
          aria-label={target.label}
          onDragOver={(event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
          }}
          onDrop={(event) => {
            event.preventDefault()
            onDrop(target.dock)
          }}
        >
          {target.label}
        </button>
      ))}
    </div>
  )
}
export default function App() {
  const { t } = useLocale()
  const status = useConnection((state) => state.status),
    data = useCatalog((state) => state.data),
    host = useConnection((state) => state.host)
  const activeSession = useWorkbench((state) => state.activeSession),
    workspaceId = useWorkbench((state) => state.workspaceId),
    panel = useWorkbench((state) => state.panel),
    approvalMode = useWorkbench((state) => state.approvalMode),
    modelId = useWorkbench((state) => state.modelId),
    toolPanel = useWorkbench((state) => state.toolPanel),
    sidebarWidth = useWorkbench((state) => state.sidebarWidth)
  const notice = useNotice((state) => state.error)
  const taskNotice = useNotice((state) => state.notice)
  const clientPanels = useUIPlugins((state) => state.panels)
  const plugins = data?.plugins
  const sessions = data?.sessions
  const detachedPanelId = new URLSearchParams(window.location.search).get('hbarPanel')
  const activeSnapshot = useSessions((state) => (activeSession ? state.snapshots[activeSession] : undefined))
  const initialSelection = useRef(true)
  const openToolIdsRef = useRef(new Set<string>())
  const nativeToolWindows = useRef(new Map<string, { dock: ToolWindowDock; focus(): Promise<void>; close(): Promise<void> }>())
  const switchingSession = useRef(false)
  const lastSessionSelection = useRef<string | undefined>(undefined)
  const creatingSession = useRef(false)
  const [small, setSmall] = useState(window.innerWidth < 900),
    [sidebar, setSidebar] = useState(true),
    [mobileView, setMobileView] = useState('chat'),
    [workspaceModal, setWorkspaceModal] = useState(false),
    [workspacePaths, setWorkspacePaths] = useState<string[]>([]),
    [workspaceAlias, setWorkspaceAlias] = useState('')
  const [discoveredWorktrees, setDiscoveredWorktrees] = useState<Array<GitWorktreeInfo & { sourcePath: string }>>([])
  const [selectedWorktreePaths, setSelectedWorktreePaths] = useState<string[]>([])
  const [workspaceCreateErrors, setWorkspaceCreateErrors] = useState<Array<{ path: string; message: string; retryable: boolean }>>([])
  const [workspaceCreateBusy, setWorkspaceCreateBusy] = useState(false)
  const [isCreatingSession, setIsCreatingSession] = useState(false)
  const [mobileFile, setMobileFile] = useState('')
  const [mobilePanel, setMobilePanel] = useState('')
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [referenceGalleryOpen, setReferenceGalleryOpen] = useState(false)
  const [conversationViews, setConversationViews] = useState<Record<string, 'chat' | 'console'>>({})
  useEffect(() => {
    let cancelled = false
    if (!workspacePaths.length) {
      setDiscoveredWorktrees([])
      setSelectedWorktreePaths([])
      return () => {
        cancelled = true
      }
    }
    const paths = [...workspacePaths]
    const connection = client()
    const groups: Array<Array<GitWorktreeInfo & { sourcePath: string }>> = []
    let cursor = 0
    async function worker() {
      while (!cancelled) {
        const sourcePath = paths[cursor++]
        if (!sourcePath) return
        try {
          const [status, result] = await Promise.all([
            connection.call('git.status', { cwd: sourcePath }),
            connection.call('git.worktree', { cwd: sourcePath, operation: 'list' }),
          ])
          const entries = Array.isArray(result) ? result : [result]
          const currentRoot = status.root ?? sourcePath
          groups.push(entries
            .filter((item) => workspacePathKey(item.path) !== workspacePathKey(currentRoot))
            .map((item) => ({ ...item, sourcePath })))
        } catch {
          groups.push([])
        }
      }
    }
    void Promise.all(Array.from({ length: Math.min(8, paths.length) }, () => worker())).then(() => {
      if (cancelled || useConnection.getState().client !== connection) return
      const seen = new Set<string>()
      const external = groups.flat().filter((item) => {
        const key = workspacePathKey(item.path)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      setDiscoveredWorktrees(external)
      setSelectedWorktreePaths(external.map((item) => item.path))
    })
    return () => {
      cancelled = true
    }
  }, [workspacePaths])
  const [model, setModel] = useState(() => {
    return Model.fromJson(restoreLayout(useWorkbench.getState().layout))
  })
  const [draggingTool, setDraggingTool] = useState<string | null>(null)
  const draggingToolRef = useRef<string | null>(null)
  const setToolDragState = (id: string | null) => {
    if (id) draggingToolRef.current = id
    setDraggingTool(id)
  }
  const contributionToolIds = [...(data?.panels ?? []), ...clientPanels].map((panel) => panel.id)
  const allToolIds = [...new Set([...DEFAULT_TOOL_RAIL_ORDER, ...contributionToolIds])]
  const nodeIdForTool = (id: string) => (id === 'diagnose' ? DIAGNOSE_PANEL_ID : id.startsWith('plugin:') ? id : id)
  const toolRailSides = Object.fromEntries(allToolIds.map((id) => [id, 'right'])) as Record<string, 'left' | 'right'>
  const toolRailOrder: string[] = []
  const orderedDockIds = (dock: 'left' | 'right') => {
    const border = model.getNodeById(`border_${dock}`)
    if (border instanceof BorderNode)
      return border.getTabNodes().map((node) => {
        if (node.getId() === DIAGNOSE_PANEL_ID) return 'diagnose'
        return node.getId().startsWith('plugin:') ? node.getId().slice('plugin:'.length) : node.getId()
      })
    return []
  }
  for (const dock of ['left', 'right'] as const) {
    for (const id of orderedDockIds(dock)) {
      if (allToolIds.includes(id) && !toolRailOrder.includes(id)) {
        toolRailOrder.push(id)
        toolRailSides[id] = dock
      }
    }
  }
  for (const id of allToolIds) if (!toolRailOrder.includes(id)) toolRailOrder.push(id)
  function findToolNode(id: string): TabNode | undefined {
    const node = model.getNodeById(nodeIdForTool(id)) ?? model.getNodeById(`plugin:${id}`)
    return node instanceof TabNode ? node : undefined
  }
  function moveToolRail(id: string, side: 'left' | 'right') {
    const contribution = [...(data?.panels ?? []), ...clientPanels].find((panel) => panel.id === id)
    if (contribution?.allowedDocks && !contribution.allowedDocks.includes(side)) return
    let node = findToolNode(id)
    if (!node) {
      if (contribution) {
        const target = model.getNodeById(`border_${side}`)
        if (target instanceof BorderNode) {
          model.doAction(
            Actions.addNode(
            {
              type: 'tab',
              id: `plugin:${id}`,
              name: contribution.title,
              component: 'plugin',
              enableClose: contribution.closable !== false,
              config: { panelId: id },
              ...(contribution.canPopout === false
                ? { enablePopout: false, enablePopoutIcon: false, enablePopoutFloatIcon: false }
                : {}),
            },
            target.getId(),
            DockLocation.CENTER,
            -1,
            ),
          )
        }
        node = findToolNode(id)
     }
    }
    const border = model.getNodeById(`border_${side}`)
    if (!(node instanceof TabNode) || !(border instanceof BorderNode)) return
    let source = node.getParent()
    while (source && !(source instanceof BorderNode)) source = source.getParent()
    const wasSelected = source instanceof BorderNode && source.getSelectedNode()?.getId() === node.getId()
    model.doAction(Actions.updateNodeAttributes(border.getId(), { show: true }))
    if (node.getParent()?.getId() !== border.getId())
      model.doAction(Actions.moveNode(node.getId(), border.getId(), DockLocation.CENTER, -1, false))
    if (source instanceof BorderNode && source.getId() !== border.getId() && wasSelected)
      model.doAction(Actions.updateNodeAttributes(source.getId(), { show: false, selected: -1 }))
  }
  function reorderToolRail(source: string, target: string) {
    const sourceNode = model.getNodeById(nodeIdForTool(source)) ?? model.getNodeById(`plugin:${source}`)
    const targetNode = model.getNodeById(nodeIdForTool(target)) ?? model.getNodeById(`plugin:${target}`)
    const parent = targetNode?.getParent()
    if (!(sourceNode instanceof TabNode) || !(targetNode instanceof TabNode) || !parent) return
    const index = parent.getChildren().indexOf(targetNode)
    model.doAction(Actions.moveNode(sourceNode.getId(), parent.getId(), DockLocation.CENTER, index, false))
  }
  const [toastPaused, setToastPaused] = useState(false)
  const sidebarDrag = useRef<{ startX: number; startWidth: number } | null>(null)
  const closeCommandPalette = useCallback(() => setCommandPaletteOpen(false), [])
  useEffect(() => {
    setToastPaused(false)
  }, [notice])
  useEffect(() => {
    const clearDragState = () => {
      delete document.body.dataset.hbarDraggingTool
      draggingToolRef.current = null
      setDraggingTool(null)
    }
    const onDragEnd = () => window.setTimeout(clearDragState, 0)
    window.addEventListener('dragend', onDragEnd)
    window.addEventListener('drop', clearDragState)
    return () => {
      window.removeEventListener('dragend', onDragEnd)
      window.removeEventListener('drop', clearDragState)
    }
  }, [])
  useEffect(() => {
    let dispose: (() => void) | undefined
    void platform().then((adapter) => {
      dispose = adapter.onToolWindowEvent((event) => {
        if (event.type !== 'closed') return
        const panelId = event.windowId
        const previous = nativeToolWindows.current.get(panelId)
        nativeToolWindows.current.delete(panelId)
        const contribution = [...(useCatalog.getState().data?.panels ?? []), ...useUIPlugins.getState().panels].find((panel) => panel.id === panelId)
        if (contribution) openPanel(`plugin:${panelId}`, contribution.title, 'plugin', { panelId }, previous?.dock ?? contribution.defaultDock)
      })
    })
    return () => dispose?.()
  // The adapter subscription is process-wide; the callback reads current stores
  // and is intentionally installed once for this App instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!taskNotice) return
    const timer = window.setTimeout(() => {
      if (useNotice.getState().notice === taskNotice) useNotice.setState({ notice: '' })
    }, 6000)
    return () => window.clearTimeout(timer)
  }, [taskNotice])
  useEffect(() => {
    if (!notice || toastPaused) return
    const timer = window.setTimeout(() => {
      if (useNotice.getState().error === notice) useNotice.setState({ error: '' })
    }, 6000)
    return () => window.clearTimeout(timer)
  }, [notice, toastPaused])

  useEffect(() => {
    if (!notice) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useNotice.setState({ error: '' })
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [notice])
  useEffect(() => {
    const onResize = () => setSmall(window.innerWidth < 900)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = sidebarDrag.current
      if (!drag) return
      const width = Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, drag.startWidth + event.clientX - drag.startX),
      )
      useWorkbench.setState({ sidebarWidth: Math.round(width) })
    }
    const onPointerUp = () => {
      sidebarDrag.current = null
      document.body.classList.remove('resizing-sidebar')
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === '`') {
        event.preventDefault()
        activateConversationView('console')
      } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        setCommandPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })
  useEffect(() => {
    if (plugins) void syncUIPlugins(plugins)
  }, [plugins])
  useEffect(() => {
    let mounted = true
    void platform()
      .then(async (adapter) => {
        if (!mounted) return
        const info = await adapter.connection()
        if (info.token)
          await fetch(new URL('/auth/token', info.url), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: info.token }),
            credentials: 'include',
          })
        if (mounted) await connectHost(info.url, info.token)
      })
      .catch(report)
    return () => {
      mounted = false
    }
  }, [])
  useEffect(() => {
    if (!data) return
    const restoring = initialSelection.current
    const persistedTool = restoring ? useWorkbench.getState().toolPanel : ''
    const hasPersistedTool = Boolean(persistedTool && model.getNodeById(persistedTool))
    const selectedTab = restoring ? selectedLayoutTab(model) : undefined
    const shouldSelectSession = restoring
      ? !hasPersistedTool &&
        (!selectedTab ||
          (selectedTab.getComponent() === 'conversation' && sessionIdFromTab(selectedTab) !== activeSession))
      : lastSessionSelection.current !== activeSession
    if (!activeSession) {
      if (!restoring) lastSessionSelection.current = activeSession
      return
    }
    const session = data.sessions.find((s) => s.id === activeSession)
    if (!session) return
    initialSelection.current = false
    lastSessionSelection.current = activeSession
    const tabs = conversationTabs(model)
    const target = tabs.find((tab) => sessionIdFromTab(tab) === session.id) ?? tabs[0]
    if (target) {
      const wasTarget = sessionIdFromTab(target) === session.id
      const currentConfig = sessionTabConfig(target)
      switchingSession.current = true
      try {
        if (!wasTarget || target.getName() !== session.title || !target.isEnableClose())
          model.doAction(
            Actions.updateNodeAttributes(target.getId(), {
              name: session.title,
              enableClose: true,
              config: { ...currentConfig, sessionId: session.id },
            }),
          )
        for (const extra of tabs) if (extra.getId() !== target.getId()) model.doAction(Actions.deleteTab(extra.getId()))
        if (shouldSelectSession) model.doAction(Actions.selectTab(target.getId()))
      } finally {
        switchingSession.current = false
      }
      return
    }
    const id = `session:${session.id}`
    model.doAction(
      Actions.addNode(
        {
          type: 'tab',
          id,
          name: session.title,
          component: 'conversation',
          enableClose: true,
          config: { sessionId: session.id },
        },
        model.getNodeById('main') ? 'main' : (model.getActiveTabset()?.getId() ?? 'main'),
        DockLocation.CENTER,
        -1,
      ),
    )
    if (shouldSelectSession) model.doAction(Actions.selectTab(id))
  }, [activeSession, data, model])
  useEffect(() => {
    for (const session of sessions ?? []) {
      const node = conversationTabs(model).find((tab) => sessionIdFromTab(tab) === session.id)
      if (node && node.getName() !== session.title)
        model.doAction(Actions.updateNodeAttributes(node.getId(), { name: session.title }))
    }
  }, [sessions, model])
  function openPanel(
    id: string,
    title: string,
    component: string,
    config?: Record<string, unknown>,
    placement = 'editor',
  ) {
    if (component === 'system-terminal' && id === 'system-terminal') {
      const placeholder = model.getNodeById('system-terminal-placeholder')
      if (placeholder) model.doAction(Actions.deleteTab(placeholder.getId()))
      id = `system-terminal:${crypto.randomUUID()}`
      title = `${t('systemTerminalTitle')} ${systemTerminalCount(model) + 1}`
    }
    if (component === 'terminal') {
      activateConversationView('console')
      return
    }
    if (component !== 'conversation') useWorkbench.setState({ toolPanel: id })
    if (component !== 'conversation') openToolIdsRef.current.add(id)
    if (component === 'plugin') setMobilePanel(String(config?.panelId ?? ''))
    if (small) setMobileView(MOBILE_VIEW_BY_COMPONENT[component] ?? 'chat')
    const registeredPanels = [...(useCatalog.getState().data?.panels ?? []), ...useUIPlugins.getState().panels]
    const panelContribution = component === 'plugin'
      ? registeredPanels.find((panel) => panel.id === String(config?.panelId ?? ''))
      : undefined
    const popoutAttributes = panelContribution?.canPopout === false
      ? { enablePopout: false, enablePopoutIcon: false, enablePopoutFloatIcon: false }
      : {}
    const borderId = placement === 'right'
      ? 'border_right'
      : placement === 'bottom'
        ? 'border_bottom'
        : placement === 'top'
          ? 'border_top'
          : placement === 'left'
            ? 'border_left'
            : undefined
    const border = borderId ? model.getNodeById(borderId) : undefined
    let skipBorderSelection = false
    if (borderId && border instanceof BorderNode) {
      const existing = model.getNodeById(id)
      skipBorderSelection = existing instanceof TabNode && border.getSelectedNode()?.getId() === existing.getId()
      if (!existing)
        model.doAction(
          Actions.addNode(
            { type: 'tab', id, name: title, component, enableClose: true, config, ...popoutAttributes },
            borderId,
            DockLocation.CENTER,
            -1,
          ),
        )
      else if (existing instanceof TabNode && !existing.isEnableClose())
        model.doAction(Actions.updateNodeAttributes(existing.getId(), { enableClose: true }))
      if (existing && existing.getParent()?.getId() !== borderId)
        model.doAction(Actions.moveNode(id, borderId, DockLocation.CENTER, -1, false))
      model.doAction(Actions.updateNodeAttributes(borderId, { show: true }))
    } else {
      const existing = model.getNodeById(id)
      if (!existing)
        model.doAction(
          Actions.addNode(
            { type: 'tab', id, name: title, component, enableClose: true, config, ...popoutAttributes },
            model.getNodeById('main') ? 'main' : (model.getActiveTabset()?.getId() ?? 'main'),
            placement === 'bottom'
              ? DockLocation.BOTTOM
              : placement === 'top'
                ? DockLocation.TOP
              : placement === 'left'
                ? DockLocation.LEFT
                : DockLocation.CENTER,
            -1,
          ),
        )
      else if (existing instanceof TabNode && !existing.isEnableClose())
        model.doAction(Actions.updateNodeAttributes(existing.getId(), { enableClose: true }))
    }
    if (!skipBorderSelection) {
      const selectedNode = model.getNodeById(id)
      if (border instanceof BorderNode && selectedNode instanceof TabNode)
        model.doAction(
          Actions.updateNodeAttributes(border.getId(), {
            show: true,
            selected: border.getTabNodes().indexOf(selectedNode),
          }),
        )
      else model.doAction(Actions.selectTab(id))
    }
  }

  function moveToolToDock(id: string, dock: ToolWindowDock) {
    const contribution = [...(data?.panels ?? []), ...clientPanels].find((panel) => panel.id === id)
    if (contribution?.allowedDocks && !contribution.allowedDocks.includes(dock)) return
    if (dock === 'window' && contribution?.canPopout === false) return
    const resolvedId = id === 'diagnose' ? DIAGNOSE_PANEL_ID : id
    let node = model.getNodeById(resolvedId) ?? model.getNodeById(`plugin:${id}`)
    if (!node && contribution) {
      openPanel(
        `plugin:${id}`,
        contribution.title,
        'plugin',
        { panelId: id },
        contribution.defaultDock ?? 'right',
      )
      node = model.getNodeById(`plugin:${id}`)
    }
    if (dock === 'window') {
      if (node instanceof TabNode && contribution) {
        void platform().then(async (adapter) => {
          if (adapter.kind !== 'desktop') {
            model.doAction(Actions.popoutTab(node!.getId(), 'window'))
            return
          }
          const url = new URL(window.location.href)
          url.searchParams.set('hbarPanel', id)
          const handle = await adapter.openToolWindow({ windowId: id, title: contribution.title, url: url.href })
          if (!handle) return
          nativeToolWindows.current.set(id, {
            dock: toolDock(id),
            focus: () => adapter.focusToolWindow(handle.windowId),
            close: () => adapter.closeToolWindow(handle.windowId),
          })
          closePanel(node!.getId())
        }).catch(report)
      } else if (node instanceof TabNode) model.doAction(Actions.popoutTab(node.getId(), 'window'))
      return
    }
    const target = dock === 'editor' ? model.getNodeById('main') : model.getNodeById(`border_${dock}`)
    if (!target) return
    if (node instanceof TabNode) {
      model.doAction(Actions.moveNode(node.getId(), target.getId(), DockLocation.CENTER, -1, true))
      if (dock !== 'editor') model.doAction(Actions.updateNodeAttributes(target.getId(), { show: true }))
      if (dock === 'left' || dock === 'right') {
        moveToolRail(id, dock)
      }
    }
  }

  function toolDock(id: string): 'left' | 'right' | 'top' | 'bottom' | 'editor' {
    const resolvedId = id === 'diagnose' ? DIAGNOSE_PANEL_ID : id
    const node = model.getNodeById(resolvedId) ?? model.getNodeById(`plugin:${id}`)
    if (!(node instanceof TabNode)) return 'right'
    let parent = node.getParent()
    while (parent && !(parent instanceof BorderNode)) parent = parent.getParent()
    if (parent instanceof BorderNode) {
      const location = parent.getLocation().getName()
      if (location === 'left' || location === 'right' || location === 'top' || location === 'bottom') return location
    }
    return 'editor'
  }

  const draggedContribution = draggingTool
    ? [...(data?.panels ?? []), ...clientPanels].find((contribution) => contribution.id === draggingTool)
    : undefined
  const dragAllowedDocks: readonly ToolWindowDock[] = draggedContribution?.allowedDocks
    ? draggedContribution.allowedDocks.filter((dock) => draggedContribution.canPopout !== false || dock !== 'window')
    : draggedContribution?.canPopout === false
      ? ['left', 'right', 'top', 'bottom', 'editor']
      : ['left', 'right', 'top', 'bottom', 'editor', 'window']

  function handleToolRailDragOver(event: React.DragEvent<HTMLDivElement>) {
    const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('.tool-rail') : null
    if (!target) return
    const source =
      event.dataTransfer.getData('application/x-hbar-tool') ||
      document.body.dataset.hbarDraggingTool ||
      draggingToolRef.current ||
      draggingTool
    if (!source) return
    event.preventDefault()
    moveToolRail(source, target.classList.contains('left-rail') ? 'left' : 'right')
  }
  function handleToolRailDrop(event: React.DragEvent<HTMLDivElement>) {
    const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('.tool-rail') : null
    if (!target) return
    const source = event.dataTransfer.getData('application/x-hbar-tool') || document.body.dataset.hbarDraggingTool || draggingToolRef.current
    if (!source) return
    event.preventDefault()
    event.stopPropagation()
    moveToolRail(source, target.classList.contains('left-rail') ? 'left' : 'right')
    setToolDragState(null)
  }

  function systemTerminalCount(current: Model) {
    let count = 0
    current.visitNodes((node) => {
      if (node instanceof TabNode && node.getComponent() === 'system-terminal') count++
    })
    return count
  }

  function closePanel(id: string) {
    openToolIdsRef.current.delete(id)
    const node = model.getNodeById(id)
    let parent = node?.getParent()
    while (parent && !(parent instanceof BorderNode)) parent = parent.getParent()
    if (parent instanceof BorderNode) {
      if (node instanceof TabNode && node.getComponent() === 'system-terminal') {
        model.doAction(Actions.deleteTab(id))
        const remaining = parent.getTabNodes()
        if (remaining.length) model.doAction(Actions.updateNodeAttributes(parent.getId(), { show: true, selected: 0 }))
        else model.doAction(Actions.updateNodeAttributes(parent.getId(), { show: false, selected: -1 }))
      } else model.doAction(Actions.updateNodeAttributes(parent.getId(), { show: false, selected: -1 }))
    } else if (node) model.doAction(Actions.deleteTab(id))
    if (useWorkbench.getState().toolPanel === id) useWorkbench.setState({ toolPanel: '' })
  }
  function clearWorkspaceSurface() {
    const staleIds: string[] = []
    model.visitNodes((node) => {
      if (!(node instanceof TabNode)) return
      if (node.getComponent() === 'file' || node.getComponent() === 'git' || node.getComponent() === 'browser' ||
        node.getComponent() === 'inspector' || node.getComponent() === 'plan' || node.getComponent() === 'insights' ||
        node.getComponent() === 'activity' || node.getComponent() === 'diagnose' || node.getComponent() === 'settings' ||
        node.getComponent() === 'plugin') staleIds.push(node.getId())
    })
    for (const id of staleIds) closePanel(id)
    openToolIdsRef.current.clear()
    useWorkbench.setState({ toolPanel: '' })
    setMobileFile('')
    setMobilePanel('')
    if (small) setMobileView('chat')
  }
  function activateConversationView(view: 'chat' | 'console') {
    const key = activeSession || 'new'
    setConversationViews((current) => ({ ...current, [key]: view }))
    const target =
      conversationTabs(model).find((tab) => sessionIdFromTab(tab) === activeSession) ?? conversationTabs(model)[0]
    if (target) model.doAction(Actions.selectTab(target.getId()))
    const legacyTerminal = model.getNodeById('terminal')
    if (legacyTerminal) closePanel('terminal')
    useWorkbench.setState({ toolPanel: '' })
    if (small) setMobileView('chat')
  }
  function toggleGalleryTool(
    id: string,
    title: string,
    component: string,
    config?: Record<string, unknown>,
    placement = 'right',
  ) {
    const panelId = id.startsWith('plugin:') ? id.slice('plugin:'.length) : id
    const nativeWindow = nativeToolWindows.current.get(panelId)
    if (nativeWindow) {
      void nativeWindow.focus().catch(report)
      return
    }
    const existing = model.getNodeById(id) ?? (id.startsWith('plugin:') ? undefined : model.getNodeById(`plugin:${id}`))
    if (existing instanceof TabNode) {
      // FlexLayout can keep a border tab selected while another editor tab
      // (for example Settings) is active.  The Zustand toolPanel is the
      // authoritative visible-tool state; the model selection alone must
      // not turn a subsequent click into an accidental close.
      const selected = useWorkbench.getState().toolPanel === id
      if (selected) {
        closePanel(id)
        if (small) setMobileView('chat')
        return
      }
      const selectedEditorTab = selectedLayoutTab(model)
      if (selectedEditorTab?.getComponent() !== 'conversation') {
        const conversation = conversationTabs(model)[0]
        if (conversation) model.doAction(Actions.selectTab(conversation.getId()))
      }
      openPanel(id, title, component, config, placement)
      return
    }
    if (openToolIdsRef.current.has(id) && existing) {
      let parent = existing.getParent()
      while (parent && !(parent instanceof BorderNode)) parent = parent.getParent()
      const selected =
        useWorkbench.getState().toolPanel === id ||
        (parent instanceof BorderNode
          ? parent.isShowing() && parent.getSelectedNode()?.getId() === id
          : existing instanceof TabNode && existing.isSelected())
      if (selected) {
        closePanel(id)
        if (small) setMobileView('chat')
        return
      }
      if (parent instanceof BorderNode) {
        const index = parent.getTabNodes().findIndex((tab) => tab.getId() === id)
        model.doAction(Actions.updateNodeAttributes(parent.getId(), { show: true, ...(index >= 0 ? { selected: index } : {}) }))
      } else if (existing instanceof TabNode) {
        model.doAction(Actions.selectTab(id))
      }
      useWorkbench.setState({ toolPanel: id })
      if (small) setMobileView(MOBILE_VIEW_BY_COMPONENT[component] ?? 'chat')
      return
    }
    let existingParent = existing?.getParent()
    while (existingParent && !(existingParent instanceof BorderNode)) existingParent = existingParent.getParent()
    const selectedInBorder = existing instanceof TabNode && existingParent instanceof BorderNode &&
      existingParent.isShowing() && existingParent.getSelectedNode()?.getId() === existing.getId()
    if (toolPanel === id || selectedInBorder || (existing instanceof TabNode && !(existingParent instanceof BorderNode) && existing.isSelected())) {
      let parent = existing?.getParent()
      while (parent && !(parent instanceof BorderNode)) parent = parent.getParent()
      if (parent instanceof BorderNode)
        {
          model.doAction(Actions.updateNodeAttributes(parent.getId(), { show: false, selected: -1 }))
          const fallback = conversationTabs(model)[0]
          if (fallback) model.doAction(Actions.selectTab(fallback.getId()))
        }
      else closePanel(id)
      useWorkbench.setState({ toolPanel: '' })
      if (small) setMobileView('chat')
      return
    }
    openPanel(id, title, component, config, model.getNodeById(id) ? toolDock(id) : placement)
  }
  const settings = () => openPanel('settings', t('settingsTitle'), 'settings')
  const toggleSettings = () => {
    const existing = model.getNodeById('settings')
    if (existing instanceof TabNode && useWorkbench.getState().toolPanel === 'settings') {
      closePanel('settings')
      return
    }
    if (existing instanceof TabNode) {
      let parent = existing.getParent()
      while (parent && !(parent instanceof BorderNode)) parent = parent.getParent()
      if (parent instanceof BorderNode)
        model.doAction(Actions.updateNodeAttributes(parent.getId(), { show: true, selected: parent.getTabNodes().indexOf(existing) }))
      else model.doAction(Actions.selectTab(existing.getId()))
      useWorkbench.setState({ toolPanel: 'settings' })
      return
    }
    openPanel('settings', t('settingsTitle'), 'settings', undefined, 'editor')
  }
  function closeWorkspaceModal() {
    setWorkspaceModal(false)
    setWorkspacePaths([])
    setWorkspaceAlias('')
    setDiscoveredWorktrees([])
    setSelectedWorktreePaths([])
    setWorkspaceCreateErrors([])
    setWorkspaceCreateBusy(false)
  }
  async function chooseWorkspaceDirectory() {
    try {
      const selected = await (await platform()).pickDirectory()
      if (selected) {
        const normalized = normalizeWorkspacePath(selected)
        setWorkspacePaths((current) => current.some((item) => workspacePathKey(item) === workspacePathKey(normalized)) ? current : [...current, normalized])
      }
    } catch (error) {
      report(error)
    }
  }
  async function createWorkspaces(retryPaths?: readonly string[]) {
    const paths = [...(retryPaths ?? workspacePaths)]
    if (!paths.length) return
    if (workspaceCreateBusy) return
    setWorkspaceCreateBusy(true)
    setWorkspaceCreateErrors([])
    try {
      const discovered = new Map<string, string>()
      for (const path of retryPaths ? paths : [...paths, ...selectedWorktreePaths]) {
        const key = workspacePathKey(path)
        if (!discovered.has(key)) discovered.set(key, path)
      }
      const pathsToCreate = [...discovered.values()]
      const alias = retryPaths ? '' : workspaceAlias.trim()
      const created: Array<{ id: string }> = []
      const failures: Array<{ path: string; message: string; retryable: boolean }> = []
      for (const path of pathsToCreate) {
        const name = alias && pathsToCreate.length === 1 ? alias : undefined
        try {
          created.push(await client().call('workspace.create', { path, ...(name ? { name } : {}) }))
        } catch (error) {
          failures.push({ path, message: error instanceof Error ? error.message : String(error), retryable: true })
        }
      }
      if (created.length) {
        try {
          await refreshCatalog()
          useWorkbench.setState({ workspaceId: created.at(-1)?.id ?? '' })
        } catch (error) {
          failures.push({ path: t('workspaceRefreshFailed'), message: error instanceof Error ? error.message : String(error), retryable: false })
        }
      }
      if (failures.length) {
        setWorkspaceCreateErrors(failures)
        return
      }
      closeWorkspaceModal()
    } catch (error) {
      setWorkspaceCreateErrors([{ path: t('workspaceCreateFailed'), message: error instanceof Error ? error.message : String(error), retryable: false }])
    } finally {
      setWorkspaceCreateBusy(false)
    }
  }
  async function useWorktreePath(path: string) {
    const connection = client()
    const startingWorkspaceId = useWorkbench.getState().workspaceId
    const startingSessionId = useWorkbench.getState().activeSession
    const currentData = useCatalog.getState().data
    const normalizedPath = normalizeWorkspacePath(path)
    const existing = currentData?.workspaces.find((workspace) => workspacePathKey(workspace.path) === workspacePathKey(normalizedPath))
    const target = existing ?? await connection.call('workspace.create', { path: normalizedPath })
    if (useConnection.getState().client !== connection || useWorkbench.getState().workspaceId !== startingWorkspaceId || useWorkbench.getState().activeSession !== startingSessionId)
      throw new Error(t('worktreeContextChanged'))
    const currentSession = currentData?.sessions.find((session) => session.id === startingSessionId)
    if (startingSessionId && currentSession && currentSession.workspaceId !== target.id)
      await connection.call('session.move', { sessionId: startingSessionId, workspaceId: target.id })
    if (useConnection.getState().client !== connection) throw new Error(t('connectionChanged'))
    await refreshCatalog()
    if (useConnection.getState().client !== connection) throw new Error(t('connectionChanged'))
    clearWorkspaceSurface()
    useWorkbench.setState({ workspaceId: target.id })
    if (startingSessionId) await openSession(startingSessionId)
  }
  function openSessionTab(session: Session) {
    initialSelection.current = false
    const tabs = conversationTabs(model)
    const target = tabs.find((tab) => sessionIdFromTab(tab) === session.id) ?? tabs[0]
    switchingSession.current = true
    try {
      if (target) {
        const currentConfig = sessionTabConfig(target)
        model.doAction(
          Actions.updateNodeAttributes(target.getId(), {
            name: session.title,
            enableClose: true,
            config: { ...currentConfig, sessionId: session.id },
          }),
        )
        for (const extra of tabs) if (extra.getId() !== target.getId()) model.doAction(Actions.deleteTab(extra.getId()))
        model.doAction(Actions.selectTab(target.getId()))
      } else {
        const id = `session:${session.id}`
        model.doAction(
          Actions.addNode(
            {
              type: 'tab',
              id,
              name: session.title,
              component: 'conversation',
              enableClose: true,
              config: { sessionId: session.id },
            },
            model.getNodeById('main') ? 'main' : (model.getActiveTabset()?.getId() ?? 'main'),
            DockLocation.CENTER,
            -1,
          ),
        )
        model.doAction(Actions.selectTab(id))
      }
    } finally {
      switchingSession.current = false
    }
    void openSession(session.id).catch(report)
    setMobileView('chat')
  }
  function clearSessionTab() {
    const tabs = conversationTabs(model)
    const target = tabs[0]
    if (!target) return
    switchingSession.current = true
    try {
      const config = sessionTabConfig(target)
      const { sessionId: _sessionId, ...withoutSession } = config
      model.doAction(
        Actions.updateNodeAttributes(target.getId(), {
          name: t('newSession'),
          enableClose: false,
          config: withoutSession,
        }),
      )
      for (const extra of tabs.slice(1)) model.doAction(Actions.deleteTab(extra.getId()))
      model.doAction(Actions.selectTab(target.getId()))
    } finally {
      switchingSession.current = false
    }
  }
  function selectWorkspace(nextWorkspaceId: string) {
    if (!nextWorkspaceId || nextWorkspaceId === workspaceId) return
    const previousSession = useWorkbench.getState().activeSession
    clearWorkspaceSurface()
    useWorkbench.setState({ workspaceId: nextWorkspaceId, activeSession: '' })
    if (previousSession) void client().unfollow(previousSession).catch(report)
    clearSessionTab()
    if (small) setMobileView('chat')
  }
  async function newSession() {
    if (creatingSession.current) return
    const targetWorkspaceId = workspaceId || data?.workspaces[0]?.id || ''
    if (!targetWorkspaceId) {
      setWorkspaceModal(true)
      return
    }
    creatingSession.current = true
    setIsCreatingSession(true)
    try {
      if (!workspaceId) useWorkbench.setState({ workspaceId: targetWorkspaceId })
      const session = await client().call('session.create', { workspaceId: targetWorkspaceId })
      await refreshCatalog()
      openSessionTab(session)
    } catch (error) {
      report(error)
    } finally {
      creatingSession.current = false
      setIsCreatingSession(false)
    }
  }
  function selectSession(id: string) {
    const session = data?.sessions.find((item) => item.id === id)
    if (session) openSessionTab(session)
    else void openSession(id).catch(report)
  }
  function openFile(path: string) {
    setMobileFile(path)
    openPanel(`file:${workspaceId}:${path}`, path.split('/').at(-1)!, 'file', { path, workspaceId })
  }
  const paletteCommands: readonly PaletteCommand[] = [
    {
      id: 'new-session',
      label: t('newSession'),
      description: t('newSessionDescription'),
      keywords: ['session', 'create'],
      icon: Plus,
      group: 'actions',
      execute: () => void newSession(),
    },
    {
      id: 'toggle-sidebar',
      label: sidebar ? t('collapseSidebar') : t('expandSidebar'),
      keywords: ['sidebar', 'navigation'],
      icon: sidebar ? PanelLeftClose : PanelLeftOpen,
      group: 'navigation',
      execute: () => {
        if (small) setMobileView(mobileView === 'sessions' ? 'chat' : 'sessions')
        else setSidebar((visible) => !visible)
      },
    },
    {
      id: 'open-files',
      label: t('openFile'),
      description: t('browseProjectFiles'),
      keywords: ['file', 'files'],
      icon: Folder,
      group: 'navigation',
      execute: () => {
        useWorkbench.setState({ panel: 'files' })
        if (small) setMobileView('files')
        else setSidebar(true)
      },
    },
    {
      id: 'open-terminal',
      label: t('openCommandConsole'),
      description: t('commandConsoleDescription'),
      keywords: ['terminal', 'console'],
      icon: TerminalSquare,
      group: 'navigation',
      execute: () => activateConversationView('console'),
    },
    {
      id: 'open-system-terminal',
      label: t('openSystemTerminal'),
      description: t('systemTerminalDescription'),
      keywords: ['terminal', 'shell', 'pty'],
      icon: TerminalSquare,
      group: 'navigation',
      execute: () => openPanel('system-terminal', t('systemTerminalTitle'), 'system-terminal', undefined, 'bottom'),
    },
    {
      id: 'open-settings',
      label: t('openSettings'),
      description: t('settingsDescription'),
      keywords: ['settings', 'preferences', 'theme'],
      icon: Settings2,
      group: 'navigation',
      execute: settings,
    },
    {
      id: 'open-reactbits-reference-gallery',
      label: t('openReferenceGallery'),
      description: t('referenceGalleryDescription'),
      keywords: ['reactbits', 'reference', 'gallery', 'ui', 'variants'],
      icon: LayoutGrid,
      group: 'navigation',
      execute: () => setReferenceGalleryOpen(true),
    },
    {
      id: 'open-activity',
      label: t('openActivity'),
      description: t('activityDescription'),
      keywords: ['activity', 'events', 'runs'],
      icon: Activity,
      group: 'navigation',
      execute: () => openPanel('activity', t('runs'), 'activity', undefined, 'right'),
    },
    {
      id: 'open-git',
      label: t('openGit'),
      description: t('gitDescription'),
      keywords: ['git', 'changes', 'diff', 'branch', 'commit'],
      icon: GitBranch,
      group: 'navigation',
      execute: () => openPanel('git', 'Git', 'git', undefined, 'right'),
    },
    {
      id: 'restore-layout',
      label: t('restoreLayout'),
      description: t('restoreLayoutDescription'),
      keywords: ['layout', 'reset', 'restore'],
      icon: LayoutGrid,
      group: 'actions',
      execute: () => {
        useWorkbench.setState({ layout: null, toolPanel: '' })
        setModel(Model.fromJson(defaultLayout()))
      },
    },
  ]
  function factory(node: TabNode) {
    const config = node.getConfig() as { sessionId?: string; path?: string; workspaceId?: string; panelId?: string }
    switch (node.getComponent()) {
      case undefined:
        return <div className="empty-tool">{t('panelUnavailable')}</div>
      case 'conversation': {
        const viewKey = config?.sessionId ?? 'new'
        return (
          <Chat
            {...(config?.sessionId ? { sessionId: config.sessionId } : {})}
            onSettings={settings}
            view={conversationViews[viewKey] ?? 'chat'}
            onViewChange={(view) => setConversationViews((current) => ({ ...current, [viewKey]: view }))}
            onSelectSession={(id) => {
              setConversationViews((current) => ({ ...current, [id]: 'console' }))
              selectSession(id)
            }}
            onUseWorktree={useWorktreePath}
          />
        )
      }
      case 'settings':
        return <Settings />
      case 'system-terminal':
        return <SystemTerminalPanel workspaceId={workspaceId} onClose={() => closePanel(node.getId())} />
      case 'system-terminal-placeholder':
        return null
      case 'activity':
        return <ActivityPanel />
      case 'git':
        return (
          <GitPanel workspacePath={data?.workspaces.find((workspace) => workspace.id === workspaceId)?.path ?? ''} />
        )
      case 'browser':
        return <BrowserPanel sessionId={activeSession} />
      case 'inspector':
        return <SessionInspectorPanel sessionId={activeSession} />
      case 'plan':
        return <PlanPanel sessionId={activeSession} />
      case 'insights':
        return <InsightsPanel sessionId={activeSession} />
      case 'file':
        return <FileViewer path={config.path!} workspaceId={config.workspaceId!} />
      case 'diagnose':
        return <Diagnose />
      case 'plugin':
        return renderPlugin(config.panelId ?? '', toolDock(node.getId()), node)
      default:
        return <div className="empty-tool">{t('panelUnavailable')}</div>
    }
  }
  function renderPlugin(
    panelId: string,
    dock: ToolWindowProps['dock'] = 'right',
    node?: TabNode,
    hostWindow?: Window,
    hostDocument?: Document,
  ) {
    const panel = clientPanels.find((p) => p.id === panelId)
    const ClientPanel = panel?.component
    const panelWindow = hostWindow ?? node?.getWindow()
    const panelDocument = hostDocument ?? node?.getDocument()
    if (ClientPanel)
      return (
        <div className="plugin-panel rb-plugin-panel">
          <GlassSurface className="plugin-panel-glass" width="100%" height="100%" aria-hidden="true" />
          <ClientPanel
            panelId={panelId}
            owner={panel.owner}
            dock={dock}
            {...(panelWindow ? { window: panelWindow } : {})}
            {...(panelDocument ? { document: panelDocument } : {})}
            {...(workspaceId ? { workspaceId } : {})}
            {...(activeSession ? { sessionId: activeSession } : {})}
          />
        </div>
      )
    const contribution = data?.panels.find((p) => p.id === panelId)
    return contribution ? (
      <div className="plugin-panel rb-plugin-panel">
        <GlassSurface className="plugin-panel-glass" width="100%" height="100%" aria-hidden="true" />
        {contribution.kind === 'markdown' ? (
          <Markdown text={contribution.content} />
        ) : (
          <pre>{contribution.content}</pre>
        )}
      </div>
    ) : (
      <div className="empty-tool">{t('pluginDisabled')}</div>
    )
  }
  if (status === 'pairing' || (!data && status !== 'connected')) return <><ThemeRuntimeSync /><PairingPage /></>
  if (detachedPanelId && data) {
    const detachedContribution = [...(data.panels ?? []), ...clientPanels].find((panel) => panel.id === detachedPanelId)
    if (detachedContribution)
      return <><ThemeRuntimeSync /><div className="detached-tool-window">{renderPlugin(detachedPanelId, 'window', undefined, window, document)}</div></>
  }
  return (
    <>
      <ThemeRuntimeSync />
      <div
        {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/app-shell/app-shell-4', 'bootstrap-shell')}
        className="app-shell"
        onDragOver={handleToolRailDragOver}
        onDropCapture={handleToolRailDrop}
      >
      <WorkbenchHeader
        status={status}
        host={host}
        workspaces={data?.workspaces ?? []}
        workspaceId={workspaceId}
        sidebarOpen={sidebar}
        compact={small}
        onToggleSidebar={() => {
          if (small) setMobileView(mobileView === 'sessions' ? 'chat' : 'sessions')
          else setSidebar((visible) => !visible)
        }}
        onSelectWorkspace={selectWorkspace}
        onAddWorkspace={() => setWorkspaceModal(true)}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
      />
      <div
        className={`main-frame ${sidebar ? '' : 'sidebar-collapsed'}`}
        style={{ '--sidebar-width': `${sidebarWidth}px` } as CSSProperties}
      >
        <aside
          {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/app-sidebar', 'bootstrap-shell')}
          className="sidebar"
        >
          <GlassSurface className="chrome-glass" width="100%" height="100%" aria-hidden="true" />
          {panel === 'sessions' ? (
            <Sessions onSelect={selectSession} onNew={() => void newSession()} onAddWorkspace={() => setWorkspaceModal(true)} creating={isCreatingSession} />
          ) : (
            <FileNavigation workspaceId={workspaceId} onOpen={openFile} />
          )}
          {!small && sidebar && (
            <div
              className="sidebar-resizer"
              role="separator"
              aria-label={t('resizeSidebar')}
              aria-orientation="vertical"
              aria-valuemin={SIDEBAR_MIN_WIDTH}
              aria-valuemax={SIDEBAR_MAX_WIDTH}
              aria-valuenow={sidebarWidth}
              tabIndex={0}
              onPointerDown={(event) => {
                event.preventDefault()
                sidebarDrag.current = { startX: event.clientX, startWidth: sidebarWidth }
                document.body.classList.add('resizing-sidebar')
                event.currentTarget.setPointerCapture?.(event.pointerId)
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                  event.preventDefault()
                  useWorkbench.setState({
                    sidebarWidth: Math.min(
                      SIDEBAR_MAX_WIDTH,
                      Math.max(SIDEBAR_MIN_WIDTH, sidebarWidth + (event.key === 'ArrowRight' ? 8 : -8)),
                    ),
                  })
                }
              }}
            />
          )}
        </aside>
        <WorkbenchToolRails
          side="left"
          showPrimary={false}
          panel={panel}
          toolPanel={toolPanel}
          diagnosePanelId={DIAGNOSE_PANEL_ID}
          contributions={[...(data?.panels ?? []), ...clientPanels]}
          onSelectPrimary={(nextPanel) => {
            useWorkbench.setState({ panel: nextPanel })
            setSidebar(true)
          }}
          onToggleTool={(id, title, component, placement, config) => toggleGalleryTool(id, title, component, config, placement)}
          onDragState={setToolDragState}
          toolOrder={toolRailOrder}
          toolSides={toolRailSides}
          onMoveTool={moveToolRail}
          onReorderTool={reorderToolRail}
        />
        <main
          {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/app-shell', 'bootstrap-shell')}
          className="workbench"
        >
          {small ? (
            <>
              {mobileView === 'sessions' ? (
                <Sessions onSelect={selectSession} onNew={() => void newSession()} onAddWorkspace={() => setWorkspaceModal(true)} creating={isCreatingSession} />
              ) : mobileView === 'settings' ? (
                <Settings />
              ) : mobileView === 'activity' ? (
                <ActivityPanel />
              ) : mobileView === 'git' ? (
                <GitPanel
                  workspacePath={data?.workspaces.find((workspace) => workspace.id === workspaceId)?.path ?? ''}
                />
              ) : mobileView === 'files' ? (
                <FileNavigation workspaceId={workspaceId} onOpen={openFile} />
              ) : mobileView === 'file' ? (
                <FileViewer path={mobileFile} workspaceId={workspaceId} />
              ) : mobileView === 'diagnose' ? (
                <Diagnose />
              ) : mobileView === 'browser' ? (
                <BrowserPanel sessionId={activeSession} />
              ) : mobileView === 'inspector' ? (
                <SessionInspectorPanel sessionId={activeSession} />
              ) : mobileView === 'plan' ? (
                <PlanPanel sessionId={activeSession} />
              ) : mobileView === 'insights' ? (
                <InsightsPanel sessionId={activeSession} />
              ) : mobileView === 'system-terminal' ? (
                <SystemTerminalPanel workspaceId={workspaceId} onClose={() => setMobileView('chat')} />
              ) : mobileView === 'plugin' ? (
                renderPlugin(mobilePanel)
              ) : mobileView === 'plugins' ? (
                <MobileToolMenu
                  contributions={[...(data?.panels ?? []), ...clientPanels]}
                  onClose={() => setMobileView('chat')}
                  onOpenTool={(id, title, component, placement, config) => {
                    if (component === 'terminal') activateConversationView('console')
                    else if (component === 'system-terminal') setMobileView('system-terminal')
                    else openPanel(id, title, component, config, placement)
                  }}
                />
              ) : (
                <Chat
                  sessionId={activeSession}
                  onSettings={settings}
                  view={conversationViews[activeSession || 'new'] ?? 'chat'}
                  onViewChange={(view) =>
                    setConversationViews((current) => ({ ...current, [activeSession || 'new']: view }))
                  }
                  onSelectSession={(id) => {
                    setConversationViews((current) => ({ ...current, [id]: 'console' }))
                    selectSession(id)
                  }}
                  onUseWorktree={useWorktreePath}
                />
              )}
            </>
          ) : (
            <Layout
              model={model}
              factory={factory}
              onModelChange={(next, action) => {
                useWorkbench.setState({ layout: versionedLayout(next.toJson()) })
                const selectedTool = useWorkbench.getState().toolPanel
                if (selectedTool) {
                  const selectedNode = next.getNodeById(selectedTool)
                  let owner = selectedNode?.getParent()
                  while (owner && !(owner instanceof BorderNode)) owner = owner.getParent()
                  if (!selectedNode || (owner instanceof BorderNode && !owner.isShowing()))
                    useWorkbench.setState({ toolPanel: '' })
                }
                const previous = useWorkbench.getState().activeSession
                if (
                  !switchingSession.current &&
                  [Actions.DELETE_TAB, Actions.DELETE_TABSET].includes(action.type) &&
                  previous &&
                  !next.getNodeById(`session:${previous}`)
                ) {
                  const selected = next.getActiveTabset()?.getSelectedNode()
                  const id =
                    selected instanceof TabNode && selected.getComponent() === 'conversation'
                      ? (selected.getConfig() as { sessionId?: string })?.sessionId
                      : undefined
                  if (id) void openSession(id).catch(report)
                  else {
                    useWorkbench.setState({ activeSession: '' })
                    switchingSession.current = true
                    try {
                      const welcome = ensureWelcomeTab(next, t('newSession'))
                      if (welcome) next.doAction(Actions.selectTab(welcome))
                    } finally {
                      switchingSession.current = false
                    }
                    void client().unfollow(previous).catch(report)
                  }
                }
                if (!switchingSession.current && action.type === Actions.SELECT_TAB) {
                  const tabNode = (action.data as { tabNode?: unknown }).tabNode
                  if (typeof tabNode === 'string') {
                    const node = next.getNodeById(tabNode)
                    if (node instanceof TabNode && node.getComponent() === 'conversation') {
                      initialSelection.current = false
                      useWorkbench.setState({ toolPanel: '' })
                      const id = (node.getConfig() as { sessionId?: string })?.sessionId
                      if (id && id !== useWorkbench.getState().activeSession) void openSession(id).catch(report)
                      else if (!id) {
                        const previous = useWorkbench.getState().activeSession
                        useWorkbench.setState({ activeSession: '' })
                        if (previous) void client().unfollow(previous).catch(report)
                      }
                    } else if (node instanceof TabNode) {
                      let owner = node.getParent()
                      while (owner && !(owner instanceof BorderNode)) owner = owner.getParent()
                      if (owner instanceof BorderNode || node.getComponent() !== 'conversation')
                        useWorkbench.setState({ toolPanel: node.getId() })
                    }
                  }
                }
              }}
              supportsPopout={!small}
              popoutURL="/popout.html"
              popoutWindowName="hbar Tool Window"
              onRenderTab={(node, renderValues) => {
                if (!node) {
                  renderValues.leading = <LayoutGrid size={13} aria-hidden="true" />
                  return
                }
                const config = (node.getConfig() ?? {}) as { panelId?: string }
                const panelId = config.panelId
                const contribution = panelId
                  ? [...(data?.panels ?? []), ...clientPanels].find((panel) => panel.id === panelId)
                  : undefined
                const componentIcons: Record<string, typeof LayoutGrid> = {
                  activity: Activity,
                  browser: Globe,
                  diagnose: CircleHelp,
                  git: GitBranch,
                  inspector: FileSearch,
                  insights: BarChart3,
                  plan: ListChecks,
                  settings: Settings2,
                  'system-terminal': TerminalSquare,
                }
                const component = node.getComponent()
                const Icon = contribution?.icon
                  ? TOOL_WINDOW_TAB_ICONS[contribution.icon] ?? LayoutGrid
                  : (component ? componentIcons[component] : undefined) ?? LayoutGrid
                renderValues.leading = <Icon size={13} aria-hidden="true" />
              }}
            />
          )}
        </main>
        <WorkbenchToolRails
          side="right"
          panel={panel}
          toolPanel={toolPanel}
          diagnosePanelId={DIAGNOSE_PANEL_ID}
          contributions={[...(data?.panels ?? []), ...clientPanels]}
          onSelectPrimary={(nextPanel) => {
            useWorkbench.setState({ panel: nextPanel })
            setSidebar(true)
          }}
           onToggleTool={(id, title, component, placement, config) => toggleGalleryTool(id, title, component, config, placement)}
          onDragState={setToolDragState}
          toolOrder={toolRailOrder}
          toolSides={toolRailSides}
          onMoveTool={moveToolRail}
          onReorderTool={reorderToolRail}
        />
      </div>
      {draggingTool?.startsWith('plugin:') && !BUILTIN_TOOL_IDS.has(draggingTool.slice('plugin:'.length)) && (
        <DockTargetOverlay
          allowedDocks={dragAllowedDocks}
          onDrop={(dock) => {
            moveToolToDock(draggingTool, dock)
            setDraggingTool(null)
          }}
        />
      )}
      <button
        type="button"
        className="global-settings-action"
        title={t('settingsTitle')}
        aria-label={t('settingsTitle')}
        onClick={toggleSettings}
      >
        <Settings2 size={17} aria-hidden="true" />
      </button>
      <WorkbenchStatusBar
        workspacePath={data?.workspaces.find((workspace) => workspace.id === workspaceId)?.path ?? 'Workspace'}
        modelLabel={data?.models.find((model) => model.id === modelId)?.name ?? 'Provider'}
        permissionLabel={permissionPreset(approvalMode).shortLabel}
        running={Boolean(activeSnapshot?.runs.some((run) => ['running', 'waiting_approval'].includes(run.status)))}
        contextTokens={activeSnapshot ? activeSnapshot.usage.input + activeSnapshot.usage.output : 0}
        activeRuns={host?.activeRuns ?? 0}
      />
      <MobileNavigation mobileView={mobileView} onSetMobileView={setMobileView} />
      {notice && (
        <div
          className="toast"
          role="alert"
          tabIndex={0}
          onMouseEnter={() => setToastPaused(true)}
          onMouseLeave={() => setToastPaused(false)}
          onFocus={() => setToastPaused(true)}
          onBlur={() => setToastPaused(false)}
        >
          <span>{notice}</span>
          <button title={t('closeNotification')} aria-label={t('closeNotification')} onClick={() => useNotice.setState({ error: '' })}>
            <X size={15} />
          </button>
        </div>
      )}
      {taskNotice && !notice && (
        <div className="toast task-toast" role="status" tabIndex={0}>
          <span>{taskNotice}</span>
          <button title={t('closeNotification')} aria-label={t('closeNotification')} onClick={() => useNotice.setState({ notice: '' })}>
            <X size={15} />
          </button>
        </div>
      )}
      <CommandPalette open={commandPaletteOpen} commands={paletteCommands} onClose={closeCommandPalette} />
      <ReferenceGallery open={referenceGalleryOpen} onClose={() => setReferenceGalleryOpen(false)} />
      {workspaceModal && (
        <Modal title={t('addWorkspace')} onClose={closeWorkspaceModal}>
          <form
            className="settings-form"
            onSubmit={(event) => {
              event.preventDefault()
              void createWorkspaces()
            }}
          >
            <label>
              {t('projectAliasOptional')}
              <input
                autoFocus
                value={workspaceAlias}
                onChange={(event) => setWorkspaceAlias(event.target.value)}
                placeholder={t('defaultDirectoryName')}
                maxLength={160}
              />
            </label>
            <div className="workspace-picker">
              <div className="workspace-picker-heading">
                <span>{t('workspaceDirectory')}</span>
                <button type="button" className="button" onClick={() => void chooseWorkspaceDirectory()}>
                  <FolderOpen size={14} />
                  {t('browseFolders')}
                </button>
              </div>
              {workspacePaths.length ? (
                <ul className="workspace-picker-list">
                  {workspacePaths.map((path) => (
                    <li key={path}>
                      <span title={path}>{path}</span>
                      <button
                        type="button"
                        title={`${t('remove')} ${path}`}
                        aria-label={`${t('remove')} ${path}`}
                        onClick={() => setWorkspacePaths((current) => current.filter((item) => item !== path))}
                      >
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="workspace-picker-empty">{t('chooseFolders')}</p>
              )}
              {discoveredWorktrees.length > 0 && (
                <div className="workspace-worktree-discovery" aria-label={t('externalWorktreesDetected')}>
                  <strong>{t('otherWorktreesDetected')}</strong>
                  {discoveredWorktrees.map((item) => {
                    const checked = selectedWorktreePaths.includes(item.path)
                    return (
                      <label key={item.path} className="workspace-worktree-option">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setSelectedWorktreePaths((current) => checked ? current.filter((path) => path !== item.path) : [...current, item.path])}
                        />
                        <span><b>{item.branch ?? t('detachedHead')}</b><small title={item.path}>{item.path}</small></span>
                      </label>
                    )
                  })}
                </div>
              )}
              {workspaceCreateErrors.length > 0 && (
                <div className="workspace-create-errors" role="alert">
                  <strong>{t('partialWorkspaceFailure')}</strong>
                  <ul>
                    {workspaceCreateErrors.map((failure) => (
                      <li key={`${failure.path}:${failure.message}`}>
                        <span title={failure.path}>{failure.path}</span>
                        <small>{failure.message}</small>
                      </li>
                    ))}
                  </ul>
                  {workspaceCreateErrors.some((failure) => failure.retryable) && (
                    <button
                      type="button"
                      className="button"
                      disabled={workspaceCreateBusy}
                      onClick={() => void createWorkspaces(workspaceCreateErrors.filter((failure) => failure.retryable).map((failure) => failure.path))}
                    >
                      {t('retryFailedItems')}
                    </button>
                  )}
                </div>
              )}
              {workspacePaths.length > 1 && <p className="workspace-picker-hint">{t('multipleDirectoryHint')}</p>}
            </div>
            <footer className="modal-footer">
              <button className="button primary" disabled={!workspacePaths.length || workspaceCreateBusy}>
                <FolderOpen size={14} />
                {workspaceCreateBusy ? t('joining') : t('openWorkspace')}
              </button>
            </footer>
          </form>
        </Modal>
      )}
      </div>
    </>
  )
}
