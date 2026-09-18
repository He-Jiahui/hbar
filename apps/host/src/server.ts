import { networkInterfaces } from 'node:os'
import { resolve, relative, isAbsolute, join } from 'node:path'
import { readFile, readdir } from 'node:fs/promises'
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
  createBudgetCommands,
  createFileCommands,
  createGoalPlanCommands,
  createInteractionCommands,
  createModelCommands,
  createModelSettingsValidator,
  createRunCommands,
  createSettingsCommands,
} from '@hbar/kernel'
import { budgetCommands as budgetDefinitions } from '@hbar/contracts/commands/budget'
import { agentCommands as agentDefinitions } from '@hbar/contracts/commands/agents'
import { browserCommands as browserDefinitions } from '@hbar/contracts/commands/browser'
import { computerCommands as computerDefinitions } from '@hbar/contracts/commands/computer'
import { configurationCommands as configurationDefinitions } from '@hbar/contracts/commands/configuration'
import { gitCommands as gitDefinitions } from '@hbar/contracts/commands/git'
import { workspaceSessionCommands as workspaceSessionDefinitions } from '@hbar/contracts/commands/workspaces'
import { fileCommands as fileDefinitions } from '@hbar/contracts/commands/files'
import { extensionCommands as extensionDefinitions } from '@hbar/contracts/commands/extensions'
import { goalPlanCommands as goalPlanDefinitions } from '@hbar/contracts/commands/goals'
import { interactionCommands as interactionDefinitions } from '@hbar/contracts/commands/interaction'
import { modelCommands as modelDefinitions } from '@hbar/contracts/commands/models'
import { runCommands as runDefinitions } from '@hbar/contracts/commands/run'
import { settingsCommands as settingsDefinitions } from '@hbar/contracts/commands/settings'
import { systemCommands as systemDefinitions } from '@hbar/contracts/commands/system'
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
} from '@hbar/plugin-sdk'
import { Auth, requestToken } from './auth.ts'
import { createSystemCommands } from './system-commands.ts'
import { createExtensionCommands } from './extension-commands.ts'
import type { RuntimeScope } from '@hbar/kernel'

interface SocketData {
  token?: string | undefined
  deviceId?: string | undefined
  initialized: boolean
  follows: Set<string>
  operationFollows: Set<string>
  pending: number
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
  staticRoot?: string
  cert?: string
  key?: string
}
export async function startServer(kernel: Kernel, options: ServerOptions = {}) {
  const agentCommands = createAgentCommands(kernel.plugins.get<AgentService>('agent'))
  const browserCommands = createBrowserCommands(kernel.plugins.get<BrowserUseService>('browser'))
  const computerCommands = createComputerCommands(kernel.plugins.get<ComputerUseService>('computer'))
  const configurationCommands = createConfigurationCommands(kernel, kernel.plugins.get<ModeService>('mode'))
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
    async skills() {
      const root = resolve(kernel.options.layout.skills, 'global')
      const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({ id: entry.name, path: resolve(root, entry.name), scope: 'global' as const }))
        .sort((left, right) => left.id.localeCompare(right.id))
    },
  })
  const gitCommands = createGitCommands(kernel.plugins.get<GitService>('git'))
  const workspaceSessionCommands = createWorkspaceSessionCommands(kernel)
  const budgetCommands = createBudgetCommands(kernel.plugins.get<BudgetService>('budget'))
  const fileCommands = createFileCommands(kernel.storage, kernel.plugins.get<ExecutionProvider>('execution'))
  const goalPlanCommands = createGoalPlanCommands(
    kernel.plugins.get<GoalService>('goal'),
    kernel.plugins.get<PlanService>('plan'),
  )
  const interactionCommands = createInteractionCommands(kernel)
  const settingsService = new SettingsService(kernel.storage, createModelSettingsValidator(kernel))
  const modelCommands = createModelCommands(kernel, settingsService)
  const runCommands = createRunCommands(kernel)
  const settingsCommands = createSettingsCommands(settingsService)
  const commandServices = [
    { definitions: agentDefinitions, service: agentCommands },
    { definitions: browserDefinitions, service: browserCommands },
    { definitions: computerDefinitions, service: computerCommands },
    { definitions: configurationDefinitions, service: configurationCommands },
    { definitions: extensionDefinitions, service: extensionCommands },
    { definitions: gitDefinitions, service: gitCommands },
    { definitions: directoryDefinitions, service: kernel.directoryQueries },
    { definitions: workspaceSessionDefinitions, service: workspaceSessionCommands },
    { definitions: budgetDefinitions, service: budgetCommands },
    { definitions: fileDefinitions, service: fileCommands },
    { definitions: goalPlanDefinitions, service: goalPlanCommands },
    { definitions: interactionDefinitions, service: interactionCommands },
    { definitions: modelDefinitions, service: modelCommands },
    { definitions: runDefinitions, service: runCommands },
    { definitions: settingsDefinitions, service: settingsCommands },
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
  async function invoke(method: RpcMethod, raw: unknown, socket: ServerWebSocket<SocketData>): Promise<unknown> {
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
        return input.commandId === 'run.submit' || input.commandId === 'run.retry'
          ? runCommands.getReceipt(input.commandId, input.sessionId, socket.data.deviceId, input.idempotencyKey)
          : budgetCommands.getReceipt(input.sessionId, socket.data.deviceId, input.idempotencyKey)
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
          events: reset ? [] : events.filter((event) => event.runId === input.operationId),
          cursor: session.seq,
          reset,
        }
      }
      case 'operation.unwatch': {
        const input = rpcSchemas[method].parse(raw)
        socket.data.operationFollows.delete(input.operationId)
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
        return kernel.setPermissionMode(p.mode)
      }
      case 'goal.get': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<GoalService>('goal').get(p.sessionId)
      }
      case 'goal.create': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<GoalService>('goal').create(p.sessionId, p.objective, p.tokenBudget)
      }
      case 'goal.update': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<GoalService>('goal').update(p.sessionId, p.status)
      }
      case 'goal.set': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<GoalService>('goal').set(p.sessionId, p)
      }
      case 'goal.clear': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<GoalService>('goal').clear(p.sessionId)
      }
      case 'plan.get': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<PlanService>('plan').get(p.sessionId)
      }
      case 'plan.update': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<PlanService>('plan').update(p.sessionId, p.plan, p.explanation, p.turnId)
      }
      case 'plan.clear': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<PlanService>('plan').clear(p.sessionId)
      }
      case 'mode.get': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<ModeService>('mode').get(p.sessionId)
      }
      case 'mode.set': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<ModeService>('mode').set(p.sessionId, p.mode)
      }
      case 'budget.get': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<BudgetService>('budget').get(p.sessionId)
      }
      case 'budget.set': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<BudgetService>('budget').set(p.sessionId, p.limit)
      }
      case 'budget.clear': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<BudgetService>('budget').clear(p.sessionId)
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
        return kernel.plugins.get<GitService>('git').commit(p.cwd, p)
      }
      case 'git.branch': {
        const p = rpcSchemas[method].parse(raw)
        const operation = p.operation === 'list' ? {} : { operation: p.operation, name: p.name!, force: p.force }
        return kernel.plugins.get<GitService>('git').branch(p.cwd, operation)
      }
      case 'git.worktree': {
        const p = rpcSchemas[method].parse(raw)
        const operation =
          p.operation === 'list'
            ? {}
            : p.operation === 'add'
              ? { operation: 'add' as const, path: p.path!, branch: p.branch, createBranch: p.createBranch }
              : { operation: 'remove' as const, path: p.path!, force: p.force }
        return kernel.plugins.get<GitService>('git').worktree(p.cwd, operation)
      }
      case 'git.diff_to_remote': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<GitService>('git').diffToRemote(p.cwd)
      }
      case 'workspace.create': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.createWorkspace(p.path)
      }
      case 'session.create': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.createSession(p.workspaceId, p.title)
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
        return kernel.updateSession(p.sessionId, { title: p.title })
      }
      case 'session.archive': {
        const p = rpcSchemas[method].parse(raw)
        if (kernel.active.has(p.sessionId)) throw new HbarError('BUSY', 'Stop the active run before archiving')
        return kernel.updateSession(p.sessionId, { archived: p.archived })
      }
      case 'session.fork': {
        const p = rpcSchemas[method].parse(raw)
        const session = await kernel.storage.call('fork', p.sessionId, p.atSeq)
        kernel.changed('sessions')
        return session
      }
      case 'session.export': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.storage.call('events', p.sessionId, 0, 100_000)
      }
      case 'run.start': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.submit(p.sessionId, p.requestId, p.input, p.modelId)
      }
      case 'run.cancel': {
        const p = rpcSchemas[method].parse(raw)
        await kernel.cancel(p.runId)
        return null
      }
      case 'approval.resolve': {
        const p = rpcSchemas[method].parse(raw)
        await kernel.resolveApproval(p.approvalId, p.decision)
        return null
      }
      case 'user_input.resolve': {
        const p = rpcSchemas[method].parse(raw)
        return { accepted: await kernel.resolveUserInput(p.requestId, p.answers) }
      }
      case 'context.compact': {
        const p = rpcSchemas[method].parse(raw)
        return runCommands.execute('context.compact', p, { actorId: socket.data.deviceId! })
      }
      case 'provider.save': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.saveProvider(p.provider, p.apiKey)
      }
      case 'provider.delete': {
        const p = rpcSchemas[method].parse(raw)
        await kernel.deleteProvider(p.id)
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
        return kernel.plugins.get<BrowserUseService>('browser').navigate(p.sessionId, p.url, p.contextId, p.pageId)
      }
      case 'browser.snapshot': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<BrowserUseService>('browser').snapshot(p.sessionId, p.contextId, p.pageId)
      }
      case 'browser.click': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<BrowserUseService>('browser').click(p.sessionId, p.selector, p.contextId, p.pageId)
      }
      case 'browser.type': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins
          .get<BrowserUseService>('browser')
          .type(p.sessionId, p.selector, p.text, p.contextId, p.pageId)
      }
      case 'browser.press': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins
          .get<BrowserUseService>('browser')
          .press(p.sessionId, p.key, p.selector, p.contextId, p.pageId)
      }
      case 'browser.screenshot': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins
          .get<BrowserUseService>('browser')
          .screenshot(p.sessionId, p.fullPage, p.contextId, p.pageId)
      }
      case 'browser.evaluate': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins
          .get<BrowserUseService>('browser')
          .evaluate(p.sessionId, p.expression, p.contextId, p.pageId)
      }
      case 'browser.close': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<BrowserUseService>('browser').close(p.sessionId, p.contextId, p.pageId)
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
        return kernel.plugins.get<ComputerUseService>('computer').click(p.sessionId, p.x, p.y, p.appId)
      }
      case 'computer.double_click': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<ComputerUseService>('computer').doubleClick(p.sessionId, p.x, p.y, p.appId)
      }
      case 'computer.type': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<ComputerUseService>('computer').type(p.sessionId, p.text, p.appId)
      }
      case 'computer.key': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<ComputerUseService>('computer').key(p.sessionId, p.key, p.appId)
      }
      case 'computer.scroll': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<ComputerUseService>('computer').scroll(p.sessionId, p.deltaX, p.deltaY, p.appId)
      }
      case 'computer.move': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<ComputerUseService>('computer').move(p.sessionId, p.x, p.y, p.appId)
      }
      case 'computer.wait': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<ComputerUseService>('computer').wait(p.sessionId, p.milliseconds, p.appId)
      }
      case 'computer.launch': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<ComputerUseService>('computer').launch(p.sessionId, p.appId)
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
        return {
          text: await kernel.plugins.get<ExecutionProvider>('execution').read(workspace.path, p.path),
          path: p.path,
        }
      }
      case 'file.list': {
        const p = rpcSchemas[method].parse(raw)
        const workspace = await kernel.storage.call('workspace', p.workspaceId)
        return kernel.plugins.get<ExecutionProvider>('execution').list(workspace.path, p.path)
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
                schemaQueries: new Map(),
                pending: 0,
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
            send(socket, { jsonrpc: '2.0', id, result: await invoke(method, params, socket) })
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
    for (const socket of sockets) {
      if (!socket.data.initialized) continue
      if (event.method === 'session.event' || event.method === 'stream.update') {
        const bySession = socket.data.follows.has(event.params.sessionId)
        const byOperation = Boolean(event.params.runId && socket.data.operationFollows.has(event.params.runId))
        if (!bySession && !byOperation) continue
      }
      send(socket, { jsonrpc: '2.0', ...event })
    }
  })
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
      budgetCommands.dispose()
      fileCommands.dispose()
      goalPlanCommands.dispose()
      interactionCommands.dispose()
      modelCommands.dispose()
      runCommands.dispose()
      settingsCommands.dispose()
      systemCommands.dispose()
      unsubscribe()
      for (const pending of [...pendingSurfaceByRelay.values()])
        finishSurface(pending, { ok: false, code: 'CAPABILITY_UNAVAILABLE', message: 'Host is shutting down' })
      surfaceClients.clear()
      for (const socket of sockets) socket.close()
      await server.stop(true)
    },
  }
}
