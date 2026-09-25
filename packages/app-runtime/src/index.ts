import {
  CommandRegistry,
  CommandError,
  createCommandClient,
  parseArguments,
  tokenizeCommand,
  type ExecuteOptions,
} from '@hbar/commands'
import { applicationCommands, navigationCommands, surfaceCommands } from '@hbar/contracts/commands'
import { budgetEditorCommands } from '@hbar/contracts/commands/budget-editor'
import { draftCommands } from '@hbar/contracts/commands/draft'
import { runAcceptedSchema, runCommands } from '@hbar/contracts/commands/run'
import { interactionCommands } from '@hbar/contracts/commands/interaction'
import { modelCommands } from '@hbar/contracts/commands/models'
import { usageCommands } from '@hbar/contracts/commands/usage'
import { interactionDraftCommands } from '@hbar/contracts/commands/interaction-draft'
import { settingsEditorCommands } from '@hbar/contracts/commands/settings-editor'
import { providerEditorCommands } from '@hbar/contracts/commands/provider-editor'
import { configurationCommands } from '@hbar/contracts/commands/configuration'
import { commandPaletteCommands } from '@hbar/contracts/commands/command-palette'
import { fileWorkspaceCommands } from '@hbar/contracts/commands/file-workspace'
import { agentWorkspaceCommands } from '@hbar/contracts/commands/agent-workspace'
import { goalPlanWorkspaceCommands } from '@hbar/contracts/commands/goal-plan-workspace'
import { workflowWorkspaceCommands } from '@hbar/contracts/commands/workflow-workspace'
import { extensionWorkspaceCommands } from '@hbar/contracts/commands/extension-workspace'
import { statusWorkspaceCommands } from '@hbar/contracts/commands/status-workspace'
import { clientPersistenceCommands } from '@hbar/contracts/commands/client-persistence'
import { terminalApplicationCommands } from '@hbar/contracts/commands/terminal-application'
import { sessionTimelineCommands } from '@hbar/contracts/commands/session-timeline'
import { createState } from './state'
import { createDirectoryModule } from './directory'
import { registerNavigationCommands } from './navigation'
import { createBudgetForms } from './budget-forms'
import { registerSurfaceCommands } from './surfaces'
import { createSessionTimeline } from './session-timeline'
import { createDrafts } from './drafts'
import { createPlanProposalActions, planProposalCommands } from './plan-proposal-actions'
import { createInteractions } from './interactions'
import { interactionRecoveryCommands } from './interaction-recovery'
import { createSessionControls } from './session-controls'
import { composerModelCommands, createComposerModel } from './composer-model'
import { composerIntentCommands, createComposerIntent } from './composer-intent'
import { composerPermissionCommands, createComposerPermission } from './composer-permission'
import { sessionRenameCommands, createSessionRename } from './session-rename'
import { sessionArchiveCommands, createSessionArchive } from './session-archive'
import { createSettingsForms } from './settings-forms'
import { createProviderSettings } from './provider-settings'
import { createCommandPalette } from './command-palette'
import { createFileWorkspace } from './file-workspace'
export { filteredFileChanges, FILE_CHANGES_PAGE_SIZE } from './file-workspace-changes'
import { createAgentWorkspace } from './agent-workspace'
import { createGoalPlanWorkspace } from './goal-plan-workspace'
import { createWorkflowWorkspace } from './workflow-workspace'
import { createExtensionWorkspace } from './extension-workspace'
export { EXTENSION_PAGE_SIZE, extensionWorkspacePage } from './extension-workspace-model'
import { createStatusWorkspace } from './status-workspace'
import { createClientPersistence } from './client-persistence'
import type { NavigationState, PresentationState, RuntimeOptions, SurfaceState } from './types'
export { goalControlStatuses } from './goal-plan-workspace'
export type { StateReader } from './state'
export { projectSessionDecisions, sessionDecisionAction } from './interaction-presentations'
export type { SessionDecision, SessionDecisionProjection, QuestionnaireFact } from './interaction-presentations'
export { interactionRecoveryCommands } from './interaction-recovery'
export { planProposalCommands, planProposalActionKey } from './plan-proposal-actions'
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
  RunCommandPort,
  SessionDraftState,
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
  FileWorkspaceEntryState,
  FileWorkspaceState,
  AgentWorkspaceDraftState,
  AgentWorkspaceActionState,
  AgentWorkspaceEntryState,
  AgentWorkspaceState,
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

export type { ComposerIntent, ComposerIntentState, ComposerIntentEntry } from './composer-intent'
export type { SessionRenameState, SessionRenameOptions } from './session-rename'
export type {
  SessionArchiveState,
  SessionArchiveMutation,
  ArchivedSessionsPage,
  SessionArchiveOptions,
} from './session-archive'
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
  ...composerIntentCommands,
  ...composerPermissionCommands,
  ...sessionRenameCommands,
  ...sessionArchiveCommands,
  ...planProposalCommands,
  ...interactionRecoveryCommands,
}

export function createAppRuntime(options: RuntimeOptions) {
  if (!options.instanceId || !options.hostId)
    throw new CommandError('INVALID_INPUT', 'Runtime and Host identities are required')
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
  const surfaces = createState<SurfaceState>(
    { panels: {}, windows: {}, focusedPanelId: null, focusedWindowId: null },
    onSubscriberError,
  )
  const presentation = createState<PresentationState>(
    {
      page: { kind: 'session' },
      toolInstanceId: null,
      modalInstanceId: null,
      returnContext: null,
      sidebarOpen: true,
    },
    onSubscriberError,
  )

  const local = new CommandRegistry({ execution: 'client' })
  const platform = new CommandRegistry({ execution: 'platform' })
  let disposed = false
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
  registerNavigationCommands(
    local,
    directory.queries,
    directory.createSession,
    directory.renameSession,
    directory.archiveSession,
    directory.openWorkspace,
    navigation,
    () => disposed,
  )
  const disposeSurfaces = registerSurfaceCommands(local, platform, options, navigation.reader, surfaces, presentation)
  const forms = createBudgetForms(local, options.budget, onSubscriberError, () => disposed)
  const timeline = createSessionTimeline(local, options.timeline, navigation.reader, onSubscriberError, () => disposed)
  const drafts = createDrafts(local, options.run, options.attachments, onSubscriberError, () => disposed, options.files)
  const composerPermission = createComposerPermission(local, {
    configuration: options.configuration,
    navigation: navigation.reader,
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
  const composerIntent = createComposerIntent(local, {
    goals: options.goals,
    navigation: navigation.reader,
    executeRun: drafts.executeRun,
    permissions: composerPermission,
    getSettledReceipt: drafts.getSettledReceipt,
    reconcileRun: async (sessionId) =>
      runAcceptedSchema.nullable().parse(await local.execute('draft.reconcileSubmission', { sessionId })),
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
    timeline: timeline.reader,
    controls: controls.reader,
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
  const composerModel = createComposerModel(
    local,
    options.models,
    navigation.reader,
    controls,
    onSubscriberError,
    () => disposed,
  )
  const providerSettings = createProviderSettings(
    local,
    options,
    surfaces.reader,
    settingsForms.reader,
    onSubscriberError,
    () => disposed,
  )
  const fileWorkspace = createFileWorkspace(local, options, surfaces.reader, onSubscriberError, () => disposed)
  const agentWorkspace = createAgentWorkspace(
    local,
    options,
    surfaces.reader,
    controls.reader,
    onSubscriberError,
    () => disposed,
  )
  const goalPlanWorkspace = createGoalPlanWorkspace(local, options, surfaces.reader, onSubscriberError, () => disposed)
  const workflowWorkspace = createWorkflowWorkspace(local, options, surfaces.reader, onSubscriberError, () => disposed)
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
        Object.hasOwn(interactionDraftCommands, name) ||
        Object.hasOwn(interactionRecoveryCommands, name) ||
        Object.hasOwn(settingsEditorCommands, name) ||
        Object.hasOwn(providerEditorCommands, name) ||
        Object.hasOwn(commandPaletteCommands, name) ||
        Object.hasOwn(fileWorkspaceCommands, name) ||
        Object.hasOwn(agentWorkspaceCommands, name) ||
        Object.hasOwn(goalPlanWorkspaceCommands, name) ||
        Object.hasOwn(workflowWorkspaceCommands, name) ||
        Object.hasOwn(extensionWorkspaceCommands, name) ||
        Object.hasOwn(statusWorkspaceCommands, name) ||
        Object.hasOwn(clientPersistenceCommands, name) ||
        Object.hasOwn(sessionTimelineCommands, name) ||
        Object.hasOwn(composerModelCommands, name) ||
        Object.hasOwn(composerIntentCommands, name) ||
        Object.hasOwn(composerPermissionCommands, name) ||
        Object.hasOwn(sessionRenameCommands, name) ||
        Object.hasOwn(sessionArchiveCommands, name) ||
        Object.hasOwn(planProposalCommands, name) ||
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
      directory: directory.reader,
      forms: forms.reader,
      surfaces: surfaces.reader,
      presentation: presentation.reader,
      timeline: timeline.reader,
      drafts: drafts.reader,
      runActions: drafts.actions,
      interactions: interactions.reader,
      questionnaires: interactions.questionnaires,
      controls: controls.reader,
      composerModel: composerModel.reader,
      composerIntent: composerIntent.reader,
      composerPermission: composerPermission.reader,
      sessionRename: sessionRename.reader,
      sessionArchive: sessionArchive.reader,
      planProposal: planProposal.reader,
      settings: settingsForms.reader,
      providers: providerSettings.reader,
      commandPalette: commandPalette.reader,
      files: fileWorkspace.reader,
      agents: agentWorkspace.reader,
      goals: goalPlanWorkspace.reader,
      workflows: workflowWorkspace.reader,
      extensions: extensionWorkspace.reader,
      status: statusWorkspace.reader,
      layout: clientPersistence.layout,
      preferences: clientPersistence.preferences,
    }),
    commands: Object.freeze(createCommandClient(runtimeCommands, executor)),
    async executeText(source: string, execution?: ExecuteOptions): Promise<unknown> {
      const [name, ...arguments_] = tokenizeCommand(source)
      const definition = runtimeCommands[name as keyof typeof runtimeCommands]
      if (!definition) throw new CommandError('COMMAND_NOT_FOUND', 'Command definition not found')
      return executor.execute(name!, parseArguments(definition.metadata, arguments_), execution)
    },
  })
  return {
    view,
    ready: clientPersistence.ready,
    dispose() {
      if (disposed) return
      disposed = true

      local.dispose()
      platform.dispose()
      directory.dispose()
      forms.dispose()
      timeline.dispose()
      drafts.dispose()
      interactions.dispose()
      controls.dispose()
      composerModel.dispose()
      composerIntent.dispose()
      composerPermission.dispose()
      sessionRename.dispose()
      sessionArchive.dispose()
      planProposal.dispose()
      settingsForms.dispose()
      providerSettings.dispose()
      commandPalette.dispose()
      fileWorkspace.dispose()
      agentWorkspace.dispose()
      goalPlanWorkspace.dispose()
      workflowWorkspace.dispose()
      extensionWorkspace.dispose()
      statusWorkspace.dispose()
      clientPersistence.dispose()
      disposeSurfaces()
      surfaces.dispose()
      presentation.dispose()
      navigation.dispose()
    },
  }
}
