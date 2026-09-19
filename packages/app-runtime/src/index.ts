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
import { runCommands } from '@hbar/contracts/commands/run'
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
import { extensionWorkspaceCommands } from '@hbar/contracts/commands/extension-workspace'
import { statusWorkspaceCommands } from '@hbar/contracts/commands/status-workspace'
import { clientPersistenceCommands } from '@hbar/contracts/commands/client-persistence'
import { terminalApplicationCommands } from '@hbar/contracts/commands/terminal-application'
import { createState } from './state'
import { createDirectoryModule } from './directory'
import { registerNavigationCommands } from './navigation'
import { createBudgetForms } from './budget-forms'
import { registerSurfaceCommands } from './surfaces'
import { createSessionTimeline } from './session-timeline'
import { createDrafts } from './drafts'
import { createInteractions } from './interactions'
import { createSessionControls } from './session-controls'
import { createSettingsForms } from './settings-forms'
import { createProviderSettings } from './provider-settings'
import { createCommandPalette } from './command-palette'
import { createFileWorkspace } from './file-workspace'
import { createAgentWorkspace } from './agent-workspace'
import { createGoalPlanWorkspace } from './goal-plan-workspace'
import { createExtensionWorkspace } from './extension-workspace'
import { createStatusWorkspace } from './status-workspace'
import { createClientPersistence } from './client-persistence'
import type { NavigationState, RuntimeOptions, SurfaceState } from './types'
export type { StateReader } from './state'
export type {
  BudgetCommandPort,
  BudgetFormState,
  BudgetFormsState,
  DraftsState,
  DirectoryState,
  InteractionActionState,
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
  SessionTimelinePort,
  SessionTimelineState,
  SessionTimelineUpdate,
  SurfaceCapabilityPort,
  PlatformPort,
  PanelSurface,
  WindowSurface,
  SurfaceState,
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
  GoalPlanGoalDraftState,
  GoalPlanStepDraftState,
  GoalPlanPlanDraftState,
  GoalPlanWorkspaceEntryState,
  GoalPlanWorkspaceState,
  ExtensionWorkspaceActionState,
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
  registerNavigationCommands(local, directory.queries, directory.openWorkspace, navigation, () => disposed)
  const disposeSurfaces = registerSurfaceCommands(local, platform, options, navigation.reader, surfaces)
  const forms = createBudgetForms(local, options.budget, onSubscriberError, () => disposed)
  const timeline = createSessionTimeline(options.timeline, navigation.reader, onSubscriberError, () => disposed)
  const drafts = createDrafts(local, options.run, options.attachments, onSubscriberError, () => disposed)
  const interactions = createInteractions(
    local,
    options.interactions,
    timeline.reader,
    onSubscriberError,
    () => disposed,
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
  const settingsForms = createSettingsForms(
    local,
    options,
    surfaces.reader,
    directory.reader,
    onSubscriberError,
    () => disposed,
  )
  const providerSettings = createProviderSettings(local, options, surfaces.reader, onSubscriberError, () => disposed)
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
  const extensionWorkspace = createExtensionWorkspace(
    local,
    options,
    surfaces.reader,
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
        Object.hasOwn(settingsEditorCommands, name) ||
        Object.hasOwn(providerEditorCommands, name) ||
        Object.hasOwn(commandPaletteCommands, name) ||
        Object.hasOwn(fileWorkspaceCommands, name) ||
        Object.hasOwn(agentWorkspaceCommands, name) ||
        Object.hasOwn(goalPlanWorkspaceCommands, name) ||
        Object.hasOwn(extensionWorkspaceCommands, name) ||
        Object.hasOwn(statusWorkspaceCommands, name) ||
        Object.hasOwn(clientPersistenceCommands, name) ||
        Object.hasOwn(surfaceCommands, name)
        ? local.execute(name, input, execution)
        : remote.execute(name, input, execution)
    },
  }
  const commandPalette = createCommandPalette(
    local,
    options,
    navigation.reader,
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
      timeline: timeline.reader,
      drafts: drafts.reader,
      runActions: drafts.actions,
      interactions: interactions.reader,
      questionnaires: interactions.questionnaires,
      controls: controls.reader,
      settings: settingsForms.reader,
      providers: providerSettings.reader,
      commandPalette: commandPalette.reader,
      files: fileWorkspace.reader,
      agents: agentWorkspace.reader,
      goals: goalPlanWorkspace.reader,
      extensions: extensionWorkspace.reader,
      status: statusWorkspace.reader,
      layout: clientPersistence.layout,
      preferences: clientPersistence.preferences,
    }),
    commands: Object.freeze(createCommandClient(applicationCommands, executor)),
    async executeText(source: string, execution?: ExecuteOptions): Promise<unknown> {
      const [name, ...arguments_] = tokenizeCommand(source)
      const definition = applicationCommands[name as keyof typeof applicationCommands]
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
      settingsForms.dispose()
      providerSettings.dispose()
      commandPalette.dispose()
      fileWorkspace.dispose()
      agentWorkspace.dispose()
      goalPlanWorkspace.dispose()
      extensionWorkspace.dispose()
      statusWorkspace.dispose()
      clientPersistence.dispose()
      disposeSurfaces()
      surfaces.dispose()
      navigation.dispose()
    },
  }
}
