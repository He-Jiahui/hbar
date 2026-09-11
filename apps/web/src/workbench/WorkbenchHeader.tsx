import type { ConnectionStatus } from '@hbar/client'
import type { HostInfo, Session, Workspace } from '@hbar/contracts'
import { ChevronDown, Command, FolderOpen, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react'
import GlassSurface from '../react-bits/GlassSurface'
import './WorkbenchHeader.css'

export interface WorkbenchHeaderProps {
  status: ConnectionStatus
  host: HostInfo | null
  workspaces: readonly Workspace[]
  workspaceId: string
  activeSession: Session | undefined
  sidebarOpen: boolean
  compact: boolean
  onToggleSidebar(): void
  onSelectWorkspace(workspaceId: string): void
  onAddWorkspace(): void
  onOpenCommandPalette(): void
}

function hostLabel(status: ConnectionStatus, host: HostInfo | null): string {
  if (status !== 'connected') return '重新连接中'
  if (host?.platform === 'win32') return 'Windows Host'
  return 'Host'
}

/**
 * The application frame header is intentionally data-in/data-out.  It owns
 * only shell semantics (scope, current session and connection state); the
 * parent remains responsible for navigation and transport actions.
 */
export default function WorkbenchHeader({
  status,
  host,
  workspaces,
  workspaceId,
  activeSession,
  sidebarOpen,
  compact,
  onToggleSidebar,
  onSelectWorkspace,
  onAddWorkspace,
  onOpenCommandPalette,
}: WorkbenchHeaderProps) {
  const sessionTitle = activeSession?.title ?? '新会话'
  const currentWorkspace = workspaces.find((workspace) => workspace.id === workspaceId)
  const connectionReady = status === 'connected'

  return (
    <header className={`topbar rb-shell-header${compact ? ' rb-shell-header-compact' : ''}`}>
      <GlassSurface className="chrome-glass" width="100%" height="100%" aria-hidden="true" />
      <div className="shell-header-leading">
        <button
          type="button"
          className="sidebar-toggle"
          title={compact ? '打开会话侧栏' : '会话侧栏'}
          aria-label="会话侧栏"
          aria-expanded={sidebarOpen}
          onClick={onToggleSidebar}
        >
          {sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
        </button>
        <div className="brand" aria-label="hbar">
          hbar
          <span aria-hidden="true" />
        </div>
      </div>
      <div className="top-divider" aria-hidden="true" />
      <div className="shell-scope">
        <FolderOpen size={16} className="folder-icon" aria-hidden="true" />
        <label className="workspace-switcher">
          <span className="workspace-switcher-copy">
            <span className="workspace-switcher-eyebrow">工作区</span>
            <select
              className="workspace-select"
              aria-label="选择工作区"
              value={workspaceId}
              onChange={(event) => onSelectWorkspace(event.target.value)}
            >
              <option value="" disabled>
                选择工作区
              </option>
              {workspaces.map((workspace) => (
                <option value={workspace.id} key={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </span>
          <ChevronDown className="workspace-switcher-chevron" size={13} aria-hidden="true" />
        </label>
        <button
          type="button"
          className="add-workspace"
          title="添加工作区"
          aria-label="添加工作区"
          onClick={onAddWorkspace}
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="top-context" title={sessionTitle} aria-label={`当前会话：${sessionTitle}`}>
        <span className="top-context-label">会话</span>
        <strong>{sessionTitle}</strong>
        {currentWorkspace && <span className="top-context-workspace">{currentWorkspace.name}</span>}
      </div>
      <span className="top-spacer" />
      <button
        type="button"
        className="top-command"
        title="命令面板（Ctrl+Shift+P）"
        aria-label="打开命令面板"
        onClick={onOpenCommandPalette}
      >
        <Command size={17} aria-hidden="true" />
        <span>命令</span>
        <kbd>Ctrl⇧P</kbd>
      </button>
      <span
        className={`host-status ${connectionReady ? 'success' : 'warning'}`}
        aria-live="polite"
        title={connectionReady ? `已连接 · ${host?.version ?? 'Host'}` : '宿主连接正在恢复'}
      >
        <i aria-hidden="true" />
        <span className="host-status-text">{hostLabel(status, host)}</span>
      </span>
    </header>
  )
}
