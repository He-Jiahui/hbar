import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { executionOwnershipSchema, runtimeOwnerSchema, runtimeResourceLeaseSchema, runtimeToolPermitSchema,
  type ExecutionOwnership, type RuntimeOwner, type RuntimeVersionSet } from '@hbar/contracts/runtime'
import { procedure, type IpcPeer, type IpcCallOptions } from './ipc'
import type { RuntimeCoordinator, RuntimeResourceLease, RuntimeToolPermit } from './coordinator'

const id = z.string().min(1).max(160)
const claimSchema = z.strictObject({ sessionId: id, runId: id })
const resourceSchema = z.strictObject({ key: z.string().min(1).max(4_000), execution: executionOwnershipSchema.optional() })
const toolSchema = z.strictObject({ execution: executionOwnershipSchema, callId: id })
export const RUNTIME_COORDINATION_CONTROL_METHODS = [
  'execution.claim', 'execution.release', 'execution.stopped', 'resource.release', 'tool.release',
] as const
export interface RuntimeCoordinatorPortOptions {
  readonly owner: RuntimeOwner
  readonly bindings: (owner: RuntimeOwner, sessionId: string) => RuntimeVersionSet
  readonly canAdmit?: (sessionId: string) => boolean
  readonly admitted?: (execution: ExecutionOwnership) => void
  readonly released?: (execution: ExecutionOwnership) => void | Promise<void>
  readonly stopped?: (owner: RuntimeOwner, runId: string) => void | Promise<void>
  readonly releaseFailed?: (execution: ExecutionOwnership) => void
}
function ownExecution(owner: RuntimeOwner, execution: ExecutionOwnership): void {
  if (JSON.stringify(runtimeOwnerSchema.parse(execution.owner)) !== JSON.stringify(runtimeOwnerSchema.parse(owner)))
    throw new HbarError('EXECUTION_OWNER_MISMATCH', 'The IPC caller cannot submit another executor ownership')
}
/** The peer registration fixes caller authority. Child processes cannot choose owners, fences or dependency defaults. */
export function registerRuntimeCoordinatorPort(peer: IpcPeer, coordinator: RuntimeCoordinator, options: RuntimeCoordinatorPortOptions): () => void {
  const owner = Object.freeze(runtimeOwnerSchema.parse(options.owner))
  if (JSON.stringify(owner) !== JSON.stringify(peer.remote))
    throw new HbarError('RUNTIME_OWNER_MISMATCH', 'Coordination authority must match the authenticated IPC incarnation')
  const disposers = [
    peer.register('execution.claim', procedure(claimSchema, executionOwnershipSchema.nullable(), async input => {
      if (coordinator.role(owner) === 'draining') return null
      if (coordinator.role(owner) === 'default' && options.canAdmit && !options.canAdmit(input.sessionId)) return null
      const lease = await coordinator.claim(owner, input.sessionId, input.runId, options.bindings(owner, input.sessionId))
      if (lease) options.admitted?.(lease)
      return lease
    })),
    peer.register('execution.canIdle', procedure(z.strictObject({ sessionId: id }), z.boolean(), input =>
      (!options.canAdmit || options.canAdmit(input.sessionId)) && coordinator.canIdle(owner, input.sessionId))),
    peer.register('execution.release', procedure(executionOwnershipSchema, z.undefined(), async lease => {
      ownExecution(owner, lease)
      await coordinator.requestRelease(lease, () => options.released?.(lease), () => options.releaseFailed?.(lease))
    })),
    peer.register('execution.assert', procedure(executionOwnershipSchema, z.undefined(), lease => {
      ownExecution(owner, lease)
      coordinator.assertExecution(lease)
    })),
    peer.register('execution.stopped', procedure(z.strictObject({ runId: id }), z.undefined(), async input => {
      coordinator.acknowledgeRunStopped(owner, input.runId)
      await options.stopped?.(owner, input.runId)
    })),
    peer.register('resource.acquire', procedure(resourceSchema, runtimeResourceLeaseSchema.nullable(), input => {
      return coordinator.acquireResource(owner, input.key, input.execution)
    })),
    peer.register('resource.release', procedure(z.strictObject({ resourceId: id }), z.undefined(), input => coordinator.releaseResource(owner, input.resourceId))),
    peer.register('tool.reserve', procedure(toolSchema, runtimeToolPermitSchema, input => coordinator.reserveTool(input.execution, input.callId, owner))),
    peer.register('tool.release', procedure(z.strictObject({ permitId: id }), z.undefined(), input => coordinator.releaseTool(owner, input.permitId))),
  ]
  return () => { for (const dispose of disposers) dispose() }
}
/** Typed named calls; AbortSignals stay local and become ordinary IPC cancellation. */
export class RuntimeCoordinatorClient {
  private waitingResources = 0
  constructor(private readonly peer: IpcPeer) {}
  claim(sessionId: string, runId: string, options?: IpcCallOptions): Promise<ExecutionOwnership | null> {
    return this.peer.call('execution.claim', claimSchema.parse({ sessionId, runId }), executionOwnershipSchema.nullable(), options)
  }
  release(execution: ExecutionOwnership): Promise<void> {
    return this.peer.call('execution.release', executionOwnershipSchema.parse(execution), z.undefined())
  }
  assert(execution: ExecutionOwnership): Promise<void> {
    return this.peer.call('execution.assert', executionOwnershipSchema.parse(execution), z.undefined())
  }
  canIdle(sessionId: string): Promise<boolean> { return this.peer.call('execution.canIdle', { sessionId }, z.boolean()) }
  stopped(runId: string): Promise<void> {
    return this.peer.call('execution.stopped', { runId }, z.undefined())
  }
  acquireResource(key: string, execution?: ExecutionOwnership): Promise<RuntimeResourceLease | null> {
    return this.peer.call('resource.acquire', resourceSchema.parse({ key, execution }), runtimeResourceLeaseSchema.nullable())
  }
  releaseResource(resourceId: string): Promise<void> { return this.peer.call('resource.release', { resourceId }, z.undefined()) }
  reserveTool(execution: ExecutionOwnership, callId: string): Promise<RuntimeToolPermit> {
    return this.peer.call('tool.reserve', toolSchema.parse({ execution, callId }), runtimeToolPermitSchema)
  }
  releaseTool(permitId: string): Promise<void> { return this.peer.call('tool.release', { permitId }, z.undefined()) }
  async withResource<Result>(key: string, operation: () => Promise<Result>, options: { execution?: ExecutionOwnership; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<Result> {
    const timeout = options.timeoutMs ?? 120_000
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 120_000)
      throw new HbarError('INVALID_INPUT', 'Resource admission requires a bounded deadline')
    if (this.waitingResources >= 64) throw new HbarError('BUSY', 'Resource admission capacity is full')
    this.waitingResources++
    const deadline = Date.now() + timeout
    let resource: RuntimeResourceLease | null = null
    try {
      while (!resource) {
        options.signal?.throwIfAborted()
        resource = await this.acquireResource(key, options.execution)
        if (resource) break
        if (Date.now() >= deadline) throw new HbarError('BUSY', 'Resource admission deadline expired')
        await new Promise<void>(resolve => setTimeout(resolve, Math.min(100, deadline - Date.now())))
      }
      options.signal?.throwIfAborted()
      return await operation()
    } finally {
      this.waitingResources--
      if (resource) await this.releaseResource(resource.id)
    }
  }
}
