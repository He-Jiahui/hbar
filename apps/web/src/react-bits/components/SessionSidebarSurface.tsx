import { Archive, Folder, FolderOpen, GitBranch, LoaderCircle, MessageSquare, Pencil, Pin, PinOff, Plus, Search } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Session, Workspace } from '@hbar/contracts'
import AnimatedList from '../AnimatedList'
import LineSidebar from '../LineSidebar'
import SpotlightCard from '../SpotlightCard'
import { FloatingSurface } from '../../FloatingLayer'
import { referenceAttributes } from '../production'

export type SessionActionKind = 'fork' | 'archive'

export interface SessionSidebarLabels {
  readonly archived: string
  readonly sessions: string
  readonly newWorkspace: string
  readonly activeSessions: string
  readonly archivedSessions: string
  readonly searchSessions: string
  readonly pinnedArea: string
  readonly pinned: string
  readonly pinnedWorkspace: string
  readonly newSession: string
  readonly newSessionInWorkspace: string
  readonly pinSession: string
  readonly unpinSession: string
  readonly renameSession: string
  readonly rename: string
  readonly createBranch: string
  readonly restore: string
  readonly archive: string
  readonly restoreSession: string
  readonly archiveSession: string
  readonly noMatchingSessions: string
  readonly noArchivedSessions: string
  readonly noSessions: string
  readonly noGitBranch: string
  readonly branchLabel: string
  readonly lastResponse: string
  readonly sessionOptions: string
  readonly pinWorkspace: string
}

export interface SessionSidebarRow {
  readonly session: Session
  readonly workspaceName: string
  readonly workspacePath?: string | undefined
  readonly branch?: string | null | undefined
  readonly status: string
  readonly statusIcon: ReactNode
  readonly responseLabel: string
  readonly responseTitle?: string | undefined
  readonly pinned: boolean
  readonly selected: boolean
}

export interface SessionSidebarWorkspaceGroup {
  readonly workspace: Workspace
  readonly sessions: readonly SessionSidebarRow[]
  readonly expanded: boolean
  readonly pinned: boolean
  readonly branch?: string | null | undefined
}

export interface SessionContextMenuState {
  readonly x: number
  readonly y: number
  readonly type: 'workspace' | 'session'
  readonly id: string
}

export interface SessionSidebarSurfaceProps {
  readonly labels: SessionSidebarLabels
  readonly archived: boolean
  readonly creating: boolean
  readonly selectedId?: string | undefined
  readonly search: string
  readonly renamingId?: string | null | undefined
  readonly renameValue: string
  readonly renameBusy: boolean
  readonly sessionActions: Readonly<Record<string, SessionActionKind>>
  readonly workspaces: readonly SessionSidebarWorkspaceGroup[]
  readonly pinnedWorkspaces: readonly Workspace[]
  readonly pinnedSessions: readonly SessionSidebarRow[]
  readonly visibleSessionCount: number
  readonly contextMenu?: SessionContextMenuState | null | undefined
  readonly contextSession?: Session | undefined
  onSearchChange(value: string): void
  onToggleArchived(): void
  onAddWorkspace(): void
  onSelectSession(id: string): void
  onSelectWorkspace(id: string): void
  onNewSession(workspaceId: string): void
  onToggleWorkspace(id: string): void
  onContextMenu(event: React.MouseEvent, type: 'workspace' | 'session', id: string): void
  onTogglePinned(type: 'workspace' | 'session', id: string): void
  onStartRename(event: React.MouseEvent, session: Session): void
  onRenameChange(value: string): void
  onFinishRename(): void
  onCancelRename(): void
  onFork(session: Session): void
  onArchive(session: Session): void
  onCloseContextMenu(): void
  onContextRename(id: string): void
  onContextArchive(id: string): void
}

function renderRowDetails(row: SessionSidebarRow, labels: SessionSidebarLabels) {
  const { session } = row
  return (
    <>
      <span className="session-leading-icon" aria-hidden="true">{row.pinned ? <Pin size={14} /> : <MessageSquare size={14} />}</span>
      <span className="session-row-copy">
        <span>{session.title}</span>
        <small title={row.branch ? `${row.workspacePath ?? row.workspaceName} · ${row.branch}` : labels.noSessions}>
          {row.workspaceName} · {row.branch ? `${labels.branchLabel} · ${row.branch}` : labels.noGitBranch}
        </small>
      </span>
      <span className={`session-status-indicator session-status-${row.status}`} title={row.status} aria-label={row.status}>
        {row.statusIcon}
      </span>
      <small className="session-last-response" title={row.responseTitle}>{labels.lastResponse} {row.responseLabel}</small>
    </>
  )
}

/**
 * ReactBits app-sidebar surface for hbar sessions/workspaces. It is a pure
 * list/interaction view: stores, Git lookups and RPCs stay in the adapter.
 * The LineSidebar + AnimatedList combination follows the reference's dense
 * scoped navigation, pinned area and keyboard/mouse-friendly row actions.
 *
 * References:
 * - https://pro.reactbits.dev/docs/app-ui/app-sidebar
 * - https://pro.reactbits.dev/docs/app-ui/list
 * - https://pro.reactbits.dev/docs/app-ui/app-shell/app-shell-9
 */
export default function SessionSidebarSurface({
  labels,
  archived,
  creating,
  selectedId,
  search,
  renamingId,
  renameValue,
  renameBusy,
  sessionActions,
  workspaces,
  pinnedWorkspaces,
  pinnedSessions,
  visibleSessionCount,
  contextMenu,
  contextSession,
  onSearchChange,
  onToggleArchived,
  onAddWorkspace,
  onSelectSession,
  onSelectWorkspace,
  onNewSession,
  onToggleWorkspace,
  onContextMenu,
  onTogglePinned,
  onStartRename,
  onRenameChange,
  onFinishRename,
  onCancelRename,
  onFork,
  onArchive,
  onCloseContextMenu,
  onContextRename,
  onContextArchive,
}: SessionSidebarSurfaceProps) {
  return (
    <div
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/app-sidebar', 'bootstrap-shell')}
      className="session-nav rb-session-sidebar-surface"
      onClick={() => contextMenu && onCloseContextMenu()}
    >
      <div className="sidebar-heading">
        <strong>{archived ? labels.archived : labels.sessions}</strong>
        <div>
          {!archived && <button type="button" title={labels.newWorkspace} aria-label={labels.newWorkspace} onClick={onAddWorkspace}><Plus size={15} /></button>}
          <button
            type="button"
            title={archived ? labels.activeSessions : labels.archivedSessions}
            aria-label={archived ? labels.activeSessions : labels.archivedSessions}
            className={archived ? 'selected' : ''}
            onClick={onToggleArchived}
          >
            <Archive size={15} />
          </button>
        </div>
      </div>
      <label className="search-field">
        <Search size={13} aria-hidden="true" />
        <input
          placeholder={labels.searchSessions}
          aria-label={labels.searchSessions}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>
      <LineSidebar
        {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/app-sidebar', 'bootstrap-shell')}
        className="session-line-sidebar"
        activeId={selectedId ?? null}
        itemSelector="[data-session-line-item]"
      >
        {(pinnedWorkspaces.length > 0 || pinnedSessions.length > 0) && (
          <section className="session-pinned-section" aria-label={labels.pinnedArea}>
            <div className="session-group-heading"><Pin size={12} />{labels.pinned}</div>
            {pinnedWorkspaces.map((workspace) => (
              <button
                type="button"
                key={workspace.id}
                className="workspace-item pinned"
                onContextMenu={(event) => onContextMenu(event, 'workspace', workspace.id)}
                onClick={() => onSelectWorkspace(workspace.id)}
              >
                <Folder size={14} /><span>{workspace.name}</span><Pin size={11} />
              </button>
            ))}
            {pinnedSessions.map((row) => (
              <button
                type="button"
                data-session-line-item
                data-line-id={row.session.id}
                key={row.session.id}
                className={`session-item-pinned${row.selected ? ' selected' : ''}`}
                onContextMenu={(event) => onContextMenu(event, 'session', row.session.id)}
                onClick={() => onSelectSession(row.session.id)}
              >
                <span className="session-line-marker" aria-hidden="true" />
                {renderRowDetails(row, labels)}
              </button>
            ))}
          </section>
        )}
        <AnimatedList
          className="session-list"
          viewportClassName="session-list-viewport"
          aria-label={archived ? labels.archivedSessions : labels.sessions}
        >
          {workspaces.map((group) => (
            <section className={`workspace-group${group.pinned ? ' pinned' : ''}`} key={group.workspace.id}>
              <div className="workspace-heading" onContextMenu={(event) => onContextMenu(event, 'workspace', group.workspace.id)}>
                <button type="button" className="workspace-toggle" onClick={() => onToggleWorkspace(group.workspace.id)}>
                  {group.expanded ? <FolderOpen size={14} /> : <Folder size={14} />}<strong>{group.workspace.name}</strong><span>{group.sessions.length}</span>
                </button>
                <div className="workspace-actions">
                  <button type="button" title={labels.pinnedWorkspace} aria-label={`${labels.pinnedWorkspace} ${group.workspace.name}`} onClick={() => onTogglePinned('workspace', group.workspace.id)}>
                    {group.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                  </button>
                  <button type="button" title={labels.newSession} aria-label={labels.newSessionInWorkspace.replace('{workspace}', group.workspace.name)} disabled={creating} onClick={() => onNewSession(group.workspace.id)}>
                    <Plus size={13} />
                  </button>
                </div>
              </div>
              {group.expanded && group.sessions.map((row) => (
                <SpotlightCard
                  data-session-line-item
                  data-line-id={row.session.id}
                  className={`session-item ${row.selected ? 'selected' : ''}`}
                  key={row.session.id}
                  spotlightColor="color-mix(in srgb, var(--rb-accent) 34%, transparent)"
                  onContextMenu={(event) => onContextMenu(event, 'session', row.session.id)}
                >
                  <span className="session-line-marker" aria-hidden="true" />
                  {renamingId === row.session.id ? (
                    <input
                      className="session-rename-input"
                      aria-label={`${labels.rename} ${row.session.title}`}
                      value={renameValue}
                      autoFocus
                      disabled={renameBusy}
                      onChange={(event) => onRenameChange(event.target.value)}
                      onBlur={onFinishRename}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          onFinishRename()
                        } else if (event.key === 'Escape') {
                          event.preventDefault()
                          onCancelRename()
                        }
                      }}
                    />
                  ) : (
                    <button type="button" className="session-select" onClick={() => onSelectSession(row.session.id)}>
                      {renderRowDetails(row, labels)}
                    </button>
                  )}
                  <div className="session-row-actions">
                    <button type="button" title={row.pinned ? labels.unpinSession : labels.pinSession} aria-label={`${row.pinned ? labels.unpinSession : labels.pinSession} ${row.session.title}`} onClick={() => onTogglePinned('session', row.session.id)}>
                      {row.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                    </button>
                    <button type="button" title={labels.renameSession} aria-label={`${labels.rename} ${row.session.title}`} disabled={renameBusy || Boolean(sessionActions[row.session.id])} onClick={(event) => onStartRename(event, row.session)}>
                      <Pencil size={12} />
                    </button>
                    <button type="button" title={labels.createBranch} aria-label={`${labels.createBranch} ${row.session.title}`} disabled={Boolean(sessionActions[row.session.id])} onClick={() => onFork(row.session)}>
                      {sessionActions[row.session.id] === 'fork' ? <LoaderCircle size={12} className="spinning" /> : <GitBranch size={12} />}
                    </button>
                    <button type="button" title={archived ? `${labels.restore} ${labels.sessions}` : `${labels.archive} ${labels.sessions}`} aria-label={`${archived ? labels.restore : labels.archive} ${row.session.title}`} disabled={Boolean(sessionActions[row.session.id])} onClick={() => onArchive(row.session)}>
                      {sessionActions[row.session.id] === 'archive' ? <LoaderCircle size={12} className="spinning" /> : <Archive size={12} />}
                    </button>
                  </div>
                </SpotlightCard>
              ))}
            </section>
          ))}
          {!visibleSessionCount && <div className="empty-nav">{search ? labels.noMatchingSessions : archived ? labels.noArchivedSessions : labels.noSessions}</div>}
        </AnimatedList>
      </LineSidebar>
      {contextMenu && (
        <SessionContextMenuSurface
          menu={contextMenu}
          session={contextSession}
          labels={labels}
          onClose={onCloseContextMenu}
          onTogglePinned={onTogglePinned}
          onRename={onContextRename}
          onArchive={onContextArchive}
        />
      )}
    </div>
  )
}

export interface SessionContextMenuLabels {
  readonly sessionOptions: string
  readonly pinSession: string
  readonly pinWorkspace: string
  readonly rename: string
  readonly restoreSession: string
  readonly archiveSession: string
}

export function SessionContextMenuSurface({
  menu,
  session,
  labels,
  onClose,
  onTogglePinned,
  onRename,
  onArchive,
}: {
  menu: SessionContextMenuState
  session?: Session | undefined
  labels: SessionContextMenuLabels
  onClose(): void
  onTogglePinned(type: 'workspace' | 'session', id: string): void
  onRename(id: string): void
  onArchive(id: string): void
}) {
  return (
    <FloatingSurface
      mode="point"
      anchorPoint={{ x: menu.x, y: menu.y }}
      open
      onClose={onClose}
      placement="below"
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/app-sidebar', 'bootstrap-shell')}
      className="session-context-menu rb-menu-surface"
      role="menu"
      aria-label={labels.sessionOptions}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="rb-menu-glass" aria-hidden="true" />
      <button type="button" role="menuitem" onClick={() => onTogglePinned(menu.type, menu.id)}><Pin size={14} />{menu.type === 'session' ? labels.pinSession : labels.pinWorkspace}</button>
      {menu.type === 'session' && session && (
        <>
          <button type="button" role="menuitem" onClick={() => onRename(session.id)}><Pencil size={14} />{labels.rename}</button>
          <button type="button" role="menuitem" onClick={() => onArchive(session.id)}><Archive size={14} />{session.archived ? labels.restoreSession : labels.archiveSession}</button>
        </>
      )}
    </FloatingSurface>
  )
}
