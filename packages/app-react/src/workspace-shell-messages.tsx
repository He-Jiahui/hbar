import type { ReactNode } from 'react'

import { createMessageScope } from './messages'
import type { HbarWorkspaceShellLabels } from './workspace-shell-contract'
import type { HbarWorkspaceTabsLabels } from './workspace-tabs'
import type { HbarWorkspaceTabsCloseLabels } from './workspace-tabs-close-dialog'

type ShellChromeMessages = Pick<
  HbarWorkspaceShellLabels,
  'main' | 'brand' | 'newSession' | 'showSidebar' | 'hideSidebar' | 'workspaceFiles' | 'settings' | 'status'
> & { readonly mobileNavigation: string }

type WorkspaceSidebarNavigationMessages = Pick<
  HbarWorkspaceShellLabels,
  | 'more'
  | 'status'
  | 'schedules'
  | 'commands'
  | 'projectsAndSessions'
  | 'showSidebar'
  | 'newSession'
  | 'searchChats'
  | 'settings'
  | 'server'
  | 'brand'
  | 'openWorkspace'
  | 'settingsShortcut'
  | 'searchShortcut'
  | 'hideSidebar'
>

type WorkspaceSidebarMessages = Pick<
  HbarWorkspaceShellLabels,
  | 'more'
  | 'status'
  | 'schedules'
  | 'commands'
  | 'projectsAndSessions'
  | 'showSidebar'
  | 'newSession'
  | 'searchChats'
  | 'settings'
  | 'server'
  | 'brand'
  | 'openWorkspace'
  | 'settingsShortcut'
  | 'searchShortcut'
  | 'hideSidebar'
  | 'error'
  | 'loading'
  | 'connected'
  | 'pairing'
  | 'disconnected'
  | 'noWorkspaces'
  | 'noSessions'
  | 'loadMore'
  | 'newSession'
  | 'creatingSession'
  | 'creationUnknown'
  | 'reconcileCreation'
  | 'chooseWorkspace'
  | 'chooseWorkspaceDescription'
  | 'workspacePath'
  | 'workspacePathHint'
  | 'addWorkspace'
  | 'openingWorkspace'
  | 'cancel'
  | 'createSessionInWorkspace'
  | 'workspaceFolders'
  | 'sort'
  | 'organization'
  | 'displayNames'
  | 'agentTree'
  | 'roster'
  | 'archiveBatch'
  | 'renameEditor'
  | 'archive'
  | 'pinRestoreFailure'
  | 'pinRetryRestore'
  | 'pinFailure'
  | 'pinSaved'
  | 'pinRemoved'
  | 'pinVolatile'
  | 'pinUnknown'
  | 'pinCheck'
>

type WorkspaceProjectTreeMessages = Pick<
  HbarWorkspaceShellLabels,
  | 'error'
  | 'loading'
  | 'noSessions'
  | 'noWorkspaces'
  | 'loadMore'
  | 'projectsAndSessions'
  | 'sort'
  | 'agentTree'
  | 'displayNames'
  | 'workspaceFiles'
  | 'workspaceRunBoard'
  | 'workspaceFolders'
  | 'workspaceSettings'
  | 'pinWorkspace'
  | 'unpinWorkspace'
  | 'pinnedWorkspace'
  | 'pinningWorkspace'
  | 'pinSaved'
  | 'pinRemoved'
  | 'pinVolatile'
  | 'pinUnknown'
  | 'pinCheck'
  | 'pinFailure'
  | 'roster'
  | 'organization'
  | 'archive'
  | 'createSessionInWorkspace'
  | 'workspaceActions'
>

type WorkspaceSidebarFooterMessages = Pick<HbarWorkspaceShellLabels, 'settings' | 'settingsShortcut'>

type WorkspaceSidebarRailMessages = Pick<
  HbarWorkspaceShellLabels,
  'projectsAndSessions' | 'showSidebar' | 'newSession' | 'searchChats' | 'settings' | 'server'
>

type WorkspaceNavigationFeedbackMessages = Pick<
  HbarWorkspaceShellLabels,
  'creatingSession' | 'openingWorkspace' | 'creationUnknown' | 'reconcileCreation' | 'error'
>

type SessionNavigationRowMessages = Pick<
  HbarWorkspaceShellLabels,
  | 'openSession'
  | 'sessionUpdatedAt'
  | 'sessionUpdatedAtFull'
  | 'sessionActions'
  | 'selectSession'
  | 'renameSession'
  | 'archiveSession'
  | 'archive'
  | 'renameEditor'
>

type SessionAgentBranchMessages = HbarWorkspaceShellLabels['agentTree']

type WorkspaceFoldersMessages = HbarWorkspaceShellLabels['workspaceFolders']
type WorkspaceDisplayNamesMessages = HbarWorkspaceShellLabels['displayNames']
type WorkspaceOrganizationMessages = HbarWorkspaceShellLabels['organization']
type WorkspaceHeaderSortMenuMessages = Pick<
  HbarWorkspaceShellLabels['sort'],
  'menu' | 'sortCondition' | 'createdAt' | 'updatedAt' | 'restoreHidden' | 'refresh' | 'updating'
>
type WorkspaceHeaderOrganizationMessages = HbarWorkspaceShellLabels['sort']['organization']
type WorkspaceTabsMessages = HbarWorkspaceTabsLabels
type WorkspaceTabsCloseMessages = HbarWorkspaceTabsCloseLabels

export const {
  Provider: WorkspaceShellChromeMessagesProvider,
  useMessages: useWorkspaceShellChromeMessages,
} = createMessageScope<ShellChromeMessages>()

export const {
  Provider: WorkspaceSidebarNavigationMessagesProvider,
  useMessages: useWorkspaceSidebarNavigationMessages,
} = createMessageScope<WorkspaceSidebarNavigationMessages>()

export const {
  Provider: WorkspaceSidebarMessagesProvider,
  useMessages: useWorkspaceSidebarMessages,
} = createMessageScope<WorkspaceSidebarMessages>()

export const {
  Provider: WorkspaceProjectTreeMessagesProvider,
  useMessages: useWorkspaceProjectTreeMessages,
} = createMessageScope<WorkspaceProjectTreeMessages>()

export const {
  Provider: WorkspaceSidebarFooterMessagesProvider,
  useMessages: useWorkspaceSidebarFooterMessages,
} = createMessageScope<WorkspaceSidebarFooterMessages>()

export const {
  Provider: WorkspaceSidebarRailMessagesProvider,
  useMessages: useWorkspaceSidebarRailMessages,
} = createMessageScope<WorkspaceSidebarRailMessages>()

export const {
  Provider: WorkspaceNavigationFeedbackMessagesProvider,
  useMessages: useWorkspaceNavigationFeedbackMessages,
} = createMessageScope<WorkspaceNavigationFeedbackMessages>()

export const {
  Provider: SessionNavigationRowMessagesProvider,
  useMessages: useSessionNavigationRowMessages,
} = createMessageScope<SessionNavigationRowMessages>()

export const {
  Provider: SessionAgentBranchMessagesProvider,
  useMessages: useSessionAgentBranchMessages,
} = createMessageScope<SessionAgentBranchMessages>()

export const {
  Provider: WorkspaceFoldersMessagesProvider,
  useMessages: useWorkspaceFoldersMessages,
} = createMessageScope<WorkspaceFoldersMessages>()

export const {
  Provider: WorkspaceDisplayNamesMessagesProvider,
  useMessages: useWorkspaceDisplayNamesMessages,
} = createMessageScope<WorkspaceDisplayNamesMessages>()

export const {
  Provider: WorkspaceOrganizationMessagesProvider,
  useMessages: useWorkspaceOrganizationMessages,
} = createMessageScope<WorkspaceOrganizationMessages>()

export const {
  Provider: WorkspaceHeaderSortMenuMessagesProvider,
  useMessages: useWorkspaceHeaderSortMenuMessages,
} = createMessageScope<WorkspaceHeaderSortMenuMessages>()

export const {
  Provider: WorkspaceHeaderOrganizationMessagesProvider,
  useMessages: useWorkspaceHeaderOrganizationMessages,
} = createMessageScope<WorkspaceHeaderOrganizationMessages>()

export const {
  Provider: WorkspaceTabsMessagesProvider,
  useMessages: useWorkspaceTabsMessages,
} = createMessageScope<WorkspaceTabsMessages>()

export const {
  Provider: WorkspaceTabsCloseMessagesProvider,
  useMessages: useWorkspaceTabsCloseMessages,
} = createMessageScope<WorkspaceTabsCloseMessages>()

export interface WorkspaceShellMessagesProviderProps {
  readonly labels: HbarWorkspaceShellLabels
  readonly mobileNavigationLabel: string
  readonly children: ReactNode
}

function pickMessages<TMessages extends object, TKey extends keyof TMessages>(
  messages: TMessages,
  keys: readonly TKey[],
): Pick<TMessages, TKey> {
  return Object.fromEntries(keys.map((key) => [key, messages[key]])) as Pick<TMessages, TKey>
}

/** Adapts the legacy host shell input into view-owned message providers. */
export function WorkspaceShellMessagesProvider({
  labels,
  mobileNavigationLabel,
  children,
}: WorkspaceShellMessagesProviderProps) {
  const chrome: ShellChromeMessages = {
    ...pickMessages(labels, [
      'main',
      'brand',
      'newSession',
      'showSidebar',
      'hideSidebar',
      'workspaceFiles',
      'settings',
      'status',
    ]),
    mobileNavigation: mobileNavigationLabel,
  }
  const navigation = pickMessages(labels, [
    'more',
    'status',
    'schedules',
    'commands',
    'projectsAndSessions',
    'showSidebar',
    'newSession',
    'searchChats',
    'settings',
    'server',
    'brand',
    'openWorkspace',
    'settingsShortcut',
    'searchShortcut',
    'hideSidebar',
  ])
  const sidebar = pickMessages(labels, [
    'more',
    'status',
    'schedules',
    'commands',
    'projectsAndSessions',
    'showSidebar',
    'newSession',
    'searchChats',
    'settings',
    'server',
    'brand',
    'openWorkspace',
    'settingsShortcut',
    'searchShortcut',
    'hideSidebar',
    'error',
    'loading',
    'connected',
    'pairing',
    'disconnected',
    'noWorkspaces',
    'noSessions',
    'loadMore',
    'newSession',
    'creatingSession',
    'creationUnknown',
    'reconcileCreation',
    'chooseWorkspace',
    'chooseWorkspaceDescription',
    'workspacePath',
    'workspacePathHint',
    'addWorkspace',
    'openingWorkspace',
    'cancel',
    'createSessionInWorkspace',
    'workspaceFolders',
    'sort',
    'organization',
    'displayNames',
    'agentTree',
    'roster',
    'archiveBatch',
    'renameEditor',
    'archive',
    'pinRestoreFailure',
    'pinRetryRestore',
    'pinFailure',
    'pinSaved',
    'pinRemoved',
    'pinVolatile',
    'pinUnknown',
    'pinCheck',
  ])
  const projectTree = pickMessages(labels, [
    'error',
    'loading',
    'noSessions',
    'noWorkspaces',
    'loadMore',
    'projectsAndSessions',
    'sort',
    'agentTree',
    'displayNames',
    'workspaceFiles',
    'workspaceRunBoard',
    'workspaceFolders',
    'workspaceSettings',
    'pinWorkspace',
    'unpinWorkspace',
    'pinnedWorkspace',
    'pinningWorkspace',
    'pinSaved',
    'pinRemoved',
    'pinVolatile',
    'pinUnknown',
    'pinCheck',
    'pinFailure',
    'roster',
    'organization',
    'archive',
    'createSessionInWorkspace',
    'workspaceActions',
  ])
  const footer = pickMessages(labels, ['settings', 'settingsShortcut'])

  return (
    <WorkspaceShellChromeMessagesProvider messages={chrome}>
      <WorkspaceSidebarNavigationMessagesProvider messages={navigation}>
        <WorkspaceSidebarMessagesProvider messages={sidebar}>
          <WorkspaceProjectTreeMessagesProvider messages={projectTree}>
            <WorkspaceSidebarFooterMessagesProvider messages={footer}>
              <WorkspaceSidebarRailMessagesProvider
                messages={pickMessages(labels, [
                  'projectsAndSessions',
                  'showSidebar',
                  'newSession',
                  'searchChats',
                  'settings',
                  'server',
                ])}
              >
                <WorkspaceNavigationFeedbackMessagesProvider
                  messages={pickMessages(labels, [
                    'creatingSession',
                    'openingWorkspace',
                    'creationUnknown',
                    'reconcileCreation',
                    'error',
                  ])}
                >
                  <SessionNavigationRowMessagesProvider
                    messages={pickMessages(labels, [
                      'openSession',
                      'sessionUpdatedAt',
                      'sessionUpdatedAtFull',
                      'sessionActions',
                      'selectSession',
                      'renameSession',
                      'archiveSession',
                      'archive',
                      'renameEditor',
                    ])}
                  >
                    <SessionAgentBranchMessagesProvider messages={labels.agentTree}>
                      <WorkspaceFoldersMessagesProvider messages={labels.workspaceFolders}>
                        <WorkspaceDisplayNamesMessagesProvider messages={labels.displayNames}>
                          <WorkspaceOrganizationMessagesProvider messages={labels.organization}>
                            <WorkspaceHeaderSortMenuMessagesProvider
                              messages={pickMessages(labels.sort, [
                                'menu',
                                'sortCondition',
                                'createdAt',
                                'updatedAt',
                                'restoreHidden',
                                'refresh',
                                'updating',
                              ])}
                            >
                              <WorkspaceHeaderOrganizationMessagesProvider messages={labels.sort.organization}>
                                {children}
                              </WorkspaceHeaderOrganizationMessagesProvider>
                            </WorkspaceHeaderSortMenuMessagesProvider>
                          </WorkspaceOrganizationMessagesProvider>
                        </WorkspaceDisplayNamesMessagesProvider>
                      </WorkspaceFoldersMessagesProvider>
                    </SessionAgentBranchMessagesProvider>
                  </SessionNavigationRowMessagesProvider>
                </WorkspaceNavigationFeedbackMessagesProvider>
              </WorkspaceSidebarRailMessagesProvider>
            </WorkspaceSidebarFooterMessagesProvider>
          </WorkspaceProjectTreeMessagesProvider>
        </WorkspaceSidebarMessagesProvider>
      </WorkspaceSidebarNavigationMessagesProvider>
    </WorkspaceShellChromeMessagesProvider>
  )
}
