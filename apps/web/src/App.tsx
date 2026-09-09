import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Actions, BorderNode, DockLocation, Layout, Model, TabNode } from 'flexlayout-react'
import {
  Activity,
  Archive,
  FileSearch,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Command as CommandIcon,
  FileCode2,
  Folder,
  FolderOpen,
  Globe,
  GitBranch,
  LayoutGrid,
  ListChecks,
  LoaderCircle,
  MessageSquare,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Square,
  TerminalSquare,
  X,
} from 'lucide-react'
import type { FileEntry, Session, SessionEvent } from '@hbar/contracts'
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
import TerminalPanel from './TerminalPanel'
import { BrowserPanel, InsightsPanel, PlanPanel, SessionInspectorPanel } from './SessionTools'
import CommandPalette, { type PaletteCommand } from './CommandPalette'
import SpotlightCard from './react-bits/SpotlightCard'
import GlassIconButton from './react-bits/GlassIconButton'
import 'flexlayout-react/style/dark.css'
const CodeEditor = lazy(() => import('./CodeEditor'))
const DIAGNOSE_PANEL_ID = 'diagnose-right'
const SIDEBAR_MIN_WIDTH = 220
const SIDEBAR_MAX_WIDTH = 360
const MOBILE_TOOLS = [
  { id: 'browser', title: '浏览器', icon: Globe },
  { id: 'inspector', title: '会话检查', icon: FileSearch },
  { id: 'plan', title: '计划', icon: ListChecks },
  { id: 'insights', title: '会话洞察', icon: Activity },
] as const
const MOBILE_VIEW_BY_COMPONENT: Record<string, string> = {
  activity: 'activity',
  settings: 'settings',
  diagnose: 'diagnose',
  terminal: 'terminal',
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

function Pairing() {
  const [code, setCode] = useState(''),
    [name, setName] = useState('Browser'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const status = useConnection((state) => state.status),
    url = useConnection((state) => state.url),
    connectionError = useConnection((state) => state.error)
  return (
    <main className="pairing-page">
      <div className="pairing-brand">
        hbar
        <span />
      </div>
      <form
        className="pairing-form"
        onSubmit={(event) => {
          event.preventDefault()
          setBusy(true)
          setError('')
          void client()
            .pair(code, name)
            .then((host) => {
              useConnection.setState({ host })
              return refreshCatalog()
            })
            .catch((failure) => setError(failure instanceof Error ? failure.message : String(failure)))
            .finally(() => setBusy(false))
        }}
      >
        <h1>{status === 'connecting' ? '连接宿主' : '设备配对'}</h1>
        <div className="host-chip">
          <Network size={14} />
          <code>{url}</code>
        </div>
        <label>
          配对码
          <input
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            aria-label="配对码"
          />
        </label>
        <label>
          设备名称
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        {(error || connectionError) && (
          <p className="inline-error" role="alert">
            {error || connectionError}
          </p>
        )}
        <button className="button primary pair-submit" disabled={busy || code.length !== 8 || !name}>
          {busy ? <LoaderCircle size={16} className="spinning" /> : <ShieldCheck size={16} />}配对并连接
        </button>
      </form>
      <span className="pairing-footer">hbar / 0.1.0</span>
    </main>
  )
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
  const [search, setSearch] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)
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
    try {
      const child = await client().call('session.fork', { sessionId: session.id })
      await refreshCatalog()
      onSelect(child.id)
    } catch (error) {
      report(error)
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
      <div className="session-list">
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
                disabled={renameBusy}
                onClick={(event) => startRename(event, session)}
              >
                <Pencil size={12} />
              </button>
              <button title="创建分支" aria-label={`创建分支 ${session.title}`} onClick={() => void fork(session)}>
                <GitBranch size={12} />
              </button>
              <button
                title={archived ? '恢复会话' : '归档会话'}
                aria-label={`${archived ? '恢复' : '归档'} ${session.title}`}
                onClick={() =>
                  void client()
                    .call('session.archive', { sessionId: session.id, archived: !archived })
                    .then(refreshCatalog)
                    .catch(report)
                }
              >
                <Archive size={12} />
              </button>
            </div>
          </SpotlightCard>
        ))}
        {!sessions.length && (
          <div className="empty-nav">{search ? '没有匹配会话' : archived ? '没有归档会话' : '暂无会话'}</div>
        )}
      </div>
      <button className="new-session" onClick={onNew} disabled={creating} aria-busy={creating}>
        {creating ? <LoaderCircle size={15} className="spinning" /> : <Plus size={15} />}
        {creating ? '创建中' : '新建会话'}
      </button>
    </div>
  )
}
function Files({ onOpen }: { onOpen(path: string): void }) {
  const workspaceId = useWorkbench((state) => state.workspaceId)
  const [path, setPath] = useState('.'),
    [entries, setEntries] = useState<FileEntry[]>([]),
    [error, setError] = useState('')
  useEffect(() => {
    setPath('.')
  }, [workspaceId])
  useEffect(() => {
    if (!workspaceId) return
    let alive = true
    void client()
      .call('file.list', { workspaceId, path })
      .then((files) => {
        if (alive) {
          setEntries(files)
          setError('')
        }
      })
      .catch((failure) => {
        if (alive) setError(failure instanceof Error ? failure.message : String(failure))
      })
    return () => {
      alive = false
    }
  }, [workspaceId, path])
  return (
    <div className="file-nav">
      <div className="sidebar-heading">
        <strong>文件</strong>
        <button
          title="上级目录"
          aria-label="上级目录"
          disabled={path === '.'}
          onClick={() => setPath(path.includes('/') ? path.split('/').slice(0, -1).join('/') : '.')}
        >
          <ChevronLeft size={15} />
        </button>
      </div>
      <div className="file-breadcrumb">{path}</div>
      {error ? (
        <div className="inline-error">{error}</div>
      ) : (
        <div className="file-list">
          {entries.map((entry) => (
            <button
              key={entry.path}
              onClick={() => (entry.directory ? setPath(entry.path) : onOpen(entry.path))}
              title={entry.path}
            >
              {entry.directory ? <Folder size={14} className="folder-icon" /> : <FileCode2 size={14} />}
              <span>{entry.name}</span>
              {entry.directory && <ChevronRight size={12} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
function FileViewer({ path, workspaceId }: { path: string; workspaceId: string }) {
  const [text, setText] = useState(''),
    [error, setError] = useState('')
  useEffect(() => {
    let current = true
    void client()
      .call('file.read', { workspaceId, path })
      .then((result) => {
        if (current) setText(result.text)
      })
      .catch((failure) => {
        if (current) setError(failure instanceof Error ? failure.message : String(failure))
      })
    return () => {
      current = false
    }
  }, [workspaceId, path])
  return (
    <div className="file-viewer">
      <div className="file-viewer-header">
        <FileCode2 size={14} />
        <span>{path}</span>
        <span>只读</span>
      </div>
      {error ? (
        <p className="inline-error">{error}</p>
      ) : (
        <Suspense fallback={<pre>{text}</pre>}>
          <CodeEditor value={text} {...(path.split('.').at(-1) ? { language: path.split('.').at(-1)! } : {})} />
        </Suspense>
      )}
    </div>
  )
}
function ActivityPanel() {
  const sessionId = useWorkbench((state) => state.activeSession),
    snapshot = useSessions((state) => state.snapshots[sessionId])
  const [mode, setMode] = useState<'activity' | 'trace'>('activity'),
    [events, setEvents] = useState<SessionEvent[]>([]),
    [detail, setDetail] = useState<SessionEvent | null>(null)
  const cursor = snapshot?.cursor
  useEffect(() => {
    if (mode !== 'trace' || cursor === undefined) return
    let alive = true
    void client()
      .call('session.follow', { sessionId, cursor: Math.max(0, cursor - 80) })
      .then((result) => {
        if (alive) setEvents(result.events)
      })
      .catch(report)
    return () => {
      alive = false
    }
  }, [mode, sessionId, cursor])
  const usage = snapshot?.usage
  return (
    <div className="activity-panel">
      <div className="tool-panel-tabs">
        <button className={mode === 'activity' ? 'selected' : ''} onClick={() => setMode('activity')}>
          运行
        </button>
        <button className={mode === 'trace' ? 'selected' : ''} onClick={() => setMode('trace')}>
          事件
        </button>
      </div>
      {mode === 'activity' ? (
        <>
          <div className="activity-heading">
            <h2>当前会话</h2>
            <span className="small-muted">{snapshot?.runs.length ?? 0} runs</span>
          </div>
          <dl className="metrics">
            <div>
              <dt>输入 tokens</dt>
              <dd>{(usage?.input ?? 0).toLocaleString()}</dd>
            </div>
            <div>
              <dt>输出 tokens</dt>
              <dd>{(usage?.output ?? 0).toLocaleString()}</dd>
            </div>
            <div>
              <dt>缓存读取</dt>
              <dd>{(usage?.cacheRead ?? 0).toLocaleString()}</dd>
            </div>
            <div>
              <dt>费用</dt>
              <dd>${(usage?.cost ?? 0).toFixed(4)}</dd>
            </div>
          </dl>
          <div className="section-label">运行记录</div>
          <div className="run-list">
            {snapshot?.runs.map((run) => (
              <SpotlightCard className="run-row" key={run.id} spotlightColor="color-mix(in srgb, var(--rb-status) 30%, transparent)">
                <i className={`status-dot ${run.status}`} />
                <div>
                  <strong>{run.input.text.slice(0, 65) || '图片消息'}</strong>
                  <span>
                    {run.status} ·{' '}
                    {new Date(run.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {['running', 'queued', 'waiting_approval'].includes(run.status) && (
                  <button
                    title="停止此运行"
                    aria-label="停止此运行"
                    onClick={() => void client().call('run.cancel', { runId: run.id }).catch(report)}
                  >
                    <Square size={12} />
                  </button>
                )}
              </SpotlightCard>
            ))}
          </div>
          {!snapshot?.runs.length && (
            <div className="empty-tool">
              <Activity size={25} />
              <span>尚无运行记录</span>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="event-list">
            {events.map((event) => (
              <button key={event.eventId} onClick={() => setDetail(event)}>
                <span className="event-seq">{event.seq}</span>
                <code>{event.type}</code>
                <time>{new Date(event.time).toLocaleTimeString()}</time>
              </button>
            ))}
          </div>
          {detail && (
            <Modal title={detail.type} onClose={() => setDetail(null)}>
              <pre className="event-detail">{JSON.stringify(detail, null, 2)}</pre>
            </Modal>
          )}
        </>
      )}
    </div>
  )
}
function Diagnose() {
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const refresh = () => {
    void client().call('system.diagnose', {}).then(setData).catch(report)
  }
  useEffect(refresh, [])
  return (
    <div className="diagnose-panel">
      <div className="page-heading">
        <h1>诊断</h1>
        <button title="刷新诊断" aria-label="刷新诊断" onClick={refresh}>
          <RefreshCw size={15} />
        </button>
      </div>
      <pre>{JSON.stringify(data, null, 2)}</pre>
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
    sidebarWidth = useWorkbench((state) => state.sidebarWidth)
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
  const sidebarDrag = useRef<{ startX: number; startWidth: number } | null>(null)
  const closeCommandPalette = useCallback(() => setCommandPaletteOpen(false), [])
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
        const button = document.querySelector<HTMLButtonElement>('button[aria-label="终端"]')
        if (button) button.click()
        else openPanel('terminal', '终端', 'terminal', undefined, 'bottom')
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
    if (component !== 'conversation') useWorkbench.setState({ toolPanel: id })
    if (component === 'plugin') setMobilePanel(String(config?.panelId ?? ''))
    if (small) setMobileView(MOBILE_VIEW_BY_COMPONENT[component] ?? 'chat')
    const borderId = placement === 'right' ? 'border_right' : placement === 'bottom' ? 'border_bottom' : undefined
    const border = borderId ? model.getNodeById(borderId) : undefined
    if (borderId && border?.getType() === 'border') {
      const existing = model.getNodeById(id)
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
            placement === 'bottom' ? DockLocation.BOTTOM : placement === 'left' ? DockLocation.LEFT : DockLocation.CENTER,
            -1,
          ),
        )
      else if (existing instanceof TabNode && !existing.isEnableClose())
        model.doAction(Actions.updateNodeAttributes(existing.getId(), { enableClose: true }))
    }
    model.doAction(Actions.selectTab(id))
  }

  function closePanel(id: string) {
    const node = model.getNodeById(id)
    let parent = node?.getParent()
    while (parent && !(parent instanceof BorderNode)) parent = parent.getParent()
    if (parent instanceof BorderNode) {
      model.doAction(Actions.updateNodeAttributes(parent.getId(), { show: false }))
    }
    else if (node) model.doAction(Actions.deleteTab(id))
    if (useWorkbench.getState().toolPanel === id) useWorkbench.setState({ toolPanel: '' })
  }
  function togglePanel(id: string, title: string, component: string, placement: 'right' | 'bottom') {
    if (useWorkbench.getState().toolPanel === id) closePanel(id)
    else openPanel(id, title, component, undefined, placement)
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
      execute: () => void newSession(),
    },
    {
      id: 'toggle-sidebar',
      label: sidebar ? '收起项目与会话栏' : '展开项目与会话栏',
      keywords: ['sidebar', 'navigation'],
      icon: sidebar ? PanelLeftClose : PanelLeftOpen,
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
      execute: () => {
        useWorkbench.setState({ panel: 'files' })
        if (small) setMobileView('files')
        else setSidebar(true)
      },
    },
    {
      id: 'open-terminal',
      label: '打开命令控制台',
      description: '在底部展开 AI 命令控制台',
      keywords: ['terminal', 'console'],
      icon: TerminalSquare,
      execute: () => openPanel('terminal', '终端', 'terminal', undefined, 'bottom'),
    },
    {
      id: 'open-settings',
      label: '打开设置',
      description: '模型、权限、外观与设备',
      keywords: ['settings', 'preferences', 'theme'],
      icon: Settings2,
      execute: settings,
    },
    {
      id: 'open-activity',
      label: '打开运行与事件',
      description: '查看当前会话运行状态',
      keywords: ['activity', 'events', 'runs'],
      icon: Activity,
      execute: () => openPanel('activity', '运行', 'activity', undefined, 'right'),
    },
    {
      id: 'restore-layout',
      label: '恢复默认布局',
      description: '重置工具区和标签位置',
      keywords: ['layout', 'reset', 'restore'],
      icon: LayoutGrid,
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
      case 'conversation':
        return (
          <Chat
            {...(config?.sessionId ? { sessionId: config.sessionId } : {})}
            onSettings={settings}
            onTerminal={() => togglePanel('terminal', '终端', 'terminal', 'bottom')}
          />
        )
      case 'settings':
        return <Settings />
      case 'activity':
        return <ActivityPanel />
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
      case 'terminal':
        return (
          <TerminalPanel
            onSettings={settings}
            onClose={() => {
              closePanel(node.getId())
            }}
          />
        )
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
        <div className="plugin-panel">
          <ClientPanel />
        </div>
      )
    const contribution = data?.panels.find((p) => p.id === panelId)
    return contribution ? (
      <div className="plugin-panel">
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
  if (status === 'pairing' || (!data && status !== 'connected')) return <Pairing />
  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="sidebar-toggle"
          title="会话侧栏"
          aria-label="会话侧栏"
          onClick={() =>
            small ? setMobileView(mobileView === 'sessions' ? 'chat' : 'sessions') : setSidebar(!sidebar)
          }
        >
          {sidebar ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
        </button>
        <div className="brand">
          hbar
          <span />
        </div>
        <div className="top-divider" />
        <FolderOpen size={16} className="folder-icon" />
        <select
          className="workspace-select"
          aria-label="选择工作区"
          value={workspaceId}
          onChange={(event) => {
            selectWorkspace(event.target.value)
          }}
        >
          <option value="" disabled>
            选择工作区
          </option>
          {data?.workspaces.map((workspace) => (
            <option value={workspace.id} key={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
        <button
          className="add-workspace"
          title="添加工作区"
          aria-label="添加工作区"
          onClick={() => setWorkspaceModal(true)}
        >
          <Plus size={14} />
        </button>
        <span
          className="top-context"
          title={data?.sessions.find((session) => session.id === activeSession)?.title ?? '当前会话'}
        >
          {data?.sessions.find((session) => session.id === activeSession)?.title ?? '新会话'}
        </span>
        <span className="top-spacer" />
        <button title="命令面板（Ctrl+Shift+P）" aria-label="打开命令面板" onClick={() => setCommandPaletteOpen(true)}>
          <CommandIcon size={17} />
        </button>
        <span className={`host-status ${status === 'connected' ? 'success' : 'warning'}`}>
          <i />
          {status === 'connected' ? (host?.platform === 'win32' ? 'Windows Host' : 'Host') : '重新连接中'}
        </span>
      </header>
      <div
        className={`main-frame ${sidebar ? '' : 'sidebar-collapsed'}`}
        style={{ '--sidebar-width': `${sidebarWidth}px` } as CSSProperties}
      >
        <nav className="tool-rail left-rail">
          <GlassIconButton
            label="会话"
            tone="accent"
            title="会话"
            aria-label="会话"
            className={panel === 'sessions' ? 'selected' : ''}
            onClick={() => {
              useWorkbench.setState({ panel: 'sessions' })
              setSidebar(true)
            }}
          >
            <MessageSquare size={19} />
          </GlassIconButton>
          <GlassIconButton
            label="文件"
            tone="accent"
            title="文件"
            aria-label="文件"
            className={panel === 'files' ? 'selected' : ''}
            onClick={() => {
              useWorkbench.setState({ panel: 'files' })
              setSidebar(true)
            }}
          >
            <Folder size={19} />
          </GlassIconButton>
          <span />
          <GlassIconButton
            label="诊断"
            tone="warning"
            title="诊断"
            aria-label="诊断"
            aria-pressed={toolPanel === DIAGNOSE_PANEL_ID}
            className={toolPanel === DIAGNOSE_PANEL_ID ? 'selected' : ''}
            onClick={() => openPanel(DIAGNOSE_PANEL_ID, '诊断', 'diagnose', undefined, 'right')}
          >
            <CircleHelp size={18} />
          </GlassIconButton>
          <GlassIconButton
            label="恢复默认布局"
            tone="neutral"
            title="恢复默认布局"
            aria-label="恢复默认布局"
            onClick={() => {
              useWorkbench.setState({ layout: null })
              setModel(Model.fromJson(defaultLayout()))
            }}
          >
            <LayoutGrid size={18} />
          </GlassIconButton>
        </nav>
        <aside className="sidebar">
          {panel === 'sessions' ? (
            <Sessions onSelect={selectSession} onNew={() => void newSession()} creating={isCreatingSession} />
          ) : (
            <Files onOpen={openFile} />
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
              ) : mobileView === 'files' ? (
                <Files onOpen={openFile} />
              ) : mobileView === 'file' ? (
                <FileViewer path={mobileFile} workspaceId={workspaceId} />
              ) : mobileView === 'diagnose' ? (
                <Diagnose />
              ) : mobileView === 'terminal' ? (
                <TerminalPanel
                  onSettings={() => {
                    closePanel('terminal')
                    setMobileView('settings')
                  }}
                  onClose={() => {
                    closePanel('terminal')
                    setMobileView('chat')
                  }}
                />
              ) : mobileView === 'browser' ? (
                <BrowserPanel sessionId={activeSession} />
              ) : mobileView === 'inspector' ? (
                <SessionInspectorPanel sessionId={activeSession} />
              ) : mobileView === 'plan' ? (
                <PlanPanel sessionId={activeSession} />
              ) : mobileView === 'insights' ? (
                <InsightsPanel sessionId={activeSession} />
              ) : mobileView === 'plugin' ? (
                renderPlugin(mobilePanel)
              ) : mobileView === 'plugins' ? (
                <div className="plugin-panel">
                  <h2>工具与插件</h2>
                  <div className="mobile-tool-grid" aria-label="工具窗口">
                    {MOBILE_TOOLS.map(({ id, title, icon: Icon }) => (
                      <button
                        key={id}
                        className="new-session"
                        onClick={() => toggleGalleryTool(id, title, id, undefined, 'right')}
                      >
                        <Icon size={16} />
                        {title}
                      </button>
                    ))}
                  </div>
                  <h3 className="mobile-tool-heading">插件面板</h3>
                  {[...(data?.panels ?? []), ...clientPanels].map((panel) => (
                    <button
                      key={panel.id}
                      className="new-session"
                      onClick={() =>
                        openPanel(`plugin:${panel.id}`, panel.title, 'plugin', { panelId: panel.id }, panel.placement)
                      }
                    >
                      <LayoutGrid size={16} />
                      {panel.title}
                    </button>
                  ))}
                </div>
              ) : (
                <Chat
                  sessionId={activeSession}
                  onSettings={settings}
                  onTerminal={() => togglePanel('terminal', '终端', 'terminal', 'bottom')}
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
        <nav className="tool-rail right-rail">
          <GlassIconButton
            label="浏览器"
            tone="accent"
            title="浏览器"
            aria-label="浏览器"
            aria-pressed={toolPanel === 'browser'}
            className={toolPanel === 'browser' ? 'selected' : ''}
            onClick={() => toggleGalleryTool('browser', '浏览器', 'browser', undefined, 'right')}
          >
            <Globe size={18} />
          </GlassIconButton>
          <GlassIconButton
            label="会话检查"
            tone="accent"
            title="会话检查"
            aria-label="会话检查"
            aria-pressed={toolPanel === 'inspector'}
            className={toolPanel === 'inspector' ? 'selected' : ''}
            onClick={() => toggleGalleryTool('inspector', '会话检查', 'inspector', undefined, 'right')}
          >
            <FileSearch size={18} />
          </GlassIconButton>
          <GlassIconButton
            label="计划"
            tone="accent"
            title="计划"
            aria-label="计划"
            aria-pressed={toolPanel === 'plan'}
            className={toolPanel === 'plan' ? 'selected' : ''}
            onClick={() => toggleGalleryTool('plan', '计划', 'plan', undefined, 'right')}
          >
            <ListChecks size={18} />
          </GlassIconButton>
          <GlassIconButton
            label="会话洞察"
            tone="status"
            title="会话洞察"
            aria-label="会话洞察"
            aria-pressed={toolPanel === 'insights'}
            className={toolPanel === 'insights' ? 'selected' : ''}
            onClick={() => toggleGalleryTool('insights', '会话洞察', 'insights', undefined, 'right')}
          >
            <Activity size={18} />
          </GlassIconButton>
          <GlassIconButton
            label="终端"
            tone="neutral"
            title="终端"
            aria-label="终端"
            aria-pressed={toolPanel === 'terminal'}
            className={toolPanel === 'terminal' ? 'selected' : ''}
            onClick={() => togglePanel('terminal', '终端', 'terminal', 'bottom')}
          >
            <TerminalSquare size={18} />
          </GlassIconButton>
          <GlassIconButton
            label="运行与事件"
            tone="status"
            title="运行与事件"
            aria-label="运行与事件"
            aria-pressed={toolPanel === 'activity'}
            className={toolPanel === 'activity' ? 'selected' : ''}
            onClick={() => toggleGalleryTool('activity', '运行', 'activity', undefined, 'right')}
          >
            <Activity size={18} />
          </GlassIconButton>
          <GlassIconButton
            label="设置"
            tone="neutral"
            title="设置"
            aria-label="设置"
            aria-pressed={toolPanel === 'settings'}
            className={toolPanel === 'settings' ? 'selected' : ''}
            onClick={toggleSettings}
          >
            <Settings2 size={18} />
          </GlassIconButton>
          {[...(data?.panels ?? []), ...clientPanels].map((contribution) => (
            <GlassIconButton
              label={contribution.title}
              tone="accent"
              key={contribution.id}
              title={contribution.title}
              aria-label={contribution.title}
              aria-pressed={toolPanel === `plugin:${contribution.id}`}
              className={toolPanel === `plugin:${contribution.id}` ? 'selected' : ''}
              onClick={() =>
                openPanel(
                  `plugin:${contribution.id}`,
                  contribution.title,
                  'plugin',
                  { panelId: contribution.id },
                  contribution.placement,
                )
              }
            >
              <LayoutGrid size={18} />
            </GlassIconButton>
          ))}
          <span />
          <GlassIconButton
            label="诊断"
            tone="warning"
            title="诊断"
            aria-label="诊断"
            aria-pressed={toolPanel === DIAGNOSE_PANEL_ID}
            className={toolPanel === DIAGNOSE_PANEL_ID ? 'selected' : ''}
            onClick={() => toggleGalleryTool(DIAGNOSE_PANEL_ID, '诊断', 'diagnose', undefined, 'right')}
          >
            <CircleHelp size={18} />
          </GlassIconButton>
        </nav>
      </div>
      <footer className="statusbar">
        <span className="status-item status-workspace" data-status-item="workspace" title="当前工作区">
          <Folder size={12} />
          {data?.workspaces.find((workspace) => workspace.id === workspaceId)?.path ?? 'Workspace'}
        </span>
        <span className="status-item status-provider" data-status-item="provider" title="当前模型">
          <Network size={12} />
          {data?.models.find((model) => model.id === modelId)?.name ?? 'Provider'}
        </span>
        <span className="status-item status-agent" data-status-item="agent-status" title="会话状态">
          <i
            className={
              activeSnapshot?.runs.some((run) => ['running', 'waiting_approval'].includes(run.status)) ? 'running' : ''
            }
          />
          {activeSnapshot?.runs.some((run) => ['running', 'waiting_approval'].includes(run.status))
            ? 'Running'
            : 'Idle'}
        </span>
        <span className="status-item status-permission" data-status-item="permission" title="工具权限">
          <ShieldCheck size={12} />
          {permissionPreset(approvalMode).shortLabel}
        </span>
        <span className="status-spacer" />
        <span className="status-item" data-status-item="context" title="上下文使用量">
          Context{' '}
          {activeSnapshot?.usage ? (activeSnapshot.usage.input + activeSnapshot.usage.output).toLocaleString() : 0}
        </span>
        <span className="status-item" data-status-item="turn-tokens" title="当前 token 使用量">
          {host?.activeRuns ?? 0} active
        </span>
        <span className="status-item" data-status-item="encoding">
          UTF-8
        </span>
        <span className="status-item" data-status-item="version">
          0.1.0
        </span>
      </footer>
      <nav className="mobile-nav">
        {[
          { id: 'sessions', label: '会话', icon: MessageSquare },
          { id: 'chat', label: '对话', icon: Plus },
          { id: 'files', label: '文件', icon: Folder },
          { id: 'activity', label: '运行', icon: Activity },
          { id: 'terminal', label: '终端', icon: TerminalSquare },
          { id: 'plugins', label: '插件', icon: LayoutGrid },
          { id: 'settings', label: '设置', icon: Settings2 },
        ].map((item) => (
          <button
            key={item.id}
            className={mobileView === item.id ? 'selected' : ''}
            onClick={() => setMobileView(item.id)}
            aria-label={item.label}
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      {notice && (
        <div className="toast" role="alert">
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
