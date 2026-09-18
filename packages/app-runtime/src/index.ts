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
import { createState } from './state'
import { createDirectoryModule } from './directory'
import { registerNavigationCommands } from './navigation'
import { createBudgetForms } from './budget-forms'
import { registerSurfaceCommands } from './surfaces'
import { createSessionTimeline } from './session-timeline'
import { createDrafts } from './drafts'
import type { NavigationState, RuntimeOptions, SurfaceState } from './types'
export type { StateReader } from './state'
export type {
  BudgetCommandPort,
  BudgetFormState,
  BudgetFormsState,
  DraftsState,
  DirectoryState,
  NavigationState,
  RuntimeOptions,
  RunCommandPort,
  SessionDraftState,
  SessionTimelinePort,
  SessionTimelineState,
  SessionTimelineUpdate,
  SurfaceCapabilityPort,
  PlatformPort,
  PanelSurface,
  WindowSurface,
  SurfaceState,
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
  registerNavigationCommands(local, directory.queries, navigation, () => disposed)
  const disposeSurfaces = registerSurfaceCommands(local, platform, options, navigation.reader, surfaces)
  const forms = createBudgetForms(local, options.budget, onSubscriberError, () => disposed)
  const timeline = createSessionTimeline(options.timeline, navigation.reader, onSubscriberError, () => disposed)
  const drafts = createDrafts(local, options.run, onSubscriberError, () => disposed)
  const executor = {
    execute(name: string, input: unknown, execution?: ExecuteOptions) {
      if (
        Object.hasOwn(surfaceCommands, name) &&
        surfaceCommands[name as keyof typeof surfaceCommands].metadata.execution === 'platform'
      )
        return platform.execute(name, input, execution)
      if (Object.hasOwn(runCommands, name)) return drafts.executeRun(name, input, execution)
      return Object.hasOwn(navigationCommands, name) ||
        Object.hasOwn(budgetEditorCommands, name) ||
        Object.hasOwn(draftCommands, name) ||
        Object.hasOwn(surfaceCommands, name)
        ? local.execute(name, input, execution)
        : remote.execute(name, input, execution)
    },
  }
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
    dispose() {
      if (disposed) return
      disposed = true

      local.dispose()
      platform.dispose()
      directory.dispose()
      forms.dispose()
      timeline.dispose()
      drafts.dispose()
      disposeSurfaces()
      surfaces.dispose()
      navigation.dispose()
    },
  }
}
