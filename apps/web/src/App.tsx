import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Actions, DockLocation, Layout, Model, TabNode } from 'flexlayout-react'
import {
  Activity,
  Archive,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FileCode2,
  Folder,
  FolderOpen,
  GitBranch,
  LayoutGrid,
  LoaderCircle,
  MessageSquare,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Square,
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
import { defaultLayout, restoreLayout } from './workbench/layout'
import 'flexlayout-react/style/dark.css'
const CodeEditor = lazy(() => import('./CodeEditor'))

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
function Sessions({ onSelect, onNew }: { onSelect(id: string): void; onNew(): void }) {
  const [search, setSearch] = useState('')
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
          <button title="新建会话" aria-label="新建会话" onClick={onNew}>
            <Plus size={17} />
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
          <div className={`session-item ${selected === session.id ? 'selected' : ''}`} key={session.id}>
            <button
              className="session-select"
              onClick={() => onSelect(session.id)}
              onDoubleClick={() => {
                const title = window.prompt('会话名称', session.title)
                if (title?.trim())
                  void client()
                    .call('session.rename', { sessionId: session.id, title })
                    .then(refreshCatalog)
                    .catch(report)
              }}
            >
              <MessageSquare size={14} />
              <div>
                <span>{session.title}</span>
                <small>
                  {new Date(session.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  {session.parentId && ' · 分支'}
                </small>
              </div>
            </button>
            <div className="session-row-actions">
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
          </div>
        ))}
        {!sessions.length && (
          <div className="empty-nav">{search ? '没有匹配会话' : archived ? '没有归档会话' : '暂无会话'}</div>
        )}
      </div>
      <button className="new-session" onClick={onNew}>
        <Plus size={15} />
        新建会话
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
              <div className="run-row" key={run.id}>
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
              </div>
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
    approvalMode = useWorkbench((state) => state.approvalMode)
  const notice = useNotice((state) => state.error)
  const clientPanels = useUIPlugins((state) => state.panels)
  const plugins = data?.plugins
  const sessions = data?.sessions
  const initialSelection = useRef(true)
  const [small, setSmall] = useState(window.innerWidth < 900),
    [sidebar, setSidebar] = useState(true),
    [mobileView, setMobileView] = useState('chat'),
    [workspaceModal, setWorkspaceModal] = useState(false),
    [workspacePath, setWorkspacePath] = useState('')
  const [mobileFile, setMobileFile] = useState('')
  const [mobilePanel, setMobilePanel] = useState('')
  const [model, setModel] = useState(() => {
    return Model.fromJson(restoreLayout(useWorkbench.getState().layout))
  })
  useEffect(() => {
    const onResize = () => setSmall(window.innerWidth < 900)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
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
    initialSelection.current = false
    if (!activeSession) return
    const session = data.sessions.find((s) => s.id === activeSession)
    if (!session) return
    const id = `session:${session.id}`
    const exists = Boolean(model.getNodeById(id))
    if (!exists)
      model.doAction(
        Actions.addNode(
          { type: 'tab', id, name: session.title, component: 'conversation', config: { sessionId: session.id } },
          model.getNodeById('main') ? 'main' : (model.getActiveTabset()?.getId() ?? 'tools'),
          DockLocation.CENTER,
          -1,
        ),
      )
    if (!restoring || !exists) model.doAction(Actions.selectTab(id))
  }, [activeSession, data, model])
  useEffect(() => {
    for (const session of sessions ?? []) {
      const node = model.getNodeById(`session:${session.id}`)
      if (node instanceof TabNode && node.getName() !== session.title)
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
    if (component === 'plugin') setMobilePanel(String(config?.panelId ?? ''))
    if (small) {
      setMobileView(
        component === 'activity'
          ? 'activity'
          : component === 'settings'
            ? 'settings'
            : component === 'diagnose'
              ? 'diagnose'
              : component === 'file'
                ? 'file'
                : component === 'plugin'
                  ? 'plugin'
                  : 'chat',
      )
    }
    if (!model.getNodeById(id))
      model.doAction(
        Actions.addNode(
          { type: 'tab', id, name: title, component, config },
          placement === 'right' && model.getNodeById('tools')
            ? 'tools'
            : model.getNodeById('main')
              ? 'main'
              : (model.getActiveTabset()?.getId() ?? 'tools'),
          placement === 'bottom' ? DockLocation.BOTTOM : placement === 'left' ? DockLocation.LEFT : DockLocation.CENTER,
          -1,
        ),
      )
    model.doAction(Actions.selectTab(id))
  }
  const settings = () => openPanel('settings', '设置', 'settings')
  async function newSession() {
    if (!workspaceId) {
      setWorkspaceModal(true)
      return
    }
    try {
      const session = await client().call('session.create', { workspaceId })
      await refreshCatalog()
      await openSession(session.id)
      setMobileView('chat')
    } catch (error) {
      report(error)
    }
  }
  function selectSession(id: string) {
    void openSession(id).catch(report)
    if (model.getNodeById(`session:${id}`)) model.doAction(Actions.selectTab(`session:${id}`))
    setMobileView('chat')
  }
  function openFile(path: string) {
    setMobileFile(path)
    openPanel(`file:${workspaceId}:${path}`, path.split('/').at(-1)!, 'file', { path, workspaceId })
  }
  function factory(node: TabNode) {
    const config = node.getConfig() as { sessionId?: string; path?: string; workspaceId?: string; panelId?: string }
    switch (node.getComponent()) {
      case undefined:
        return <div className="empty-tool">面板不可用</div>
      case 'conversation':
        return <Chat {...(config?.sessionId ? { sessionId: config.sessionId } : {})} onSettings={settings} />
      case 'settings':
        return <Settings />
      case 'activity':
        return <ActivityPanel />
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
            useWorkbench.setState({ workspaceId: event.target.value, activeSession: '' })
            if (!small) model.doAction(Actions.selectTab('welcome'))
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
        <span className="top-spacer" />
        <span className={`host-status ${status === 'connected' ? 'success' : 'warning'}`}>
          <i />
          {status === 'connected' ? (host?.platform === 'win32' ? 'Windows Host' : 'Host') : '重新连接中'}
        </span>
        <button title="设置" aria-label="设置" onClick={settings}>
          <Settings2 size={17} />
        </button>
      </header>
      <div className={`main-frame ${sidebar ? '' : 'sidebar-collapsed'}`}>
        <nav className="tool-rail left-rail">
          <button
            title="会话"
            aria-label="会话"
            className={panel === 'sessions' ? 'selected' : ''}
            onClick={() => {
              useWorkbench.setState({ panel: 'sessions' })
              setSidebar(true)
            }}
          >
            <MessageSquare size={19} />
          </button>
          <button
            title="文件"
            aria-label="文件"
            className={panel === 'files' ? 'selected' : ''}
            onClick={() => {
              useWorkbench.setState({ panel: 'files' })
              setSidebar(true)
            }}
          >
            <Folder size={19} />
          </button>
          <span />
          <button title="诊断" aria-label="诊断" onClick={() => openPanel('diagnose', '诊断', 'diagnose')}>
            <CircleHelp size={18} />
          </button>
          <button
            title="恢复默认布局"
            aria-label="恢复默认布局"
            onClick={() => {
              useWorkbench.setState({ layout: null })
              setModel(Model.fromJson(defaultLayout()))
            }}
          >
            <LayoutGrid size={18} />
          </button>
        </nav>
        <aside className="sidebar">
          {panel === 'sessions' ? (
            <Sessions onSelect={selectSession} onNew={() => void newSession()} />
          ) : (
            <Files onOpen={openFile} />
          )}
        </aside>
        <main className="workbench">
          {small ? (
            <>
              {mobileView === 'sessions' ? (
                <Sessions onSelect={selectSession} onNew={() => void newSession()} />
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
              ) : mobileView === 'plugin' ? (
                renderPlugin(mobilePanel)
              ) : mobileView === 'plugins' ? (
                <div className="plugin-panel">
                  <h2>插件面板</h2>
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
                <Chat sessionId={activeSession} onSettings={settings} />
              )}
            </>
          ) : (
            <Layout
              model={model}
              factory={factory}
              onModelChange={(next, action) => {
                useWorkbench.setState({ layout: next.toJson() })
                const previous = useWorkbench.getState().activeSession
                if (
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
                    void client().unfollow(previous).catch(report)
                  }
                }
                if (action.type === Actions.SELECT_TAB) {
                  const tabNode = (action.data as { tabNode?: unknown }).tabNode
                  if (typeof tabNode === 'string') {
                    const node = next.getNodeById(tabNode)
                    if (node instanceof TabNode && node.getComponent() === 'conversation') {
                      const id = (node.getConfig() as { sessionId?: string })?.sessionId
                      if (id && id !== useWorkbench.getState().activeSession) void openSession(id).catch(report)
                      else if (!id) {
                        const previous = useWorkbench.getState().activeSession
                        useWorkbench.setState({ activeSession: '' })
                        if (previous) void client().unfollow(previous).catch(report)
                      }
                    }
                  }
                }
              }}
            />
          )}
        </main>
        <nav className="tool-rail right-rail">
          <button title="运行与事件" aria-label="运行与事件" onClick={() => openPanel('activity', '运行', 'activity')}>
            <Activity size={18} />
          </button>
          <button title="模型与插件" aria-label="模型与插件" onClick={settings}>
            <Network size={18} />
          </button>
          {[...(data?.panels ?? []), ...clientPanels].map((contribution) => (
            <button
              key={contribution.id}
              title={contribution.title}
              aria-label={contribution.title}
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
            </button>
          ))}
          <span />
          <button title="诊断" aria-label="诊断" onClick={() => openPanel('diagnose', '诊断', 'diagnose')}>
            <CircleHelp size={18} />
          </button>
        </nav>
      </div>
      <footer className="statusbar">
        <span>
          <Folder size={12} />
          {data?.workspaces.find((workspace) => workspace.id === workspaceId)?.path ?? 'Workspace'}
        </span>
        <span>
          <ShieldCheck size={12} />
          {permissionPreset(approvalMode).shortLabel}
        </span>
        <span className="status-spacer" />
        <span>{host?.activeRuns ?? 0} active</span>
        <span>UTF-8</span>
        <span>0.1.0</span>
      </footer>
      <nav className="mobile-nav">
        {[
          { id: 'sessions', label: '会话', icon: MessageSquare },
          { id: 'chat', label: '对话', icon: Plus },
          { id: 'files', label: '文件', icon: Folder },
          { id: 'activity', label: '运行', icon: Activity },
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
