import { resolve } from 'node:path'
import { z } from 'zod'
import { createLocalExecutionPolicy, HbarError } from '@hbar/contracts'
import {
  SettingsService,
  createAgentCommands,
  createBrowserCommands,
  createComputerCommands,
  createConfigurationCommands,
  createGitCommands,
  createWorkspaceSessionCommands,
  createSessionLaunchTargetCommands,
  createSessionLaunchBranchesCommands,
  createSessionBranchTargetCommands,
  createBudgetCommands,
  createFileCommands,
  createResourceCommands,
  createGoalPlanCommands,
  createInteractionCommands,
  createModelCommands,
  createModelSettingsValidator,
  createRunCommands,
  createSettingsCommands,
  createUsageCommands,
  createWorkflowCommands,
  createScheduleCommands,
  createPromptTemplateCommands,
  createSandboxCommands,
  createSandboxSettingsValidator,
  createNotificationCommands,
  createRunBoardCommands,
  createScheduleDueReader,
} from '@hbar/kernel/controller'
import { budgetCommands as budgetDefinitions } from '@hbar/contracts/commands/budget'
import { agentCommands as agentDefinitions } from '@hbar/contracts/commands/agents'
import { browserCommands as browserDefinitions } from '@hbar/contracts/commands/browser'
import { computerCommands as computerDefinitions } from '@hbar/contracts/commands/computer'
import { configurationCommands as configurationDefinitions } from '@hbar/contracts/commands/configuration'
import { gitCommands as gitDefinitions } from '@hbar/contracts/commands/git'
import { workspaceSessionCommands as workspaceSessionDefinitions } from '@hbar/contracts/commands/workspaces'
import { sessionLaunchTargetCommands as sessionLaunchTargetDefinitions } from '@hbar/contracts/commands/session-launch-target'
import { sessionLaunchBranchesCommands as sessionLaunchBranchesDefinitions } from '@hbar/contracts/commands/session-launch-branches'
import { sessionBranchTargetCommands as sessionBranchTargetDefinitions } from '@hbar/contracts/commands/session-branch-target'
import { fileCommands as fileDefinitions } from '@hbar/contracts/commands/files'
import { resourceCommands as resourceDefinitions } from '@hbar/contracts/commands/resources'
import { extensionCommands as extensionDefinitions } from '@hbar/contracts/commands/extensions'
import { goalPlanCommands as goalPlanDefinitions } from '@hbar/contracts/commands/goals'
import { interactionCommands as interactionDefinitions } from '@hbar/contracts/commands/interaction'
import { modelCommands as modelDefinitions } from '@hbar/contracts/commands/models'
import { runCommands as runDefinitions } from '@hbar/contracts/commands/run'
import { settingsCommands as settingsDefinitions } from '@hbar/contracts/commands/settings'
import { chatDatabaseCommands as chatDatabaseDefinitions } from '@hbar/contracts/commands/chat-database'
import { usageCommands as usageDefinitions } from '@hbar/contracts/commands/usage'
import { workflowCommands as workflowDefinitions } from '@hbar/contracts/commands/workflows'
import { directoryCommands as directoryDefinitions } from '@hbar/contracts/commands'
import type { ExecutionProvider, GoalService, ModeService, PlanService, WorkspaceQueryProvider } from '@hbar/plugin-sdk'
import { createSkillImportService } from '@hbar/kernel/skill-import'
import { createExtensionCommands } from './extension-commands.ts'
import { createSkillInspectionService } from './skill-inspection.ts'
import type { KernelControllerPort } from '@hbar/kernel/controller'
import { UsageService } from '@hbar/usage'
import { createSessionSearchCommands } from '@hbar/kernel/session-search-commands'
import { sessionSearchCommands as sessionSearchDefinitions } from '@hbar/contracts/commands/session-search'
import { scheduleCommands as scheduleDefinitions } from '@hbar/contracts/commands/schedules'
import { promptTemplateCommands as promptTemplateDefinitions } from '@hbar/contracts/commands/prompt-templates'
import { sandboxCommands as sandboxDefinitions } from '@hbar/contracts/commands/sandbox'
import { notificationCommands as notificationDefinitions } from '@hbar/contracts/commands/notifications'
import { runBoardCommands as runBoardDefinitions } from '@hbar/contracts/commands/run-board'
import { submitRunInputSchema } from '@hbar/contracts/commands/run'
import { createScheduleService, createNotificationService } from '@hbar/kernel/controller'
import { createScheduleHostController } from './schedule-host-controller.ts'
import { createChatDatabaseHostController } from './chat-database-host-controller'
import {
  createCommandRouter,
  prepareCommandInvocation,
  type CommandDescriptor,
  type CommandInvocation,
} from '@hbar/commands'
declare const HBAR_MANAGED_MAINTENANCE: boolean

export interface ControllerCommandService {
  readonly commandIds: readonly string[]
  readonly service: {
    prepare?(value: unknown): CommandInvocation | Promise<CommandInvocation>
    dispatch(value: unknown, actorId: string): Promise<unknown>
    describe(id: string): CommandDescriptor
    list(filter?: { readonly includeInternal?: boolean }): { revision: number; items: readonly CommandDescriptor[] }
  }
}

function resolveModeService(kernel: KernelControllerPort): ModeService {
  return {
    get: (sessionId) => kernel.plugins.get('mode').get(sessionId),
    set: (sessionId, mode) => kernel.plugins.get('mode').set(sessionId, mode),
    effectiveMode: (run) => kernel.plugins.get('mode').effectiveMode(run),
    commitExit: (sessionId, commit) => kernel.plugins.get('mode').commitExit(sessionId, commit),
  }
}

function resolveGoalService(kernel: KernelControllerPort): GoalService {
  return {
    resumeOnStartup: () => kernel.plugins.get('goal').resumeOnStartup(),
    snapshot: (sessionId) => kernel.plugins.get('goal').snapshot(sessionId),
    get: (sessionId) => kernel.plugins.get('goal').get(sessionId),
    create: (sessionId, objective, tokenBudget, runId, startedAt) =>
      kernel.plugins.get('goal').create(sessionId, objective, tokenBudget, runId, startedAt),
    set: (sessionId, input) => kernel.plugins.get('goal').set(sessionId, input),
    update: (sessionId, status, runId, reason) => kernel.plugins.get('goal').update(sessionId, status, runId, reason),
    clear: (sessionId, expectedGoalId) => kernel.plugins.get('goal').clear(sessionId, expectedGoalId),
    requestContinuation: (sessionId, input) => kernel.plugins.get('goal').requestContinuation(sessionId, input),
  }
}

function resolvePlanService(kernel: KernelControllerPort): PlanService {
  return {
    snapshot: (sessionId) => kernel.plugins.get('plan').snapshot(sessionId),
    get: (sessionId) => kernel.plugins.get('plan').get(sessionId),
    withRevision: (sessionId, revision, commit) => kernel.plugins.get('plan').withRevision(sessionId, revision, commit),
    update: (sessionId, plan, explanation, turnId, expectedRevision) =>
      kernel.plugins.get('plan').update(sessionId, plan, explanation, turnId, expectedRevision),
    clear: (sessionId, expectedRevision) => kernel.plugins.get('plan').clear(sessionId, expectedRevision),
  }
}

function resolveExecutionProvider(kernel: KernelControllerPort): ExecutionProvider {
  return {
    list: (workspace, path) => kernel.plugins.get('execution').list(workspace, path),
    read: (workspace, path) => kernel.plugins.get('execution').read(workspace, path),
    readBytes: (workspace, path) => kernel.plugins.get('execution').readBytes(workspace, path),
    write: (workspace, path, text) => kernel.plugins.get('execution').write(workspace, path, text),
    exec: (workspace, command, signal) => kernel.plugins.get('execution').exec(workspace, command, signal),
    get workspaceQuery(): WorkspaceQueryProvider {
      const query = kernel.plugins.get('execution').workspaceQuery
      if (!query) throw new HbarError('CAPABILITY_UNAVAILABLE', 'Workspace path search is unavailable')
      return query
    },
  }
}

export function createControllerApplication(
  kernel: KernelControllerPort,
  options: {
    readonly maintenance?: import('./runtime-maintenance-contract').RuntimeMaintenancePort
    readonly publishFresh: (event: import('@hbar/contracts/commands/notifications').NotificationFreshEvent) => void
    readonly background?: boolean
    readonly manualGitQuery?: (
      input: {
        readonly workspaceId: string
        readonly actorId: string
        readonly requestId: string
        readonly cwd: string
      },
      signal: AbortSignal,
    ) => Promise<import('@hbar/plugin-sdk').GitLaunchBranchSnapshot | null>
  },
) {
  const localExecutionPolicy = createLocalExecutionPolicy(kernel.options.noLocalExec)
  const agentCommands = createAgentCommands(kernel.plugins.get('agent'), localExecutionPolicy)
  const browserCommands = createBrowserCommands(kernel.plugins.get('browser'))
  const computerCommands = createComputerCommands(kernel.plugins.get('computer'))
  const configurationCommands = createConfigurationCommands(kernel, resolveModeService(kernel))
  const skillInspection = createSkillInspectionService(kernel.options.layout.globalSkills)
  const skillImport = createSkillImportService({
    destination: kernel.options.layout.globalSkills,
    journalRoot: resolve(kernel.options.layout.settings, 'skill-imports'),
  })
  const extensionCommands = createExtensionCommands({
    skillImport,
    list: () => kernel.plugins.list(),
    set: (id, enabled, config) => kernel.changePlugin(id, enabled, config),
    install: (path, projectId) => kernel.installPlugin(path, projectId),
    async remove(id) {
      kernel.assertIdle()
      const result = await kernel.plugins.remove(id)
      kernel.changed('plugins')
      return result
    },
    resolve: (id) => kernel.plugins.resolve(id),
    graph: () => kernel.plugins.graph(),
    lock: () => kernel.plugins.lock(),
    doctor: () => kernel.plugins.doctor(),
    skills: (signal) => skillInspection.list(signal),
    skillInspection,
  })
  const gitCommands = createGitCommands(kernel.plugins.get('git'), {
    storage: kernel.storage,
    resolveSessionPath: (sessionId, workspacePath, signal) =>
      kernel.sessionLaunchTargets.workspaceForRun(sessionId, workspacePath, signal),
  }, localExecutionPolicy)
  const workspaceSessionCommands = createWorkspaceSessionCommands(kernel)
  const sessionLaunchTargetCommands = createSessionLaunchTargetCommands(kernel, () =>
    kernel.changed('session-launch-target'),
  )
  const sessionLaunchBranchesCommands = createSessionLaunchBranchesCommands(
    kernel.storage,
    kernel.plugins.get('git'),
    options.manualGitQuery ? { manualQuery: options.manualGitQuery } : {},
  )
  const sessionBranchTargetCommands = createSessionBranchTargetCommands(kernel)
  const budgetCommands = createBudgetCommands(kernel.plugins.get('budget'))
  const fileCommands = createFileCommands(kernel.storage, resolveExecutionProvider(kernel), {
    resolveWorkspacePath: (workspaceId, path, signal) => kernel.workspaceSandboxes.prepare(workspaceId, path, signal),
    resolveSessionPath: (sessionId, workspacePath, signal) =>
      kernel.sessionLaunchTargets.workspaceForRun(sessionId, workspacePath, signal),
  }, { undo: (sessionId, runId, signal) => kernel.undoFileChanges(sessionId, runId, signal) })
  const goalPlanCommands = createGoalPlanCommands(
    resolveGoalService(kernel),
    resolvePlanService(kernel),
    kernel.storage,
  )
  const interactionCommands = createInteractionCommands(kernel)
  const validateModelSettings = createModelSettingsValidator(kernel)
  const validateSandboxSettings = createSandboxSettingsValidator(kernel.sandboxProfiles)
  const settingsService = new SettingsService(
    kernel.storage,
    async (candidate) => {
      await validateModelSettings(candidate)
      await validateSandboxSettings(candidate)
    },
    () => kernel.changed('settings'),
  )
  const modelCommands = createModelCommands(kernel, settingsService)
  const runCommands = createRunCommands(kernel)
  const settingsCommands = createSettingsCommands(settingsService)
  const resourceCommands = createResourceCommands(
    kernel.storage,
    resolveExecutionProvider(kernel),
    {
      resolveWorkspacePath: (workspaceId, path, signal) => kernel.workspaceSandboxes.prepare(workspaceId, path, signal),
      resolveSessionPath: (sessionId, workspacePath, signal) =>
        kernel.sessionLaunchTargets.workspaceForRun(sessionId, workspacePath, signal),
    },
    [
      kernel.options.layout.settings,
      kernel.options.layout.artifacts,
      kernel.options.layout.sessions,
      kernel.options.layout.databases,
      kernel.options.layout.connectionFile,
      kernel.options.layout.hostLock,
      kernel.options.layout.diagnostics,
    ],
  )
  const chatDatabaseCommands =
    options.maintenance ??
    (typeof HBAR_MANAGED_MAINTENANCE !== 'undefined' && HBAR_MANAGED_MAINTENANCE
      ? (() => {
          throw new HbarError('RUNTIME_RECOVERING', 'The managed Maintenance port is required')
        })()
      : createChatDatabaseHostController(kernel, settingsService))
  const usageCommands = createUsageCommands(
    new UsageService({ read: (input) => kernel.storage.call('usageEvents', input) }),
  )
  const workflowCommands = createWorkflowCommands(kernel.plugins.get('workflow'), {
    lookup: (input, options) => runCommands.getPeerMessageReceipt(input, options.actorId, options.idempotencyKey),
    send: (input, options) => runCommands.execute('session.message.send', input, options),
    cancel: (operationId, options) => runCommands.execute('operation.cancel', { operationId }, options),
    get: (operationId, options) => runCommands.execute('operation.get', { operationId }, options),
  })
  const sessionSearchCommands = createSessionSearchCommands(kernel.storage, { start: options.background ?? true })
  const scheduleService = createScheduleService({
    list: (workspaceId, after, limit) => kernel.storage.call('schedulePage', workspaceId, after, limit),
    get: (scheduleId) => kernel.storage.call('schedule', scheduleId),
    create: (input, identity) => kernel.storage.call('createSchedule', input, identity),
    update: (input, identity) => kernel.storage.call('updateSchedule', input, identity),
    delete: (scheduleId, expectedRevision, identity) =>
      kernel.storage.call('deleteSchedule', scheduleId, expectedRevision, identity),
    occurrences: (scheduleId, after, limit) => kernel.storage.call('scheduleOccurrences', scheduleId, after, limit),
    claim: (scheduleId, dueAt, now) => kernel.storage.call('claimScheduleOccurrence', scheduleId, dueAt, now),
    transition: (id, status, runId, error, sessionId) =>
      kernel.storage.call('transitionScheduleOccurrence', id, status, runId, error, sessionId),
  })
  const scheduleCommands = createScheduleCommands(scheduleService, {
    lookup: (commandId, input, identity) => kernel.storage.call('scheduleReceipt', commandId, input, identity),
  })
  const sandboxCommandService = createSandboxCommands(kernel.sandboxProfiles)
  const promptTemplateCommands = createPromptTemplateCommands({
    list: (input) => kernel.storage.call('promptTemplatePage', input),
    get: (id) => kernel.storage.call('promptTemplate', id),
    save: (input, identity) => kernel.storage.call('savePromptTemplate', input, identity),
    delete: (input, identity) => kernel.storage.call('deletePromptTemplate', input, identity),
    receipt: (commandId, input, identity) => kernel.storage.call('promptTemplateReceipt', commandId, input, identity),
  })
  const notificationService = createNotificationService({
    storage: {
      insertNotification: (record) => kernel.storage.call('insertNotification', record),
      notificationPage: (input) => kernel.storage.call('notificationPage', input),
      notificationBySourceEvent: (sourceEventId) => kernel.storage.call('notificationBySourceEvent', sourceEventId),
      markNotificationRead: (id, readAt, identity) => kernel.storage.call('markNotificationRead', id, readAt, identity),
      markAllNotificationsRead: (readAt, identity) => kernel.storage.call('markAllNotificationsRead', readAt, identity),
      notificationPreferences: () => kernel.storage.call('notificationPreferences'),
      setNotificationPreferences: (input, identity) =>
        kernel.storage.call('setNotificationPreferences', input, identity),
      notificationReceipt: (commandId, input, identity) =>
        kernel.storage.call('notificationReceipt', commandId, input, identity),
    },
    publish: (event) => kernel.changed(event.params.kind),
    publishFresh: (event) => options.publishFresh(event),
  })
  const notificationCommands = createNotificationCommands(notificationService)
  const runBoardCommands = createRunBoardCommands(kernel.storage)
  const readDueSchedules = createScheduleDueReader({
    enabledPage: (after, limit) => kernel.storage.call('enabledSchedules', after, limit),
    runtime: (id) => kernel.storage.call('scheduleRuntime', id),
    recordCandidate: (id, dueAt, now) => kernel.storage.call('recordScheduleCandidate', id, dueAt, now),
  })
  const scheduleController = createScheduleHostController({
    service: scheduleService,
    actorId: 'hbar:scheduler',
    runCommands: {
      execute: (id, input, options) =>
        id === 'run.submit'
          ? runCommands.execute(id, submitRunInputSchema.parse(input), options)
          : runCommands.execute(id, z.strictObject({ operationId: z.string().min(1) }).parse(input), options),
      getReceipt: (_commandId, sessionId, actorId, idempotencyKey) =>
        runCommands.getReceipt('run.submit', sessionId, actorId, idempotencyKey),
    },
    prepareSession: async (input) => {
      if (input.sessionId || input.target === 'existing-session') {
        if (!input.sessionId) throw new HbarError('INVALID_INPUT', 'Scheduled target session is required')
        const session = await kernel.storage.call('session', input.sessionId)
        if (session.workspaceId !== input.workspaceId || session.archived)
          throw new HbarError('COMMAND_CONFLICT', 'Scheduled target session is unavailable')
        return { sessionId: session.id }
      }
      const created = await kernel.storage.call('createSessionCommand', {
        actorId: 'hbar:scheduler',
        idempotencyKey: `schedule-session:${input.occurrenceId}`,
        workspaceId: input.workspaceId,
        title: 'Scheduled run',
      })
      kernel.changed('sessions')
      return { sessionId: created.id }
    },
    reader: {
      enabledSchedules: async (after: string | null, limit: number) =>
        (await kernel.storage.call('enabledSchedules', after, limit)).items,
      activeScheduleOccurrences: (limit, after) => kernel.storage.call('activeScheduleOccurrences', limit, after),
      dueScheduleOccurrences: readDueSchedules,
    },
    onFailure: ({ occurrenceId }) => notificationService.publishSource(`schedule:${occurrenceId}:failed`),
  })
  const commandServices: ControllerCommandService[] = [
    { definitions: agentDefinitions, service: agentCommands },
    { definitions: browserDefinitions, service: browserCommands },
    { definitions: computerDefinitions, service: computerCommands },
    { definitions: configurationDefinitions, service: configurationCommands },
    { definitions: extensionDefinitions, service: extensionCommands },
    { definitions: gitDefinitions, service: gitCommands },
    { definitions: directoryDefinitions, service: kernel.directoryQueries },
    { definitions: sessionSearchDefinitions, service: sessionSearchCommands },
    { definitions: workspaceSessionDefinitions, service: workspaceSessionCommands },
    { definitions: sessionLaunchTargetDefinitions, service: sessionLaunchTargetCommands },
    { definitions: sessionLaunchBranchesDefinitions, service: sessionLaunchBranchesCommands },
    { definitions: sessionBranchTargetDefinitions, service: sessionBranchTargetCommands },
    { definitions: budgetDefinitions, service: budgetCommands },
    { definitions: fileDefinitions, service: fileCommands },
    { definitions: resourceDefinitions, service: resourceCommands },
    { definitions: goalPlanDefinitions, service: goalPlanCommands },
    { definitions: interactionDefinitions, service: interactionCommands },
    { definitions: modelDefinitions, service: modelCommands },
    { definitions: runDefinitions, service: runCommands },
    { definitions: settingsDefinitions, service: settingsCommands },
    { definitions: chatDatabaseDefinitions, service: chatDatabaseCommands },
    { definitions: usageDefinitions, service: usageCommands },
    { definitions: workflowDefinitions, service: workflowCommands },
    { definitions: scheduleDefinitions, service: scheduleCommands },
    { definitions: promptTemplateDefinitions, service: promptTemplateCommands },
    { definitions: sandboxDefinitions, service: sandboxCommandService },
    { definitions: notificationDefinitions, service: notificationCommands },
    { definitions: runBoardDefinitions, service: runBoardCommands },
  ].map(({ definitions, service }) => ({
    commandIds: Object.keys(definitions),
    service: {
      dispatch: service.dispatch,
      describe: service.describe,
      list: service.list,
      prepare: (value: unknown) => prepareCommandInvocation(definitions, value),
    },
  }))
  const commandDispatchers = new Map<string, (value: unknown, actorId: string) => Promise<unknown>>(
    commandServices.flatMap(({ commandIds, service }) => commandIds.map((id) => [id, service.dispatch] as const)),
  )
  const commandDescribers = new Map(
    commandServices.flatMap(({ commandIds, service }) =>
      commandIds.map((id) => [id, () => service.describe(id)] as const),
    ),
  )
  const commandRouter = createCommandRouter({
    catalogs: () => commandServices.map(({ service }) => service.list()),
    resolve(id) {
      const dispatch = commandDispatchers.get(id)
      const describe = commandDescribers.get(id)
      const prepare = commandServices.find((entry) => entry.commandIds.includes(id))?.service.prepare
      return dispatch && describe ? { dispatch, describe, ...(prepare ? { prepare } : {}) } : undefined
    },
  })

  return {
    agentCommands,
    browserCommands,
    computerCommands,
    configurationCommands,
    skillImport,
    extensionCommands,
    gitCommands,
    workspaceSessionCommands,
    sessionLaunchTargetCommands,
    sessionLaunchBranchesCommands,
    sessionBranchTargetCommands,
    budgetCommands,
    fileCommands,
    goalPlanCommands,
    interactionCommands,
    settingsService,
    modelCommands,
    runCommands,
    settingsCommands,
    resourceCommands,
    chatDatabaseCommands,
    usageCommands,
    workflowCommands,
    sessionSearchCommands,
    scheduleService,
    scheduleCommands,
    sandboxCommandService,
    promptTemplateCommands,
    notificationService,
    notificationCommands,
    runBoardCommands,
    scheduleController,
    commandServices,
    commandDispatchers,
    commandDescribers,
    commandRouter,
    async dispose() {
      agentCommands.dispose()
      browserCommands.dispose()
      computerCommands.dispose()
      configurationCommands.dispose()
      extensionCommands.dispose()
      await skillImport.dispose()
      gitCommands.dispose()
      workspaceSessionCommands.dispose()
      sessionLaunchTargetCommands.dispose()
      sessionLaunchBranchesCommands.dispose()
      sessionBranchTargetCommands.dispose()
      await sessionSearchCommands.dispose()
      budgetCommands.dispose()
      fileCommands.dispose()
      resourceCommands.dispose()
      goalPlanCommands.dispose()
      workflowCommands.dispose()
      interactionCommands.dispose()
      modelCommands.dispose()
      runCommands.dispose()
      settingsCommands.dispose()
      await chatDatabaseCommands.dispose()
      usageCommands.dispose()
      await scheduleController.close()
      scheduleCommands.dispose()
      promptTemplateCommands.dispose()
      sandboxCommandService.dispose()
      notificationCommands.dispose()
      runBoardCommands.dispose()
    },
  }
}
export type ControllerApplication = ReturnType<typeof createControllerApplication>
