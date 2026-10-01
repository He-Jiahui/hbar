import {
  CommandRegistry,
  CommandError,
  createCommandClient,
  parseArguments,
  tokenizeCommand,
  type ExecuteOptions,
} from '@hbar/commands'
/** Public application error for View-side validation without reaching into command infrastructure. */
export { CommandError as RuntimeCommandError } from '@hbar/commands'
import { applicationCommands, navigationCommands, surfaceCommands } from '@hbar/contracts/commands'
import { budgetEditorCommands } from '@hbar/contracts/commands/budget-editor'
import { draftCommands } from '@hbar/contracts/commands/draft'
import { preSessionDraftCommands } from '@hbar/contracts/commands/pre-session-draft'
export type { PreSessionDraftState } from '@hbar/contracts/commands/pre-session-draft'
export type { SessionLaunchSelection } from '@hbar/contracts/commands/session-launch-target'
export type { SessionLaunchBranchesPage } from '@hbar/contracts/commands/session-launch-branches'
export type { PromptWorkspaceContext, PromptWorkspaceContextInput } from '@hbar/contracts/commands/draft'
export { MAX_PROMPT_WORKSPACE_CONTEXT_QUOTE_LENGTH } from '@hbar/contracts/commands/draft'
import { runAcceptedSchema, runCommands } from '@hbar/contracts/commands/run'
import { runActionCommands } from '@hbar/contracts/commands/run-action'
export { runActionCommands } from '@hbar/contracts/commands/run-action'
export type { CancellationReconciliation, ObservedOperationStatus } from '@hbar/contracts/commands/run-action'
import { interactionCommands } from '@hbar/contracts/commands/interaction'
import { modelCommands } from '@hbar/contracts/commands/models'
import { usageCommands } from '@hbar/contracts/commands/usage'
import { interactionDraftCommands } from '@hbar/contracts/commands/interaction-draft'
import { settingsEditorCommands } from '@hbar/contracts/commands/settings-editor'
import { providerEditorCommands } from '@hbar/contracts/commands/provider-editor'
import { configurationCommands } from '@hbar/contracts/commands/configuration'
import { commandPaletteCommands } from '@hbar/contracts/commands/command-palette'
import { fileWorkspaceCommands } from '@hbar/contracts/commands/file-workspace'
export type { SessionFileTarget } from '@hbar/contracts/commands/files'
export type { FileComposerContextSelection } from '@hbar/contracts/commands/file-workspace'
export { projectWorkspaceDiffRows, selectWorkspaceDiffRange } from './file-context-selection'
export type { WorkspaceDiffRow, WorkspaceDiffRange } from './file-context-selection'
import { agentWorkspaceCommands } from '@hbar/contracts/commands/agent-workspace'
import { goalPlanWorkspaceCommands } from '@hbar/contracts/commands/goal-plan-workspace'
import { workflowWorkspaceCommands } from '@hbar/contracts/commands/workflow-workspace'
import { extensionWorkspaceCommands } from '@hbar/contracts/commands/extension-workspace'
import { statusWorkspaceCommands } from '@hbar/contracts/commands/status-workspace'
import { clientPersistenceCommands } from '@hbar/contracts/commands/client-persistence'
import { terminalApplicationCommands } from '@hbar/contracts/commands/terminal-application'
import { sessionTimelineCommands } from '@hbar/contracts/commands/session-timeline'
import { createState } from './state'
import { startupSettingsState } from './startup-settings'
import { createSessionExecutionAccess } from './session-execution-access'
import { createSelectedSessionExecution, selectedSessionExecutionCommands } from './selected-session-execution'
export { selectedSessionExecutionCommands } from './selected-session-execution'
export type { SelectedSessionExecutionState } from './selected-session-execution'
import { createSessionExecutionPreparation } from './session-execution-preparation'
import { createDirectoryModule } from './directory'
export { parseWorkspacePage } from './directory'
import { registerNavigationCommands } from './navigation'
import { createWorkspaceTabs, workspaceTabCommands, MAX_WORKSPACE_TABS } from './workspace-tabs-runtime'
import { createAgentChildNavigation, agentChildNavigationCommands } from './agent-child-navigation'
import { createSessionMessageForkNavigation, sessionMessageForkCommands } from './session-message-fork-navigation'
export { workspaceTabCommands } from './workspace-tabs-runtime'
export { agentChildNavigationCommands } from './agent-child-navigation'
export { sessionMessageForkCommands, messageForkActionKey } from './session-message-fork-navigation'
export type { SessionMessageForkState, SessionMessageForkAction } from './session-message-fork-navigation'
export { MAX_WORKSPACE_TABS } from './workspace-tabs-runtime'
export { isWorkspaceRelativePath } from './composer-mentions'
export { parseComposerFilePage, parseComposerPathSearch } from './composer-mention-query'
export type { PromptMention } from '@hbar/contracts/commands/draft'
export type {
  WorkspaceTabRef,
  WorkspaceTabsState,
  WorkspaceTabNavigationHooks,
  AgentChildSource,
} from './workspace-tabs-runtime'
import { createBudgetForms } from './budget-forms'
import { registerSurfaceCommands } from './surfaces'
import { createSessionTools, sessionToolCommands } from './session-tools'
import { isSessionToolProtected } from './session-tool-retention'
export { sessionToolCommands } from './session-tools'
import { createSessionTimeline } from './session-timeline'
import { activityWorkspaceCommands, createActivityWorkspace } from './activity-workspace'
export {
  activityWorkspaceCommands,
  ACTIVITY_WORKSPACE_MAX_ITEMS,
  ACTIVITY_WORKSPACE_PAGE_SIZE,
} from './activity-workspace'
export type { ActivityWorkspaceEntryState, ActivityWorkspaceState, ActivityAgentEntryState } from './types'
import { createQueuedUserRuns, queuedUserRunsCommands } from './queued-user-runs'
export { queuedUserRunsCommands, QUEUED_USER_RUNS_PAGE_SIZE } from './queued-user-runs'
export type { QueuedUserRunsState } from './queued-user-runs'
export { createConversationFind, CONVERSATION_FIND_LIMITS } from './conversation-find'
export type { ConversationFindSource, ConversationFindMatch, ConversationFindState } from './conversation-find'
import { createGoalHistory, goalHistoryCommands } from './goal-history'
export { goalHistoryCommands, getGoalHistoryProjection, GOAL_HISTORY_MAX_FACTS } from './goal-history'
export type {
  GoalHistoryState,
  GoalHistoryEntry,
  GoalHistoryProjection,
  GoalHistoryFact,
  GoalHistorySnapshot,
} from './goal-history'
import { createDrafts } from './drafts'
import { createPreSessionDrafts } from './pre-session-drafts'
import { createPreSessionLaunchBranches, preSessionLaunchBranchesCommands } from './pre-session-launch-branches'
import {
  createPreSessionLaunchBranchCreation,
  preSessionLaunchBranchCreationCommands,
  sessionLaunchBranchCreationCommands,
} from './pre-session-launch-branch-creation'
import { createSessionLaunchDrafts, sessionLaunchDraftCommands } from './session-launch-drafts'
import { createSessionWorkspaceMove, sessionWorkspaceMoveCommands } from './session-workspace-move'
import { agentPageSchema } from '@hbar/contracts/commands/agents'
import { createPlanProposalActions, planProposalCommands } from './plan-proposal-actions'
import { createInteractions } from './interactions'
import { interactionRecoveryCommands } from './interaction-recovery'
import { createSessionControls } from './session-controls'
import { composerModelCommands, createComposerModel } from './composer-model'
import { composerIntentCommands, createComposerIntent } from './composer-intent'
import { composerPermissionCommands, createComposerPermission } from './composer-permission'
import { composerPlanModeCommands, createComposerPlanMode } from './composer-plan-mode'
import { composerPlanChoiceCommands, registerComposerPlanChoice } from './composer-plan-choice'
import { sessionRenameCommands, createSessionRename } from './session-rename'
import { sessionArchiveCommands, createSessionArchive } from './session-archive'
import { createSettingsForms } from './settings-forms'
import { createProviderSettings } from './provider-settings'
import { createCommandPalette } from './command-palette'
import { createFileWorkspace } from './file-workspace'
export { filteredFileChanges, FILE_CHANGES_PAGE_SIZE } from './file-workspace-changes'
import { createAgentWorkspace } from './agent-workspace'
import { agentComposerCommands, createAgentComposer } from './agent-composer'
export { agentComposerCommands } from './agent-composer'
import { createGoalPlanWorkspace } from './goal-plan-workspace'
import { createWorkflowWorkspace } from './workflow-workspace'
import { createExtensionWorkspace } from './extension-workspace'
export { EXTENSION_PAGE_SIZE, extensionWorkspacePage } from './extension-workspace-model'
import { createStatusWorkspace } from './status-workspace'
import { createSessionGitContext, sessionGitContextCommands } from './session-git-context'
import { createSessionRosterRefresh, sessionRosterRefreshCommands } from './session-roster-refresh'
export { sessionRosterRefreshCommands } from './session-roster-refresh'
export type { SessionRosterRefreshState, SessionRosterRefreshEntry } from './session-roster-refresh'
export { PRE_SESSION_LAUNCH_BRANCHES_PAGE_SIZE, preSessionLaunchBranchesCommands } from './pre-session-launch-branches'
export type { PreSessionLaunchBranchesState } from './pre-session-launch-branches'
export {
  preSessionLaunchBranchCreationCommands,
  sessionLaunchBranchCreationCommands,
} from './pre-session-launch-branch-creation'
export type {
  PreSessionLaunchBranchCreationEntry,
  PreSessionLaunchBranchCreationState,
} from './pre-session-launch-branch-creation'
import { createSettingsUsage, settingsUsageCommands } from './settings-usage'
export { settingsUsageCommands, SETTINGS_USAGE_MAX_BUCKETS } from './settings-usage'
export type { SettingsUsageWindow, SettingsUsageReport, SettingsUsageEntry, SettingsUsageState } from './settings-usage'
export type { SessionGitContextState } from './session-git-context'
import { createSystemDiagnostics, systemDiagnosticsCommands } from './system-diagnostics'
import { createClientPersistence } from './client-persistence'
import { createWorkspacePins, workspacePinCommands } from './workspace-pins'
import { createWorkspaceActivity, workspaceActivityCommands } from './workspace-activity'
export { workspaceActivityCommands, orderWorkspaceActivityIds } from './workspace-activity'
export type { WorkspaceActivityState, WorkspaceActivityOptions } from './workspace-activity'
import { createWorkspaceOrganization, workspaceOrganizationClientCommands } from './workspace-organization'
export { workspaceOrganizationClientCommands } from './workspace-organization'
export type { WorkspaceOrganizationState, WorkspaceOrganizationAction } from './workspace-organization'
import { createWorkspaceDisplayNames, workspaceDisplayNamesClientCommands } from './workspace-display-names'
export { workspaceDisplayNamesClientCommands, workspaceDisplayName } from './workspace-display-names'
export type {
  WorkspaceDisplayNamesState,
  WorkspaceDisplayNamesAction,
  WorkspaceDisplayNameEditor,
  WorkspaceDisplayNamesSnapshot,
} from './workspace-display-names'
export { MAX_PINNED_WORKSPACES, sortPinnedWorkspaces } from './workspace-pins'
export type { WorkspacePinAction, WorkspacePinsState } from './workspace-pins'
import type { NavigationState, PresentationState, RuntimeOptions, SurfaceState } from './types'
export { goalControlStatuses } from './goal-plan-workspace'
export type { StateReader } from './state'
export { createImageThumbnails, IMAGE_THUMBNAILS_MAX_ITEMS } from './image-thumbnails'
export type {
  ImageThumbnails,
  ImageThumbnailsRequest,
  ImageThumbnailState,
  ImageThumbnailsState,
  ImageThumbnailsOptions,
} from './image-thumbnails'
export { createImageViewer, IMAGE_VIEWER_MAX_ITEMS } from './image-viewer'
export type {
  ImageViewer,
  ImageViewerSource,
  ImageViewerItem,
  ImageViewerRequest,
  ImageViewerState,
  ImageViewerResource,
  ImageViewerOptions,
  ImageResourceLease,
  ImageResourcePort,
  ImageResourceErrorCode,
} from './image-viewer'
export {
  projectSessionDraftImages,
  projectPreSessionDraftImages,
  projectSessionMessageImages,
  containsPreSessionDraftImages,
  isPreSessionImageRequestCurrent,
  isSessionImageRequestCurrent,
} from './session-image-sources'
export type {
  SessionImageProjection,
  PreSessionImageProjection,
  SessionImageDraftInput,
  PreSessionDraftImageInput,
  SessionImageMessageInput,
  SessionImageMembership,
  PreSessionImageMembership,
  SessionImageDraft,
  PreSessionImageDraft,
  SessionImageMessage,
  SessionImageTimeline,
} from './session-image-sources'
export { projectSessionDecisions, sessionDecisionAction } from './interaction-presentations'
export type { SessionDecision, SessionDecisionProjection, QuestionnaireFact } from './interaction-presentations'
export { interactionRecoveryCommands } from './interaction-recovery'
export { planProposalCommands, planProposalActionKey } from './plan-proposal-actions'
export type { SessionExecutionAccess, SessionExecutionTarget } from './session-execution-access'
export { parseProposedPlan } from './proposed-plan'
export type { ProposedPlanParseResult } from './proposed-plan'
export type {
  PlanProposalTarget,
  PlanProposalSubmit,
  PlanProposalRequestText,
  PlanProposalDocument,
  PlanProposalActionState,
  PlanProposalState,
  PlanProposalOptions,
} from './plan-proposal-actions'
export type {
  BudgetCommandPort,
  BudgetFormState,
  BudgetFormsState,
  DraftsState,
  DirectoryState,
  InteractionActionState,
  InteractionRecoveryPort,
  InteractionState,
  QuestionnaireDraftState,
  QuestionnaireDraftsState,
  RunActionState,
  RunActionsState,
  NavigationState,
  RuntimeOptions,
  GlobalSettingsStartup,
  RunCommandPort,
  SessionDraftState,
  SessionLaunchDraftEntry,
  SessionLaunchDraftState,
  PreSessionDraftsState,
  SessionAttachmentUpload,
  SessionControlsState,
  ComposerModelState,
  SessionTimelinePort,
  SessionTimelineState,
  SessionTimelineUpdate,
  SurfaceCapabilityPort,
  PlatformPort,
  PanelSurface,
  WindowSurface,
  SurfaceState,
  MainPageState,
  SessionViewContext,
  PresentationState,
  SettingsFormEntry,
  SettingsFieldContentState,
  SettingsWorkspaceState,
  ProviderEditorState,
  ProviderSettingsState,
  CommandCatalogPage,
  CommandCatalogPort,
  CommandTextPort,
  CommandPaletteItem,
  CommandPaletteDraftState,
  CommandPaletteState,
  FileWorkspaceDocumentState,
  FileWorkspacePreviewState,
  FileWorkspaceEntryState,
  FileWorkspaceState,
  AgentWorkspaceDraftState,
  AgentWorkspaceActionState,
  AgentWorkspaceEntryState,
  AgentWorkspaceState,
  AgentComposerActionState,
  AgentComposerState,
  GoalPlanActionState,
  GoalPlanWorkspacePort,
  GoalPlanGoalDraftState,
  GoalPlanStepDraftState,
  GoalPlanPlanDraftState,
  GoalPlanWorkspaceEntryState,
  GoalPlanWorkspaceState,
  WorkflowWorkspaceActionState,
  WorkflowWorkspaceEntryState,
  WorkflowWorkspacePort,
  WorkflowWorkspaceState,
  ExtensionWorkspaceActionState,
  ExtensionCollectionReadState,
  ExtensionWorkspaceDetailState,
  ExtensionWorkspaceEntryState,
  ExtensionWorkspaceState,
  StatusWorkspaceEntryState,
  StatusWorkspaceState,
  ClientJsonValue,
  ClientJsonObject,
  ClientPersistencePort,
  ClientLayoutState,
  ClientPreferencesState,
  ClientExportPort,
} from './types'
export { SessionSelectionError } from './navigation'
export { systemDiagnosticsCommands } from './system-diagnostics'
export type { SystemDiagnosticsEntry, SystemDiagnosticsState } from './system-diagnostics'

export type {
  ComposerIntent,
  ComposerIntentState,
  ComposerIntentEntry,
  ComposerGoalReconciliation,
} from './composer-intent'
export { composerPlanModeCommands } from './composer-plan-mode'
export { composerPlanChoiceCommands } from './composer-plan-choice'
export type { ComposerPlanModeState, ComposerPlanModeEntry, ComposerPlanMode } from './composer-plan-mode'
export { sessionLaunchDraftCommands } from './session-launch-drafts'
export { sessionWorkspaceMoveCommands } from './session-workspace-move'
export type {
  SessionWorkspaceMoveState,
  SessionWorkspaceMoveEntry,
  SessionWorkspaceMovePhase,
} from './session-workspace-move'
export type { SessionRenameState, SessionRenameOptions } from './session-rename'
export type {
  SessionArchiveState,
  SessionArchiveMutation,
  SessionArchiveBatchState,
  SessionArchiveBatchItem,
  SessionArchiveBatchTarget,
  ArchivedSessionsPage,
  SessionArchiveOptions,
} from './session-archive'
export { ARCHIVED_SESSIONS_PAGE_SIZE, SESSION_ARCHIVE_BATCH_MAX_ITEMS } from './session-archive'
export type {
  ComposerPermissionState,
  ComposerPermissionEntry,
  ComposerPermissionChoice,
  ComposerPermissionMode,
  ComposerPermissionSubmission,
  ComposerPermissionOptions,
} from './composer-permission'

const runtimeCommands = {
  ...applicationCommands,
  ...composerModelCommands,
  ...sessionGitContextCommands,
  ...sessionRosterRefreshCommands,
  ...settingsUsageCommands,
  ...activityWorkspaceCommands,
  ...goalHistoryCommands,
  ...queuedUserRunsCommands,
  ...composerIntentCommands,
  ...selectedSessionExecutionCommands,
  ...composerPermissionCommands,
  ...composerPlanModeCommands,
  ...composerPlanChoiceCommands,
  ...sessionRenameCommands,
  ...sessionArchiveCommands,
  ...planProposalCommands,
  ...interactionRecoveryCommands,
  ...workspaceTabCommands,
  ...sessionToolCommands,
  ...agentComposerCommands,
  ...workspacePinCommands,
  ...workspaceActivityCommands,
  ...workspaceOrganizationClientCommands,
  ...workspaceDisplayNamesClientCommands,
  ...agentChildNavigationCommands,
  ...sessionMessageForkCommands,
  ...preSessionLaunchBranchesCommands,
  ...preSessionLaunchBranchCreationCommands,
  ...sessionLaunchBranchCreationCommands,
  ...sessionLaunchDraftCommands,
  ...sessionWorkspaceMoveCommands,
  ...systemDiagnosticsCommands,
}

export function createAppRuntime(options: RuntimeOptions) {
  if (!options.instanceId || !options.hostId)
    throw new CommandError('INVALID_INPUT', 'Runtime and Host identities are required')
  const startup = startupSettingsState(options)
  const onSubscriberError = (error: unknown): void => {
    try {
      options.onSubscriberError?.(error)
    } catch {
      /* An observer cannot change command success or block other observers. */
    }
  }
  const navigation = createState<NavigationState>(
    { workspaceId: null, sessionId: null, status: 'idle', error: null },
    onSubscriberError,
  )
  const surfaces = createState<SurfaceState>(startup.surfaces, onSubscriberError)
  const presentation = createState<PresentationState>(startup.presentation, onSubscriberError)

  const local = new CommandRegistry({ execution: 'client' })
  const platform = new CommandRegistry({ execution: 'platform' })
  let disposed = false
  const preSessionLaunchBranches = createPreSessionLaunchBranches(
    local,
    options.sessionLaunchBranches,
    onSubscriberError,
    () => disposed,
  )
  const clientPersistence = createClientPersistence(local, options, onSubscriberError, () => disposed)
  const directory = createDirectoryModule(
    options,
    navigation.reader,
    (id) => {
      const current = navigation.reader.getSnapshot()
      if (current.sessionId === id) navigation.replace({ ...current, sessionId: null, status: 'idle', error: null })
    },
    onSubscriberError,
  )
  const remote = directory.registry
  const sessionExecutionAccess = createSessionExecutionAccess({
    navigation: navigation.reader,
    directory: directory.reader,
    subscribeConfirmedSessions: directory.subscribeConfirmedSessions,
    onSubscriberError,
  })
  const executionPreparation = createSessionExecutionPreparation({
    access: sessionExecutionAccess,
    directory: directory.reader,
    readSession: (sessionId, signal) => directory.observeSession(sessionId, signal ? { signal } : {}),
    isDisposed: () => disposed,
  })
  const sessionRosterRefresh = createSessionRosterRefresh(local, {
    directory: directory.reader,
    host: options.directory,
    subscribeConfirmedSessions: directory.subscribeConfirmedSessions,
    reconcile: directory.reconcileRosterSessions,
    onSubscriberError,
    isDisposed: () => disposed,
  })
  const sessionGitContext = createSessionGitContext(
    local,
    options.git,
    navigation.reader,
    directory.reader,
    onSubscriberError,
    () => disposed,
    options.sessionLaunchTargets,
  )
  const workspacePins = createWorkspacePins(local, {
    preferences: clientPersistence.preferences,
    preferencesReady: clientPersistence.ready,
    preferenceCommands: local,
    refreshPreferences: clientPersistence.refreshPreferences,
    directory: directory.reader,
    queries: directory.queries,
    onSubscriberError,
    isDisposed: () => disposed,
  })
  const workspaceActivity = createWorkspaceActivity(local, {
    preferences: clientPersistence.preferences,
    preferencesReady: clientPersistence.ready,
    preferenceCommands: local,
    refreshPreferences: clientPersistence.refreshPreferences,
    queries: directory.queries,
    pins: workspacePins.reader,
    hiddenWorkspaceIds: () => workspaceOrganization.reader.getSnapshot().snapshot?.hiddenWorkspaceIds ?? [],
    directory: directory.reader,
    projectActivityWorkspaces: directory.projectActivityWorkspaces,
    projectActivitySessions: directory.projectActivitySessions,
    subscribeConfirmedSessions: directory.subscribeConfirmedSessions,
    ...(options.sidebarActivityEvents ? { sidebarActivityEvents: options.sidebarActivityEvents } : {}),
    onSubscriberError,
    isDisposed: () => disposed,
  })
  const workspaceOrganization = createWorkspaceOrganization(local, {
    ...(options.workspaceOrganization
      ? {
          host: options.workspaceOrganization.commands,
          ...(options.workspaceOrganization.events ? { events: options.workspaceOrganization.events } : {}),
        }
      : {}),
    beginRevealGuard: (workspaceId) => {
      const source = navigation.reader.getSnapshot()
      return () =>
        source === navigation.reader.getSnapshot() && source.workspaceId === workspaceId && source.status === 'idle'
    },
    onSubscriberError,
    isDisposed: () => disposed,
  })
  const workspaceDisplayNames = createWorkspaceDisplayNames(local, {
    ...(options.workspaceDisplayNames
      ? {
          host: options.workspaceDisplayNames.commands,
          ...(options.workspaceDisplayNames.events ? { events: options.workspaceDisplayNames.events } : {}),
        }
      : {}),
    resolveWorkspace: (id) =>
      directory.reader.getSnapshot().workspaces[id] ?? workspacePins.reader.getSnapshot().resolved[id],
    onSubscriberError,
    isDisposed: () => disposed,
  })
  let tabNavigation: ReturnType<typeof registerNavigationCommands> | undefined
  const workspaceTabs = createWorkspaceTabs(local, {
    navigation: navigation.reader,
    directory: directory.reader,
    subscribeConfirmedSessions: directory.subscribeConfirmedSessions,
    surfaces: surfaces.reader,
    queries: directory.queries,
    preferences: clientPersistence.preferences,
    preferenceCommands: local,
    preferencesReady: clientPersistence.ready,
    retryPreferencesRestore: clientPersistence.retryPreferencesRestore,
    selectSession: (sessionId, workspaceId, execution) =>
      local.execute('app.setSession', { sessionId, workspaceId }, execution),
    commitLocalSelection: (closedId, next) => tabNavigation?.commitLocalSelection(closedId, next),
    onSubscriberError,
  })
  tabNavigation = registerNavigationCommands(
    local,
    directory.queries,
    directory.createSession,
    directory.renameSession,
    directory.archiveSession,
    directory.openWorkspace,
    navigation,
    () => disposed,
    workspaceTabs.hooks,
    (workspaceId, isCurrent) => workspaceOrganization.reveal(workspaceId, isCurrent),
  )
  const messageFork = createSessionMessageForkNavigation(local, {
    workspaces: options.workspaces ?? {
      execute: () => Promise.reject(new CommandError('CAPABILITY_UNAVAILABLE', 'Session commands are unavailable')),
    },
    directory: directory.queries,
    tabs: workspaceTabs,
    navigation: navigation.reader,
    selectSession: (sessionId, workspaceId, execution) =>
      local.execute('app.setSession', { sessionId, workspaceId }, execution),
    isDisposed: () => disposed,
    onSubscriberError,
  })
  const sessionTools = createSessionTools(local, {
    navigation: navigation.reader,
    tabs: workspaceTabs.reader,
    surfaces,
    presentation,
    canRender: (panelId) => options.surfaces?.canRender(panelId) ?? false,
    isArchived: (workspaceId, sessionId) => {
      const session = directory.reader.getSnapshot().sessions[sessionId]
      return session?.workspaceId === workspaceId && session.archived
    },
    isProtected: (instanceId) =>
      isSessionToolProtected(instanceId, {
        files: fileWorkspace.reader.getSnapshot(),
        agents: agentWorkspace.reader.getSnapshot(),
        goals: goalPlanWorkspace.reader.getSnapshot(),
        workflow: workflowWorkspace.reader.getSnapshot(),
      }),
    onSubscriberError,
  })
  const disposeSurfaces = registerSurfaceCommands(
    local,
    platform,
    options,
    navigation.reader,
    surfaces,
    presentation,
    sessionTools,
  )
  const activityWorkspace = createActivityWorkspace(
    local,
    options.run,
    surfaces.reader,
    presentation.reader,
    navigation.reader,
    onSubscriberError,
    () => disposed,
    {
      ...(options.agents ? { agents: options.agents } : {}),
      ...(options.sidebarActivityEvents ? { events: options.sidebarActivityEvents } : {}),
    },
  )
  const forms = createBudgetForms(local, options.budget, onSubscriberError, () => disposed)
  const timeline = createSessionTimeline(local, options.timeline, navigation.reader, onSubscriberError, () => disposed)
  const sessionLaunchDrafts = createSessionLaunchDrafts(local, {
    queries: directory.queries,
    ...(options.timeline ? { timeline: options.timeline } : {}),
    ...(options.sessionLaunchTargetPreparation ? { preparation: options.sessionLaunchTargetPreparation } : {}),
    navigation: navigation.reader,
    onSubscriberError,
    isDisposed: () => disposed,
  })
  const sessionLaunchBranchCreation = createPreSessionLaunchBranchCreation(local, {
    commandFamily: 'session',
    ...(options.sessionLaunchBranches ? { reader: options.sessionLaunchBranches } : {}),
    ...(options.sessionLaunchBranchCreation ? { manager: options.sessionLaunchBranchCreation } : {}),
    choice: {
      read(sessionId) {
        const entry = sessionLaunchDrafts.reader.getSnapshot().entries[sessionId]
        if (!entry) return undefined
        const selected = navigation.reader.getSnapshot()
        const access = sessionExecutionAccess.get({ sessionId, workspaceId: entry.workspaceId })
        const history = timeline.reader.getSnapshot()
        return {
          workspaceId: entry.workspaceId,
          revision: entry.revision,
          launchSelection: entry.selection,
          editError:
            selected.status !== 'idle' || selected.sessionId !== sessionId || selected.workspaceId !== entry.workspaceId
              ? 'STALE_TARGET'
              : access.kind === 'archived'
                ? 'SESSION_ARCHIVED'
                : access.kind !== 'ready'
                  ? 'SESSION_UNVERIFIED'
                  : [
                        'selection',
                        'starting',
                        'queued',
                        'preparing',
                        'cancel-requested',
                        'reconciling',
                        'unknown',
                        'paused-navigation',
                      ].includes(entry.phase)
                    ? 'BUSY'
                    : history.sessionId === sessionId &&
                        (history.messages.length > 0 || history.runs.length > 0 || history.hasOlder)
                      ? 'STALE_TARGET'
                      : null,
        }
      },
      async setSelection(sessionId, selection, expectedRevision) {
        await local.execute(sessionLaunchDraftCommands['sessionLaunchDraft.setSelection'].metadata.id, {
          sessionId,
          selection,
          expectedRevision,
        })
      },
    },
    onSubscriberError,
    isDisposed: () => disposed,
  })
  const isCurrentRunActive = (sessionId: string) => {
    const current = timeline.reader.getSnapshot()
    return (
      current.sessionId === sessionId &&
      current.runs.some((run) => ['queued', 'running', 'waiting_approval'].includes(run.status))
    )
  }
  const queuedUserRuns = createQueuedUserRuns(
    local,
    options.run,
    navigation.reader,
    timeline.reader,
    onSubscriberError,
    () => disposed,
  )
  const goalHistory = createGoalHistory(
    local,
    options.goalHistory,
    timeline.history,
    navigation.reader,
    onSubscriberError,
    () => disposed,
  )
  const readConversationMessage = (sessionId: string, messageId: string) => {
    const selected = navigation.reader.getSnapshot()
    if (selected.status !== 'idle' || selected.sessionId !== sessionId) return null
    const current = timeline.reader.getSnapshot()
    if (current.status !== 'ready' || current.sessionId !== sessionId) return null
    return current.messages.find((message) => message.sessionId === sessionId && message.id === messageId) ?? null
  }
  const drafts = createDrafts(
    local,
    options.run,
    options.attachments,
    onSubscriberError,
    () => disposed,
    options.files,
    executionPreparation,
    readConversationMessage,
  )
  const composerPermission = createComposerPermission(local, {
    configuration: options.configuration,
    ...(options.settings ? { settings: options.settings } : {}),
    ...(options.permissionEvents ? { events: options.permissionEvents } : {}),
    navigation: navigation.reader,
    isRunActive: isCurrentRunActive,
    isSubmissionLocked: (sessionId) => {
      const draft = drafts.reader.getSnapshot()[sessionId]
      const intent = composerIntent.reader.getSnapshot().entries[sessionId]
      return (
        draft?.status === 'submitting' ||
        draft?.status === 'unknown' ||
        intent?.submission.status === 'submitting' ||
        intent?.submission.status === 'unknown'
      )
    },
    onSubscriberError,
  })
  const composerPlanMode = createComposerPlanMode(local, {
    preparation: executionPreparation,
    ...(options.planMode ? { configuration: options.planMode } : {}),
    ...(options.planModeEvents ? { events: options.planModeEvents } : {}),
    navigation: navigation.reader,
    isRunActive: isCurrentRunActive,
    isSubmissionLocked: (sessionId) =>
      composerIntent.isSubmissionPending(sessionId) ||
      composerIntent.reader.getSnapshot().entries[sessionId]?.intent === 'goal' ||
      ['submitting', 'unknown'].includes(drafts.reader.getSnapshot()[sessionId]?.status ?? ''),
    onSubscriberError,
  })
  registerComposerPlanChoice(local, navigation.reader, composerPlanMode.reader, composerPermission.reader)
  const composerIntent = createComposerIntent(local, {
    preparation: executionPreparation,
    goals: options.goals,
    ...(options.goalEvents ? { events: options.goalEvents } : {}),
    navigation: navigation.reader,
    executeRun: drafts.executeRun,
    serializeDraft: drafts.serializeSubmission,
    serializeGoalObjective: drafts.serializeGoalObjective,
    consumeGoalSlashDraft: (sessionId, revision, text) => {
      const current = drafts.reader.getSnapshot()[sessionId]
      if (
        current?.revision !== revision ||
        current.text !== text ||
        current.mentions.length ||
        current.workspaceContexts?.length ||
        current.attachments.length ||
        current.attachmentTransfers.length ||
        current.status === 'unknown' ||
        current.status === 'submitting'
      )
        return
      void local
        .execute('draft.setContent', { sessionId, text: '', mentions: [], expectedRevision: revision })
        .catch(onSubscriberError)
    },
    permissions: composerPermission,
    ...(options.planMode ? { captureMode: composerPlanMode.capture } : {}),
    ...(options.planMode ? { refreshMode: composerPlanMode.captureFresh } : {}),
    isRunActive: isCurrentRunActive,
    getSettledReceipt: drafts.getSettledReceipt,
    reconcileRun: async (sessionId) =>
      runAcceptedSchema.nullable().parse(await local.execute('draft.reconcileSubmission', { sessionId })),
    onSubscriberError,
  })
  const selectedSessionExecution = createSelectedSessionExecution(local, {
    // Retain actual adapter occupancy: Directory's registry can settle logical
    // cancellation before an ignored-abort transport finishes. This owner
    // validates the public contract and fences its own captured target.
    queries: options.directory,
    navigation: navigation.reader,
    presentation: presentation.reader,
    goals: composerIntent.reader,
    ...(options.sidebarActivityEvents ? { events: options.sidebarActivityEvents } : {}),
    onSubscriberError,
  })
  const interactions = createInteractions(
    local,
    options.interactions,
    timeline.reader,
    onSubscriberError,
    () => disposed,
    options.interactionRecovery,
  )
  const controls = createSessionControls(
    options.models,
    options.usage,
    options.budget,
    navigation.reader,
    timeline.reader,
    onSubscriberError,
    () => disposed,
  )
  const planProposal = createPlanProposalActions(local, {
    preparation: executionPreparation,
    timeline: timeline.reader,
    controls: controls.reader,
    ...(options.planMode
      ? {
          mode: {
            read: composerPlanMode.captureFresh,
            async setDefault(sessionId: string) {
              const entry = composerPlanMode.reader.getSnapshot().entries[sessionId]
              if (entry?.status !== 'ready' || entry.mode === null)
                throw new CommandError('BUSY', 'Confirm Host Plan mode before implementing')
              const result = composerPlanModeCommands['composerPlanMode.setMode'].output.parse(
                await local.execute('composerPlanMode.setMode', {
                  sessionId,
                  mode: 'default',
                  expectedRevision: entry.revision,
                }),
              )
              if (result.mode !== 'default')
                throw new CommandError('RESULT_UNKNOWN', 'Host Plan exit was not confirmed')
              return result.mode
            },
            async reconcile(sessionId: string) {
              const result = composerPlanModeCommands['composerPlanMode.reconcile'].output.parse(
                await local.execute('composerPlanMode.reconcile', { sessionId }),
              )
              if (!result.mode) throw new CommandError('RESULT_UNKNOWN', 'Host mode was not confirmed')
              return result.mode
            },
            isUnknown: (sessionId: string) =>
              composerPlanMode.reader.getSnapshot().entries[sessionId]?.status === 'unknown',
          },
        }
      : {}),
    executeDetachedRun: (input, execution) => {
      if (
        composerIntent.isSubmissionPending(input.sessionId) ||
        composerPermission.reader.getSnapshot().entries[input.sessionId]?.locked
      )
        return Promise.reject(new CommandError('BUSY', 'The ordinary composer owns this session submission'))
      return drafts.executeDetachedRun(input, execution)
    },
    getSettledReceipt: drafts.getSettledReceipt,
    reconcileRun: async (sessionId) =>
      runAcceptedSchema.nullable().parse(await local.execute('draft.reconcileSubmission', { sessionId })),
    onSubscriberError,
    ...(options.planProposal ? { requestText: options.planProposal.requestText } : {}),
  })
  const settingsForms = createSettingsForms(
    local,
    options,
    surfaces.reader,
    presentation.reader,
    directory.reader,
    onSubscriberError,
    () => disposed,
    controls.settingsCommitted,
  )
  const settingsUsage = createSettingsUsage(
    local,
    options.usage,
    surfaces.reader,
    onSubscriberError,
    () => disposed,
    presentation.reader,
  )
  const composerModel = createComposerModel(
    local,
    options.models,
    navigation.reader,
    controls,
    onSubscriberError,
    () => disposed,
    executionPreparation,
    isCurrentRunActive,
  )
  const preSessionDrafts = createPreSessionDrafts(local, {
    navigation: navigation.reader,
    controls: controls.reader,
    permissions: composerPermission.reader,
    sessionApprovalSettingsAvailable: Boolean(options.settings),
    planModes: composerPlanMode.reader,
    sessionPlanModeAvailable: Boolean(options.planMode),
    composerIntents: composerIntent.reader,
    sessionGoalsAvailable: Boolean(options.goals),
    drafts: drafts.reader,
    queries: directory.queries,
    tabs: workspaceTabs.hooks,
    createSession: directory.createSession,
    ...(options.attachments ? { attachments: options.attachments } : {}),
    ...(options.files ? { files: options.files } : {}),
    ...(options.workspaces ? { workspaces: options.workspaces } : {}),
    ...(options.models ? { models: options.models } : {}),
    ...(options.run ? { run: options.run } : {}),
    ...(options.sessionLaunchTargetPreparation
      ? { sessionLaunchTargetPreparation: options.sessionLaunchTargetPreparation }
      : {}),
    onSubscriberError,
    isDisposed: () => disposed,
  })
  const preSessionLaunchBranchCreation = createPreSessionLaunchBranchCreation(local, {
    ...(options.sessionLaunchBranches ? { reader: options.sessionLaunchBranches } : {}),
    ...(options.sessionLaunchBranchCreation ? { manager: options.sessionLaunchBranchCreation } : {}),
    drafts: preSessionDrafts.reader,
    onSubscriberError,
    isDisposed: () => disposed,
  })
  const offModelEvents = options.modelEvents?.subscribe(composerModel.invalidateModels)
  const offModelConnection = options.modelEvents?.onConnection?.(composerModel.setConnected)
  const providerSettings = createProviderSettings(
    local,
    options,
    surfaces.reader,
    settingsForms.reader,
    onSubscriberError,
    () => disposed,
    composerModel.invalidateModels,
    controls.settingsCommitted,
  )
  const fileWorkspace = createFileWorkspace(local, options, surfaces.reader, onSubscriberError, () => disposed, {
    tabs: workspaceTabs.reader,
    drafts: drafts.reader,
    sessions: directory.queries,
    onPreviewOpened: sessionTools.previewOpened,
  })
  const agentWorkspace = createAgentWorkspace(
    local,
    options,
    surfaces.reader,
    controls.reader,
    onSubscriberError,
    () => disposed,
  )
  const agentComposer = createAgentComposer(local, options, {
    recovery: agentWorkspace.recovery,
    acquireCreateLock: agentWorkspace.acquireCreateLock,
    isCreateInFlight: agentWorkspace.isCreateInFlight,
    navigation: navigation.reader,
    presentation: presentation.reader,
    directory: directory.reader,
    drafts: drafts.reader,
    tabs: workspaceTabs.reader,
    surfaces: surfaces.reader,
    controls: controls.reader,
    mergeCreatedRecord: agentWorkspace.mergeCreatedRecord,
    onSubscriberError,
    isDisposed: () => disposed,
  })
  const offAgentModelEvents = options.modelEvents?.subscribe(agentWorkspace.invalidateModels)
  const offAgentModelConnection = options.modelEvents?.onConnection?.((connected) => {
    agentWorkspace.setConnected(connected)
    agentComposer.setConnected(connected)
  })
  const goalPlanWorkspace = createGoalPlanWorkspace(
    local,
    options,
    surfaces.reader,
    onSubscriberError,
    () => disposed,
    executionPreparation,
    presentation.reader,
  )
  const workflowWorkspace = createWorkflowWorkspace(
    local,
    options,
    surfaces.reader,
    onSubscriberError,
    () => disposed,
    presentation.reader,
  )
  createAgentChildNavigation(local, {
    ...(options.agents ? { agents: options.agents } : {}),
    queries: directory.queries,
    tabs: workspaceTabs,
    surfaces: surfaces.reader,
    agentWorkspace: agentWorkspace.reader,
    activity: activityWorkspace.reader,
    workflows: workflowWorkspace.reader,
    presentation: presentation.reader,
    navigation: navigation.reader,
    selectSession: (sessionId, workspaceId, execution) =>
      local.execute('app.setSession', { sessionId, workspaceId }, execution),
    isDisposed: () => disposed,
  })
  const extensionWorkspace = createExtensionWorkspace(
    local,
    options,
    surfaces.reader,
    presentation.reader,
    onSubscriberError,
    () => disposed,
  )
  const statusWorkspace = createStatusWorkspace(
    local,
    options,
    surfaces.reader,
    directory.reader,
    onSubscriberError,
    () => disposed,
  )
  const systemDiagnostics = createSystemDiagnostics(
    local,
    options.system,
    surfaces.reader,
    onSubscriberError,
    () => disposed,
  )
  const sessionWorkspaceMove = createSessionWorkspaceMove(local, {
    available: Boolean(options.workspaces && options.timeline && options.models && options.agents),
    directoryQueries: directory.queries,
    createSession: directory.createSession,
    archiveSession: directory.archiveSession,
    navigation: navigation.reader,
    drafts: drafts.reader,
    controls: controls.reader,
    composerIntent: composerIntent.reader,
    permissions: composerPermission.reader,
    planModes: composerPlanMode.reader,
    timeline: timeline.reader,
    snapshot: (sessionId) => {
      if (!options.timeline)
        return Promise.reject(new CommandError('CAPABILITY_UNAVAILABLE', 'Session timeline is unavailable'))
      return options.timeline.snapshot(sessionId, undefined, 1)
    },
    ...(options.files ? { filesQuery: options.files } : {}),
    hasChildSessions: async (sessionId, signal) => {
      if (!options.agents) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Agent directory is unavailable')
      const page = agentPageSchema.parse(
        await options.agents.execute('agent.list', { parentSessionId: sessionId, limit: 1 }, { signal }),
      )
      return page.items.length > 0 || page.nextCursor !== null
    },
    tabs: {
      capture: workspaceTabs.capture,
      finishReplacement: workspaceTabs.replaceCapturedSession,
    },
    releaseSourceChoices: async (sourceSessionId, signal) => {
      if (sessionLaunchBranchCreation.reader.getSnapshot().entries[sourceSessionId])
        await local.execute('sessionLaunchBranchCreation.cancel', { draftId: sourceSessionId }, { signal })
      if (sessionLaunchBranchCreation.reader.getSnapshot().entries[sourceSessionId])
        throw new CommandError('BUSY', 'The source branch operation still needs its launch-choice owner')
      if (sessionLaunchDrafts.reader.getSnapshot().entries[sourceSessionId])
        await local.execute('sessionLaunchDraft.close', { sessionId: sourceSessionId }, { signal })
    },
    assertEligible: ({ sourceSessionId, sourceWorkspaceId }) => {
      if (sessionExecutionAccess.get({ sessionId: sourceSessionId, workspaceId: sourceWorkspaceId }).kind !== 'ready')
        throw new CommandError('SESSION_UNVERIFIED', 'The source Session cannot be prepared')
      if (workspaceTabs.reader.getSnapshot().items.length >= MAX_WORKSPACE_TABS)
        throw new CommandError('TAB_LIMIT', 'Close a tab before moving this Session')
      const launch = sessionLaunchDrafts.reader.getSnapshot().entries[sourceSessionId]
      if (launch && !['idle', 'ready', 'failed', 'cancelled'].includes(launch.phase))
        throw new CommandError('BUSY', 'Resolve the source launch preparation before moving')
      const branchCreation = sessionLaunchBranchCreation.reader.getSnapshot().entries[sourceSessionId]
      if (branchCreation && ['capturing', 'creating', 'unknown', 'verified', 'created'].includes(branchCreation.phase))
        throw new CommandError('BUSY', 'Resolve or adopt the source branch creation before moving')
      if (
        Object.values(preSessionDrafts.reader.getSnapshot()).some(
          (entry) => entry.sessionId === sourceSessionId && entry.phase !== 'accepted',
        )
      )
        throw new CommandError('BUSY', 'Resolve the original first-send operation before moving')
      const model = composerModel.reader.getSnapshot()
      if (model.sessionId === sourceSessionId && ['submitting', 'unknown'].includes(model.action.status))
        throw new CommandError('BUSY', 'Confirm the source model choice before moving')
      const agent = agentComposer.reader.getSnapshot().actions[sourceSessionId]
      if (agent && ['submitting', 'unknown'].includes(agent.status))
        throw new CommandError('BUSY', 'Resolve the original Agent request before moving')
    },
    onSubscriberError,
    isDisposed: () => disposed,
  })
  const executor = {
    execute(name: string, input: unknown, execution?: ExecuteOptions) {
      if (
        Object.hasOwn(surfaceCommands, name) &&
        surfaceCommands[name as keyof typeof surfaceCommands].metadata.execution === 'platform'
      )
        return platform.execute(name, input, execution)
      if (Object.hasOwn(runCommands, name)) return drafts.executeRun(name, input, execution)
      if (name === 'draft.reconcileSubmission') {
        return local.execute(name, input, execution).then((value) => {
          const accepted = runAcceptedSchema.nullable().parse(value)
          if (accepted) composerIntent.acceptRunReceipt(accepted)
          return accepted
        })
      }
      if (Object.hasOwn(interactionCommands, name)) return interactions.execute(name, input, execution)
      if (Object.hasOwn(modelCommands, name)) return controls.executeModel(name, input, execution)
      if (Object.hasOwn(usageCommands, name)) return controls.executeUsage(name, input, execution)
      if (Object.hasOwn(configurationCommands, name)) {
        if (!options.configuration)
          return Promise.reject(new CommandError('CAPABILITY_UNAVAILABLE', 'Configuration commands are unavailable'))
        return options.configuration.execute(name, input, execution)
      }
      if (Object.hasOwn(terminalApplicationCommands, name))
        return Promise.reject(new CommandError('CAPABILITY_UNAVAILABLE', 'This runtime does not own a terminal UI'))
      return Object.hasOwn(navigationCommands, name) ||
        Object.hasOwn(budgetEditorCommands, name) ||
        Object.hasOwn(draftCommands, name) ||
        Object.hasOwn(preSessionDraftCommands, name) ||
        Object.hasOwn(sessionLaunchDraftCommands, name) ||
        Object.hasOwn(sessionWorkspaceMoveCommands, name) ||
        Object.hasOwn(preSessionLaunchBranchesCommands, name) ||
        Object.hasOwn(preSessionLaunchBranchCreationCommands, name) ||
        Object.hasOwn(sessionLaunchBranchCreationCommands, name) ||
        Object.hasOwn(runActionCommands, name) ||
        Object.hasOwn(interactionDraftCommands, name) ||
        Object.hasOwn(interactionRecoveryCommands, name) ||
        Object.hasOwn(settingsEditorCommands, name) ||
        Object.hasOwn(providerEditorCommands, name) ||
        Object.hasOwn(commandPaletteCommands, name) ||
        Object.hasOwn(fileWorkspaceCommands, name) ||
        Object.hasOwn(agentWorkspaceCommands, name) ||
        Object.hasOwn(agentComposerCommands, name) ||
        Object.hasOwn(agentChildNavigationCommands, name) ||
        Object.hasOwn(sessionMessageForkCommands, name) ||
        Object.hasOwn(goalPlanWorkspaceCommands, name) ||
        Object.hasOwn(workflowWorkspaceCommands, name) ||
        Object.hasOwn(extensionWorkspaceCommands, name) ||
        Object.hasOwn(statusWorkspaceCommands, name) ||
        Object.hasOwn(systemDiagnosticsCommands, name) ||
        Object.hasOwn(clientPersistenceCommands, name) ||
        Object.hasOwn(sessionTimelineCommands, name) ||
        Object.hasOwn(composerModelCommands, name) ||
        Object.hasOwn(sessionGitContextCommands, name) ||
        Object.hasOwn(sessionRosterRefreshCommands, name) ||
        Object.hasOwn(settingsUsageCommands, name) ||
        Object.hasOwn(activityWorkspaceCommands, name) ||
        Object.hasOwn(goalHistoryCommands, name) ||
        Object.hasOwn(queuedUserRunsCommands, name) ||
        Object.hasOwn(composerIntentCommands, name) ||
        Object.hasOwn(selectedSessionExecutionCommands, name) ||
        Object.hasOwn(composerPermissionCommands, name) ||
        Object.hasOwn(composerPlanModeCommands, name) ||
        Object.hasOwn(composerPlanChoiceCommands, name) ||
        Object.hasOwn(sessionRenameCommands, name) ||
        Object.hasOwn(sessionArchiveCommands, name) ||
        Object.hasOwn(planProposalCommands, name) ||
        Object.hasOwn(workspaceTabCommands, name) ||
        Object.hasOwn(sessionToolCommands, name) ||
        Object.hasOwn(workspacePinCommands, name) ||
        Object.hasOwn(workspaceActivityCommands, name) ||
        Object.hasOwn(workspaceOrganizationClientCommands, name) ||
        Object.hasOwn(workspaceDisplayNamesClientCommands, name) ||
        Object.hasOwn(surfaceCommands, name)
        ? local.execute(name, input, execution)
        : remote.execute(name, input, execution)
    },
  }
  const sessionRename = createSessionRename(local, {
    directory: directory.reader,
    commands: executor,
    onSubscriberError,
    isDisposed: () => disposed,
  })
  const sessionArchive = createSessionArchive(local, {
    directory: directory.reader,
    commands: executor,
    observeSession: directory.observeSession,
    onSubscriberError,
    isDisposed: () => disposed,
  })
  const commandPalette = createCommandPalette(
    local,
    options,
    navigation.reader,
    directory.reader,
    executor,
    onSubscriberError,
    () => disposed,
  )
  const view = Object.freeze({
    instanceId: options.instanceId,
    hostId: options.hostId,
    state: Object.freeze({
      navigation: navigation.reader,
      sessionExecutionAccess: sessionExecutionAccess.reader,
      selectedSessionExecution: selectedSessionExecution.reader,
      workspaceTabs: workspaceTabs.reader,
      workspacePins: workspacePins.reader,
      workspaceActivity: workspaceActivity.reader,
      workspaceOrganization: workspaceOrganization.reader,
      workspaceDisplayNames: workspaceDisplayNames.reader,
      workspaceDisplayNameSnapshot: workspaceDisplayNames.snapshotReader,
      messageFork: messageFork.reader,
      directory: directory.reader,
      forms: forms.reader,
      surfaces: surfaces.reader,
      presentation: presentation.reader,
      timeline: timeline.reader,
      sessionLaunchDrafts: sessionLaunchDrafts.reader,
      sessionWorkspaceMove: sessionWorkspaceMove.reader,
      sessionLaunchBranchCreation: sessionLaunchBranchCreation.reader,
      goalHistory: goalHistory.reader,
      activity: activityWorkspace.reader,
      queuedUserRuns: queuedUserRuns.reader,
      drafts: drafts.reader,
      preSessionDrafts: preSessionDrafts.reader,
      preSessionLaunchBranches: preSessionLaunchBranches.reader,
      preSessionLaunchBranchCreation: preSessionLaunchBranchCreation.reader,
      runActions: drafts.actions,
      interactions: interactions.reader,
      questionnaires: interactions.questionnaires,
      controls: controls.reader,
      composerModel: composerModel.reader,
      sessionGitContext: sessionGitContext.reader,
      sessionRosterRefresh: sessionRosterRefresh.reader,
      settingsUsage: settingsUsage.reader,
      composerIntent: composerIntent.reader,
      composerPermission: composerPermission.reader,
      composerPlanMode: composerPlanMode.reader,
      sessionRename: sessionRename.reader,
      sessionArchive: sessionArchive.reader,
      planProposal: planProposal.reader,
      settings: settingsForms.reader,
      providers: providerSettings.reader,
      commandPalette: commandPalette.reader,
      files: fileWorkspace.reader,
      agents: agentWorkspace.reader,
      agentComposer: agentComposer.reader,
      goals: goalPlanWorkspace.reader,
      workflows: workflowWorkspace.reader,
      extensions: extensionWorkspace.reader,
      status: statusWorkspace.reader,
      diagnostics: systemDiagnostics.reader,
      layout: clientPersistence.layout,
      preferences: clientPersistence.preferences,
    }),
    commands: Object.freeze(createCommandClient(runtimeCommands, executor)),
    getSessionExecutionAccess: sessionExecutionAccess.get,
    async executeText(source: string, execution?: ExecuteOptions): Promise<unknown> {
      const [name, ...arguments_] = tokenizeCommand(source)
      const definition = runtimeCommands[name as keyof typeof runtimeCommands]
      if (!definition) throw new CommandError('COMMAND_NOT_FOUND', 'Command definition not found')
      return executor.execute(name!, parseArguments(definition.metadata, arguments_), execution)
    },
  })
  return {
    view,
    clientPreferences: Object.freeze({ refresh: clientPersistence.refreshPreferences }),
    workspaceTabs: Object.freeze({
      capture: workspaceTabs.capture,
      closeCaptured: workspaceTabs.closeCaptured,
      replaceCapturedSession: workspaceTabs.replaceCapturedSession,
      select: workspaceTabs.select,
      move: workspaceTabs.move,
      whenIdle: workspaceTabs.whenIdle,
    }),
    ready: Promise.all([clientPersistence.ready, workspaceTabs.ready, workspaceActivity.ready]).then(() => undefined),
    dispose() {
      if (disposed) return
      disposed = true
      messageFork.dispose()
      workspaceTabs.dispose()
      workspacePins.dispose()
      workspaceActivity.dispose()
      workspaceOrganization.dispose()
      workspaceDisplayNames.dispose()

      activityWorkspace.dispose()
      agentComposer.dispose()
      preSessionLaunchBranchCreation.dispose()
      sessionLaunchBranchCreation.dispose()
      preSessionDrafts.dispose()
      sessionWorkspaceMove.dispose()
      sessionLaunchDrafts.dispose()
      preSessionLaunchBranches.dispose()
      selectedSessionExecution.dispose()
      local.dispose()
      platform.dispose()
      directory.dispose()
      sessionExecutionAccess.dispose()
      forms.dispose()
      goalHistory.dispose()
      queuedUserRuns.dispose()
      timeline.dispose()
      drafts.dispose()
      interactions.dispose()
      offModelEvents?.()
      offModelConnection?.()
      controls.dispose()
      composerModel.dispose()
      sessionGitContext.dispose()
      sessionRosterRefresh.dispose()
      settingsUsage.dispose()
      composerIntent.dispose()
      composerPermission.dispose()
      composerPlanMode.dispose()
      sessionRename.dispose()
      sessionArchive.dispose()
      planProposal.dispose()
      settingsForms.dispose()
      providerSettings.dispose()
      commandPalette.dispose()
      fileWorkspace.dispose()
      agentWorkspace.dispose()
      offAgentModelEvents?.()
      offAgentModelConnection?.()
      goalPlanWorkspace.dispose()
      workflowWorkspace.dispose()
      extensionWorkspace.dispose()
      statusWorkspace.dispose()
      systemDiagnostics.dispose()
      clientPersistence.dispose()
      disposeSurfaces()
      sessionTools.dispose()
      surfaces.dispose()
      presentation.dispose()
      navigation.dispose()
    },
  }
}
