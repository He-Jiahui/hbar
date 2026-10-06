import { networkInterfaces } from 'node:os'
import { createHash } from 'node:crypto'
import { resolve, relative, isAbsolute, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { APP_VERSION, HbarError, PROTOCOL_VERSION, rpcRequestSchema, rpcSchemas } from '@hbar/contracts'
import type { HostInfo, RpcMethod, WireNotification } from '@hbar/contracts'
import type { ServerWebSocket } from 'bun'
import {
  Kernel,
  SettingsService,
  createAgentCommands,
  createBrowserCommands,
  createComputerCommands,
  createConfigurationCommands,
  createGitCommands,
  createWorkspaceSessionCommands,
  createSessionLaunchTargetCommands,
  createSessionLaunchBranchesCommands,
  createBudgetCommands,
  createFileCommands,
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
} from '@hbar/kernel'
import { budgetCommands as budgetDefinitions } from '@hbar/contracts/commands/budget'
import { agentCommands as agentDefinitions } from '@hbar/contracts/commands/agents'
import { browserCommands as browserDefinitions } from '@hbar/contracts/commands/browser'
import { computerCommands as computerDefinitions } from '@hbar/contracts/commands/computer'
import { configurationCommands as configurationDefinitions } from '@hbar/contracts/commands/configuration'
import { gitCommands as gitDefinitions } from '@hbar/contracts/commands/git'
import { workspaceSessionCommands as workspaceSessionDefinitions } from '@hbar/contracts/commands/workspaces'
import { sessionLaunchTargetCommands as sessionLaunchTargetDefinitions } from '@hbar/contracts/commands/session-launch-target'
import { sessionLaunchBranchesCommands as sessionLaunchBranchesDefinitions } from '@hbar/contracts/commands/session-launch-branches'
import { fileCommands as fileDefinitions } from '@hbar/contracts/commands/files'
import { extensionCommands as extensionDefinitions } from '@hbar/contracts/commands/extensions'
import { goalPlanCommands as goalPlanDefinitions } from '@hbar/contracts/commands/goals'
import { interactionCommands as interactionDefinitions } from '@hbar/contracts/commands/interaction'
import { modelCommands as modelDefinitions } from '@hbar/contracts/commands/models'
import {
  queuedRunGuidedOperationId as guidedOperationId,
  runCommands as runDefinitions,
} from '@hbar/contracts/commands/run'
import { settingsCommands as settingsDefinitions } from '@hbar/contracts/commands/settings'
import { systemCommands as systemDefinitions } from '@hbar/contracts/commands/system'
import { usageCommands as usageDefinitions } from '@hbar/contracts/commands/usage'
import { workflowCommands as workflowDefinitions } from '@hbar/contracts/commands/workflows'
import { metricsCommands as metricsDefinitions } from '@hbar/contracts/commands/metrics'
import {
  directoryCommands as directoryDefinitions,
  surfaceCommands as surfaceDefinitions,
} from '@hbar/contracts/commands'
import { CommandError } from '@hbar/commands/protocol'
import type {
  BrowserUseService,
  AgentService,
  BudgetService,
  ComputerUseService,
  ExecutionProvider,
  GitService,
  GoalService,
  ModeService,
  PlanService,
  WorkspaceQueryProvider,
  WorkflowService,
} from '@hbar/plugin-sdk'
import { Auth, requestToken } from './auth.ts'
import { createSystemCommands } from './system-commands.ts'
import { createExtensionCommands } from './extension-commands.ts'
import { createSkillInspectionService } from './skill-inspection.ts'
import type { RuntimeScope } from '@hbar/kernel'
import { SystemTerminalManager } from './system-terminal'
import { UsageService } from '@hbar/usage'
import { PerformanceCollector } from '@hbar/metrics'
import { createHostPerformanceProvider } from './performance-provider.ts'
import { createMetricsCommands } from './metrics-commands.ts'
import { createSessionSearchCommands } from '@hbar/kernel/session-search-commands'
import { sessionSearchCommands as sessionSearchDefinitions } from '@hbar/contracts/commands/session-search'
import { scheduleCommands as scheduleDefinitions } from '@hbar/contracts/commands/schedules'
import { promptTemplateCommands as promptTemplateDefinitions } from '@hbar/contracts/commands/prompt-templates'
import { sandboxCommands as sandboxDefinitions } from '@hbar/contracts/commands/sandbox'
import { notificationCommands as notificationDefinitions } from '@hbar/contracts/commands/notifications'
import { runBoardCommands as runBoardDefinitions } from '@hbar/contracts/commands/run-board'
import { submitRunInputSchema } from '@hbar/contracts/commands/run'
import { createScheduleService, createNotificationService } from '@hbar/kernel'
import { createScheduleHostController } from './schedule-host-controller.ts'

interface SocketData {
  token?: string | undefined
  deviceId?: string | undefined
  initialized: boolean
  follows: Set<string>
  operationFollows: Set<string>
  metricsFollowing: boolean
  pending: number
  terminals: Set<string>
  terminalCallbacks?: {
    onOutput(terminalId: string, data: string): void
    onExit(terminalId: string, code: number | null, signal: string | null): void
  }
  timer?: ReturnType<typeof setTimeout> | undefined
  scope?: RuntimeScope | undefined
  surfaceClientId?: string | undefined
  surfaceGeneration?: number | undefined
  schemaQueries: Map<string, AbortController>
}
export interface ServerOptions {
  hostname?: string
  port?: number
  origins?: string[]
  desktop?: boolean
  staticRoot?: string
  cert?: string
  key?: string
  metricsIntervalMs?: number
  restart?: () => boolean | Promise<boolean>
}

function resolveModeService(kernel: Kernel): ModeService {
  return {
    get: (sessionId) => kernel.plugins.get<ModeService>('mode').get(sessionId),
    set: (sessionId, mode) => kernel.plugins.get<ModeService>('mode').set(sessionId, mode),
    effectiveMode: (run) => kernel.plugins.get<ModeService>('mode').effectiveMode(run),
    commitExit: (sessionId, commit) => kernel.plugins.get<ModeService>('mode').commitExit(sessionId, commit),
  }
}

function resolveGoalService(kernel: Kernel): GoalService {
  return {
    snapshot: (sessionId) => kernel.plugins.get<GoalService>('goal').snapshot(sessionId),
    get: (sessionId) => kernel.plugins.get<GoalService>('goal').get(sessionId),
    create: (sessionId, objective, tokenBudget, runId, startedAt) =>
      kernel.plugins.get<GoalService>('goal').create(sessionId, objective, tokenBudget, runId, startedAt),
    set: (sessionId, input) => kernel.plugins.get<GoalService>('goal').set(sessionId, input),
    update: (sessionId, status, runId, reason) =>
      kernel.plugins.get<GoalService>('goal').update(sessionId, status, runId, reason),
    clear: (sessionId, expectedGoalId) => kernel.plugins.get<GoalService>('goal').clear(sessionId, expectedGoalId),
    requestContinuation: (sessionId, input) =>
      kernel.plugins.get<GoalService>('goal').requestContinuation(sessionId, input),
  }
}

function resolvePlanService(kernel: Kernel): PlanService {
  return {
    snapshot: (sessionId) => kernel.plugins.get<PlanService>('plan').snapshot(sessionId),
    get: (sessionId) => kernel.plugins.get<PlanService>('plan').get(sessionId),
    withRevision: (sessionId, revision, commit) =>
      kernel.plugins.get<PlanService>('plan').withRevision(sessionId, revision, commit),
    update: (sessionId, plan, explanation, turnId, expectedRevision) =>
      kernel.plugins.get<PlanService>('plan').update(sessionId, plan, explanation, turnId, expectedRevision),
    clear: (sessionId, expectedRevision) => kernel.plugins.get<PlanService>('plan').clear(sessionId, expectedRevision),
  }
}

function resolveExecutionProvider(kernel: Kernel): ExecutionProvider {
  return {
    list: (workspace, path) => kernel.plugins.get<ExecutionProvider>('execution').list(workspace, path),
    read: (workspace, path) => kernel.plugins.get<ExecutionProvider>('execution').read(workspace, path),
    readBytes: (workspace, path) => kernel.plugins.get<ExecutionProvider>('execution').readBytes(workspace, path),
    write: (workspace, path, text) => kernel.plugins.get<ExecutionProvider>('execution').write(workspace, path, text),
    exec: (workspace, command, signal) =>
      kernel.plugins.get<ExecutionProvider>('execution').exec(workspace, command, signal),
    get workspaceQuery(): WorkspaceQueryProvider {
      const query = kernel.plugins.get<ExecutionProvider>('execution').workspaceQuery
      if (!query) throw new HbarError('CAPABILITY_UNAVAILABLE', 'Workspace path search is unavailable')
      return query
    },
  }
}

export async function startServer(kernel: Kernel, options: ServerOptions = {}) {
  const performance = new PerformanceCollector(
    createHostPerformanceProvider(async () => ({
      activeRuns: kernel.active.size,
      queuedRuns: (await kernel.storage.call('queuedSessions')).length,
      managedChildProcesses: null,
    })),
    { intervalMs: options.metricsIntervalMs },
  )
  await performance.start()
  const metricsCommands = createMetricsCommands(performance)
  const agentCommands = createAgentCommands(kernel.plugins.get<AgentService>('agent'))
  const browserCommands = createBrowserCommands(kernel.plugins.get<BrowserUseService>('browser'))
  const computerCommands = createComputerCommands(kernel.plugins.get<ComputerUseService>('computer'))
  const configurationCommands = createConfigurationCommands(kernel, resolveModeService(kernel))
  const skillInspection = createSkillInspectionService(kernel.options.layout.globalSkills)
  const extensionCommands = createExtensionCommands({
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
  const gitCommands = createGitCommands(kernel.plugins.get<GitService>('git'), {
    storage: kernel.storage,
    resolveSessionPath: (sessionId, workspacePath, signal) =>
      kernel.sessionLaunchTargets.workspaceForRun(sessionId, workspacePath, signal),
  })
  const workspaceSessionCommands = createWorkspaceSessionCommands(kernel)
  const sessionLaunchTargetCommands = createSessionLaunchTargetCommands(kernel, () =>
    kernel.changed('session-launch-target'),
  )
  const sessionLaunchBranchesCommands = createSessionLaunchBranchesCommands(
    kernel.storage,
    kernel.plugins.get<GitService>('git'),
  )
  const budgetCommands = createBudgetCommands(kernel.plugins.get<BudgetService>('budget'))
  const fileCommands = createFileCommands(kernel.storage, resolveExecutionProvider(kernel), {
    resolveWorkspacePath: (workspaceId, path, signal) => kernel.workspaceSandboxes.prepare(workspaceId, path, signal),
    resolveSessionPath: (sessionId, workspacePath, signal) =>
      kernel.sessionLaunchTargets.workspaceForRun(sessionId, workspacePath, signal),
  })
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
  const usageCommands = createUsageCommands(
    new UsageService({ read: (input) => kernel.storage.call('usageEvents', input) }),
  )
  const workflowCommands = createWorkflowCommands(kernel.plugins.get<WorkflowService>('workflow'))
  const sessionSearchCommands = createSessionSearchCommands(kernel.storage)
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
    publishFresh: (event) => broadcastFresh(event),
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
  const commandServices = [
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
    { definitions: budgetDefinitions, service: budgetCommands },
    { definitions: fileDefinitions, service: fileCommands },
    { definitions: goalPlanDefinitions, service: goalPlanCommands },
    { definitions: interactionDefinitions, service: interactionCommands },
    { definitions: modelDefinitions, service: modelCommands },
    { definitions: metricsDefinitions, service: metricsCommands },
    { definitions: runDefinitions, service: runCommands },
    { definitions: settingsDefinitions, service: settingsCommands },
    { definitions: usageDefinitions, service: usageCommands },
    { definitions: workflowDefinitions, service: workflowCommands },
    { definitions: scheduleDefinitions, service: scheduleCommands },
    { definitions: promptTemplateDefinitions, service: promptTemplateCommands },
    { definitions: sandboxDefinitions, service: sandboxCommandService },
    { definitions: notificationDefinitions, service: notificationCommands },
    { definitions: runBoardDefinitions, service: runBoardCommands },
  ]
  const commandDispatchers = new Map<string, (value: unknown, actorId: string) => Promise<unknown>>(
    commandServices.flatMap(({ definitions, service }) =>
      Object.keys(definitions).map((id) => [id, service.dispatch] as const),
    ),
  )
  const commandDescribers = new Map(
    commandServices.flatMap(({ definitions, service }) =>
      Object.keys(definitions).map((id) => [id, () => service.describe(id)] as const),
    ),
  )
  const hostname = options.hostname ?? '127.0.0.1'
  const auth = new Auth(kernel.storage)
  const pairing = auth.createPairing()
  const sockets = new Set<ServerWebSocket<SocketData>>()
  const systemTerminals = new SystemTerminalManager()
  let broadcastFresh: (event: import('@hbar/contracts/commands/notifications').NotificationFreshEvent) => void = () =>
    undefined
  const notificationTasks = new Set<Promise<void>>()
  const notificationQueue: Array<() => Promise<void>> = []
  let notificationActive = 0
  const enqueueNotification = (task: () => Promise<void>) => {
    if (notificationQueue.length + notificationActive >= 256) {
      kernel.changed('notifications')
      return
    }
    notificationQueue.push(task)
    const pump = () => {
      while (notificationActive < 4 && notificationQueue.length) {
        const next = notificationQueue.shift()!
        notificationActive++
        const promise = next()
          .catch((error) => {
            console.error('Notification publication failed:', error)
            kernel.changed('notifications')
          })
          .finally(() => {
            notificationActive--
            notificationTasks.delete(promise)
            pump()
          })
        notificationTasks.add(promise)
      }
    }
    pump()
  }
  const surfaceClients = new Map<
    string,
    { socket: ServerWebSocket<SocketData>; generation: number; commands: Set<string> }
  >()
  type SurfaceOutcome = { ok: true; result: unknown } | { ok: false; code: string; message: string }
  interface PendingSurfaceInvocation {
    key: string
    signature: string
    relayId: string
    targetId: string
    generation: number
    promise: Promise<SurfaceOutcome>
    resolve(outcome: SurfaceOutcome): void
    timer?: ReturnType<typeof setTimeout>
  }
  const pendingSurfaceByRelay = new Map<string, PendingSurfaceInvocation>()
  const pendingSurfaceByKey = new Map<string, PendingSurfaceInvocation>()
  const completedSurfaces = new Map<string, { signature: string; outcome: SurfaceOutcome; expiresAt: number }>()
  const allowedSurfaceCommands = new Set(Object.keys(surfaceDefinitions))
  const addresses = [
    ...new Set(
      Object.values(networkInterfaces()).flatMap((list) =>
        (list ?? []).filter((item) => item.family === 'IPv4').map((item) => item.address),
      ),
    ),
  ]
  const allowedHosts = new Set([
    'localhost',
    '127.0.0.1',
    '[::1]',
    ...addresses,
    ...(hostname === '0.0.0.0' ? [] : [hostname]),
  ])
  const origins = new Set(options.origins ?? [])
  if (options.desktop) {
    origins.add('http://127.0.0.1:5173')
    origins.add('http://localhost:5173')
  }
  for (const origin of origins) allowedHosts.add(new URL(origin).hostname)
  const root = resolve(options.staticRoot ?? join(import.meta.dir, '../../../dist/web'))
  const secure = Boolean(options.cert && options.key)
  if (Boolean(options.cert) !== Boolean(options.key)) throw new Error('Configure both TLS certificate and key')
  let server: Bun.Server<SocketData>
  const hostInfo = (): HostInfo => ({
    version: APP_VERSION,
    protocol: PROTOCOL_VERSION,
    instanceId: kernel.instanceId,
    platform: process.platform,
    addresses: (hostname === '127.0.0.1' ? ['127.0.0.1'] : addresses).map(
      (ip) => `${secure ? 'https' : 'http'}://${ip}:${server.port}`,
    ),
    activeRuns: kernel.active.size,
    demo: Boolean(kernel.options.demo),
  })
  function validOrigin(request: Request) {
    const url = new URL(request.url)
    if (!allowedHosts.has(url.hostname)) return false
    const origin = request.headers.get('origin')
    return !origin || origin === url.origin || origins.has(origin)
  }
  function response(request: Request, body: BodyInit | null, status = 200, extra: HeadersInit = {}) {
    const headers = new Headers(extra)
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('Referrer-Policy', 'no-referrer')
    headers.set('Cache-Control', 'no-store')
    const origin = request.headers.get('origin')
    if (origin && validOrigin(request)) {
      headers.set('Access-Control-Allow-Origin', origin)
      headers.set('Access-Control-Allow-Credentials', 'true')
      headers.set('Vary', 'Origin')
    }
    return new Response(body, { status, headers })
  }
  function json(request: Request, data: unknown, status = 200, headers: HeadersInit = {}) {
    return response(request, JSON.stringify(data), status, { 'Content-Type': 'application/json', ...headers })
  }
  function send(socket: ServerWebSocket<SocketData>, value: unknown) {
    if (socket.readyState !== 1) return
    if (socket.getBufferedAmount() > 4 * 1024 * 1024) {
      socket.close(1013, 'Reconnect to resynchronize')
      return
    }
    socket.send(JSON.stringify(value))
  }
  broadcastFresh = (event) => {
    for (const socket of sockets)
      if (socket.data.initialized) send(socket, { jsonrpc: '2.0', method: 'notifications.created', params: event })
  }
  const systemCommands = createSystemCommands({
    hostInfo,
    async diagnose() {
      return {
        database: await kernel.storage.call('stats'),
        recoveredRuns: kernel.recovered,
        plugins: kernel.plugins.list(),
        tools: kernel.tools.list().map((tool) => tool.name),
        streams: kernel.streams.size,
      }
    },
    paths: () => kernel.paths(),
    storageLocations: () => kernel.storageLocations(),
    applyStorageLocations: (input) => kernel.applyStorageLocations(input),
    validatePaths: (dataRoot, cacheRoot) => kernel.validatePaths(dataRoot, cacheRoot),
    setPaths: (dataRoot, cacheRoot) => kernel.setPaths(dataRoot, cacheRoot),
    devices: () => kernel.storage.call('devices'),
    async revokeDevice(id) {
      const revoked = (await kernel.storage.call('devices')).some((device) => device.id === id)
      if (!revoked) return { revoked: false }
      await kernel.storage.call('revokeDevice', id)
      for (const peer of sockets)
        if (peer.data.deviceId === id) {
          send(peer, { jsonrpc: '2.0', method: 'auth.revoked', params: { reason: 'Device access revoked' } })
          peer.close(4001, 'Revoked')
        }
      return { revoked: true }
    },
    createPairing: () => auth.createPairing(),
    ...(options.restart ? { restart: options.restart } : {}),
  })
  for (const id of Object.keys(systemDefinitions)) {
    commandDispatchers.set(id, systemCommands.dispatch)
    commandDescribers.set(id, () => systemCommands.describe(id))
  }
  function finishSurface(pending: PendingSurfaceInvocation, outcome: SurfaceOutcome) {
    if (pendingSurfaceByRelay.get(pending.relayId) !== pending) return
    clearTimeout(pending.timer)
    pendingSurfaceByRelay.delete(pending.relayId)
    pendingSurfaceByKey.delete(pending.key)
    completedSurfaces.set(pending.key, { signature: pending.signature, outcome, expiresAt: Date.now() + 60_000 })
    while (completedSurfaces.size > 1000) completedSurfaces.delete(completedSurfaces.keys().next().value!)
    pending.resolve(outcome)
  }
  function rejectSurfaceTarget(clientId: string, generation: number, message: string) {
    for (const pending of [...pendingSurfaceByRelay.values()])
      if (pending.targetId === clientId && pending.generation === generation)
        finishSurface(pending, { ok: false, code: 'CAPABILITY_UNAVAILABLE', message })
  }
  function legacyCommandOptions(
    method: RpcMethod,
    rpcId: string | number,
    socket: ServerWebSocket<SocketData>,
    idempotent = false,
  ) {
    const requestId = `legacy-${createHash('sha256')
      .update(`${method}:${String(rpcId)}`)
      .digest('hex')
      .slice(0, 32)}`
    return {
      actorId: socket.data.deviceId!,
      requestId,
      ...(idempotent ? { idempotencyKey: requestId } : {}),
    }
  }

  async function invoke(
    method: RpcMethod,
    raw: unknown,
    socket: ServerWebSocket<SocketData>,
    rpcId: string | number,
  ): Promise<unknown> {
    switch (method) {
      case 'command.execute': {
        const invocation = rpcSchemas[method].parse(raw)
        if (!socket.data.deviceId) throw new HbarError('UNAUTHORIZED', 'Authenticated device required')
        const dispatch = commandDispatchers.get(invocation.commandId)
        if (!dispatch) throw new HbarError('COMMAND_NOT_FOUND', 'Command is not registered on this Host')
        return dispatch(invocation, socket.data.deviceId)
      }
      case 'command.catalog': {
        const filter = rpcSchemas[method].parse(raw)
        const catalogs = [...commandServices.map(({ service }) => service.list()), systemCommands.list()]
        const descriptors = catalogs
          .flatMap(({ items }) => items)
          .filter(
            ({ metadata }) =>
              !filter.category ||
              metadata.category === filter.category ||
              metadata.category.startsWith(`${filter.category}.`),
          )
          .filter(({ metadata }) => !filter.after || metadata.id > filter.after)
          .sort((a, b) => a.metadata.id.localeCompare(b.metadata.id))
        const items = descriptors.slice(0, filter.limit)
        return {
          revision: catalogs.reduce((total, catalog) => total + catalog.revision, 0),
          items,
          ...(descriptors.length > filter.limit ? { nextCursor: items.at(-1)!.metadata.id } : {}),
        }
      }
      case 'command.describe': {
        const input = rpcSchemas[method].parse(raw)
        const describe = commandDescribers.get(input.commandId)
        if (!describe) throw new HbarError('COMMAND_NOT_FOUND', 'Command is not registered on this Host')
        return describe()
      }
      case 'command.getReceipt': {
        const input = rpcSchemas[method].parse(raw)
        if (!socket.data.deviceId) throw new HbarError('UNAUTHORIZED', 'Authenticated device required')
        if (input.commandId === 'run.submit' || input.commandId === 'run.retry')
          return runCommands.getReceipt(input.commandId, input.sessionId, socket.data.deviceId, input.idempotencyKey)
        if (input.commandId === 'queuedRun.editText')
          return runCommands.getQueuedEditTextReceipt(input.sessionId, socket.data.deviceId, input.idempotencyKey)
        if (input.commandId === 'queuedRun.remove')
          return runCommands.getQueuedRemoveReceipt(input.sessionId, socket.data.deviceId, input.idempotencyKey)
        if (input.commandId === 'queuedRun.guide')
          return runCommands.getQueuedRunGuideReceipt(input.sessionId, socket.data.deviceId, input.idempotencyKey)
        return budgetCommands.getReceipt(input.sessionId, socket.data.deviceId, input.idempotencyKey)
      }
      case 'operation.watch': {
        const input = rpcSchemas[method].parse(raw)
        const snapshot = await runCommands.execute('operation.get', { operationId: input.operationId })
        const session = await kernel.storage.call('session', snapshot.sessionId)
        if (!socket.data.operationFollows.has(input.operationId) && socket.data.operationFollows.size >= 128)
          throw new HbarError('BUSY', 'Too many watched operations')
        socket.data.operationFollows.add(input.operationId)
        const events = await kernel.storage.call('events', snapshot.sessionId, input.cursor, 201)
        const reset = events.length > 200 || input.cursor > session.seq
        return {
          snapshot,
          events: reset
            ? []
            : events.filter(
                (event) => event.runId === input.operationId || guidedOperationId(event) === input.operationId,
              ),
          cursor: session.seq,
          reset,
        }
      }
      case 'operation.unwatch': {
        const input = rpcSchemas[method].parse(raw)
        socket.data.operationFollows.delete(input.operationId)
        return null
      }
      case 'metrics.watch': {
        const input = rpcSchemas[method].parse(raw)
        socket.data.metricsFollowing = true
        return performance.samplesAfter(input.cursor)
      }
      case 'metrics.unwatch': {
        rpcSchemas[method].parse(raw)
        socket.data.metricsFollowing = false
        return null
      }
      case 'surface.register': {
        const input = rpcSchemas[method].parse(raw)
        if (!socket.data.deviceId) throw new HbarError('UNAUTHORIZED', 'Authenticated device required')
        const commands = new Set(input.commands)
        if ([...commands].some((command) => !allowedSurfaceCommands.has(command)))
          throw new HbarError('INVALID_INPUT', 'Client published an unknown surface command')
        const previous = surfaceClients.get(input.clientId)
        if (!previous || previous.socket !== socket || previous.generation !== input.generation)
          for (const pending of [...pendingSurfaceByRelay.values()])
            if (pending.targetId === input.clientId)
              finishSurface(pending, {
                ok: false,
                code: 'CAPABILITY_UNAVAILABLE',
                message: 'Target client generation was replaced',
              })
        if (socket.data.surfaceClientId && socket.data.surfaceClientId !== input.clientId)
          throw new HbarError('COMMAND_CONFLICT', 'Connection already registered another surface client')
        socket.data.surfaceClientId = input.clientId
        socket.data.surfaceGeneration = input.generation
        surfaceClients.set(input.clientId, { socket, generation: input.generation, commands })
        return { clientId: input.clientId, generation: input.generation, commands: [...commands].sort() }
      }
      case 'surface.unregister': {
        const input = rpcSchemas[method].parse(raw)
        const target = surfaceClients.get(input.clientId)
        if (target?.socket === socket && target.generation === input.generation) {
          surfaceClients.delete(input.clientId)
          socket.data.surfaceClientId = undefined
          socket.data.surfaceGeneration = undefined
          rejectSurfaceTarget(input.clientId, input.generation, 'Target client unregistered')
        }
        return null
      }
      case 'surface.list':
        return {
          items: [...surfaceClients.entries()]
            .map(([clientId, target]) => ({
              clientId,
              generation: target.generation,
              commands: [...target.commands].sort(),
            }))
            .sort((a, b) => a.clientId.localeCompare(b.clientId)),
        }
      case 'surface.invoke': {
        const input = rpcSchemas[method].parse(raw)
        if (!socket.data.deviceId) throw new HbarError('UNAUTHORIZED', 'Authenticated device required')
        if (!allowedSurfaceCommands.has(input.commandId))
          throw new HbarError('COMMAND_NOT_FOUND', 'Surface command is not registered')
        const key = `${socket.data.deviceId}:${input.invocationId}`
        const signature = JSON.stringify([input.clientId, input.commandId, input.input])
        const completed = completedSurfaces.get(key)
        if (completed && completed.expiresAt <= Date.now()) completedSurfaces.delete(key)
        else if (completed) {
          if (completed.signature !== signature)
            throw new HbarError('IDEMPOTENCY_CONFLICT', 'Invocation ID was already used with another target or input')
          if (!completed.outcome.ok) throw new HbarError(completed.outcome.code, completed.outcome.message)
          return completed.outcome.result
        }
        const existing = pendingSurfaceByKey.get(key)
        if (existing) {
          if (existing.signature !== signature)
            throw new HbarError('IDEMPOTENCY_CONFLICT', 'Invocation ID is active with another target or input')
          const outcome = await existing.promise
          if (!outcome.ok) throw new HbarError(outcome.code, outcome.message)
          return outcome.result
        }
        const target = surfaceClients.get(input.clientId)
        if (!target || target.socket.readyState !== 1)
          throw new HbarError('CAPABILITY_UNAVAILABLE', 'Target GUI client is not connected')
        if (!target.commands.has(input.commandId))
          throw new HbarError('CAPABILITY_UNAVAILABLE', 'Target GUI client did not publish this capability')
        if ([...pendingSurfaceByRelay.values()].filter((pending) => pending.targetId === input.clientId).length >= 32)
          throw new HbarError('BUSY', 'Target GUI client has too many pending commands')
        const relayId = crypto.randomUUID()
        let resolveOutcome: (outcome: SurfaceOutcome) => void = () => undefined
        const promise = new Promise<SurfaceOutcome>((resolve) => {
          resolveOutcome = resolve
        })
        const pending: PendingSurfaceInvocation = {
          key,
          signature,
          relayId,
          targetId: input.clientId,
          generation: target.generation,
          promise,
          resolve: resolveOutcome,
        }
        pending.timer = setTimeout(
          () => finishSurface(pending, { ok: false, code: 'TIMED_OUT', message: 'Target GUI client timed out' }),
          input.timeoutMs,
        )
        pendingSurfaceByRelay.set(relayId, pending)
        pendingSurfaceByKey.set(key, pending)
        send(target.socket, {
          jsonrpc: '2.0',
          method: 'surface.invoke',
          params: {
            relayId,
            invocationId: input.invocationId,
            commandId: input.commandId,
            input: input.input,
            generation: target.generation,
          },
        })
        const outcome = await promise
        if (!outcome.ok) throw new HbarError(outcome.code, outcome.message)
        return outcome.result
      }
      case 'surface.resolve': {
        const input = rpcSchemas[method].parse(raw)
        const target = surfaceClients.get(input.clientId)
        const pending = pendingSurfaceByRelay.get(input.relayId)
        if (
          !target ||
          target.socket !== socket ||
          target.generation !== input.generation ||
          !pending ||
          pending.targetId !== input.clientId ||
          pending.generation !== input.generation
        )
          throw new HbarError('FORBIDDEN', 'Surface result does not belong to this client generation')
        finishSurface(
          pending,
          input.ok
            ? { ok: true, result: input.result }
            : { ok: false, code: input.error.code, message: input.error.message },
        )
        return null
      }
      case 'schema.content.query': {
        const input = rpcSchemas[method].parse(raw)
        if (!socket.data.deviceId) throw new HbarError('UNAUTHORIZED', 'Authenticated device required')
        if (socket.data.schemaQueries.has(input.queryId))
          throw new HbarError('COMMAND_CONFLICT', 'Schema content query ID is already active')
        if (socket.data.schemaQueries.size >= 16) throw new HbarError('BUSY', 'Too many active schema content queries')
        const controller = new AbortController()
        socket.data.schemaQueries.set(input.queryId, controller)
        try {
          return await kernel.schemaCallbacks.query(input.callbackId, input.request, { signal: controller.signal })
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string')
            throw new HbarError(error.code, error instanceof Error ? error.message : String(error))
          throw error
        } finally {
          if (socket.data.schemaQueries.get(input.queryId) === controller)
            socket.data.schemaQueries.delete(input.queryId)
        }
      }
      case 'schema.content.cancel': {
        const input = rpcSchemas[method].parse(raw)
        const controller = socket.data.schemaQueries.get(input.queryId)
        controller?.abort(new HbarError('CANCELLED', 'Schema content query was cancelled'))
        return { cancelled: Boolean(controller) }
      }
      case 'system.hello': {
        const params = rpcSchemas[method].parse(raw)
        if (socket.data.initialized) throw new HbarError('ALREADY_INITIALIZED', 'Connection already initialized')
        const token = params.token ?? socket.data.token
        const device = await auth.authenticate(token)
        socket.data.scope = await kernel.plugins.openScope('client', crypto.randomUUID())
        socket.data.token = token
        socket.data.deviceId = device.id
        socket.data.initialized = true
        const terminalCallbacks = {
          onOutput: (terminalId: string, data: string) =>
            send(socket, { jsonrpc: '2.0', method: 'terminal.output', params: { terminalId, data } }),
          onExit: (terminalId: string, code: number | null, signal: string | null) =>
            send(socket, { jsonrpc: '2.0', method: 'terminal.exit', params: { terminalId, code, signal } }),
        }
        socket.data.terminalCallbacks = terminalCallbacks
        for (const terminal of systemTerminals.attach(device.id, terminalCallbacks)) socket.data.terminals.add(terminal.id)
        clearTimeout(socket.data.timer)
        return hostInfo()
      }
      case 'workspace.list':
        return kernel.directoryQueries.execute('workspace.list', rpcSchemas['workspace.list'].parse(raw))
      case 'workspace.get':
        return kernel.directoryQueries.execute('workspace.get', rpcSchemas['workspace.get'].parse(raw))
      case 'session.list':
        return kernel.directoryQueries.execute('session.list', rpcSchemas['session.list'].parse(raw))
      case 'session.get':
        return kernel.directoryQueries.execute('session.get', rpcSchemas['session.get'].parse(raw))
      case 'system.bootstrap':
        return kernel.bootstrap(hostInfo())
      case 'system.diagnose':
        return systemCommands.execute('system.diagnose', {})
      case 'system.skills.list':
        return kernel.skills()
      case 'system.paths.get':
        return systemCommands.execute('system.paths.get', {})
      case 'system.paths.validate': {
        const p = rpcSchemas[method].parse(raw)
        return systemCommands.execute('system.paths.validate', p, { actorId: socket.data.deviceId! })
      }
      case 'system.paths.set': {
        const p = rpcSchemas[method].parse(raw)
        return systemCommands.execute('system.paths.set', p, { actorId: socket.data.deviceId! })
      }
      case 'system.restart':
        return systemCommands.execute('system.restart', {})
      case 'permission.get':
        return { mode: kernel.permissionMode() }
      case 'permission.set': {
        const p = rpcSchemas[method].parse(raw)
        return configurationCommands.execute('permission.set', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'settings.catalog':
        return kernel.settingsCatalog()
      case 'settings.snapshot': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.settingsSnapshot(p.scope, p.targetId)
      }
      case 'settings.set': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.setSetting(p.scope, p.targetId, p.id, p.value, p.expectedRevision)
      }
      case 'settings.reset': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.resetSetting(p.scope, p.targetId, p.id, p.expectedRevision)
      }
      case 'settings.search': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.searchSettings(p.query)
      }
      case 'automation.get': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.automationGet(p.sessionId)
      }
      case 'automation.set': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.automationSet(p.sessionId, p.unattended, p.goalEnabled)
      }
      case 'goal.get': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<GoalService>('goal').get(p.sessionId)
      }
      case 'goal.create': {
        const p = rpcSchemas[method].parse(raw)
        return goalPlanCommands.execute('goal.create', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'goal.update': {
        const p = rpcSchemas[method].parse(raw)
        return goalPlanCommands.execute('goal.update', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'goal.set': {
        const p = rpcSchemas[method].parse(raw)
        return goalPlanCommands.execute('goal.set', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'goal.clear': {
        const p = rpcSchemas[method].parse(raw)
        return goalPlanCommands.execute('goal.clear', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'plan.get': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<PlanService>('plan').get(p.sessionId)
      }
      case 'plan.update': {
        const p = rpcSchemas[method].parse(raw)
        return goalPlanCommands.execute('plan.update', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'plan.clear': {
        const p = rpcSchemas[method].parse(raw)
        return goalPlanCommands.execute('plan.clear', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'mode.get': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<ModeService>('mode').get(p.sessionId)
      }
      case 'mode.set': {
        const p = rpcSchemas[method].parse(raw)
        return configurationCommands.execute('mode.set', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'budget.get': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<BudgetService>('budget').get(p.sessionId)
      }
      case 'budget.set': {
        const p = rpcSchemas[method].parse(raw)
        const receipt = await budgetCommands.execute(
          'session.setBudget',
          { sessionId: p.sessionId, tokens: p.limit },
          legacyCommandOptions(method, rpcId, socket, true),
        )
        return receipt.budget
      }
      case 'budget.clear': {
        const p = rpcSchemas[method].parse(raw)
        return budgetCommands.execute('session.clearBudget', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'git.status': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<GitService>('git').status(p.cwd)
      }
      case 'git.info': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<GitService>('git').info(p.cwd)
      }
      case 'git.diff': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<GitService>('git').diff(p.cwd, p)
      }
      case 'git.log': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<GitService>('git').log(p.cwd, p.limit)
      }
      case 'git.commit': {
        const p = rpcSchemas[method].parse(raw)
        return gitCommands.execute('git.commit', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'git.stage': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<GitService>('git').stage(p.cwd, p.paths)
      }
      case 'git.unstage': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<GitService>('git').unstage(p.cwd, p.paths)
      }
      case 'git.branch': {
        const p = rpcSchemas[method].parse(raw)
        return gitCommands.execute('git.branch', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'git.worktree': {
        const p = rpcSchemas[method].parse(raw)
        return gitCommands.execute('git.worktree', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'git.diff_to_remote': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<GitService>('git').diffToRemote(p.cwd, undefined, p.paths)
      }
      case 'workspace.create': {
        const p = rpcSchemas[method].parse(raw)
        return workspaceSessionCommands.execute('workspace.create', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'session.create': {
        const p = rpcSchemas[method].parse(raw)
        return workspaceSessionCommands.execute('session.create', p, legacyCommandOptions(method, rpcId, socket, true))
      }
      case 'session.move': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.moveSession(p.sessionId, p.workspaceId)
      }
      case 'session.summaries': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.sessionSummaries(p.sessionIds)
      }
      case 'session.snapshot': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.snapshot(p.sessionId, p.before, p.limit)
      }
      case 'session.follow': {
        const p = rpcSchemas[method].parse(raw)
        await kernel.storage.call('session', p.sessionId)
        socket.data.follows.add(p.sessionId)
        const events = await kernel.storage.call('events', p.sessionId, p.cursor, 2001)
        const session = await kernel.storage.call('session', p.sessionId)
        const reset = events.length > 2000 || p.cursor > session.seq
        return {
          events: reset ? [] : events,
          cursor: reset ? session.seq : (events.at(-1)?.seq ?? p.cursor),
          reset,
          streams: [...kernel.streams.values()].filter((s) => s.sessionId === p.sessionId),
        }
      }
      case 'session.unfollow': {
        const p = rpcSchemas[method].parse(raw)
        socket.data.follows.delete(p.sessionId)
        return null
      }
      case 'session.rename': {
        const p = rpcSchemas[method].parse(raw)
        return workspaceSessionCommands.execute('session.rename', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'session.archive': {
        const p = rpcSchemas[method].parse(raw)
        return workspaceSessionCommands.execute('session.archive', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'session.fork': {
        const p = rpcSchemas[method].parse(raw)
        return workspaceSessionCommands.execute('session.fork', p, legacyCommandOptions(method, rpcId, socket, true))
      }
      case 'session.export': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.storage.call('events', p.sessionId, 0, 100_000)
      }
      case 'run.start': {
        const p = rpcSchemas[method].parse(raw)
        const accepted = await runCommands.execute(
          'run.submit',
          { sessionId: p.sessionId, input: p.input, modelId: p.modelId },
          {
            ...legacyCommandOptions(method, rpcId, socket),
            idempotencyKey: p.requestId,
          },
        )
        return kernel.storage.call('run', accepted.operationId)
      }
      case 'run.cancel': {
        const p = rpcSchemas[method].parse(raw)
        await runCommands.execute(
          'operation.cancel',
          { operationId: p.runId },
          legacyCommandOptions(method, rpcId, socket),
        )
        return null
      }
      case 'run.reorder': {
        const p = rpcSchemas[method].parse(raw)
        await kernel.reorderQueued(p.sessionId, p.runIds)
        return null
      }
      case 'terminal.open': {
        const p = rpcSchemas[method].parse(raw)
        if (socket.data.terminals.size >= 8) throw new HbarError('OVERLOADED', 'A connection may own at most 8 terminals')
        const workspace = await kernel.storage.call('workspace', p.workspaceId)
        const callbacks = socket.data.terminalCallbacks
        if (!callbacks) throw new HbarError('UNAUTHORIZED', 'Initialize the connection first')
        const info = systemTerminals.open(socket.data.deviceId!, workspace.id, workspace.path, p.cols, p.rows, callbacks)
        socket.data.terminals.add(info.id)
        return info
      }
      case 'terminal.input': {
        const p = rpcSchemas[method].parse(raw)
        systemTerminals.write(socket.data.deviceId!, p.terminalId, p.data)
        return null
      }
      case 'terminal.resize': {
        const p = rpcSchemas[method].parse(raw)
        systemTerminals.resize(socket.data.deviceId!, p.terminalId, p.cols, p.rows)
        return null
      }
      case 'terminal.close': {
        const p = rpcSchemas[method].parse(raw)
        socket.data.terminals.delete(p.terminalId)
        systemTerminals.close(socket.data.deviceId!, p.terminalId)
        return null
      }
      case 'terminal.list':
        return systemTerminals.list(socket.data.deviceId!)
      case 'approval.resolve': {
        const p = rpcSchemas[method].parse(raw)
        const approval = await kernel.storage.call('approval', p.approvalId)
        await interactionCommands.execute(
          'approval.resolve',
          { sessionId: approval.sessionId, approvalId: p.approvalId, decision: p.decision },
          legacyCommandOptions(method, rpcId, socket),
        )
        return null
      }
      case 'user_input.resolve': {
        const p = rpcSchemas[method].parse(raw)
        const request = kernel.pendingUserInput(p.requestId)
        if (!request) return { accepted: false }
        const result = await interactionCommands.execute(
          'questionnaire.answer',
          { sessionId: request.sessionId, requestId: p.requestId, answers: p.answers },
          legacyCommandOptions(method, rpcId, socket),
        )
        return { accepted: result.accepted }
      }
      case 'context.compact': {
        const p = rpcSchemas[method].parse(raw)
        return runCommands.execute('context.compact', p, { actorId: socket.data.deviceId! })
      }
      case 'provider.save': {
        const p = rpcSchemas[method].parse(raw)
        return configurationCommands.execute('provider.save', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'provider.delete': {
        const p = rpcSchemas[method].parse(raw)
        await configurationCommands.execute('provider.delete', p, legacyCommandOptions(method, rpcId, socket))
        return null
      }
      case 'plugin.set': {
        const p = rpcSchemas[method].parse(raw)
        return extensionCommands.execute('plugin.set', p, { actorId: socket.data.deviceId! })
      }
      case 'plugin.install': {
        const p = rpcSchemas[method].parse(raw)
        return extensionCommands.execute('plugin.install', p, { actorId: socket.data.deviceId! })
      }
      case 'plugin.scan':
        return extensionCommands.execute('plugin.scan', {})
      case 'plugin.remove': {
        const p = rpcSchemas[method].parse(raw)
        return extensionCommands.execute('plugin.remove', p, { actorId: socket.data.deviceId! })
      }
      case 'plugin.enable': {
        const p = rpcSchemas[method].parse(raw)
        return extensionCommands.execute('plugin.enable', p, { actorId: socket.data.deviceId! })
      }
      case 'plugin.disable': {
        const p = rpcSchemas[method].parse(raw)
        return extensionCommands.execute('plugin.disable', p, { actorId: socket.data.deviceId! })
      }
      case 'plugin.resolve': {
        const p = rpcSchemas[method].parse(raw)
        return extensionCommands.execute('plugin.resolve', p)
      }
      case 'plugin.graph':
        return extensionCommands.execute('plugin.graph', {})
      case 'plugin.lock':
        return extensionCommands.execute('plugin.lock', {})
      case 'plugin.doctor':
        return extensionCommands.execute('plugin.doctor', {})
      case 'browser.status': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<BrowserUseService>('browser').status(p.sessionId)
      }
      case 'browser.navigate': {
        const p = rpcSchemas[method].parse(raw)
        return browserCommands.execute('browser.navigate', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'browser.go': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<BrowserUseService>('browser').go(p.sessionId, p.action, p.contextId, p.pageId)
      }
      case 'browser.snapshot': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<BrowserUseService>('browser').snapshot(p.sessionId, p.contextId, p.pageId)
      }
      case 'browser.click': {
        const p = rpcSchemas[method].parse(raw)
        return browserCommands.execute('browser.click', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'browser.type': {
        const p = rpcSchemas[method].parse(raw)
        return browserCommands.execute('browser.type', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'browser.press': {
        const p = rpcSchemas[method].parse(raw)
        return browserCommands.execute('browser.press', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'browser.screenshot': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins
          .get<BrowserUseService>('browser')
          .screenshot(p.sessionId, p.fullPage, p.contextId, p.pageId)
      }
      case 'browser.evaluate': {
        const p = rpcSchemas[method].parse(raw)
        return browserCommands.execute('browser.evaluate', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'browser.close': {
        const p = rpcSchemas[method].parse(raw)
        return browserCommands.execute('browser.close', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'browser.history': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<BrowserUseService>('browser').history(p.sessionId, p.contextId)
      }
      case 'computer.status': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<ComputerUseService>('computer').status(p.sessionId)
      }
      case 'computer.screenshot': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<ComputerUseService>('computer').screenshot(p.sessionId, p.appId)
      }
      case 'computer.click': {
        const p = rpcSchemas[method].parse(raw)
        return computerCommands.execute('computer.click', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'computer.double_click': {
        const p = rpcSchemas[method].parse(raw)
        return computerCommands.execute('computer.doubleClick', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'computer.type': {
        const p = rpcSchemas[method].parse(raw)
        return computerCommands.execute('computer.type', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'computer.key': {
        const p = rpcSchemas[method].parse(raw)
        return computerCommands.execute('computer.key', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'computer.scroll': {
        const p = rpcSchemas[method].parse(raw)
        return computerCommands.execute('computer.scroll', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'computer.move': {
        const p = rpcSchemas[method].parse(raw)
        return computerCommands.execute('computer.move', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'computer.wait': {
        const p = rpcSchemas[method].parse(raw)
        return computerCommands.execute('computer.wait', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'computer.launch': {
        const p = rpcSchemas[method].parse(raw)
        return computerCommands.execute('computer.launch', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'device.list':
        return systemCommands.execute('device.list', {})
      case 'device.revoke': {
        const p = rpcSchemas[method].parse(raw)
        await systemCommands.execute('device.revoke', p, { actorId: socket.data.deviceId! })
        return null
      }
      case 'pairing.create':
        return systemCommands.execute('pairing.create', {}, { actorId: socket.data.deviceId! })
      case 'file.read': {
        const p = rpcSchemas[method].parse(raw)
        const workspace = await kernel.storage.call('workspace', p.workspaceId)
        const root = await kernel.workspaceSandboxes.prepare(workspace.id, workspace.path, AbortSignal.timeout(30_000))
        const text = await kernel.plugins.get<ExecutionProvider>('execution').read(root, p.path)
        return {
          text,
          path: p.path,
          revision: createHash('sha256').update(text, 'utf8').digest('hex'),
        }
      }
      case 'file.write': {
        const p = rpcSchemas[method].parse(raw)
        const workspace = await kernel.storage.call('workspace', p.workspaceId)
        const root = await kernel.workspaceSandboxes.prepare(workspace.id, workspace.path, AbortSignal.timeout(30_000))
        const details = await kernel.plugins.get<ExecutionProvider>('execution').write(root, p.path, p.text, {
          ...(p.expectedRevision ? { expectedRevision: p.expectedRevision } : {}),
        })
        return {
          text: details.after,
          path: details.path,
          revision: details.revision,
        }
      }
      case 'file.list': {
        const p = rpcSchemas[method].parse(raw)
        const workspace = await kernel.storage.call('workspace', p.workspaceId)
        const root = await kernel.workspaceSandboxes.prepare(workspace.id, workspace.path, AbortSignal.timeout(30_000))
        return kernel.plugins.get<ExecutionProvider>('execution').list(root, p.path)
      }
    }
    throw new HbarError('METHOD_NOT_FOUND', method)
  }
  server = Bun.serve<SocketData>({
    hostname,
    port: options.port ?? 4317,
    maxRequestBodySize: 12 * 1024 * 1024,
    ...(secure ? { tls: { cert: await readFile(options.cert!), key: await readFile(options.key!) } } : {}),
    async fetch(request, host) {
      const url = new URL(request.url)
      if (!validOrigin(request)) return json(request, { error: 'Origin or Host is not allowed' }, 403)
      if (request.method === 'OPTIONS')
        return response(request, null, 204, {
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Filename',
        })
      try {
        if (url.pathname === '/healthz')
          return json(request, {
            ready: true,
            version: APP_VERSION,
            protocol: PROTOCOL_VERSION,
            instanceId: kernel.instanceId,
          })
        if (url.pathname === '/auth/pair' && request.method === 'POST') {
          const p = z.object({ code: z.string().max(32), name: z.string().min(1).max(100) }).parse(await request.json())
          const result = await auth.pair(p.code, p.name, host.requestIP(request)?.address ?? 'unknown')
          return json(request, result, 200, {
            'Set-Cookie': `hbar_device=${result.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${secure ? '; Secure' : ''}`,
          })
        }
        if (url.pathname === '/auth/token' && request.method === 'POST') {
          const p = z.object({ token: z.string().max(512) }).parse(await request.json())
          const device = await auth.authenticate(p.token)
          return json(request, { device }, 200, {
            'Set-Cookie': `hbar_device=${p.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${secure ? '; Secure' : ''}`,
          })
        }
        if (url.pathname === '/rpc') {
          if (
            host.upgrade(request, {
              data: {
                token: requestToken(request),
                initialized: false,
                follows: new Set(),
                operationFollows: new Set(),
                metricsFollowing: false,
                schemaQueries: new Map(),
                pending: 0,
                terminals: new Set(),
              },
            })
          )
            return undefined
          return json(request, { error: 'WebSocket upgrade required' }, 426)
        }
        if (url.pathname.startsWith('/api/')) {
          await auth.authenticate(requestToken(request))
          const clientPlugin = /^\/api\/plugins\/([^/]+)\/client\.js$/.exec(url.pathname)
          if (clientPlugin && request.method === 'GET')
            return response(request, kernel.plugins.clientCode(decodeURIComponent(clientPlugin[1]!)), 200, {
              'Content-Type': 'text/javascript; charset=utf-8',
            })
          const pluginAsset = /^\/api\/plugins\/([^/]+)\/assets\/(.+)$/.exec(url.pathname)
          if (pluginAsset && request.method === 'GET') {
            const assetPath = await kernel.plugins.assetPath(decodeURIComponent(pluginAsset[1]!), decodeURIComponent(pluginAsset[2]!))
            const file = Bun.file(assetPath)
            return response(request, file, 200, { 'Content-Type': file.type || 'application/octet-stream', 'Content-Security-Policy': "default-src 'none'" })
          }
          if (url.pathname === '/api/artifacts' && request.method === 'POST') {
            const name = decodeURIComponent(request.headers.get('x-filename') ?? 'image')
            return json(
              request,
              await kernel.upload(
                name,
                (request.headers.get('content-type') ?? '').split(';')[0]!,
                new Uint8Array(await request.arrayBuffer()),
              ),
            )
          }
          const match = /^\/api\/artifacts\/([a-f0-9]{64})$/.exec(url.pathname)
          if (match && request.method === 'GET') {
            const artifact = await kernel.storage.call('artifact', match[1]!)
            const disposition = artifact.mime.startsWith('image/') ? 'inline' : 'attachment'
            return response(request, Bun.file(join(kernel.options.layout.artifacts, artifact.id)), 200, {
              'Content-Type': artifact.mime,
              'Content-Security-Policy': "default-src 'none'",
              'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(artifact.name)}`,
            })
          }
          return json(request, { error: 'Not found' }, 404)
        }
        if (request.method !== 'GET') return json(request, { error: 'Not found' }, 404)
        const path = resolve(root, `.${decodeURIComponent(url.pathname)}`)
        const rel = relative(root, path)
        if (rel.startsWith('..') || isAbsolute(rel)) return json(request, { error: 'Not found' }, 404)
        const file = Bun.file(path)
        const body = (await file.exists()) && url.pathname !== '/' ? file : Bun.file(join(root, 'index.html'))
        if (!(await body.exists())) return response(request, 'Build the web application with bun run build.', 503)
        return response(request, body, 200, {
          'Content-Type': body.type,
          'Content-Security-Policy':
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self' ws: wss: ipc: http://ipc.localhost; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
        })
      } catch (error) {
        const code = error instanceof HbarError ? error.code : 'INVALID_REQUEST'
        return json(
          request,
          { code, error: error instanceof Error ? error.message : String(error) },
          code === 'UNAUTHORIZED' || code === 'PAIRING_FAILED' ? 401 : code === 'RATE_LIMIT' ? 429 : 400,
        )
      }
    },
    websocket: {
      maxPayloadLength: 1024 * 1024,
      idleTimeout: 120,
      sendPings: true,
      open(socket) {
        sockets.add(socket)
        socket.data.timer = setTimeout(() => {
          if (!socket.data.initialized) socket.close(4001, 'Handshake required')
        }, 10_000)
      },
      message(socket, payload) {
        void (async () => {
          let id: string | number | null = null
          let admitted = false
          try {
            if (socket.data.pending >= 32) throw new HbarError('OVERLOADED', 'Too many pending requests')
            socket.data.pending++
            admitted = true
            const request = rpcRequestSchema.parse(
              JSON.parse(typeof payload === 'string' ? payload : payload.toString()),
            )
            id = request.id
            if (!Object.hasOwn(rpcSchemas, request.method)) throw new HbarError('METHOD_NOT_FOUND', request.method)
            if (request.method !== 'system.hello') {
              if (!socket.data.initialized) throw new HbarError('UNAUTHORIZED', 'Initialize the connection first')
              await auth.authenticate(socket.data.token)
            }
            const method = request.method as RpcMethod
            const params = rpcSchemas[method].parse(request.params)
            send(socket, { jsonrpc: '2.0', id, result: await invoke(method, params, socket, request.id) })
          } catch (error) {
            send(socket, {
              jsonrpc: '2.0',
              id,
              error: {
                code: -32000,
                data: error instanceof HbarError || error instanceof CommandError ? error.code : 'INVALID_REQUEST',
                message: error instanceof Error ? error.message : String(error),
              },
            })
          } finally {
            if (admitted) socket.data.pending--
          }
        })()
      },
      close(socket) {
        clearTimeout(socket.data.timer)
        if (socket.data.deviceId && socket.data.terminalCallbacks)
          systemTerminals.detach(socket.data.deviceId, socket.data.terminalCallbacks)
        socket.data.terminals.clear()
        sockets.delete(socket)
        for (const controller of socket.data.schemaQueries.values())
          controller.abort(new HbarError('CANCELLED', 'Schema content client disconnected'))
        socket.data.schemaQueries.clear()
        if (socket.data.surfaceClientId && socket.data.surfaceGeneration) {
          const target = surfaceClients.get(socket.data.surfaceClientId)
          if (target?.socket === socket && target.generation === socket.data.surfaceGeneration) {
            surfaceClients.delete(socket.data.surfaceClientId)
            rejectSurfaceTarget(
              socket.data.surfaceClientId,
              socket.data.surfaceGeneration,
              'Target GUI client disconnected',
            )
          }
        }
        void socket.data.scope?.dispose().catch(console.error)
      },
    },
  })
  const unsubscribe = kernel.subscribe((event: WireNotification) => {
    if (
      event.method === 'session.event' &&
      (event.params.type === 'run.settled' || event.params.type === 'approval.requested')
    ) {
      enqueueNotification(() => notificationService.publishSource(event.params.eventId))
    }
    for (const socket of sockets) {
      if (!socket.data.initialized) continue
      if (event.method === 'session.event' || event.method === 'stream.update') {
        const bySession = socket.data.follows.has(event.params.sessionId)
        const byOperation = Boolean(event.params.runId && socket.data.operationFollows.has(event.params.runId))
        const guidedId = event.method === 'session.event' ? guidedOperationId(event.params) : null
        const byGuidedOperation = guidedId !== null && socket.data.operationFollows.has(guidedId)
        if (!bySession && !byOperation && !byGuidedOperation) continue
      }
      send(socket, { jsonrpc: '2.0', ...event })
    }
  })
  const unsubscribeMetrics = performance.subscribe((sample) => {
    for (const socket of sockets)
      if (socket.data.initialized && socket.data.metricsFollowing)
        send(socket, { jsonrpc: '2.0', method: 'metrics.sample', params: sample })
  })
  await scheduleController.start()
  return {
    server,
    auth,
    pairing,
    info: hostInfo,
    async close() {
      agentCommands.dispose()
      browserCommands.dispose()
      computerCommands.dispose()
      configurationCommands.dispose()
      extensionCommands.dispose()
      gitCommands.dispose()
      workspaceSessionCommands.dispose()
      sessionLaunchTargetCommands.dispose()
      sessionLaunchBranchesCommands.dispose()
      await sessionSearchCommands.dispose()
      budgetCommands.dispose()
      fileCommands.dispose()
      goalPlanCommands.dispose()
      workflowCommands.dispose()
      interactionCommands.dispose()
      modelCommands.dispose()
      metricsCommands.dispose()
      performance.stop()
      runCommands.dispose()
      settingsCommands.dispose()
      usageCommands.dispose()
      await scheduleController.close()
      unsubscribe()
      systemTerminals.closeAll()
      while (notificationTasks.size) await Promise.allSettled([...notificationTasks])
      scheduleCommands.dispose()
      promptTemplateCommands.dispose()
      sandboxCommandService.dispose()
      notificationCommands.dispose()
      runBoardCommands.dispose()
      systemCommands.dispose()
      unsubscribeMetrics()
      for (const pending of [...pendingSurfaceByRelay.values()])
        finishSurface(pending, { ok: false, code: 'CAPABILITY_UNAVAILABLE', message: 'Host is shutting down' })
      surfaceClients.clear()
      for (const socket of sockets) socket.close()
      await server.stop(true)
    },
  }
}
