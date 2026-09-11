import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Actions, BorderNode, DockLocation, Layout, Model, TabNode } from 'flexlayout-react'
import {
  Activity,
  Archive,
  Folder,
  FolderOpen,
  GitBranch,
  LayoutGrid,
  LoaderCircle,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  Settings2,
  TerminalSquare,
  X,
} from 'lucide-react'
import type { Session } from '@hbar/contracts'
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
  useWorkbench,
} from './stores'
import { platform } from './platform'
import Chat from './Chat'
import Settings, { Modal } from './Settings'
import Markdown from './Markdown'
import { syncUIPlugins, useUIPlugins } from './ui-plugins'
import { permissionPreset } from './permissions'
import { defaultLayout, restoreLayout, versionedLayout } from './workbench/layout'
import PairingPage from './PairingPage'
import { BrowserPanel, InsightsPanel, PlanPanel, SessionInspectorPanel } from './SessionTools'
import CommandPalette, { type PaletteCommand } from './CommandPalette'
import Diagnose from './DiagnosePanel'
import SpotlightCard from './react-bits/SpotlightCard'
import GlassSurface from './react-bits/GlassSurface'
import AnimatedList from './react-bits/AnimatedList'
import ActivityPanel from './ActivityPanel'
import GitPanel from './GitPanel'
import WorkbenchHeader from './workbench/WorkbenchHeader'
import { MobileNavigation, MobileToolMenu, WorkbenchToolRails } from './workbench/WorkbenchNavigation'
import WorkbenchStatusBar from './workbench/WorkbenchStatusBar'
import { FileNavigation, FileViewer } from './FileNavigation'
import SystemTerminalPanel from './SystemTerminalPanel'
import 'flexlayout-react/style/dark.css'
const DIAGNOSE_PANEL_ID = 'diagnose-right'
const DEFAULT_TOOL_RAIL_ORDER = [
  'browser',
  'git',
  'inspector',
  'plan',
  'insights',
  'activity',
  'settings',
  'diagnose',
] as const
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

function ensureWelcomeTab(model: Model): string | undefined {
  const existing = conversationTabs(model).find((tab) => !sessionIdFromTab(tab))
  if (existing) return existing.getId()

  const id = model.getNodeById('welcome') ? 'welcome:fallback' : 'welcome'
  const parentId = model.getNodeById('main') ? 'main' : model.getActiveTabset()?.getId()
  if (!parentId) return undefined
  model.doAction(
    Actions.addNode(
      { type: 'tab', id, name: '新会话', component: 'conversation', enableClose: false },
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
  creating = false,
}: {
  onSelect(id: string): void
  onNew(): void
  creating?: boolean
}) {
  type SessionActionKind = 'fork' | 'archive'
  const [search, setSearch] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)
  const [sessionActions, setSessionActions] = useState<Record<string, SessionActionKind>>({})
  const sessionActionIds = useRef(new Set<string>())
  const data = useCatalog((state) => state.data),
    workspaceId = useWorkbench((state) => state.workspaceId),
    selected = useWorkbench((state) => state.activeSession),
    archived = useWorkbench((state) => state.showArchived)
  const sessions =
    data?.sessions.filter(
      (s) =>
        s.workspaceId === workspaceId &&
        s.archived === archived &&
        s.title.toLowerCase().includes(search.toLowerCase()),
    ) ?? []
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
    <div className="session-nav">
      <div className="sidebar-heading">
        <strong>{archived ? '已归档' : '会话'}</strong>
        <div>
          <button
            title={archived ? '活动会话' : '已归档会话'}
            aria-label={archived ? '活动会话' : '已归档会话'}
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
          placeholder="搜索会话"
          aria-label="搜索会话"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <AnimatedList
        className="session-list"
        viewportClassName="session-list-viewport"
        aria-label={archived ? '已归档会话列表' : '会话列表'}
      >
        {sessions.map((session) => (
          <SpotlightCard
            className={`session-item ${selected === session.id ? 'selected' : ''}`}
            key={session.id}
            spotlightColor="color-mix(in srgb, var(--rb-accent) 34%, transparent)"
          >
            {renamingId === session.id ? (
              <input
                className="session-rename-input"
                aria-label={`重命名 ${session.title}`}
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
                <MessageSquare size={14} />
                <div>
                  <span>{session.title}</span>
                  <small>
                    {new Date(session.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    {session.parentId && ' · 分支'}
                  </small>
                </div>
              </button>
            )}
            <div className="session-row-actions">
              <button
                title="重命名会话"
                aria-label={`重命名 ${session.title}`}
                disabled={renameBusy || Boolean(sessionActions[session.id])}
                onClick={(event) => startRename(event, session)}
              >
                <Pencil size={12} />
              </button>
              <button
                title="创建分支"
                aria-label={`创建分支 ${session.title}`}
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
                title={archived ? '恢复会话' : '归档会话'}
                aria-label={`${archived ? '恢复' : '归档'} ${session.title}`}
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
        {!sessions.length && (
          <div className="empty-nav">{search ? '没有匹配会话' : archived ? '没有归档会话' : '暂无会话'}</div>
        )}
      </AnimatedList>
      <button className="new-session" aria-label="新建会话" onClick={onNew} disabled={creating} aria-busy={creating}>
        {creating ? <LoaderCircle size={15} className="spinning" /> : <Plus size={15} />}
        {creating ? '创建中' : '新建会话'}
      </button>
    </div>
  )
}
export default function App() {
  const status = useConnection((state) => state.status),
    data = useCatalog((state) => state.data),
    host = useConnection((state) => state.host)
  const activeSession = useWorkbench((state) => state.activeSession),
    workspaceId = useWorkbench((state) => state.workspaceId),
    panel = useWorkbench((state) => state.panel),
    approvalMode = useWorkbench((state) => state.approvalMode),
    theme = useWorkbench((state) => state.theme),
    modelId = useWorkbench((state) => state.modelId),
    toolPanel = useWorkbench((state) => state.toolPanel),
    sidebarWidth = useWorkbench((state) => state.sidebarWidth),
    persistedToolRailLayout = useWorkbench((state) => state.toolRailLayout)
  const notice = useNotice((state) => state.error)
  const clientPanels = useUIPlugins((state) => state.panels)
  const plugins = data?.plugins
  const sessions = data?.sessions
  const activeSnapshot = useSessions((state) => (activeSession ? state.snapshots[activeSession] : undefined))
  const initialSelection = useRef(true)
  const switchingSession = useRef(false)
  const lastSessionSelection = useRef<string | undefined>(undefined)
  const creatingSession = useRef(false)
  const [small, setSmall] = useState(window.innerWidth < 900),
    [sidebar, setSidebar] = useState(true),
    [mobileView, setMobileView] = useState('chat'),
    [workspaceModal, setWorkspaceModal] = useState(false),
    [workspacePath, setWorkspacePath] = useState('')
  const [isCreatingSession, setIsCreatingSession] = useState(false)
  const [mobileFile, setMobileFile] = useState('')
  const [mobilePanel, setMobilePanel] = useState('')
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [conversationViews, setConversationViews] = useState<Record<string, 'chat' | 'console'>>({})
  const toolRailOrder = [...DEFAULT_TOOL_RAIL_ORDER].sort(
    (a, b) =>
      (persistedToolRailLayout[a]?.order ?? DEFAULT_TOOL_RAIL_ORDER.indexOf(a)) -
      (persistedToolRailLayout[b]?.order ?? DEFAULT_TOOL_RAIL_ORDER.indexOf(b)),
  )
  const toolRailSides = Object.fromEntries(
    DEFAULT_TOOL_RAIL_ORDER.map((id) => [id, persistedToolRailLayout[id]?.side ?? 'right']),
  ) as Record<string, 'left' | 'right'>
  function updateToolRailLayout(mutator: (current: typeof persistedToolRailLayout) => typeof persistedToolRailLayout) {
    useWorkbench.setState((state) => ({ toolRailLayout: mutator(state.toolRailLayout) }))
  }
  const [toastPaused, setToastPaused] = useState(false)
  const sidebarDrag = useRef<{ startX: number; startWidth: number } | null>(null)
  const closeCommandPalette = useCallback(() => setCommandPaletteOpen(false), [])
  useEffect(() => {
    setToastPaused(false)
  }, [notice])
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
  const [model, setModel] = useState(() => {
    return Model.fromJson(restoreLayout(useWorkbench.getState().layout))
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme === 'white' ? 'white' : theme === 'light' ? 'dsh-light' : 'dsh-dark'
  }, [theme])
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
      title = `系统终端 ${systemTerminalCount(model) + 1}`
    }
    if (component === 'terminal') {
      activateConversationView('console')
      return
    }
    if (component !== 'conversation') useWorkbench.setState({ toolPanel: id })
    if (component === 'plugin') setMobilePanel(String(config?.panelId ?? ''))
    if (small) setMobileView(MOBILE_VIEW_BY_COMPONENT[component] ?? 'chat')
    const borderId = placement === 'right' ? 'border_right' : placement === 'bottom' ? 'border_bottom' : undefined
    const border = borderId ? model.getNodeById(borderId) : undefined
    let skipBorderSelection = false
    if (borderId && border instanceof BorderNode) {
      const existing = model.getNodeById(id)
      skipBorderSelection = existing instanceof TabNode && border.getSelectedNode()?.getId() === existing.getId()
      if (!existing)
        model.doAction(
          Actions.addNode(
            { type: 'tab', id, name: title, component, enableClose: true, config },
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
            { type: 'tab', id, name: title, component, enableClose: true, config },
            model.getNodeById('main') ? 'main' : (model.getActiveTabset()?.getId() ?? 'main'),
            placement === 'bottom'
              ? DockLocation.BOTTOM
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

  function systemTerminalCount(current: Model) {
    let count = 0
    current.visitNodes((node) => {
      if (node instanceof TabNode && node.getComponent() === 'system-terminal') count++
    })
    return count
  }

  function closePanel(id: string) {
    const node = model.getNodeById(id)
    let parent = node?.getParent()
    while (parent && !(parent instanceof BorderNode)) parent = parent.getParent()
    if (parent instanceof BorderNode) {
      const tabs = parent.getTabNodes()
      if (node instanceof TabNode && node.getComponent() === 'system-terminal') {
        model.doAction(Actions.deleteTab(id))
        const remaining = parent.getTabNodes()
        if (remaining.length) model.doAction(Actions.updateNodeAttributes(parent.getId(), { show: true, selected: 0 }))
        else model.doAction(Actions.updateNodeAttributes(parent.getId(), { show: false, selected: -1 }))
      } else model.doAction(Actions.updateNodeAttributes(parent.getId(), { show: false }))
    } else if (node) model.doAction(Actions.deleteTab(id))
    if (useWorkbench.getState().toolPanel === id) useWorkbench.setState({ toolPanel: '' })
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
    if (toolPanel === id) {
      closePanel(id)
      if (small) setMobileView('chat')
      return
    }
    openPanel(id, title, component, config, placement)
  }
  const settings = () => openPanel('settings', '设置', 'settings')
  const toggleSettings = () => toggleGalleryTool('settings', '设置', 'settings', undefined, 'editor')
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
          name: '新会话',
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
      label: '新建会话',
      description: '在当前项目创建一个会话',
      keywords: ['session', 'create'],
      icon: Plus,
      group: 'actions',
      execute: () => void newSession(),
    },
    {
      id: 'toggle-sidebar',
      label: sidebar ? '收起项目与会话栏' : '展开项目与会话栏',
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
      label: '打开文件',
      description: '浏览当前项目文件',
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
      label: '打开命令控制台',
      description: '切换当前会话到 CLI 命令控制台',
      keywords: ['terminal', 'console'],
      icon: TerminalSquare,
      group: 'navigation',
      execute: () => activateConversationView('console'),
    },
    {
      id: 'open-system-terminal',
      label: '打开系统终端',
      description: '在当前工作区打开交互式 Shell',
      keywords: ['terminal', 'shell', 'pty'],
      icon: TerminalSquare,
      group: 'navigation',
      execute: () => openPanel('system-terminal', '系统终端', 'system-terminal', undefined, 'bottom'),
    },
    {
      id: 'open-settings',
      label: '打开设置',
      description: '模型、权限、外观与设备',
      keywords: ['settings', 'preferences', 'theme'],
      icon: Settings2,
      group: 'navigation',
      execute: settings,
    },
    {
      id: 'open-activity',
      label: '打开运行与事件',
      description: '查看当前会话运行状态',
      keywords: ['activity', 'events', 'runs'],
      icon: Activity,
      group: 'navigation',
      execute: () => openPanel('activity', '运行', 'activity', undefined, 'right'),
    },
    {
      id: 'open-git',
      label: '打开 Git',
      description: '查看项目更改、差异、历史和分支',
      keywords: ['git', 'changes', 'diff', 'branch', 'commit'],
      icon: GitBranch,
      group: 'navigation',
      execute: () => openPanel('git', 'Git', 'git', undefined, 'right'),
    },
    {
      id: 'restore-layout',
      label: '恢复默认布局',
      description: '重置工具区和标签位置',
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
        return <div className="empty-tool">面板不可用</div>
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
        return renderPlugin(config.panelId ?? '')
      default:
        return <div className="empty-tool">面板不可用</div>
    }
  }
  function renderPlugin(panelId: string) {
    const ClientPanel = clientPanels.find((p) => p.id === panelId)?.component
    if (ClientPanel)
      return (
        <div className="plugin-panel rb-plugin-panel">
          <GlassSurface className="plugin-panel-glass" width="100%" height="100%" aria-hidden="true" />
          <ClientPanel />
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
      <div className="empty-tool">插件已停用</div>
    )
  }
  if (status === 'pairing' || (!data && status !== 'connected')) return <PairingPage />
  return (
    <div className="app-shell">
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
        <WorkbenchToolRails
          side="left"
          panel={panel}
          toolPanel={toolPanel}
          diagnosePanelId={DIAGNOSE_PANEL_ID}
          contributions={[...(data?.panels ?? []), ...clientPanels]}
          onSelectPrimary={(nextPanel) => {
            useWorkbench.setState({ panel: nextPanel })
            setSidebar(true)
          }}
          onOpenTool={(id, title, component, placement, config) => openPanel(id, title, component, config, placement)}
          onToggleTool={(id, title, component, placement) => {
            if (id === 'settings') {
              toggleSettings()
              return
            }
            toggleGalleryTool(id, title, component, undefined, placement)
          }}
          toolOrder={toolRailOrder}
          toolSides={toolRailSides}
          onMoveTool={(id, side) =>
            updateToolRailLayout((current) => ({
              ...current,
              [id]: {
                side,
                order:
                  current[id]?.order ?? DEFAULT_TOOL_RAIL_ORDER.indexOf(id as (typeof DEFAULT_TOOL_RAIL_ORDER)[number]),
              },
            }))
          }
          onReorderTool={(source, target) =>
            updateToolRailLayout((current) => {
              const next = [...DEFAULT_TOOL_RAIL_ORDER].sort(
                (a, b) =>
                  (current[a]?.order ?? DEFAULT_TOOL_RAIL_ORDER.indexOf(a)) -
                  (current[b]?.order ?? DEFAULT_TOOL_RAIL_ORDER.indexOf(b)),
              )
              const sourceIndex = next.indexOf(source as (typeof DEFAULT_TOOL_RAIL_ORDER)[number])
              const targetIndex = next.indexOf(target as (typeof DEFAULT_TOOL_RAIL_ORDER)[number])
              if (sourceIndex < 0 || targetIndex < 0) return current
              next.splice(sourceIndex, 1)
              next.splice(
                next.indexOf(target as (typeof DEFAULT_TOOL_RAIL_ORDER)[number]),
                0,
                source as (typeof DEFAULT_TOOL_RAIL_ORDER)[number],
              )
              return Object.fromEntries(next.map((id, order) => [id, { side: current[id]?.side ?? 'right', order }]))
            })
          }
        />
        <aside className="sidebar">
          <GlassSurface className="chrome-glass" width="100%" height="100%" aria-hidden="true" />
          {panel === 'sessions' ? (
            <Sessions onSelect={selectSession} onNew={() => void newSession()} creating={isCreatingSession} />
          ) : (
            <FileNavigation workspaceId={workspaceId} onOpen={openFile} />
          )}
          {!small && sidebar && (
            <div
              className="sidebar-resizer"
              role="separator"
              aria-label="调整侧栏宽度"
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
        <main className="workbench">
          {small ? (
            <>
              {mobileView === 'sessions' ? (
                <Sessions onSelect={selectSession} onNew={() => void newSession()} creating={isCreatingSession} />
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
                      const welcome = ensureWelcomeTab(next)
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
          onOpenTool={(id, title, component, placement, config) => openPanel(id, title, component, config, placement)}
          onToggleTool={(id, title, component, placement) => {
            if (id === 'settings') {
              toggleSettings()
              return
            }
            toggleGalleryTool(id, title, component, undefined, placement)
          }}
          toolOrder={toolRailOrder}
          toolSides={toolRailSides}
          onMoveTool={(id, side) =>
            updateToolRailLayout((current) => ({
              ...current,
              [id]: {
                side,
                order:
                  current[id]?.order ?? DEFAULT_TOOL_RAIL_ORDER.indexOf(id as (typeof DEFAULT_TOOL_RAIL_ORDER)[number]),
              },
            }))
          }
          onReorderTool={(source, target) =>
            updateToolRailLayout((current) => {
              const next = [...DEFAULT_TOOL_RAIL_ORDER].sort(
                (a, b) =>
                  (current[a]?.order ?? DEFAULT_TOOL_RAIL_ORDER.indexOf(a)) -
                  (current[b]?.order ?? DEFAULT_TOOL_RAIL_ORDER.indexOf(b)),
              )
              const sourceIndex = next.indexOf(source as (typeof DEFAULT_TOOL_RAIL_ORDER)[number])
              const targetIndex = next.indexOf(target as (typeof DEFAULT_TOOL_RAIL_ORDER)[number])
              if (sourceIndex < 0 || targetIndex < 0) return current
              next.splice(sourceIndex, 1)
              next.splice(
                next.indexOf(target as (typeof DEFAULT_TOOL_RAIL_ORDER)[number]),
                0,
                source as (typeof DEFAULT_TOOL_RAIL_ORDER)[number],
              )
              return Object.fromEntries(next.map((id, order) => [id, { side: current[id]?.side ?? 'right', order }]))
            })
          }
        />
      </div>
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
          <button title="关闭通知" aria-label="关闭通知" onClick={() => useNotice.setState({ error: '' })}>
            <X size={15} />
          </button>
        </div>
      )}
      <CommandPalette open={commandPaletteOpen} commands={paletteCommands} onClose={closeCommandPalette} />
      {workspaceModal && (
        <Modal title="添加工作区" onClose={() => setWorkspaceModal(false)}>
          <form
            className="settings-form"
            onSubmit={(event) => {
              event.preventDefault()
              void client()
                .call('workspace.create', { path: workspacePath })
                .then(async (workspace) => {
                  await refreshCatalog()
                  useWorkbench.setState({ workspaceId: workspace.id })
                  setWorkspaceModal(false)
                  setWorkspacePath('')
                })
                .catch(report)
            }}
          >
            <label>
              目录路径
              <input
                autoFocus
                value={workspacePath}
                onChange={(event) => setWorkspacePath(event.target.value)}
                placeholder="D:\Projects\my-project"
                required
              />
            </label>
            <footer className="modal-footer">
              <button className="button primary">
                <FolderOpen size={14} />
                打开工作区
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </div>
  )
}
