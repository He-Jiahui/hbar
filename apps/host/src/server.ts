import { networkInterfaces } from 'node:os'
import { createHash } from 'node:crypto'
import { resolve, relative, isAbsolute, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import {
  APP_VERSION,
  createLocalExecutionPolicy,
  HbarError,
  PROTOCOL_VERSION,
  rpcRequestSchema,
  rpcSchemas,
} from '@hbar/contracts'
import type {
  Device,
  DiagnosticScopePort,
  DiagnosticSink,
  HostInfo,
  RpcMethod,
  WireNotification,
} from '@hbar/contracts'
import { deviceAccessOf } from '@hbar/contracts/device'
import type { ServerWebSocket } from 'bun'

import { queuedRunGuidedOperationId as guidedOperationId, admitOperationRecovery } from '@hbar/contracts/commands/run'

import {
  chatDatabaseUploadOwnerSchema,
  chatDatabaseCommands as chatDatabaseDefinitions,
} from '@hbar/contracts/commands/chat-database'
import { systemCommands as systemDefinitions } from '@hbar/contracts/commands/system'

import { metricsCommands as metricsDefinitions } from '@hbar/contracts/commands/metrics'
import { surfaceCommands as surfaceDefinitions } from '@hbar/contracts/commands'
import { directoryCommands as directoryDefinitions } from '@hbar/contracts/commands'
import { CommandError } from '@hbar/commands/protocol'
import { createCommandRouter, prepareCommandInvocation } from '@hbar/commands'

import { Auth, requestToken } from './auth.ts'
import { DeviceAuthorization } from './device-authorization'
import { enableDesktopBackground, projectDesktopStartup } from './desktop-startup'
import { desktopBackgroundRequestSchema, desktopPairingRequestSchema } from '@hbar/contracts/desktop'
import { projectDesktopTrayActions, projectDesktopPairing } from './desktop-tray'
import { createNodeCommands, createRemoteWorkspaceCreator, createRemoteWorkspaceCommands } from './node-commands'
import { nodeCommands as nodeDefinitions } from '@hbar/contracts/commands/nodes'
import { workspaceCreateInputSchema } from '@hbar/contracts/commands/workspaces'
import { NodeSocketSurface, nodeRequestAllowed } from './node-sockets'
import { resourceReadInputSchema } from '@hbar/contracts/commands/resources'
import { createSystemCommands } from './system-commands.ts'
import { LocalCommandJobs } from './local-command-jobs'
import { createHostCommandResultPayloads } from './host-command-result-payloads'
import { CommandReceiptReader } from './command-receipt-reader'
import { createCommandResultCommands } from './command-result-commands'
import { commandResultCommands as commandResultDefinitions } from '@hbar/contracts/commands/command-results'
import { SessionCommandExecution } from './session-command-execution'
import { ClientCommandRelay } from './client-command-relay'
import { ClientCommandJobs } from './client-command-jobs'

import type { KernelControllerPort, KernelClientScopePort } from '@hbar/kernel/controller'
import { SystemTerminalManager } from './system-terminal'
import { NodeTerminalRouter, sessionTerminalSandboxProvider } from './node-terminal-router'
import { sendSocketFrame, sendSocketTextFrame } from './socket-sender'
import { isStableRpc, isRecoveryControl } from './stable-rpc'

import { PerformanceCollector } from '@hbar/metrics'
import { createHostPerformanceProvider } from './performance-provider.ts'
import { readRuntimeActivity } from './runtime-activity-metrics'
import { createMetricsCommands } from './metrics-commands.ts'
import type { StorageFatalEvent } from '@hbar/storage'

declare const HBAR_MANAGED_CONTROLLER: boolean
import { createHostRequestDiagnostics, safeDiagnosticId, type DiagnosticContextPort } from './request-diagnostics.ts'

interface SocketData {
  connectionId: string
  nodeSource?: string
  token?: string | undefined
  deviceId?: string | undefined
  device?: Device | undefined
  initialized: boolean
  follows: Set<string>
  operationFollows: Set<string>
  operationChains: Map<string, Set<string>>
  metricsFollowing: boolean
  runtimeDispose?: (() => void) | undefined
  pending: number
  terminals: Set<string>
  terminalCallbacks?: {
    onOutput(terminalId: string, data: string, cursor?: { seq: number; reset?: boolean }): number | void
    onExit(terminalId: string, code: number | null, signal: string | null): void
  }
  timer?: ReturnType<typeof setTimeout> | undefined
  scope?: KernelClientScopePort | undefined
  scopeOpening?: Promise<KernelClientScopePort> | undefined
  scopeDisposal?: Promise<void> | undefined
  surfaceClientId?: string | undefined
  surfaceGeneration?: number | undefined
  schemaQueries: Map<string, AbortController>
}
export interface ServerOptions {
  readonly nodeLink?: import('./runtime-node-link-contract').RuntimeNodeLinkPort
  readonly controller?: import('./runtime-controller-contract').RuntimeControllerPort
  readonly runtime?: import('./system-commands').RuntimeSystemPort
  readonly dataRootId?: string
  hostname?: string
  port?: number
  origins?: string[]
  desktop?: boolean
  staticRoot?: string
  cert?: string
  key?: string
  metricsIntervalMs?: number
  restart?: () => boolean | Promise<boolean>
  diagnosticSink?: DiagnosticSink
  diagnosticContext?: DiagnosticContextPort
  diagnosticSampleRate?: number
  diagnosticFull?: boolean
  diagnosticScope?: DiagnosticScopePort
  /** Host-owned lifecycle seam; defaults to RuntimeScope.dispose(). */
  clientScopeDisposer?: (scope: KernelClientScopePort) => Promise<void>
  /** Host-owned scope acquisition seam; defaults to the Kernel plugin manager. */
  clientScopeOpener?: (scopeId: string) => Promise<KernelClientScopePort>
}

export async function startServer(kernel: KernelControllerPort, options: ServerOptions = {}) {
  const nodeSockets = options.nodeLink ? new NodeSocketSurface(options.nodeLink) : null
  const performance = new PerformanceCollector(
    createHostPerformanceProvider(() =>
      readRuntimeActivity({
        activeRuns: () => kernel.active.size,
        readQueuedSessionCount: async () => (await kernel.storage.call('queuedSessions')).length,
        ...(options.runtime ? { runtime: options.runtime } : {}),
      }),
    ),
    { intervalMs: options.metricsIntervalMs },
  )
  await performance.start()
  const metricsCommands = createMetricsCommands(performance)
  const application: import('./runtime-controller-services').ControllerServerApplication =
    options.controller?.application ??
    (typeof HBAR_MANAGED_CONTROLLER !== 'undefined' && HBAR_MANAGED_CONTROLLER
      ? (() => {
          throw new HbarError('RUNTIME_RECOVERING', 'The owned Controller application is required')
        })()
      : (await import('./controller-application')).createControllerApplication(kernel, {
          ...(options.runtime?.maintenance ? { maintenance: options.runtime.maintenance } : {}),
          publishFresh: (event) => broadcastFresh(event),
        }))
  const {
    browserCommands,
    computerCommands,
    configurationCommands,
    extensionCommands,
    gitCommands,
    workspaceSessionCommands,
    budgetCommands,
    goalPlanCommands,
    interactionCommands,
    runCommands,
    resourceCommands,
    notificationService,
    scheduleController,
    commandServices,
    commandDispatchers,
    commandDescribers,
  } = application
  commandServices.push({ commandIds: Object.keys(metricsDefinitions), service: metricsCommands })
  for (const id of Object.keys(metricsDefinitions)) {
    commandDispatchers.set(id, metricsCommands.dispatch)
    commandDescribers.set(id, () => metricsCommands.describe(id))
  }
  if (options.runtime?.maintenance && options.controller?.application) {
    const maintenance = options.runtime.maintenance
    commandServices.push({
      commandIds: Object.keys(chatDatabaseDefinitions),
      service: {
        dispatch: maintenance.dispatch,
        ...(maintenance.dispatchPrepared ? { dispatchPrepared: maintenance.dispatchPrepared } : {}),
        ...(maintenance.dispatchPreparedTracked
          ? { dispatchPreparedTracked: maintenance.dispatchPreparedTracked }
          : {}),
        describe: (id) => maintenance.describe(id),
        list: () => maintenance.list(),
        prepare: (value) => prepareCommandInvocation(chatDatabaseDefinitions, value),
      },
    })
    for (const id of Object.keys(chatDatabaseDefinitions)) {
      commandDispatchers.set(id, maintenance.dispatch)
      commandDescribers.set(id, () => maintenance.describe(id))
    }
  }
  const hostname = options.hostname ?? '127.0.0.1'
  const auth = new Auth(kernel.storage, { available: () => options.runtime?.authenticationAvailable?.() ?? true })
  const authorization = new DeviceAuthorization(
    kernel.storage,
    (id) => commandDescribers.get(id)?.() ?? application.resolveCommand?.(id)?.describe(id),
  )
  const pairing = auth.createPairing()
  const sockets = new Set<ServerWebSocket<SocketData>>()
  const allSockets = new Set<ServerWebSocket<SocketData>>()
  const scopeDisposals = new Set<Promise<void>>()
  const disposeClientScope = options.clientScopeDisposer ?? ((scope: KernelClientScopePort) => scope.dispose())
  const openClientScope =
    options.clientScopeOpener ?? ((scopeId: string) => kernel.plugins.openScope('client', scopeId))
  let closing = false
  const disposeSocketScope = (socket: ServerWebSocket<SocketData>): Promise<void> => {
    const existing = socket.data.scopeDisposal
    if (existing) return existing
    const scope = socket.data.scope
    const opening = socket.data.scopeOpening
    socket.data.scope = undefined
    socket.data.scopeOpening = undefined
    let disposal: Promise<void>
    if (scope) disposal = Promise.resolve().then(() => disposeClientScope(scope))
    else if (opening) disposal = opening.then((opened) => disposeClientScope(opened))
    else return Promise.resolve()
    socket.data.scopeDisposal = disposal
    scopeDisposals.add(disposal)
    void disposal.then(
      () => {
        scopeDisposals.delete(disposal)
        allSockets.delete(socket)
      },
      () => {
        scopeDisposals.delete(disposal)
        allSockets.delete(socket)
      },
    )
    return disposal
  }
  const waitForSocketScopes = async (timeoutMs: number): Promise<void> => {
    const deadline = globalThis.performance.now() + timeoutMs
    const failures: unknown[] = []
    while (scopeDisposals.size) {
      const remaining = Math.max(0, deadline - globalThis.performance.now())
      if (!remaining) throw new HbarError('HOST_SCOPE_DISPOSAL_TIMEOUT', 'Timed out releasing Host client scopes')
      const pending = [...scopeDisposals]
      let timer: ReturnType<typeof setTimeout> | undefined
      const result = await Promise.race([
        Promise.allSettled(pending),
        new Promise<'timeout'>((resolve) => {
          timer = setTimeout(() => resolve('timeout'), remaining)
        }),
      ])
      if (timer !== undefined) clearTimeout(timer)
      if (result === 'timeout')
        throw new HbarError('HOST_SCOPE_DISPOSAL_TIMEOUT', 'Timed out releasing Host client scopes')
      for (const item of result) if (item.status === 'rejected') failures.push(item.reason)
    }
    if (failures.length) throw new AggregateError(failures, 'Host client scope disposal failed')
  }
  const requestDiagnostics = createHostRequestDiagnostics({
    ...(options.diagnosticSink ? { sink: options.diagnosticSink } : {}),
    ...(options.diagnosticContext ? { contextPort: options.diagnosticContext } : {}),
    ...(options.diagnosticSampleRate === undefined ? {} : { sampleRate: options.diagnosticSampleRate }),
    ...(options.diagnosticFull === undefined ? {} : { full: options.diagnosticFull }),
    context: { instanceId: kernel.instanceId },
  })
  let storageFatal: StorageFatalEvent | undefined
  const removeStorageFatalListener = kernel.storage.onFatal?.((event) => {
    storageFatal = event
    for (const socket of sockets) socket.close(1012, 'Storage is unavailable; reconnect after Host recovery')
  })
  const localExecutionPolicy = createLocalExecutionPolicy(kernel.options.noLocalExec)
  const systemTerminals = new SystemTerminalManager(localExecutionPolicy)
  const terminalRouter = new NodeTerminalRouter({
    local: systemTerminals,
    ...(options.nodeLink ? { node: options.nodeLink } : {}),
    getWorkspace: (workspaceId) => kernel.storage.call('workspace', workspaceId),
    getSession: (sessionId) => kernel.storage.call('session', sessionId),
    loadSandbox: sessionTerminalSandboxProvider({
      getProfileId: (sessionId) => kernel.sessionSandboxProfileId(sessionId),
      getProfile: (id) => kernel.sandboxProfiles.get(id),
    }),
  })
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
  const commandClients = new ClientCommandRelay((connectionId, request) => {
    const target = [...sockets].find((socket) => socket.data.connectionId === connectionId && socket.readyState === 1)
    if (!target) throw new HbarError('COMMAND_TARGET_STALE', 'The original command client connection is unavailable')
    send(target, { jsonrpc: '2.0', method: 'command.client.request', params: request })
  })
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
  const hostInfo = (device?: Device): HostInfo => ({
    version: APP_VERSION,
    protocol: PROTOCOL_VERSION,
    instanceId: kernel.instanceId,
    ...(options.dataRootId ? { dataRootId: options.dataRootId } : {}),
    platform: process.platform,
    addresses: (hostname === '127.0.0.1' ? ['127.0.0.1'] : addresses).map(
      (ip) => `${secure ? 'https' : 'http'}://${ip}:${server.port}`,
    ),
    activeRuns: kernel.active.size,
    demo: Boolean(kernel.options.demo),
    ...(device ? { deviceAccess: deviceAccessOf(device) } : {}),
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
    const bytes = sendSocketFrame(socket, value)
    if (bytes > 0)
      requestDiagnostics.frame('out', bytes, { instanceId: kernel.instanceId, connectionId: socket.data.connectionId })
    return bytes
  }
  broadcastFresh = (event) => {
    for (const socket of sockets)
      if (socket.data.initialized && !authorization.restricted(socket.data.device))
        send(socket, { jsonrpc: '2.0', method: 'notifications.created', params: event })
  }
  const systemCommands = createSystemCommands({
    hostInfo,
    ...(options.runtime ? { runtime: options.runtime } : {}),
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
      auth.invalidateDevice(id)
      for (const peer of sockets)
        if (peer.data.deviceId === id) {
          send(peer, { jsonrpc: '2.0', method: 'auth.revoked', params: { reason: 'Device access revoked' } })
          peer.close(4001, 'Revoked')
        }
      return { revoked: true }
    },
    createPairing: (access) => auth.createPairing(access),
    ...(options.restart ? { restart: options.restart } : {}),
  })
  for (const id of Object.keys(systemDefinitions)) {
    commandDispatchers.set(id, systemCommands.dispatch)
    commandDescribers.set(id, () => systemCommands.describe(id))
  }
  const commandResultPayloads = createHostCommandResultPayloads(kernel)
  const commandResultCommands = createCommandResultCommands(
    new CommandReceiptReader(kernel.storage, commandResultPayloads),
  )
  commandServices.push({ commandIds: Object.keys(commandResultDefinitions), service: commandResultCommands })
  for (const id of Object.keys(commandResultDefinitions)) {
    commandDispatchers.set(id, commandResultCommands.dispatch)
    commandDescribers.set(id, () => commandResultCommands.describe(id))
  }
  const nodeCommands = createNodeCommands(options.nodeLink)
  commandServices.push({ commandIds: Object.keys(nodeDefinitions), service: nodeCommands })
  for (const id of Object.keys(nodeDefinitions)) {
    commandDispatchers.set(id, nodeCommands.dispatch)
    commandDescribers.set(id, () => nodeCommands.describe(id))
  }
  const createRemoteWorkspace = createRemoteWorkspaceCreator(options.nodeLink, (input) =>
    kernel.createNodeWorkspace(input),
  )
  const remoteWorkspaceCommands = createRemoteWorkspaceCommands(createRemoteWorkspace)
  const retainHostCommand = options.runtime?.retainHostCommand?.bind(options.runtime)
  const localCommandJobs = new LocalCommandJobs({
    ...(options.runtime?.commandScopes ? { scopes: options.runtime.commandScopes } : {}),
    ...(options.runtime?.instanceId ? { instanceId: options.runtime.instanceId } : {}),
    ...(retainHostCommand ? { retainSource: retainHostCommand } : {}),
  })
  const commandRouter = createCommandRouter({
    catalogs: () => [...commandServices.map(({ service }) => service.list()), systemCommands.list()],
    resolve(id) {
      let dispatch = commandDispatchers.get(id)
      let describe = commandDescribers.get(id)
      let guarded = Object.hasOwn(systemDefinitions, id)
        ? systemCommands.dispatchPrepared
        : commandServices.find((entry) => entry.commandIds.includes(id))?.service.dispatchPrepared
      let tracked = Object.hasOwn(directoryDefinitions, id)
        ? kernel.directoryQueries.dispatchPreparedTracked
        : Object.hasOwn(systemDefinitions, id)
          ? systemCommands.dispatchPreparedTracked
          : commandServices.find((entry) => entry.commandIds.includes(id))?.service.dispatchPreparedTracked
      const localDefinitions = [systemDefinitions, metricsDefinitions, nodeDefinitions, commandResultDefinitions].find(
        (definitions) => Object.hasOwn(definitions, id),
      )
      let prepare = localDefinitions
        ? (value: unknown) => prepareCommandInvocation(localDefinitions, value)
        : commandServices.find((entry) => entry.commandIds.includes(id))?.service.prepare
      if (!dispatch || !describe) {
        const dynamic = application.resolveCommand?.(id)
        dispatch ??= dynamic?.dispatch
        describe ??= dynamic ? () => dynamic.describe(id) : undefined
        prepare ??= dynamic?.prepare
        guarded ??= dynamic?.dispatchPrepared
        tracked ??= dynamic?.dispatchPreparedTracked
      }
      if (!dispatch || !describe) return undefined
      const selectedDispatch = dispatch
      return {
        describe,
        ...(prepare ? { prepare } : {}),
        async dispatch(value, actorId) {
          const invocation = rpcSchemas['command.execute'].parse(value)
          if (id === 'workspace.create') {
            const input = workspaceCreateInputSchema.safeParse(invocation.input)
            if (input.success && input.data.path === undefined)
              return remoteWorkspaceCommands.dispatch(invocation, actorId)
          }
          return selectedDispatch(invocation, actorId)
        },
        async dispatchPrepared(value, actorId, expectation, executeOptions) {
          const invocation = rpcSchemas['command.execute'].parse(value)
          if (id === 'workspace.create') {
            const input = workspaceCreateInputSchema.safeParse(invocation.input)
            if (input.success && input.data.path === undefined)
              return remoteWorkspaceCommands.dispatchPrepared(invocation, actorId, expectation, executeOptions)
          }
          if (!guarded)
            throw new CommandError('CAPABILITY_UNAVAILABLE', 'The command owner does not support guarded dispatch')
          return guarded(invocation, actorId, expectation, executeOptions)
        },
        dispatchPreparedTracked(value, actorId, expectation, executeOptions) {
          const invocation = rpcSchemas['command.execute'].parse(value)
          if (id === 'workspace.create') {
            const input = workspaceCreateInputSchema.safeParse(invocation.input)
            if (input.success && input.data.path === undefined)
              return localCommandJobs.execute(
                actorId,
                (signal) =>
                  remoteWorkspaceCommands.dispatchPreparedTracked(invocation, actorId, expectation, {
                    ...executeOptions,
                    signal,
                  }),
                { signal: executeOptions?.signal },
              )
          }
          if (!tracked)
            throw new CommandError('CAPABILITY_UNAVAILABLE', 'The command owner has no physical settlement tracking')
          const actual = tracked
          const managed = Object.hasOwn(directoryDefinitions, id)
            ? !!options.runtime
            : Object.hasOwn(chatDatabaseDefinitions, id)
              ? !!options.runtime?.maintenance || !!options.controller?.application
              : !!options.controller?.application
          if (localDefinitions || !managed)
            return localCommandJobs.execute(
              actorId,
              (signal) => actual(invocation, actorId, expectation, { ...executeOptions, signal }),
              { signal: executeOptions?.signal },
            )
          return actual(invocation, actorId, expectation, executeOptions)
        },
      }
    },
  })
  const assertCommandSource = options.runtime?.assertCommandSource?.bind(options.runtime)
  const clientCommandJobs =
    options.runtime?.commandScopes && retainHostCommand
      ? new ClientCommandJobs({
          relay: commandClients,
          scopes: options.runtime.commandScopes,
          retainSource: retainHostCommand,
        })
      : undefined
  const sessionCommandExecution =
    options.runtime?.commandScopes && assertCommandSource
      ? new SessionCommandExecution({
          storage: kernel.storage,
          routing: commandRouter,
          scopes: options.runtime.commandScopes,
          payloads: commandResultPayloads,
          assertSource: assertCommandSource,
          ...(clientCommandJobs ? { clients: clientCommandJobs } : {}),
        })
      : undefined
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
    if (method !== 'system.hello') {
      const device = socket.data.device
      if (!device) throw new HbarError('UNAUTHORIZED', 'Authenticated device required')
      await authorization.authorize(device, method, raw)
      if (
        method === 'workspace.list' ||
        (method === 'command.execute' && rpcSchemas[method].parse(raw).commandId === 'workspace.list')
      ) {
        const input = method === 'command.execute' ? rpcSchemas[method].parse(raw).input : raw
        const filtered = await authorization.workspacePage(device, input)
        if (filtered) return filtered
      }
    }
    switch (method) {
      case 'system.runtime.watch': {
        const input = rpcSchemas[method].parse(raw)
        const runtime = options.runtime
        if (!runtime?.watch || !runtime.subscribe)
          throw new HbarError('RUNTIME_RESTART_REQUIRED', 'Runtime subscriptions require the managed Host entry')
        socket.data.runtimeDispose ??= runtime.subscribe((delta) => {
          if (socket.data.initialized) send(socket, { jsonrpc: '2.0', method: 'system.runtime.delta', params: delta })
        })
        return runtime.watch(input.cursor)
      }
      case 'system.runtime.unwatch': {
        socket.data.runtimeDispose?.()
        socket.data.runtimeDispose = undefined
        return null
      }
      case 'command.execute': {
        const invocation = rpcSchemas[method].parse(raw)
        if (!socket.data.deviceId) throw new HbarError('UNAUTHORIZED', 'Authenticated device required')
        return commandRouter.execute(invocation, socket.data.deviceId)
      }
      case 'command.catalog': {
        return commandRouter.list(rpcSchemas[method].parse(raw))
      }
      case 'command.describe': {
        const input = rpcSchemas[method].parse(raw)
        return commandRouter.describe(input.commandId)
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
        const ids = socket.data.operationChains.get(input.operationId) ?? new Set([input.operationId])
        if (snapshot.executionRunId) ids.add(snapshot.executionRunId)
        socket.data.operationChains.set(input.operationId, ids)
        const events = await kernel.storage.call('events', snapshot.sessionId, input.cursor, 201)
        for (const event of events) admitOperationRecovery(event, ids)
        const reset = events.length > 200 || input.cursor > session.seq
        return {
          snapshot,
          events: reset
            ? []
            : events.filter(
                (event) =>
                  (event.runId !== null && ids.has(event.runId)) || guidedOperationId(event) === input.operationId,
              ),
          cursor: session.seq,
          reset,
        }
      }
      case 'operation.unwatch': {
        const input = rpcSchemas[method].parse(raw)
        socket.data.operationFollows.delete(input.operationId)
        socket.data.operationChains.delete(input.operationId)
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
      case 'command.client.register': {
        const actorId = socket.data.device?.id
        if (!actorId) throw new HbarError('UNAUTHORIZED', 'Authenticated command client required')
        return commandClients.register(socket.data.connectionId, actorId, rpcSchemas[method].parse(raw))
      }
      case 'command.client.unregister': {
        const actorId = socket.data.device?.id
        if (!actorId) throw new HbarError('UNAUTHORIZED', 'Authenticated command client required')
        commandClients.unregister(socket.data.connectionId, actorId, rpcSchemas[method].parse(raw))
        return null
      }
      case 'command.client.reply': {
        const actorId = socket.data.device?.id
        if (!actorId) throw new HbarError('UNAUTHORIZED', 'Authenticated command client required')
        commandClients.reply(socket.data.connectionId, actorId, rpcSchemas[method].parse(raw))
        return null
      }
      case 'command.client.list': {
        const actorId = socket.data.device?.id
        if (!actorId) throw new HbarError('UNAUTHORIZED', 'Authenticated command client required')
        return commandClients.list(actorId)
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
        if (closing) throw new HbarError('HOST_CLOSING', 'Host is closing')
        const token = params.token ?? socket.data.token
        const device = await auth.authenticate(token)
        if (closing) throw new HbarError('HOST_CLOSING', 'Host is closing')
        const opening = openClientScope(crypto.randomUUID())
        socket.data.scopeOpening = opening
        const scope = await opening
        if (socket.data.scopeOpening === opening) socket.data.scopeOpening = undefined
        if (socket.data.scopeDisposal) {
          await socket.data.scopeDisposal
          throw new HbarError('HOST_CLOSING', 'Host is closing')
        }
        if (closing) {
          await disposeClientScope(scope)
          throw new HbarError('HOST_CLOSING', 'Host is closing')
        }
        socket.data.scope = scope
        socket.data.token = token
        socket.data.deviceId = device.id
        socket.data.device = device
        socket.data.initialized = true
        const terminalCallbacks = {
          onOutput: (terminalId: string, data: string, cursor?: { seq: number; reset?: boolean }) =>
            send(socket, {
              jsonrpc: '2.0',
              method: 'terminal.output',
              params: {
                terminalId,
                data,
                ...(cursor ? { seq: cursor.seq, ...(cursor.reset ? { reset: true } : {}) } : {}),
              },
            }),
          onExit: (terminalId: string, code: number | null, signal: string | null) =>
            send(socket, { jsonrpc: '2.0', method: 'terminal.exit', params: { terminalId, code, signal } }),
        }
        socket.data.terminalCallbacks = terminalCallbacks
        for (const terminal of terminalRouter.attach(device.id, terminalCallbacks))
          socket.data.terminals.add(terminal.id)
        clearTimeout(socket.data.timer)
        return hostInfo(device)
      }
      case 'workspace.list':
        return kernel.directoryQueries.execute('workspace.list', rpcSchemas['workspace.list'].parse(raw))
      case 'workspace.get':
        return kernel.directoryQueries.execute('workspace.get', rpcSchemas['workspace.get'].parse(raw))
      case 'session.list':
        return kernel.directoryQueries.execute('session.list', rpcSchemas['session.list'].parse(raw))
      case 'session.get':
        return kernel.directoryQueries.execute('session.get', rpcSchemas['session.get'].parse(raw))
      case 'system.bootstrap': {
        const bootstrap = await kernel.bootstrap(hostInfo(socket.data.device))
        const device = socket.data.device
        if (!device || !authorization.restricted(device)) return bootstrap
        const allowed = device.workspaceIds
        return {
          ...bootstrap,
          workspaces: bootstrap.workspaces.filter((workspace) => allowed == null || allowed.includes(workspace.id)),
          sessions: bootstrap.sessions.filter((session) => allowed == null || allowed.includes(session.workspaceId)),
          plugins: [],
          panels: [],
        }
      }
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
        return kernel.plugins.get('goal').get(p.sessionId)
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
        return kernel.plugins.get('plan').get(p.sessionId)
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
        return kernel.plugins.get('mode').get(p.sessionId)
      }
      case 'mode.set': {
        const p = rpcSchemas[method].parse(raw)
        return configurationCommands.execute('mode.set', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'budget.get': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get('budget').get(p.sessionId)
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
        return kernel.plugins.get('git').status(p.cwd)
      }
      case 'git.info': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get('git').info(p.cwd)
      }
      case 'git.diff': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get('git').diff(p.cwd, p)
      }
      case 'git.log': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get('git').log(p.cwd, p.limit)
      }
      case 'git.commit': {
        const p = rpcSchemas[method].parse(raw)
        return gitCommands.execute('git.commit', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'git.stage': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get('git').stage(p.cwd, p.paths)
      }
      case 'git.unstage': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get('git').unstage(p.cwd, p.paths)
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
        return kernel.plugins.get('git').diffToRemote(p.cwd, undefined, p.paths)
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
        if (socket.data.terminals.size >= 8)
          throw new HbarError('OVERLOADED', 'A connection may own at most 8 terminals')
        const callbacks = socket.data.terminalCallbacks
        if (!callbacks || !socket.data.device) throw new HbarError('UNAUTHORIZED', 'Initialize the connection first')
        const info = await terminalRouter.open(
          socket.data.device,
          p.workspaceId,
          p.operationId,
          p.sessionId,
          p.cols,
          p.rows,
          callbacks,
        )
        socket.data.terminals.add(info.id)
        return info
      }
      case 'terminal.input': {
        const p = rpcSchemas[method].parse(raw)
        await terminalRouter.write(socket.data.deviceId!, p.terminalId, p.data)
        return null
      }
      case 'terminal.resize': {
        const p = rpcSchemas[method].parse(raw)
        await terminalRouter.resize(socket.data.deviceId!, p.terminalId, p.cols, p.rows)
        return null
      }
      case 'terminal.close': {
        const p = rpcSchemas[method].parse(raw)
        socket.data.terminals.delete(p.terminalId)
        await terminalRouter.close(socket.data.deviceId!, p.terminalId)
        return null
      }
      case 'terminal.list':
        return terminalRouter.list(socket.data.deviceId!)
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
      case 'plugin.disableTree': {
        const input = rpcSchemas[method].parse(raw)
        return kernel.changePluginTree(input.id, input.projectId)
      }
      case 'plugin.graph':
        return extensionCommands.execute('plugin.graph', {})
      case 'plugin.lock':
        return extensionCommands.execute('plugin.lock', {})
      case 'plugin.doctor':
        return extensionCommands.execute('plugin.doctor', {})
      case 'browser.status': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get('browser').status(p.sessionId)
      }
      case 'browser.navigate': {
        const p = rpcSchemas[method].parse(raw)
        return browserCommands.execute('browser.navigate', p, legacyCommandOptions(method, rpcId, socket))
      }
      case 'browser.go': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get('browser').go(p.sessionId, p.action, p.contextId, p.pageId)
      }
      case 'browser.snapshot': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get('browser').snapshot(p.sessionId, p.contextId, p.pageId)
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
        return kernel.plugins.get('browser').screenshot(p.sessionId, p.fullPage, p.contextId, p.pageId)
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
        return kernel.plugins.get('browser').history(p.sessionId, p.contextId)
      }
      case 'computer.status': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get('computer').status(p.sessionId)
      }
      case 'computer.screenshot': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get('computer').screenshot(p.sessionId, p.appId)
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
        const text = await kernel.plugins.get('execution').read(root, p.path)
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
        const details = await kernel.plugins.get('execution').write(root, p.path, p.text, {
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
        return kernel.plugins.get('execution').list(root, p.path)
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
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Filename, X-Content-Sha256, X-Artifact-Owner',
        })
      try {
        if (url.pathname === '/node') {
          const source = host.requestIP(request)?.address ?? 'unknown'
          if (!nodeSockets)
            return json(request, { code: 'NODE_LINK_UNAVAILABLE', error: 'Node link owner is unavailable' }, 503)
          if (!nodeRequestAllowed(request, source, secure))
            return json(
              request,
              { code: 'NODE_TRANSPORT_REJECTED', error: 'Use a dedicated encrypted node connection' },
              403,
            )
          if (
            host.upgrade(request, {
              data: {
                connectionId: crypto.randomUUID(),
                nodeSource: source,
                initialized: false,
                follows: new Set(),
                operationFollows: new Set(),
                operationChains: new Map(),
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
        if (url.pathname === '/node-info') return response(request, 'Not found', 404)
        if (url.pathname === '/livez') return json(request, { alive: true, instanceId: kernel.instanceId })
        if (url.pathname === '/healthz') {
          const runtime = options.runtime?.snapshot()
          const storageHealth = kernel.storageHealth()
          const fatal = storageFatal ?? storageHealth.failure
          const ready = !fatal && (runtime?.ready ?? storageHealth.ready)
          const safeFailure = fatal
            ? {
                kind: fatal.kind,
                code: fatal.code.replace(/[^A-Z0-9_.-]/g, '').slice(0, 128),
                ...(fatal.method ? { method: fatal.method.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 128) } : {}),
                occurredAt: Number.isFinite(fatal.occurredAt) ? fatal.occurredAt : 0,
              }
            : undefined
          return json(
            request,
            {
              ready,
              ...(fatal ? { status: 'storage-failed', failure: safeFailure } : {}),
              version: APP_VERSION,
              protocol: PROTOCOL_VERSION,
              instanceId: kernel.instanceId,
              ...(runtime?.admission
                ? {
                    phase: runtime.admission.phase,
                    reasonCode: runtime.admission.reasonCode,
                    nextAttemptAt: runtime.admission.startup?.nextAttemptAt ?? null,
                  }
                : {}),
              ...(options.dataRootId ? { dataRootId: options.dataRootId } : {}),
            },
            ready ? 200 : 503,
          )
        }
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
          if (!options.runtime && (storageFatal || !kernel.storageHealth().ready))
            return json(request, { error: 'Storage is unavailable', code: 'STORAGE_UNAVAILABLE' }, 503)
          if (
            host.upgrade(request, {
              data: {
                token: requestToken(request),
                connectionId: crypto.randomUUID(),
                initialized: false,
                follows: new Set(),
                operationFollows: new Set(),
                operationChains: new Map(),
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
          const device = await auth.authenticate(requestToken(request))
          if (authorization.restricted(device) && url.pathname !== '/api/resource-media')
            throw new HbarError('FORBIDDEN', 'Use scoped resource reads for this device')
          if (url.pathname === '/api/desktop/tray' && request.method === 'GET')
            return json(request, projectDesktopTrayActions(request.headers.get('accept-language') ?? 'zh-CN'), 200, {
              'Cache-Control': 'no-store',
            })
          if (url.pathname === '/api/desktop/pairing' && request.method === 'POST') {
            const input = desktopPairingRequestSchema.parse(await request.json())
            const pairing = await systemCommands.execute(
              'pairing.create',
              { role: input.role, workspaceIds: null },
              { actorId: device.id },
            )
            return json(
              request,
              projectDesktopPairing(
                pairing,
                input.role,
                hostInfo(device).addresses,
                request.headers.get('accept-language') ?? 'zh-CN',
              ),
              200,
              { 'Cache-Control': 'no-store' },
            )
          }
          if (url.pathname === '/api/desktop/background' && request.method === 'POST') {
            desktopBackgroundRequestSchema.parse(await request.json())
            return json(request, await enableDesktopBackground(application.settingsCommands, device.id), 200, {
              'Cache-Control': 'no-store',
            })
          }
          if (url.pathname === '/api/desktop/startup' && request.method === 'GET')
            return json(
              request,
              projectDesktopStartup(
                await application.settingsCommands.execute('settings.get', { scope: { kind: 'global' } }),
                request.headers.get('accept-language') ?? 'zh-CN',
              ),
              200,
              { 'Cache-Control': 'no-store' },
            )
          const clientPlugin = /^\/api\/plugins\/([^/]+)\/client\.js$/.exec(url.pathname)
          if (clientPlugin && request.method === 'GET')
            return response(request, await kernel.plugins.clientCode(decodeURIComponent(clientPlugin[1]!)), 200, {
              'Content-Type': 'text/javascript; charset=utf-8',
            })
          const pluginAsset = /^\/api\/plugins\/([^/]+)\/assets\/(.+)$/.exec(url.pathname)
          if (pluginAsset && request.method === 'GET') {
            const assetPath = await kernel.plugins.assetPath(
              decodeURIComponent(pluginAsset[1]!),
              decodeURIComponent(pluginAsset[2]!),
            )
            const file = Bun.file(assetPath)
            return response(request, file, 200, {
              'Content-Type': file.type || 'application/octet-stream',
              'Content-Security-Policy': "default-src 'none'",
            })
          }
          if (url.pathname === '/api/artifacts' && request.method === 'POST') {
            const name = decodeURIComponent(request.headers.get('x-filename') ?? 'image')
            const ownerHeader = request.headers.get('x-artifact-owner')
            if (ownerHeader && ownerHeader.length > 2048)
              throw new HbarError('INVALID_INPUT', 'Attachment owner header is oversized')
            const owner = ownerHeader
              ? chatDatabaseUploadOwnerSchema.parse(JSON.parse(decodeURIComponent(ownerHeader)))
              : undefined
            const sha256 = request.headers.get('x-content-sha256') ?? undefined
            if (sha256 && !/^[a-f0-9]{64}$/.test(sha256))
              throw new HbarError('INVALID_INPUT', 'Attachment content hash is invalid')
            return json(
              request,
              await kernel.upload(
                name,
                (request.headers.get('content-type') ?? '').split(';')[0]!,
                new Uint8Array(await request.arrayBuffer()),
                { actorId: device.id, ...(owner ? { owner } : {}), ...(sha256 ? { sha256 } : {}) },
              ),
            )
          }
          if (url.pathname === '/api/resource-media' && request.method === 'POST') {
            const body = await request.text()
            if (body.length > 24_000) throw new HbarError('INVALID_INPUT', 'Resource request is oversized')
            const input = resourceReadInputSchema.parse(JSON.parse(body))
            await authorization.assertTargets(device, input, true)
            const media = await resourceCommands.readMedia(input, request.signal)
            return response(request, new Blob([new Uint8Array(media.bytes)], { type: media.mime }), 200, {
              'Content-Type': media.mime,
              'Cache-Control': 'no-store',
              'Content-Security-Policy': "default-src 'none'; sandbox",
              'X-Content-Type-Options': 'nosniff',
            })
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
        if (socket.data.nodeSource) {
          nodeSockets?.open(socket)
          return
        }
        socket.data.connectionId = crypto.randomUUID()
        sockets.add(socket)
        allSockets.add(socket)
        socket.data.timer = setTimeout(() => {
          if (!socket.data.initialized) socket.close(4001, 'Handshake required')
        }, 10_000)
      },
      message(socket, payload) {
        if (socket.data.nodeSource) {
          nodeSockets?.message(socket, payload)
          return
        }
        void (async () => {
          let id: string | number | null = null
          let admitted = false
          let span: ReturnType<typeof requestDiagnostics.begin> | undefined
          const bytesIn =
            typeof payload === 'string' ? new TextEncoder().encode(payload).byteLength : payload.byteLength
          try {
            requestDiagnostics.frame('in', bytesIn, {
              instanceId: kernel.instanceId,
              connectionId: socket.data.connectionId,
            })
            if (socket.data.pending >= 32) throw new HbarError('OVERLOADED', 'Too many pending requests')
            socket.data.pending++
            admitted = true
            let stable = false
            if (options.controller) {
              const text = typeof payload === 'string' ? payload : payload.toString()
              try {
                const envelope = rpcRequestSchema.safeParse(JSON.parse(text))
                if (envelope.success) {
                  id = envelope.data.id
                  stable =
                    isStableRpc(envelope.data.method, envelope.data.params) ||
                    authorization.restricted(socket.data.device)
                  if (!stable) {
                    span = requestDiagnostics.begin({
                      method: envelope.data.method,
                      rpcId: envelope.data.id,
                      connectionId: socket.data.connectionId,
                      bytesIn,
                      pending: socket.data.pending,
                    })
                    span.stage('admission', socket.data.pending)
                  }
                }
              } catch {
                /* The Controller returns a correlated response for every valid envelope. */
              }
              if (!stable) {
                span?.stage('invoke', socket.data.pending)
                const frame = await options.controller.dispatch(
                  text,
                  async (request, signal) => {
                    signal.throwIfAborted()
                    if (request.method !== 'system.hello') {
                      if (!socket.data.initialized)
                        throw new HbarError('UNAUTHORIZED', 'Initialize the connection first')
                      if (isRecoveryControl(request.method, request.params))
                        await auth.authenticateStatus(socket.data.token, socket.data.deviceId)
                      else socket.data.device = await auth.authenticate(socket.data.token)
                    }
                    signal.throwIfAborted()
                    return invoke(request.method, rpcSchemas[request.method].parse(request.params), socket, request.id)
                  },
                  async (request, signal) => {
                    signal.throwIfAborted()
                    if (!socket.data.initialized || !socket.data.deviceId)
                      throw new HbarError('UNAUTHORIZED', 'Initialize the connection first')
                    if (isRecoveryControl(request.method, request.params))
                      await auth.authenticateStatus(socket.data.token, socket.data.deviceId)
                    else socket.data.device = await auth.authenticate(socket.data.token)
                    if (socket.data.device)
                      await authorization.authorize(socket.data.device, request.method, request.params)
                    signal.throwIfAborted()
                    return { actorId: socket.data.deviceId, host: hostInfo(socket.data.device) }
                  },
                )
                span?.stage('reply', socket.data.pending)
                const bytesOut = sendSocketTextFrame(socket, frame)
                if (bytesOut > 0)
                  requestDiagnostics.frame('out', bytesOut, {
                    instanceId: kernel.instanceId,
                    connectionId: socket.data.connectionId,
                  })
                const outcome = z
                  .object({ error: z.object({ data: z.object({ code: z.string().max(128) }).optional() }).optional() })
                  .safeParse(JSON.parse(frame))
                if (outcome.success && outcome.data.error)
                  span?.failure(outcome.data.error.data?.code ?? 'INVALID_REQUEST', { pending: socket.data.pending })
                else if (bytesOut === 0) span?.replySkipped({ pending: socket.data.pending })
                else span?.success({ bytesOut, pending: socket.data.pending })
                return
              }
            }
            const request = rpcRequestSchema.parse(
              JSON.parse(typeof payload === 'string' ? payload : payload.toString()),
            )
            id = request.id
            const candidateParams = request.params
            const businessRequestId =
              candidateParams &&
              typeof candidateParams === 'object' &&
              'requestId' in candidateParams &&
              typeof candidateParams.requestId === 'string'
                ? safeDiagnosticId(candidateParams.requestId)
                : undefined
            const requestSpan = requestDiagnostics.begin({
              method: request.method,
              rpcId: request.id,
              ...(businessRequestId ? { requestId: businessRequestId } : {}),
              connectionId: socket.data.connectionId,
              bytesIn,
              pending: socket.data.pending,
            })
            span = requestSpan
            requestSpan.stage('admission', socket.data.pending)
            const correlation = {
              instanceId: kernel.instanceId,
              contextId: socket.data.connectionId,
              rpcId: safeDiagnosticId(request.id) ?? 'unknown',
              ...(businessRequestId ? { requestId: businessRequestId } : {}),
            }
            const execute = async () => {
              if (!Object.hasOwn(rpcSchemas, request.method)) throw new HbarError('METHOD_NOT_FOUND', request.method)
              if (request.method !== 'system.hello') {
                if (!socket.data.initialized) throw new HbarError('UNAUTHORIZED', 'Initialize the connection first')
                requestSpan.stage('auth', socket.data.pending)
                if (isRecoveryControl(request.method, request.params))
                  await auth.authenticateStatus(socket.data.token, socket.data.deviceId)
                else socket.data.device = await auth.authenticate(socket.data.token)
              }
              const method = request.method as RpcMethod
              requestSpan.stage('validate', socket.data.pending)
              const params = rpcSchemas[method].parse(request.params)
              requestSpan.stage('invoke', socket.data.pending)
              const result = await invoke(method, params, socket, request.id)
              const response = { jsonrpc: '2.0', id, result }
              requestSpan.stage('reply', socket.data.pending)
              const bytesOut = send(socket, response)
              if (bytesOut === 0) requestSpan.replySkipped({ pending: socket.data.pending })
              else requestSpan.success({ bytesOut, pending: socket.data.pending })
            }
            if (options.diagnosticScope) await options.diagnosticScope.run(correlation, execute)
            else await execute()
          } catch (error) {
            const code = error instanceof HbarError || error instanceof CommandError ? error.code : 'INVALID_REQUEST'
            if (!span) {
              span = requestDiagnostics.begin({
                method: 'rpc.invalid',
                rpcId: id ?? 'unknown',
                connectionId: socket.data.connectionId,
                bytesIn,
                pending: socket.data.pending,
              })
            }
            span.failure(code, { pending: socket.data.pending })
            send(socket, {
              jsonrpc: '2.0',
              id,
              error: {
                code: -32000,
                data: code,
                message: error instanceof Error ? error.message : String(error),
              },
            })
          } finally {
            if (admitted) socket.data.pending--
          }
        })().catch(() => {
          console.error('[hbar] RPC callback failed')
          try {
            socket.close(1011, 'Request failed; reconnect to reconcile')
          } catch {
            /* Transport already failed. */
          }
        })
      },
      close(socket) {
        if (socket.data.nodeSource) {
          nodeSockets?.close(socket.data.connectionId)
          return
        }
        socket.data.runtimeDispose?.()
        socket.data.runtimeDispose = undefined
        clearTimeout(socket.data.timer)
        if (socket.data.deviceId && socket.data.terminalCallbacks)
          terminalRouter.detach(socket.data.deviceId, socket.data.terminalCallbacks)
        socket.data.terminals.clear()
        sockets.delete(socket)
        commandClients.disconnected(socket.data.connectionId)
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
        void disposeSocketScope(socket)
          .catch(() => {
            const span = requestDiagnostics.begin({
              method: 'host.scope.dispose',
              rpcId: 'scope',
              connectionId: socket.data.connectionId,
              bytesIn: 0,
              pending: socket.data.pending,
            })
            span.failure('SCOPE_DISPOSE_FAILED', { pending: socket.data.pending })
          })
          .finally(() => allSockets.delete(socket))
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
      authorization.revokeMovedSubscription(socket.data.device, socket.data.follows, event)
      if (!authorization.notification(socket.data.device, socket.data.follows, event)) continue
      if (event.method === 'session.event' || event.method === 'stream.update' || event.method === 'tool.output') {
        const bySession = socket.data.follows.has(event.params.sessionId)
        if (event.method === 'session.event')
          for (const ids of socket.data.operationChains.values()) admitOperationRecovery(event.params, ids)
        const byOperation = Boolean(
          event.params.runId && [...socket.data.operationChains.values()].some((ids) => ids.has(event.params.runId!)),
        )
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
  const detachCommandRouting = options.runtime?.attachCommandRouting?.(commandRouter)
  const detachSessionCommandExecution = sessionCommandExecution
    ? options.runtime?.attachSessionCommandExecution?.(sessionCommandExecution)
    : undefined
  const detachCommandMutationState = sessionCommandExecution
    ? options.runtime?.attachCommandMutationState?.(sessionCommandExecution)
    : undefined
  return {
    server,
    /** Trusted in-process adapters share the same route as authenticated RPC. */
    commands: commandRouter,
    commandJobs: localCommandJobs,
    commandClients,
    sessionCommandExecution,
    auth,
    pairing,
    info: hostInfo,
    async close() {
      sessionCommandExecution?.assertCanClose()
      localCommandJobs.assertCanClose()
      clientCommandJobs?.assertCanClose()
      commandClients.close()
      clientCommandJobs?.dispose()
      closing = true
      detachCommandRouting?.()
      detachSessionCommandExecution?.()
      detachCommandMutationState?.()
      localCommandJobs.dispose()
      nodeSockets?.closeAll()
      await application.dispose()
      metricsCommands.dispose()
      performance.stop()
      unsubscribe()
      terminalRouter.closeAll()
      await terminalRouter.dispose()
      while (notificationTasks.size) await Promise.allSettled([...notificationTasks])
      systemCommands.dispose()
      nodeCommands.dispose()
      commandResultCommands.dispose()
      remoteWorkspaceCommands.dispose()
      unsubscribeMetrics()
      for (const pending of [...pendingSurfaceByRelay.values()])
        finishSurface(pending, { ok: false, code: 'CAPABILITY_UNAVAILABLE', message: 'Host is shutting down' })
      surfaceClients.clear()
      for (const socket of allSockets) {
        void disposeSocketScope(socket).catch(() => undefined)
        socket.close()
      }
      let scopeCloseError: unknown
      try {
        await waitForSocketScopes(5_000)
      } catch (error) {
        scopeCloseError = error
      }
      await server.stop(true)
      removeStorageFatalListener?.()
      if (scopeCloseError !== undefined) throw scopeCloseError
    },
  }
}
