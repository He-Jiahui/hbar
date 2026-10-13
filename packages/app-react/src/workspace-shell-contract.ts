import { type ReactNode } from 'react'

import { type LumenAppShellProps, type LumenToolPresentation } from '@lumen/app-ui'

import type { SessionActivityExecution, SidebarLocale } from '@hbar/contracts/sidebar-directory'

import { type SessionStopLabels } from './session-stop'

import { type WorkspaceOrganizationLabels } from './workspace-organization'

import {
  type WorkspaceHeaderSortMenuLabels,
  type WorkspaceHeaderOrganizationLabels,
} from './workspace-header-sort-menu'
import { type SidebarTimeGroupId } from './sidebar-time-groups'

import { type WorkspaceDisplayNamesLabels } from './workspace-display-names'

import { type WorkspaceFoldersLabels } from './workspace-folders'
import type { WorkspaceNodeFolderRegistry } from './workspace-folders'
import type { WorkspaceLocationPickerLabels } from './workspace-location-picker'
import { type SessionRenameLabels } from './session-navigation-row'
import { type SessionAgentTreeLabels } from './session-agent-branch'
import { type SessionArchiveBatchLabels, type SessionArchiveLabels } from './session-archive'

import { type SessionRosterRefreshLabels } from './session-roster-feedback'

import { type HbarHostConnectionNoticeLabels } from './host-connection-notice'
import { type HbarRuntimeStatusLabels } from './host-runtime-status'
export interface HbarSidebarTimeLabels {
  readonly title: string
  readonly showTime: string
  readonly showProjects: string
  readonly groups: Readonly<Record<SidebarTimeGroupId, string>>
  readonly execution: Readonly<Record<SessionActivityExecution['state'], string>>
}

export interface HbarWorkspaceShellLabels {
  readonly connectionNotice: HbarHostConnectionNoticeLabels
  readonly agentTree: SessionAgentTreeLabels
  readonly stop: SessionStopLabels
  readonly main: string
  readonly brand: string
  readonly projectsAndSessions: string
  readonly organization: WorkspaceOrganizationLabels
  readonly sort: WorkspaceHeaderSortMenuLabels & {
    readonly capacityReached: string
    readonly sessionCapacityReached: string
    readonly organization: WorkspaceHeaderOrganizationLabels
    readonly time: HbarSidebarTimeLabels
    readonly reorder: {
      readonly moveUp: string
      readonly moveDown: string
      readonly dragHint: (name: string) => string
    }
  }
  readonly displayNames: WorkspaceDisplayNamesLabels
  readonly workspaceFolders: WorkspaceFoldersLabels
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
  readonly more: string
  readonly commandShortcut: string
  readonly settingsShortcut: string
  readonly searchChats: string
  readonly searchShortcut: string
  readonly archiveBatch: SessionArchiveBatchLabels
  readonly roster: SessionRosterRefreshLabels
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
  readonly workspaceRunBoard: string
  readonly schedules: string
  readonly extensionsAndSkills: string
  readonly workspaceSettings: string
  readonly pinWorkspace: string
  readonly unpinWorkspace: string
  readonly pinnedWorkspace: (name: string) => string
  readonly pinningWorkspace: string
  readonly pinSaved: string
  readonly pinRemoved: string
  readonly pinVolatile: string
  readonly pinUnknown: string
  readonly pinCheck: string
  readonly pinFailure: (code: string) => string
  readonly pinRestoreFailure: (code: string) => string
  readonly pinRetryRestore: string
  readonly openSession: (name: string) => string
  readonly sessionUpdatedAt: (timestamp: number, now?: number) => string
  readonly sessionUpdatedAtFull: (timestamp: number) => string
  readonly sessionActions: (name: string) => string
  readonly selectSession: (name: string) => string
  readonly renameSession: string
  readonly renameEditor: SessionRenameLabels
  readonly archiveSession: string
  readonly archive: SessionArchiveLabels
  readonly error: (code: string) => string
}

export interface HbarWorkspaceShellContentControls {
  /** Render beside the workspace tabs, outside their scrollable tablist. */
  readonly leadingNavigation: ReactNode
}

export interface HbarWorkspaceShellProps {
  readonly runtimeStatusLabels?: HbarRuntimeStatusLabels
  readonly labels: HbarWorkspaceShellLabels
  readonly mobileNavigationLabel: string
  readonly locale?: SidebarLocale
  readonly sidebarWidthRem: number
  readonly sidebarRailWidthRem?: number
  readonly sidebarLayout?: LumenAppShellProps['sidebarLayout']
  readonly sidebarResize?: LumenAppShellProps['sidebarResize']
  readonly sidebarFeedback?: ReactNode
  readonly featureNavigation?: ReactNode | ((compact: boolean) => ReactNode)
  readonly notificationNavigation?: ReactNode
  /** Host-owned title for global feature pages, including the compact mobile header. */
  readonly pageTitle?: string | undefined
  readonly toolWidthRem?: number
  readonly toolLayout?: LumenAppShellProps['toolLayout']
  readonly toolResize?: LumenAppShellProps['toolResize']
  readonly mainRef?: LumenAppShellProps['mainRef']
  readonly toolRef?: LumenAppShellProps['toolRef']
  readonly resizeRef?: LumenAppShellProps['resizeRef']
  readonly onToolPresentationChange?: LumenAppShellProps['onToolPresentationChange']
  readonly desktopToolPresentation?: LumenToolPresentation
  readonly onCloseTool?: (() => void) | undefined
  readonly connection: 'connected' | 'connecting' | 'pairing' | 'disconnected'
  readonly onReconnect: () => void
  readonly titlebar?: ReactNode
  readonly tool?: ReactNode
  readonly toolLabel?: string
  readonly overlay?: ReactNode
  /** Host-owned creator for local or node-pinned workspaces. */
  readonly renderWorkspaceCreator?: (callbacks: {
    readonly open: boolean
    readonly onBrowseLocal: () => void
    readonly onCreated: (workspaceId: string) => void
    readonly onCancel: () => void
  }) => ReactNode
  readonly workspaceNodeBadgeLabels?: Pick<WorkspaceLocationPickerLabels, 'remoteWorkspace'>
  readonly workspaceNodeNames?: Readonly<Record<string, string>>
  readonly workspaceNodeFolderRegistry?: WorkspaceNodeFolderRegistry
  readonly workspaceNodeFolderMutationAllowed?: boolean
  readonly refreshWorkspaceNodeFolderRegistry?: (() => Promise<void>) | undefined
  /** Host-owned projections for the production shell. Existing runtime UI remains the default. */
  readonly slots?: HbarWorkspaceShellSlots
  /** Optional host projection for desktop layout descriptors. */
  readonly renderLayout?: (
    panes: Readonly<Record<'projects' | 'workspace' | 'session-tool', ReactNode>>,
    shell: ReactNode,
  ) => ReactNode
  readonly children: ReactNode | ((controls: HbarWorkspaceShellContentControls) => ReactNode)
}

export interface HbarWorkspaceShellSlots {
  readonly navigation?: ReactNode
  readonly header?: ReactNode
  readonly content?: ReactNode
  readonly composer?: ReactNode
  readonly context?: ReactNode
}
export interface WorkspaceSidebarProps extends Omit<HbarWorkspaceShellProps, 'labels'> {
  readonly bridge: ReturnType<typeof import('./workspace-sidebar-bridge').useWorkspaceSidebarBridge>
}
