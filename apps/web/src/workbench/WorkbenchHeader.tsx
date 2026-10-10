import type { ConnectionStatus } from '@hbar/client'
import type { HostInfo, Workspace } from '@hbar/contracts'
import { Command, FolderOpen, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react'
import { LumenButton, LumenIconButton, LumenSelect } from '@lumen/app-ui'
import GlassSurface from '../react-bits/GlassSurface'
import { StatusBadge, referenceAttributes } from '../react-bits'
import { useLocale } from '../locale'
import './WorkbenchHeader.css'

export interface WorkbenchHeaderProps {
  status: ConnectionStatus
  host: HostInfo | null
  workspaces: readonly Workspace[]
  workspaceId: string
  sidebarOpen: boolean
  compact: boolean
  onToggleSidebar(): void
  onSelectWorkspace(workspaceId: string): void
  onAddWorkspace(): void
  onOpenCommandPalette(): void
}

function hostLabel(status: ConnectionStatus, host: HostInfo | null, reconnecting: string): string {
  if (status !== 'connected') return reconnecting
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
  sidebarOpen,
  compact,
  onToggleSidebar,
  onSelectWorkspace,
  onAddWorkspace,
  onOpenCommandPalette,
}: WorkbenchHeaderProps) {
  const { t } = useLocale()
  const connectionReady = status === 'connected'

  return (
    <header
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/navbar', 'bootstrap-shell')}
      className={`topbar rb-shell-header${compact ? ' rb-shell-header-compact' : ''}`}
    >
      <GlassSurface className="chrome-glass" width="100%" height="100%" aria-hidden="true" />
      <div className="shell-header-leading">
        <LumenIconButton
          type="button"
          className="sidebar-toggle"
          title={t('sessionSidebar')}
          label={t('sessionSidebar')}
          aria-expanded={sidebarOpen}
          indicator="none"
          onClick={onToggleSidebar}
        >
          {sidebarOpen ? <PanelLeftClose size={17} aria-hidden="true" /> : <PanelLeftOpen size={17} aria-hidden="true" />}
        </LumenIconButton>
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
            <span className="workspace-switcher-eyebrow">{t('workspace')}</span>
            <LumenSelect
              className="workspace-select"
              variant="plain"
              aria-label={t('selectWorkspace')}
              value={workspaceId}
              onChange={(event) => onSelectWorkspace(event.target.value)}
            >
              <option value="" disabled>
                {t('selectWorkspace')}
              </option>
              {workspaces.map((workspace) => (
                <option value={workspace.id} key={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </LumenSelect>
          </span>
          <ChevronDown className="workspace-switcher-chevron" size={13} aria-hidden="true" />
        </label>
        <LumenIconButton
          type="button"
          className="add-workspace"
          title={t('addWorkspace')}
          label={t('addWorkspace')}
          indicator="none"
          onClick={onAddWorkspace}
        >
          <Plus size={14} aria-hidden="true" />
        </LumenIconButton>
      </div>
      <span className="top-spacer" />
      <LumenButton
        type="button"
        variant="text"
        indicator="none"
        className="top-command"
        title={`${t('commandPalette')}（Ctrl+Shift+P）`}
        aria-label={t('commandPalette')}
        onClick={onOpenCommandPalette}
      >
        <Command size={17} aria-hidden="true" />
        <span>{t('commandShort')}</span>
        <kbd>Ctrl⇧P</kbd>
      </LumenButton>
      <StatusBadge
        status={connectionReady ? 'success' : 'warning'}
        className={`host-status ${connectionReady ? 'success' : 'warning'}`}
        aria-live="polite"
        title={connectionReady ? `${t('connected')} · ${host?.version ?? 'Host'}` : t('hostRecovering')}
        data-connection-status={status}
      >
        <span className="host-status-text">{hostLabel(status, host, t('reconnecting'))}</span>
      </StatusBadge>
    </header>
  )
}
