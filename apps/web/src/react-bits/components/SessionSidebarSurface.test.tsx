import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'bun:test'
import type { Session, Workspace } from '@hbar/contracts'
import SessionSidebarSurface, { type SessionSidebarLabels, type SessionSidebarRow } from './SessionSidebarSurface'

const workspace: Workspace = { id: 'workspace_1', name: 'hbar', path: 'D:/Git/hbar', createdAt: 0 }
const session: Session = {
  id: 'session_1',
  workspaceId: workspace.id,
  title: 'UI migration',
  archived: false,
  parentId: null,
  createdAt: 0,
  updatedAt: 0,
  seq: 1,
}
const row: SessionSidebarRow = {
  session,
  workspaceName: workspace.name,
  workspacePath: workspace.path,
  branch: 'main',
  status: 'idle',
  statusIcon: createElement('span', null, '•'),
  responseLabel: 'now',
  pinned: false,
  selected: true,
}
const labels: SessionSidebarLabels = {
  archived: 'Archived',
  sessions: 'Sessions',
  newWorkspace: 'New workspace',
  activeSessions: 'Active sessions',
  archivedSessions: 'Archived sessions',
  searchSessions: 'Search sessions',
  pinnedArea: 'Pinned',
  pinned: 'Pinned',
  pinnedWorkspace: 'Pin workspace',
  newSession: 'New session',
  newSessionInWorkspace: 'New session in {workspace}',
  pinSession: 'Pin session',
  unpinSession: 'Unpin session',
  renameSession: 'Rename session',
  rename: 'Rename',
  createBranch: 'Create branch',
  restore: 'Restore',
  archive: 'Archive',
  restoreSession: 'Restore session',
  archiveSession: 'Archive session',
  noMatchingSessions: 'No matches',
  noArchivedSessions: 'No archived sessions',
  noSessions: 'No sessions',
  noGitBranch: 'No branch',
  branchLabel: 'Branch',
  lastResponse: 'Last response',
  sessionOptions: 'Session options',
  pinWorkspace: 'Pin workspace',
}

test('session sidebar surface is a real ReactBits app-sidebar composition', () => {
  const markup = renderToStaticMarkup(
    createElement(SessionSidebarSurface, {
      labels,
      archived: false,
      creating: false,
      selectedId: session.id,
      search: '',
      renameValue: '',
      renameBusy: false,
      sessionActions: {},
      workspaces: [{ workspace, sessions: [row], expanded: true, pinned: false, branch: 'main' }],
      pinnedWorkspaces: [],
      pinnedSessions: [],
      visibleSessionCount: 1,
      contextMenu: null,
      onSearchChange: () => undefined,
      onToggleArchived: () => undefined,
      onAddWorkspace: () => undefined,
      onSelectSession: () => undefined,
      onSelectWorkspace: () => undefined,
      onNewSession: () => undefined,
      onToggleWorkspace: () => undefined,
      onContextMenu: () => undefined,
      onTogglePinned: () => undefined,
      onStartRename: () => undefined,
      onRenameChange: () => undefined,
      onFinishRename: () => undefined,
      onCancelRename: () => undefined,
      onFork: () => undefined,
      onArchive: () => undefined,
      onCloseContextMenu: () => undefined,
      onContextRename: () => undefined,
      onContextArchive: () => undefined,
    }),
  )
  expect(markup).toContain('rb-session-sidebar-surface')
  expect(markup).toContain('data-reactbits-reference="https://pro.reactbits.dev/docs/app-ui/app-sidebar"')
  expect(markup).toContain('UI migration')
  expect(markup).toContain('rb-spotlight-card')
})
