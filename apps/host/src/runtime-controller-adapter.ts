import { z } from 'zod'
import { AsyncLocalStorage } from 'node:async_hooks'
import { HbarError } from '@hbar/contracts'
import { nodeIdSchema } from '@hbar/contracts/node-address'
import { workspaceFoldersSchema } from '@hbar/contracts/commands/workspace-folders'
import { workspaceLocationOf } from '@hbar/contracts/node-address'
import { CommandError, type CommandPreparedOptions, type CommandExecutionExpectation } from '@hbar/commands/protocol'
import { commandJobSnapshotSchema } from '@hbar/commands/jobs'
import { procedure, RuntimeValuePort, type IpcPeer } from '@hbar/runtime'
import { RUNTIME_APPLICATION_METHODS, RUNTIME_APPLICATION_CONTROLS } from '@hbar/kernel/runtime-application'
import type { KernelControllerPort } from '@hbar/kernel/controller'
import {
  NodeGitQueryRouter,
  type NodeGitQueryConfirmationPort,
  type NodeGitQueryInvocation,
  type NodeGitQueryPort,
} from '@hbar/node-link'
import type { GitService } from '@hbar/plugin-sdk'
import { storageRpcCallSchema } from '@hbar/storage'
import {
  runtimeControllerInvokeSchema,
  runtimeControllerRequestSchema,
  runtimeControllerScopeSchema,
  runtimeControllerCatalogSchema,
  isRuntimeControllerControl,
  type RuntimeControllerPort,
  type RuntimeControllerRequest,
  type RuntimeControllerAuthorize,
  type RuntimeControllerScope,
  runtimeControllerCommandStartSchema,
} from './runtime-controller-contract'
import type { RuntimeMaintenancePort } from './runtime-maintenance-contract'
import type { RuntimeNodeLinkPort } from './runtime-node-link-contract'
import { notificationFreshEventSchema, type NotificationFreshEvent } from '@hbar/contracts/commands/notifications'
import { trackRuntimeCommandJob, type RuntimeCommandJobTicket } from './runtime-command-jobs'
import type { HostCommandExecutionScopes } from './command-execution-scopes'

export interface RuntimeControllerAdapterOptions {
  readonly kernel: KernelControllerPort
  readonly maintenance: RuntimeMaintenancePort
  readonly nodeLink?: RuntimeNodeLinkPort
  readonly projection: () => RuntimeControllerScope['kernel']
  readonly background: () => boolean
  readonly admitsApplications: () => boolean
  readonly fresh: (event: NotificationFreshEvent) => void
  readonly retainCommand?: ((jobId: string) => () => void) | undefined
  readonly commandScopes?: HostCommandExecutionScopes
}

/** Native sockets and their identity remain in the listener. A candidate only receives bounded request data. */
export class RuntimeControllerAdapter implements RuntimeControllerPort {
  private readonly invocations = new Map<
    string,
    {
      invoke(request: RuntimeControllerRequest, signal: AbortSignal): Promise<unknown>
      signature: string | null
      result: Promise<unknown> | null
      authorize: RuntimeControllerAuthorize | undefined
      authorized: boolean
      actorId?: string
      applicationsClosed?: boolean
      scope<Result>(operation: () => Result): Result
    }
  >()
  private readonly unregister: () => void
  private readonly cleanup: Array<() => void> = []
  private readonly values: RuntimeValuePort
  private catalog: z.output<typeof runtimeControllerCatalogSchema> = []
  private readonly backgroundId: string
  private closed = false
  private readonly commandLifetime = new AbortController()
  private readonly commandCleanup = new Set<() => void>()
  constructor(
    private readonly peer: IpcPeer,
    private readonly options?: RuntimeControllerAdapterOptions,
  ) {
    this.backgroundId = `controller-background-${peer.remote.incarnation}`
    this.values = new RuntimeValuePort(peer, {
      prefix: 'controller.application',
      controlMethods: [...RUNTIME_APPLICATION_CONTROLS, 'service'],
    })
    this.unregister = peer.register(
      'controller.invoke',
      procedure(runtimeControllerInvokeSchema, z.unknown(), async (input, call) => {
        const invocation = this.invocations.get(input.invocationId)
        if (!invocation)
          throw new HbarError(
            'CONTROLLER_INVOCATION_EXPIRED',
            'The request no longer belongs to this Controller incarnation',
          )
        const signature = JSON.stringify(input.request)
        if (invocation.signature !== signature)
          throw new HbarError('CONTROLLER_REQUEST_MISMATCH', 'An accepted request cannot change its payload')
        call.signal.throwIfAborted()
        invocation.result ??= Promise.resolve().then(() =>
          invocation.scope(() => invocation.invoke(input.request, call.signal)),
        )
        try {
          return await invocation.result
        } catch (error) {
          if (error instanceof CommandError) throw new HbarError(error.code, error.message)
          throw error
        }
      }),
    )
    this.cleanup.push(
      peer.register(
        'controller.authorize',
        procedure(runtimeControllerInvokeSchema, runtimeControllerScopeSchema.nullable(), async (input, call) => {
          const invocation = this.invocations.get(input.invocationId)
          if (!invocation || invocation.signature !== JSON.stringify(input.request))
            throw new HbarError('CONTROLLER_REQUEST_MISMATCH', 'Authorization must match the captured request')
          if (!options || !invocation.authorize) return null
          const admission = await invocation.scope(() => invocation.authorize?.(input.request, call.signal))
          if (!admission) throw new HbarError('UNAUTHORIZED', 'Controller authorization is missing')
          invocation.actorId = admission.actorId
          invocation.authorized = true
          return invocation.scope(() => this.description(input.invocationId, admission.actorId, admission.host))
        }),
      ),
    )
    if (options) {
      const configuredOptions = options
      const kernel = configuredOptions.kernel
      const targets = {
        kernel,
        plugins: kernel.plugins,
        directory: kernel.directoryQueries,
        schema: kernel.schemaCallbacks,
        sandbox: kernel.sandboxProfiles,
        workspaceSandbox: kernel.workspaceSandboxes,
        launchTarget: kernel.sessionLaunchTargets,
        branchTarget: kernel.sessionBranchTargets,
        workspaceQuery: kernel.plugins.get('execution').workspaceQuery,
        mode: kernel.plugins.get('mode'),
        goal: kernel.plugins.get('goal'),
        plan: kernel.plugins.get('plan'),
        budget: kernel.plugins.get('budget'),
        workflow: kernel.plugins.get('workflow'),
        agent: kernel.plugins.get('agent'),
        browser: kernel.plugins.get('browser'),
        computer: kernel.plugins.get('computer'),
        git: kernel.plugins.get('git'),
        execution: kernel.plugins.get('execution'),
      }
      for (const [target, methods] of Object.entries(RUNTIME_APPLICATION_METHODS))
        for (const method of methods) {
          const object = Reflect.get(targets, target) as unknown
          if (!object || typeof object !== 'object') continue
          const callable: unknown = Reflect.get(object, method)
          if (typeof callable !== 'function') continue
          this.values.register(`${target}.${method}`, (args, signal) =>
            this.scoped(args, signal, (rest) => Reflect.apply(callable, object, rest)),
          )
        }
      this.values.register('git.manualQuery', async (args, signal) => {
        const invocationId = z.string().min(1).max(160).parse(args[0])
        const invocation = this.invocations.get(invocationId)
        if (!invocation || !invocation.authorized || !invocation.actorId || invocation.applicationsClosed)
          throw new HbarError('CONTROLLER_INVOCATION_EXPIRED', 'Manual Git query requires its authenticated request')
        const actorId = invocation.actorId
        const input = z
          .strictObject({
            workspaceId: z.string().min(1).max(160),
            actorId: z.string().min(1).max(160),
            requestId: z.string().min(1).max(160),
            cwd: z.string().min(1).max(4_000),
          })
          .parse(args[1])
        if (input.actorId !== actorId)
          throw new HbarError('UNAUTHORIZED', 'Manual Git query actor differs from the authenticated request')
        signal.throwIfAborted()
        return invocation.scope(async () => {
          const workspace = await configuredOptions.kernel.storage.call('workspace', input.workspaceId)
          signal.throwIfAborted()
          if (!workspace || workspace.path !== input.cwd)
            throw new HbarError('WORKSPACE_SCOPE', 'Manual Git query differs from the stored workspace path')
          const location = workspaceLocationOf(workspace)
          if (location.kind === 'local') return null
          const nodeLink = configuredOptions.nodeLink
          if (!nodeLink) throw new HbarError('CAPABILITY_UNAVAILABLE', 'Remote Git query transport is unavailable')
          let current: NodeGitQueryInvocation | undefined = {
            workspace: { path: workspace.path, location },
            deviceId: actorId,
            workspaceId: input.workspaceId,
            sessionId: null,
            operationId: invocationId,
            platform: process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux',
            signal,
          }
          const base = configuredOptions.kernel.plugins.get('git') as GitService
          const node: NodeGitQueryPort = {
            call: (nodeId, method, request, abortSignal) => nodeLink.call(nodeId, method, request, abortSignal),
          }
          const confirmation: NodeGitQueryConfirmationPort = {
            status: (nodeId, request, abortSignal) =>
              nodeLink.call(nodeId, 'node.confirmation.status', request, abortSignal),
            cancel: (nodeId, request, abortSignal) =>
              nodeLink.call(nodeId, 'node.confirmation.cancel', request, abortSignal),
          }
          const router = new NodeGitQueryRouter({
            base,
            node,
            confirmation,
            current: () => current,
          })
          try {
            return await router.launchBranchSnapshot(workspace.path, signal)
          } finally {
            current = undefined
            router.dispose()
          }
        })
      })
      this.values.register('workspace.verifyFolders', async (args, signal) => {
        signal.throwIfAborted()
        if (!options.admitsApplications())
          throw new HbarError('RUNTIME_OWNER_REVOKED', 'A fenced Controller cannot verify workspace folders')
        const invocationId = z.string().min(1).max(160).parse(args[0])
        const invocation = this.invocations.get(invocationId)
        if (!invocation?.authorized || !invocation.actorId || invocation.applicationsClosed)
          throw new HbarError(
            'CONTROLLER_INVOCATION_EXPIRED',
            'Workspace verification requires its authenticated request',
          )
        const nodeId = nodeIdSchema.parse(args[1])
        const folders = workspaceFoldersSchema.parse(args[2])
        const verify = kernel.options.nodeWorkspaceInspection?.verifyWorkspaceFolders
        if (!verify)
          throw new HbarError('NODE_LINK_UNAVAILABLE', 'Remote folder verification is unavailable in this Host')
        return invocation.scope(async () => {
          signal.throwIfAborted()
          const result = await verify(nodeId, folders, signal)
          signal.throwIfAborted()
          return workspaceFoldersSchema.parse(result)
        })
      })
      this.values.register('storage.call', (args, signal) =>
        this.scoped(args, signal, (rest) => {
          const input = storageRpcCallSchema.parse(rest[0])
          const result: unknown = Reflect.apply(kernel.storage.call, kernel.storage, [input.method, ...input.args])
          return result
        }),
      )
      this.values.register('kernel.changed', (args, signal) =>
        this.scoped(args, signal, (rest) => kernel.changed(z.string().min(1).max(160).parse(rest[0]))),
      )
      this.values.register('maintenance.dispatch', (args, signal) =>
        this.scoped(args, signal, (rest) =>
          options.maintenance.dispatch(rest[0], z.string().min(1).max(160).parse(rest[1])),
        ),
      )
      this.cleanup.push(
        peer.register(
          'controller.background.scope',
          procedure(z.undefined(), runtimeControllerScopeSchema, () => {
            if (!options.background())
              throw new HbarError('RUNTIME_NOT_DEFAULT', 'Only the default Controller may schedule background work')
            return this.description(this.backgroundId, 'hbar:scheduler', {
              version: 'managed',
              protocol: 1,
              instanceId: kernel.instanceId,
              platform: process.platform,
              addresses: [],
              activeRuns: kernel.active.size,
              demo: Boolean(kernel.options.demo),
            })
          }),
        ),
      )
      this.cleanup.push(
        peer.onEvent('controller.notification', notificationFreshEventSchema, (event) => options.fresh(event)),
      )
    }
  }
  async dispatch(
    payload: string,
    invoke: (request: RuntimeControllerRequest, signal: AbortSignal) => Promise<unknown>,
    authorize?: RuntimeControllerAuthorize,
  ): Promise<string> {
    if (this.closed) throw new HbarError('RUNTIME_RECOVERING', 'The accepted Controller incarnation exited')
    if (this.invocations.size >= 320)
      throw new HbarError('CONTROLLER_CAPACITY', 'Controller request admission is exhausted')
    const invocationId = crypto.randomUUID()
    let method = 'controller.handle'
    let signature: string | null = null
    try {
      const request = runtimeControllerRequestSchema.safeParse(JSON.parse(payload))
      if (request.success) {
        signature = JSON.stringify(request.data)
        if (isRuntimeControllerControl(request.data)) method = 'controller.control'
      }
    } catch {
      /* The owning Controller returns the malformed request response. */
    }
    const scope = AsyncLocalStorage.snapshot()
    this.invocations.set(invocationId, {
      invoke,
      signature,
      result: null,
      authorize,
      authorized: false,
      scope: (operation) => scope(operation),
    })
    try {
      return await this.peer.call(method, { invocationId, payload }, z.string().max(33_554_432), { timeoutMs: 120_000 })
    } finally {
      this.invocations.delete(invocationId)
    }
  }
  async refreshCatalog(): Promise<void> {
    this.catalog = await this.peer.call('controller.catalog', undefined, runtimeControllerCatalogSchema)
  }
  list() {
    return {
      revision: this.catalog.reduce((total, value) => total + value.revision, 0),
      items: this.catalog.flatMap((value) => value.items),
    }
  }
  async service<Result>(
    service: string,
    method: string,
    args: readonly unknown[],
    options: CommandPreparedOptions = {},
  ): Promise<Result> {
    if (!this.options)
      throw new HbarError('RUNTIME_METHOD_UNAVAILABLE', 'This Controller does not expose owned command services')
    if (this.closed || !this.options.admitsApplications())
      throw new HbarError('RUNTIME_RECOVERING', 'The Controller owner has lost application authority')
    if (this.invocations.size >= 320)
      throw new HbarError('CONTROLLER_CAPACITY', 'Controller request admission is exhausted')
    const invocationId = crypto.randomUUID(),
      scope = AsyncLocalStorage.snapshot()
    const actorId =
      service === 'commands' && (method === 'dispatch' || method === 'dispatchPrepared')
        ? z.string().min(1).max(160).parse(args[1])
        : 'hbar:native-adapter'
    this.invocations.set(invocationId, {
      invoke: async () => undefined,
      signature: null,
      result: null,
      authorize: undefined,
      authorized: true,
      actorId,
      scope: (operation) => scope(operation),
    })
    try {
      const description = this.description(invocationId, actorId, {
        version: 'managed',
        protocol: 1,
        instanceId: this.options.kernel.instanceId,
        platform: process.platform,
        addresses: [],
        activeRuns: this.options.kernel.active.size,
        demo: Boolean(this.options.kernel.options.demo),
      })
      return await this.values.call<Result>('service', [description, service, method, args], {
        timeoutMs: 120_000,
        ...options,
      })
    } finally {
      this.invocations.delete(invocationId)
    }
  }
  async resume(): Promise<void> {
    await this.peer.call('controller.resume', undefined, z.undefined())
  }
  trackCommand(
    value: unknown,
    actorId: string,
    expectation: CommandExecutionExpectation,
    options: CommandPreparedOptions = {},
  ): RuntimeCommandJobTicket {
    if (!this.options || this.closed || !this.options.admitsApplications())
      throw new CommandError('CAPABILITY_UNAVAILABLE', 'The Controller owner cannot admit a command job')
    if (options.signal?.aborted) throw new CommandError('CANCELLED', 'Command cancelled before job admission')
    if (this.invocations.size >= 320) throw new CommandError('BUSY', 'Controller command admission is exhausted')
    const invocationId = crypto.randomUUID(),
      scope = AsyncLocalStorage.snapshot()
    const start = runtimeControllerCommandStartSchema.parse({
      scope: this.description(invocationId, actorId, {
        version: 'managed',
        protocol: 1,
        instanceId: this.options.kernel.instanceId,
        platform: process.platform,
        addresses: [],
        activeRuns: this.options.kernel.active.size,
        demo: Boolean(this.options.kernel.options.demo),
      }),
      invocation: value,
      expectation,
    })
    const invocation = {
      invoke: async () => undefined,
      signature: null,
      result: null,
      authorize: undefined,
      authorized: true,
      actorId,
      applicationsClosed: false,
      scope: <Result>(operation: () => Result) => scope(operation),
    }
    const release = this.options.retainCommand?.(invocationId)
    this.invocations.set(invocationId, invocation)
    const close = () => {
      invocation.applicationsClosed = true
    }
    options.signal?.addEventListener('abort', close, { once: true })
    const cleanup = () => {
      close()
      options.signal?.removeEventListener('abort', close)
      this.invocations.delete(invocationId)
      this.commandCleanup.delete(cleanup)
    }
    this.commandCleanup.add(cleanup)
    try {
      return trackRuntimeCommandJob(
        this.peer,
        { jobId: invocationId, actorId },
        (signal) =>
          this.peer.call('controller.command.start', start, commandJobSnapshotSchema, { signal, timeoutMs: 30_000 }),
        {
          signal: options.signal,
          beforeStart: this.options.commandScopes?.beforeStart({ kind: 'runtime', owner: this.peer.remote, jobId: invocationId }),
          lifetime: this.commandLifetime.signal,
          onLogicalResult: (result) => {
            if (!result.ok) close()
          },
          onTrackingStopped: close,
          onAcknowledged: () => {
            release?.()
            cleanup()
          },
        },
      )
    } catch (error) {
      release?.()
      cleanup()
      throw error
    }
  }
  async pause(): Promise<void> {
    await this.peer.call('controller.pause', undefined, z.undefined())
  }
  private description(
    invocationId: string,
    actorId: string,
    host: RuntimeControllerScope['host'],
  ): RuntimeControllerScope {
    if (!this.options) throw new HbarError('RUNTIME_METHOD_UNAVAILABLE', 'Controller projection is unavailable')
    return runtimeControllerScopeSchema.parse({
      invocationId,
      actorId,
      host,
      kernel: this.options.projection(),
      streams: [...this.options.kernel.streams.values()],
    })
  }
  private scoped(args: unknown[], signal: AbortSignal, operation: (args: unknown[]) => unknown): unknown {
    signal.throwIfAborted()
    if (!this.options?.admitsApplications())
      throw new HbarError('RUNTIME_OWNER_REVOKED', 'A fenced Controller cannot invoke application use cases')
    const id = z.string().min(1).max(160).parse(args[0])
    if (id === this.backgroundId && this.options?.background()) return operation(args.slice(1))
    const invocation = this.invocations.get(id)
    if (!invocation?.authorized || invocation.applicationsClosed)
      throw new HbarError(
        'CONTROLLER_INVOCATION_EXPIRED',
        'The authenticated request no longer owns this application call',
      )
    return invocation.scope(() => operation(args.slice(1)))
  }
  dispose(): void {
    this.closed = true
    this.commandLifetime.abort()
    for (const cleanup of [...this.commandCleanup]) cleanup()
    this.unregister()
    for (const cleanup of this.cleanup) cleanup()
    this.values.dispose()
    this.invocations.clear()
  }
}
