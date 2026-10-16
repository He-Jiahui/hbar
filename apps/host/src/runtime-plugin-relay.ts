import { z } from 'zod'
import { AsyncLocalStorage } from 'node:async_hooks'
import {
  HbarError,
  resolveProviderModel,
  sessionEventPageInputSchema,
  sessionEventPageSchema,
  userInputRequestSchema,
} from '@hbar/contracts'
import type { ExecutionOwnership, RuntimeOwner, RuntimeVersion } from '@hbar/contracts/runtime'
import type { RuntimePluginState } from '@hbar/plugin-sdk/runtime-plugin'
import type { WorkspaceExecutionScope } from '@hbar/plugin-sdk'
import {
  RuntimeValuePort,
  type IpcPeer,
  type RuntimeCoordinator,
  type IpcProcedureContext,
  type IpcCallTicket,
} from '@hbar/runtime'
import type { StableStoragePort } from '@hbar/storage'
import { runtimePluginAuthoritySchema, runtimePluginInvocationSchema } from './runtime-plugin-contract'
import type { RuntimeNodeLinkPort } from './runtime-node-link-contract'
import { invokeRuntimeNodeExecution } from './runtime-node-execution-call'
import type { RuntimeHumanWaits } from './runtime-human-waits'

export interface RuntimePluginEndpoint {
  readonly owner: RuntimeOwner
  readonly application: RuntimeValuePort
  readonly state: RuntimePluginState
  readonly version: RuntimeVersion
}
interface Pending {
  readonly owner: RuntimeOwner
  readonly permitId?: string
  readonly resourceId?: string
  readonly execution?: ExecutionOwnership
  readonly workspaceScope?: WorkspaceExecutionScope
}
/** Authentication, version routing and physical capacity live in the stable process. */
export class RuntimePluginRelay {
  private readonly pending = new Map<string, Pending>()
  private readonly incomingCallbacks = new AsyncLocalStorage<IpcProcedureContext>()
  private readonly outgoingCallbacks = new AsyncLocalStorage<{ execution: ExecutionOwnership; callId: string }>()
  constructor(
    private readonly options: {
      readonly storage: StableStoragePort
      readonly coordinator: RuntimeCoordinator
      readonly humanWaits?: Pick<RuntimeHumanWaits, 'track'>
      readonly current: () => readonly RuntimePluginEndpoint[]
      readonly resolve: (unitId: string, execution?: ExecutionOwnership, sessionId?: string) => RuntimePluginEndpoint
      readonly nodeLink?: () => RuntimeNodeLinkPort
    },
  ) {}
  attachPlugin(peer: IpcPeer, owner: RuntimeOwner): { application: RuntimeValuePort; dispose(): void } {
    const application = new RuntimeValuePort(peer, {
      prefix: 'plugin.application',
      callbackScope: (operation, call) => this.incomingCallbacks.run(call, operation),
      callbackTimeoutMs: 1_325_000,
      callbackSettlement: 'physical',
    })
    const cleanup = application.register('host.read', ([methodValue, argsValue], signal) => {
      const method = z.string().parse(methodValue),
        args = z.array(z.unknown()).max(32).parse(argsValue)
      this.options.coordinator.assertCanRead(owner)
      if (method === 'execution.nodeSettlement') {
        const invocationId = z.string().uuid().parse(args[0]),
          pending = this.pending.get(invocationId)
        if (
          !pending ||
          pending.owner.incarnation !== owner.incarnation ||
          !pending.workspaceScope ||
          !pending.execution
        )
          throw new HbarError('RUNTIME_CALLBACK_EXPIRED', 'The original node invocation is no longer owned')
        return this.nodeCall(args.slice(1), pending.workspaceScope, pending.execution, signal, true)
      }
      if (method === 'execution.nodeCall') return this.nodeCall(args, undefined, undefined, signal)
      return this.read(method, args)
    })
    const finished = peer.onEvent('plugin.finished', z.strictObject({ invocationId: z.string().uuid() }), (input) => {
      const pending = this.pending.get(input.invocationId)
      if (!pending || pending.owner.incarnation !== owner.incarnation) return
      this.pending.delete(input.invocationId)
      this.release(pending)
    })
    return {
      application,
      dispose: () => {
        cleanup()
        finished()
        application.dispose()
      },
    }
  }
  attachKernel(peer: IpcPeer, owner: RuntimeOwner): () => void {
    const application = new RuntimeValuePort(peer, {
      prefix: 'kernel.plugins',
      callbackTracked: (dispatch) => {
        const scope = this.outgoingCallbacks.getStore()
        return scope ? this.callback(scope.execution, scope.callId, dispatch) : dispatch().settled
      },
      callbackTimeoutMs: 1_325_000,
      callbackSettlement: 'physical',
    })
    application.register('catalog', () => {
      this.options.coordinator.assertCanRead(owner)
      return this.options.current().map((endpoint) => ({ unitId: endpoint.owner.unitId, state: endpoint.state }))
    })
    application.register('invoke', async ([unitValue, authorityValue, description, rawArgs, callback], signal) => {
      const unitId = z.string().min(1).max(160).parse(unitValue),
        authority = runtimePluginAuthoritySchema.parse(authorityValue)
      const explicit = authority.execution
      if (explicit && explicit.owner.incarnation !== owner.incarnation)
        throw new HbarError('EXECUTION_OWNER_MISMATCH', 'Plugin dispatch belongs to another Kernel')
      const execution =
        explicit ??
        (authority.sessionId
          ? (this.options.coordinator.executionForSession(authority.sessionId) ?? undefined)
          : undefined)
      if (execution && execution.owner.incarnation !== owner.incarnation)
        throw new HbarError('EXECUTION_OWNER_MISMATCH', 'Session capability belongs to another Kernel')
      this.options.coordinator.assertCanWrite(owner, execution)
      const endpoint = this.options.resolve(unitId, execution, authority.sessionId),
        request = runtimePluginInvocationSchema.parse(description)
      const workspaceScope = request.workspaceExecutionScope
        ? {
            workspace: structuredClone(request.workspaceExecutionScope.workspace),
            ...(request.workspaceExecutionScope.authority
              ? { authority: structuredClone(request.workspaceExecutionScope.authority) }
              : {}),
            signal: request.workspaceExecutionScope.signal,
          }
        : undefined
      const args = z.array(z.unknown()).max(32).parse(rawArgs)
      if (typeof callback !== 'function')
        throw new HbarError('RUNTIME_HOST_REQUIRED', 'Plugin dispatch needs its owned host callback')
      const invokeHost = async (method: string, parameters: readonly unknown[]): Promise<unknown> => {
        this.options.coordinator.assertCanWrite(owner, execution)
        this.options.coordinator.assertCanWrite(endpoint.owner, execution)
        if (method === 'execution.nodeCall') return this.nodeCall(parameters, workspaceScope, execution, signal)
        const forward = async (): Promise<unknown> => {
          const result: unknown = await Reflect.apply(callback, undefined, [method, [...parameters]])
          return result
        }
        if (method !== 'userInput.request' || !execution || !callId) return forward()
        const request = userInputRequestSchema.parse(parameters[0])
        if (
          request.sessionId !== execution.sessionId ||
          request.runId !== execution.runId ||
          request.callId !== callId
        )
          throw new HbarError('EXECUTION_OWNER_MISMATCH', 'A questionnaire callback must retain its original tool execution')
        const incoming = this.incomingCallbacks.getStore()?.callerDeadline
        const untrack = incoming
          ? this.options.humanWaits?.track(execution, callId, { suspendDeadline: () => incoming.suspend() })
          : undefined
        try {
          return await this.outgoingCallbacks.run({ execution, callId }, forward)
        } finally {
          untrack?.()
        }
      }
      const invocationId = crypto.randomUUID()
      let callId: string | undefined
      if (request.operation === 'execute') {
        const identity = z
          .object({
            callId: z.string().min(1).max(160),
            run: z.object({ id: z.string() }),
            session: z.object({ id: z.string() }),
          })
          .parse(args[1])
        if (!execution || identity.run.id !== execution.runId || identity.session.id !== execution.sessionId)
          throw new HbarError('EXECUTION_OWNER_MISMATCH', 'Tool execution needs its durable bound Run')
        callId = identity.callId
      }
      const resource = execution
        ? this.options.coordinator.acquireResource(endpoint.owner, 'plugin.call:' + invocationId, execution)
        : null
      let permitId: string | undefined
      if (callId && execution) {
        try {
          permitId = this.options.coordinator.reserveTool(execution, callId, endpoint.owner).id
          if (resource) this.options.coordinator.bindToolResource(endpoint.owner, resource.id, execution, callId)
        } catch (error) {
          if (permitId) this.options.coordinator.releaseTool(endpoint.owner, permitId)
          if (resource) this.options.coordinator.releaseResource(endpoint.owner, resource.id)
          throw error
        }
      }
      this.pending.set(invocationId, {
        owner: endpoint.owner,
        ...(permitId ? { permitId } : {}),
        ...(resource ? { resourceId: resource.id } : {}),
        ...(execution ? { execution } : {}),
        ...(workspaceScope ? { workspaceScope } : {}),
      })
      try {
        const tracked = endpoint.application.callTracked('invoke', [{ ...request, invocationId }, args, invokeHost], {
          signal,
          timeoutMs:
            request.toolTimeoutMs === undefined ? 120_000 : Math.min(1_325_000, request.toolTimeoutMs + 125_000),
        })
        void tracked.result.catch(() => {})
        let untrack: (() => void) | undefined
        try {
          if (execution && callId) untrack = this.options.humanWaits?.track(execution, callId, tracked)
          return await tracked.settled
        } finally {
          try {
            await tracked.settled
          } finally {
            untrack?.()
          }
        }
      } catch (error) {
        // Cancellation/transport failure is not physical completion. The owner's finally notification or actual exit releases its permit.
        if (
          !signal.aborted &&
          !(error instanceof HbarError && ['IPC_DISCONNECTED', 'IPC_TIMEOUT'].includes(error.code))
        ) {
          const pending = this.pending.get(invocationId)
          if (pending) {
            this.pending.delete(invocationId)
            this.release(pending)
          }
        }
        throw error
      }
    })
    return () => application.dispose()
  }
  private async callback<Result>(
    execution: ExecutionOwnership,
    callId: string,
    dispatch: () => IpcCallTicket<Result>,
  ): Promise<Result> {
    const ticket = dispatch()
    void ticket.result.catch(() => {})
    let untrack: (() => void) | undefined
    try {
      untrack = this.options.humanWaits?.track(execution, callId, ticket)
      return await ticket.settled
    } finally {
      try {
        await ticket.settled
      } finally {
        untrack?.()
      }
    }
  }
  exited(owner: RuntimeOwner): void {
    for (const [id, pending] of this.pending)
      if (pending.owner.incarnation === owner.incarnation) this.pending.delete(id)
  }
  private release(pending: Pending): void {
    if (pending.permitId) this.options.coordinator.releaseTool(pending.owner, pending.permitId)
    if (pending.resourceId) this.options.coordinator.releaseResource(pending.owner, pending.resourceId)
  }
  private nodeCall(
    args: readonly unknown[],
    scope: WorkspaceExecutionScope | undefined,
    execution: ExecutionOwnership | undefined,
    signal: AbortSignal,
    settlement = false,
  ): Promise<unknown> {
    const node = this.options.nodeLink?.()
    if (!node) throw new HbarError('NODE_LINK_UNAVAILABLE', 'The workspace node link is unavailable')
    return invokeRuntimeNodeExecution({ node, scope, execution, signal, settlement }, args)
  }
  private async read(method: string, args: readonly unknown[]): Promise<unknown> {
    const storage = this.options.storage
    if (method === 'sessions.list') {
      const sessions = await storage.call('sessions')
      return typeof args[0] === 'string' ? sessions.filter((session) => session.workspaceId === args[0]) : sessions
    }
    if (method === 'sessions.get') return storage.call('session', z.string().parse(args[0]))
    if (method === 'sessions.events')
      return storage.call(
        'events',
        z.string().parse(args[0]),
        z
          .number()
          .int()
          .nonnegative()
          .parse(args[1] ?? 0),
        z
          .number()
          .int()
          .positive()
          .max(200_001)
          .parse(args[2] ?? 2_000),
      )
    if (method === 'sessions.readEventPage') {
      const input = sessionEventPageInputSchema.parse(args[0])
      return sessionEventPageSchema.parse(await storage.call('readEventPage', input))
    }
    if (method === 'sessions.snapshot') return storage.call('snapshot', z.string().parse(args[0]))
    if (method === 'sessions.workspace') return storage.call('workspace', z.string().parse(args[0]))
    if (method === 'service.models.list') return storage.call('providers')
    if (method === 'service.models.get') {
      const id = z.string().parse(args[0]),
        providers = await storage.call('providers')
      const provider = providers.find((item) => item.id === id || id.startsWith(item.id + '/'))
      if (!provider) throw new HbarError('MODEL_NOT_FOUND', 'The candidate model does not exist')
      return { ...resolveProviderModel(provider, id), id }
    }
    const target = /^service\.(goal|plan|mode|budget)\.(get|snapshot)$/.exec(method)
    if (target) {
      const endpoint = this.options.current().find((item) => Object.hasOwn(item.state.capabilities, target[1] ?? ''))
      if (!endpoint)
        throw new HbarError('RUNTIME_DEPENDENCY_UNAVAILABLE', 'The candidate read dependency is unavailable')
      const result = await endpoint.application.call<unknown>('invoke', [
        { operation: 'capability', name: target[1], method: target[2], catalog: [] },
        [...args],
        (next: string, parameters: readonly unknown[]) => this.read(next, parameters),
      ])
      const { runtimePluginResultSchema } = await import('./runtime-plugin-contract')
      const checked = runtimePluginResultSchema.parse(result)
      if (checked.kind !== 'value')
        throw new HbarError(
          checked.kind === 'error' ? checked.code : 'RUNTIME_PREPARING',
          'The candidate read was rejected',
        )
      return checked.value
    }
    throw new HbarError(
      'RUNTIME_PREPARING',
      'Preparation and background callbacks cannot create production side effects',
    )
  }
}
