import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { describeCommand, invocationSchema } from '@hbar/commands'
import {
  chatDatabaseCommands,
  chatDatabaseOperationSchema,
  chatDatabasePreviewItemSchema,
  type ChatDatabaseOperation,
} from '@hbar/contracts/commands/chat-database'
import { settingsScopeSchema } from '@hbar/contracts/commands/settings'
import type { RuntimeOwner, RuntimeVersion } from '@hbar/contracts/runtime'
import type { KernelControllerPort } from '@hbar/kernel/controller'
import {
  RuntimeValuePort,
  procedure,
  type IpcPeer,
  type ManagedProcess,
  type RuntimeCoordinator,
  type RuntimePhysicalRetirementReceipt,
} from '@hbar/runtime'
import {
  storageRpcCallSchema,
  chatDatabaseVacuumRecordSchema,
  createChatDatabaseVacuumRecords,
  type StableStoragePort,
  type PathLayout,
} from '@hbar/storage'
import type { RuntimeMaintenancePort } from './runtime-maintenance-contract'
import {
  maintenanceInspectionAckSchema,
  maintenanceInspectionWakeReplySchema,
  sameMaintenanceAck,
  maintenanceInspectionLifecycleGuardSchema,
  type MaintenanceInspectionLifecycleGuard,
  type MaintenanceInspectionAck,
  type MaintenanceInspectionWakeReply,
} from './runtime-maintenance-inspection-contract'
import type { ChatDatabaseInspectionCheckpoint } from '@hbar/kernel/maintenance'
import type { HostRuntimeDemandPort, HostRuntimeDemandHold } from './runtime-host-demand'

export interface RuntimeMaintenanceEndpoint {
  readonly owner: RuntimeOwner
  readonly version: RuntimeVersion
  readonly process: ManagedProcess
}
interface Job {
  readonly owner: RuntimeOwner
  readonly version: RuntimeVersion
  readonly resourceId: string
}
interface Writer {
  readonly operationId: string
  owner: RuntimeOwner
  readonly storageOwner: RuntimeOwner
  exited: boolean
}
const id = z.string().min(1).max(160),
  number = z.number().int().nonnegative().safe()
const operationIdSchema = z.strictObject({ operationId: id })
const removalSchema = z.strictObject({
  sessionId: id,
  operationId: id,
  expectedSeq: number,
  expectedActivityAt: number,
})
const resourceSchema = z.strictObject({
  operationId: id,
  scope: settingsScopeSchema,
  item: chatDatabasePreviewItemSchema,
  cutoffAt: number,
})

/** Cross-generation job routing, a single maintenance gate, and verified physical writer handoff live in the stable base. */
export class RuntimeMaintenanceRelay implements RuntimeMaintenancePort {
  private readonly jobs = new Map<string, Job>()
  private readonly operations = new Map<string, ChatDatabaseOperation>()
  private readonly receipts = new Map<string, string>()
  private readonly dead = new Set<string>()
  private readonly resumed = new Set<string>()
  private readonly waiting = new Set<() => void>()
  private readonly inspectionSeals = new Map<
    string,
    { readonly owner: RuntimeOwner; readonly ack: MaintenanceInspectionAck }
  >()
  private readonly storageCalls = new Map<string, number>()
  private readonly idleWake = new Set<string>()
  private readonly restoringInspection = new Set<string>()
  private readonly dispatchHolds = new Set<{
    readonly owner: RuntimeOwner | null
    readonly hold: HostRuntimeDemandHold
  }>()
  private dispatchAcquiring = 0
  private writer: Writer | null = null
  private reconciling: Promise<void> | undefined
  constructor(
    private readonly options: {
      readonly storage: StableStoragePort
      readonly coordinator: RuntimeCoordinator
      readonly kernel: KernelControllerPort
      readonly layout: PathLayout
      readonly current: () => RuntimeMaintenanceEndpoint
      readonly resolve: (owner: RuntimeOwner) => RuntimeMaintenanceEndpoint
      readonly changed: () => void
      readonly demand?: HostRuntimeDemandPort
      readonly beforeDispatch?: (owner: RuntimeOwner, signal: AbortSignal) => Promise<void>
    },
  ) {}
  isWriting(): boolean {
    return this.writer !== null
  }
  /** Purely trusted physical receipt hook; this does not settle any domain operation receipt. */
  physicalExitConfirmed(proof: RuntimePhysicalRetirementReceipt): void {
    if (proof.owner.unitId !== 'maintenance' || !proof.nativeJoined || !proof.onExitCompleted)
      throw new HbarError('MAINTENANCE_INSPECTION_UNKNOWN', 'Maintenance physical ownership remains unknown')
    // Clean sleep exits need the same bounded owner-metadata cleanup as faults.
    // This is idempotent with Host.onExit; never wait for Manager.afterDispose here.
    this.exited(proof.owner)
    for (const held of this.dispatchHolds) {
      if (!held.owner || !this.sameOwner(held.owner, proof.owner)) continue
      held.hold.release()
      this.dispatchHolds.delete(held)
    }
    // Forced/nonzero absence can release a physical hold, never replay a cleanup or clear its UNKNOWN.
  }
  /** Parent reservation seals admission before it asks the child to clear its timer. */
  sealInspection(owner: RuntimeOwner, raw: MaintenanceInspectionAck): void {
    const ack = maintenanceInspectionAckSchema.parse(raw)
    this.assertOwner(owner)
    const endpoint = this.options.current()
    if (!this.sameOwner(endpoint.owner, owner) || this.writer || this.jobs.size || this.inspectionSeals.size >= 32)
      throw new HbarError('BUSY', 'Maintenance inspection cannot seal an active owner')
    const previous = this.inspectionSeals.get(owner.incarnation)
    if (previous && !sameMaintenanceAck(previous.ack, ack))
      throw new HbarError('MAINTENANCE_INSPECTION_UNKNOWN', 'Maintenance already holds another reservation')
    this.inspectionSeals.set(owner.incarnation, { owner: { ...owner }, ack })
  }
  inspectionSealed(owner: RuntimeOwner, ack: MaintenanceInspectionAck): boolean {
    const held = this.inspectionSeals.get(owner.incarnation)
    return Boolean(
      held &&
      this.sameOwner(held.owner, owner) &&
      sameMaintenanceAck(held.ack, ack) &&
      !this.writer &&
      !this.jobs.size &&
      !(this.storageCalls.get(owner.incarnation) ?? 0),
    )
  }
  /** Invoke only after known parent abort AND exact child abort ACK, never UNKNOWN. */
  abortInspection(owner: RuntimeOwner, ack: MaintenanceInspectionAck): void {
    if (!this.inspectionSealed(owner, ack))
      throw new HbarError('MAINTENANCE_INSPECTION_UNKNOWN', 'Maintenance abort is not quiescent')
    this.inspectionSeals.delete(owner.incarnation)
  }
  async initializeIdle(
    owner: RuntimeOwner,
    ack: MaintenanceInspectionAck,
    checkpoint: ChatDatabaseInspectionCheckpoint,
    signal: AbortSignal,
  ): Promise<MaintenanceInspectionWakeReply> {
    signal.throwIfAborted()
    const endpoint = this.options.current()
    if (
      !this.idleWake.has(owner.incarnation) ||
      !this.sameOwner(endpoint.owner, owner) ||
      this.writer ||
      this.jobs.size
    )
      throw new HbarError('MAINTENANCE_INSPECTION_UNKNOWN', 'Idle restore requires its exact fresh owner')
    // Permit only this child's automatic inspection accept after it arms its timer.
    // Foreground dispatch remains sealed by !resumed until the exact reply is checked.
    // On uncertain reply retain this marker; no restore replay/recovery is authorized.
    if (this.restoringInspection.has(owner.incarnation))
      throw new HbarError('MAINTENANCE_INSPECTION_UNKNOWN', 'Idle restore already has an unresolved attempt')
    this.restoringInspection.add(owner.incarnation)
    const reply = await endpoint.process.call(
      'maintenance.inspection.restore',
      { ack, checkpoint },
      maintenanceInspectionWakeReplySchema,
      { signal },
    )
    if (
      !this.sameOwner(reply.owner, owner) ||
      !sameMaintenanceAck(reply.ack, ack) ||
      reply.checkpoint.version !== checkpoint.version ||
      reply.checkpoint.cursor !== checkpoint.cursor ||
      reply.checkpoint.nextCheckAt !== checkpoint.nextCheckAt
    )
      throw new HbarError(
        'MAINTENANCE_INSPECTION_UNKNOWN',
        'Idle restore reply does not match its dispatched checkpoint',
      )
    // The validated reply is a known past completion even if this owner exited.
    // Do not consult mutable current-owner state to reclassify that completion.
    if (
      !this.dead.has(owner.incarnation) &&
      this.idleWake.has(owner.incarnation) &&
      this.restoringInspection.has(owner.incarnation)
    )
      this.resumed.add(owner.incarnation)
    return reply
  }
  async pauseInspection(
    owner: RuntimeOwner,
    raw: MaintenanceInspectionLifecycleGuard,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.inspectionLifecycle('maintenance.inspection.pause', owner, raw, signal)
  }
  async resumeInitializedInspection(
    owner: RuntimeOwner,
    raw: MaintenanceInspectionLifecycleGuard,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.inspectionLifecycle('maintenance.inspection.resume', owner, raw, signal)
  }
  private async inspectionLifecycle(
    method: 'maintenance.inspection.pause' | 'maintenance.inspection.resume',
    owner: RuntimeOwner,
    raw: MaintenanceInspectionLifecycleGuard,
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted()
    const guard = maintenanceInspectionLifecycleGuardSchema.parse(raw)
    this.assertOwner(owner)
    const endpoint = this.options.resolve(owner)
    if (
      !this.sameOwner(guard.owner, owner) ||
      !this.sameOwner(endpoint.owner, owner) ||
      this.dead.has(owner.incarnation) ||
      this.inspectionSeals.has(owner.incarnation) ||
      (this.idleWake.has(owner.incarnation) && !this.resumed.has(owner.incarnation))
    )
      throw new HbarError(
        'MAINTENANCE_INSPECTION_UNKNOWN',
        'Maintenance lifecycle requires its initialized exact owner',
      )
    await endpoint.process.call(method, guard, z.undefined(), signal ? { signal } : {})
    // A known ACK remains known if parent stop/abort raced the physical reply.
    // Parent serializes pause/start and guards its current epoch before dispatch.
  }
  private sameOwner(left: RuntimeOwner, right: RuntimeOwner): boolean {
    return (
      left.unitId === right.unitId && left.generation === right.generation && left.incarnation === right.incarnation
    )
  }
  describe(commandId: string) {
    const definition = Object.values(chatDatabaseCommands).find((definition) => definition.metadata.id === commandId)
    if (!definition) throw new HbarError('COMMAND_NOT_FOUND', 'Maintenance command is not registered')
    return describeCommand(definition)
  }
  dispose(): void {
    /* The managed owner lifecycle belongs to ProcessHostRuntime. */
  }
  list() {
    return { revision: 1, items: Object.values(chatDatabaseCommands).map(describeCommand) }
  }
  readonly dispatch = async (value: unknown, actorId: string): Promise<unknown> => {
    const invocation = invocationSchema.parse(value)
    this.describe(invocation.commandId)
    const target = z
      .object({ operationId: id.optional(), previewId: id.optional(), idempotencyKey: id.optional() })
      .safeParse(invocation.input)
    const operationId = target.success
      ? (target.data.operationId ??
        target.data.previewId ??
        (target.data.idempotencyKey ? this.receipts.get(`${actorId}:${target.data.idempotencyKey}`) : undefined))
      : undefined
    const job = operationId ? this.jobs.get(operationId) : undefined
    let endpoint: RuntimeMaintenanceEndpoint
    let demandEntry: { readonly owner: RuntimeOwner; readonly hold: HostRuntimeDemandHold } | undefined
    const releaseUndispatchedDemand = (): void => {
      // With no restore hook and before process.call, this hold has no physical dispatch to await.
      if (!demandEntry || this.options.beforeDispatch || !this.dispatchHolds.has(demandEntry)) return
      demandEntry.hold.release()
      this.dispatchHolds.delete(demandEntry)
    }
    if (job) {
      if (this.dead.has(job.owner.incarnation))
        throw new HbarError(
          'EXECUTION_OWNER_REVOKED',
          'The bound maintenance owner has exited; reconcile its original operation',
        )
      endpoint = this.options.resolve(job.owner)
    } else if (this.options.demand) {
      if (this.dispatchHolds.size + this.dispatchAcquiring >= 32)
        throw new HbarError('MAINTENANCE_CAPACITY', 'Maintenance physical admission capacity is exhausted')
      const signal = AbortSignal.timeout(30_000)
      this.dispatchAcquiring++
      let hold: HostRuntimeDemandHold
      try {
        hold = await this.options.demand.acquire(['maintenance'], signal)
      } finally {
        this.dispatchAcquiring--
      }
      const owner = hold.owners.find((value) => value.unitId === 'maintenance')
      if (!owner) {
        // No known owner can safely adopt this hold. Root demand retains its own unknown startup.
        // Keep a bounded quarantine entry instead of treating failure as physical completion.
        this.dispatchHolds.add({ owner: null, hold })
        throw new HbarError('MAINTENANCE_INSPECTION_UNKNOWN', 'Maintenance demand returned no exact owner')
      }
      demandEntry = { owner: { ...owner }, hold }
      this.dispatchHolds.add(demandEntry)
      // Failure may follow an actual restore dispatch; never release this in a catch/finally.
      await this.options.beforeDispatch?.(owner, signal)
      endpoint = this.options.current()
      if (!this.sameOwner(endpoint.owner, owner)) {
        releaseUndispatchedDemand()
        throw new HbarError('MAINTENANCE_INSPECTION_UNKNOWN', 'Maintenance default changed after demand admission')
      }
    } else endpoint = this.options.current()
    const control = ['chatDatabase.cancel', 'chatDatabase.operation', 'chatDatabase.receipt'].includes(
      invocation.commandId,
    )
    if (
      !control &&
      (this.inspectionSeals.has(endpoint.owner.incarnation) ||
        (this.idleWake.has(endpoint.owner.incarnation) && !this.resumed.has(endpoint.owner.incarnation)))
    ) {
      releaseUndispatchedDemand()
      throw new HbarError('MAINTENANCE_INSPECTION_FENCED', 'Maintenance inspection owns new command admission')
    }
    const held = demandEntry
    return endpoint.process.call(
      control ? 'maintenance.control' : 'maintenance.dispatch',
      { invocation, actorId },
      z.unknown(),
      {
        onDispatchSettled: () => {
          if (!held || !this.dispatchHolds.has(held)) return
          held.hold.release()
          this.dispatchHolds.delete(held)
        },
      },
    )
  }
  attach(
    peer: IpcPeer,
    owner: RuntimeOwner,
    version: RuntimeVersion,
    purpose?: 'startup' | 'candidate' | 'recovery' | 'idle-wake',
  ): () => void {
    if (purpose === 'idle-wake') this.idleWake.add(owner.incarnation)
    const values = new RuntimeValuePort(peer, { prefix: 'maintenance.application' })
    const kernel = this.options.kernel
    const checked = <Value>(action: () => Value): Value => {
      this.assertOwner(owner)
      return action()
    }
    values.register('domain.idle', () => checked(() => kernel.chatDatabaseIsIdle()))
    values.register('domain.protection', ([input]) =>
      checked(() => kernel.chatDatabaseSessionProtection(id.parse(input))),
    )
    values.register('domain.roots', () => checked(() => kernel.plugins.protectedResourceRoots()))
    values.register('domain.removeSession', ([input]) =>
      checked(() => kernel.removeChatDatabaseSession(removalSchema.parse(input))),
    )
    values.register('domain.removeResource', ([input]) =>
      checked(() => kernel.removeChatDatabaseResource(resourceSchema.parse(input))),
    )
    values.register('domain.deleted', ([ids, revision]) =>
      checked(() => kernel.notifyChatDatabaseDeleted(z.array(id).max(100).parse(ids), number.parse(revision))),
    )
    values.register('domain.maintain', ([action]) =>
      checked(() => {
        if (typeof action !== 'function')
          throw new HbarError('INVALID_INPUT', 'Maintenance needs its named action port')
        return kernel.maintainChatDatabase(async () => {
          this.assertOwner(owner)
          const result: unknown = await Reflect.apply(action, undefined, [])
          return result
        })
      }),
    )
    const cleanup = [
      peer.register(
        'maintenance.storage',
        procedure(storageRpcCallSchema, z.unknown(), async (input) => {
          this.assertOwner(owner)
          if (input.authority)
            throw new HbarError('EXECUTION_OWNER_MISMATCH', 'Maintenance does not submit Run execution claims')
          if (
            input.method === 'chatDatabaseOperationAccept' &&
            (this.inspectionSeals.has(owner.incarnation) ||
              (this.idleWake.has(owner.incarnation) &&
                !this.resumed.has(owner.incarnation) &&
                !this.restoringInspection.has(owner.incarnation)))
          )
            throw new HbarError('BUSY', 'Maintenance accept is sealed for inspection transfer')
          if (input.method === 'chatDatabaseOperationAccept' && this.options.coordinator.role(owner) !== 'default')
            throw new HbarError('RUNTIME_DRAINING', 'New maintenance jobs use the default generation')
          if (this.writer) {
            if (input.method === 'chatDatabaseOperationRead') {
              const cached = this.operations.get(id.parse(input.args[0]))
              if (cached) return cached
            }
            throw new HbarError('BUSY', 'Database ownership is handed to the maintenance Worker')
          }
          if (!this.storageCalls.has(owner.incarnation) && this.storageCalls.size >= 32)
            throw new HbarError(
              'RUNTIME_PREPARATION_CAPACITY',
              'Unsettled maintenance storage owners exhausted capacity',
            )
          this.storageCalls.set(owner.incarnation, (this.storageCalls.get(owner.incarnation) ?? 0) + 1)
          let result: unknown
          try {
            result = await this.options.storage.executeRpc(input)
          } finally {
            const remaining = (this.storageCalls.get(owner.incarnation) ?? 1) - 1
            if (remaining) this.storageCalls.set(owner.incarnation, remaining)
            else this.storageCalls.delete(owner.incarnation)
          }
          const operation = chatDatabaseOperationSchema.safeParse(result)
          const accepted = z.object({ created: z.boolean(), operation: chatDatabaseOperationSchema }).safeParse(result)
          if (operation.success) this.cache(operation.data)
          if (accepted.success) {
            this.cache(accepted.data.operation)
            const identity = z.object({ actorId: id, idempotencyKey: id }).parse(input.args[0])
            if (this.receipts.size >= 256) this.receipts.delete(this.receipts.keys().next().value ?? '')
            this.receipts.set(`${identity.actorId}:${identity.idempotencyKey}`, accepted.data.operation.operationId)
            if (accepted.data.created) this.started(owner, version, accepted.data.operation)
          }
          if (input.method === 'chatDatabasePending' && operation.success) {
            if (operation.data.kind === 'database' && operation.data.status === 'unknown') return null
            const job = this.jobs.get(operation.data.operationId)
            if (job && job.owner.incarnation !== owner.incarnation && !this.dead.has(job.owner.incarnation)) return null
          }
          return result
        }),
      ),
      peer.register(
        'maintenance.job.started',
        procedure(z.strictObject({ operation: chatDatabaseOperationSchema }), z.undefined(), async (input) => {
          this.assertOwner(owner)
          const saved = await this.options.storage.call('chatDatabaseOperationRead', input.operation.operationId)
          this.started(owner, version, saved)
        }),
      ),
      peer.register(
        'maintenance.job.finished',
        procedure(operationIdSchema, z.undefined(), async (input) => {
          this.assertOwner(owner)
          const job = this.jobs.get(input.operationId)
          if (!job || job.owner.incarnation !== owner.incarnation) return
          if (this.writer?.operationId === input.operationId)
            throw new HbarError(
              'STORAGE_RECONCILIATION_REQUIRED',
              'The physical writer must finish verification before releasing its job',
            )
          const operation = await this.options.storage.call('chatDatabaseOperationRead', input.operationId)
          if (!['completed', 'cancelled', 'failed', 'unknown'].includes(operation.status))
            throw new HbarError('MAINTENANCE_NOT_FINISHED', 'Maintenance has no durable terminal state')
          this.cache(operation)
          this.jobs.delete(input.operationId)
          this.options.coordinator.releaseResource(owner, job.resourceId)
          this.options.changed()
        }),
      ),
      peer.register(
        'maintenance.writer.begin',
        procedure(operationIdSchema, z.strictObject({ verificationOnly: z.boolean() }), async (input) => {
          this.assertOwner(owner)
          const held = this.writer
          if (held) {
            if (held.operationId !== input.operationId || !held.exited || !this.dead.has(held.owner.incarnation))
              throw new HbarError(
                'STORAGE_RECONCILIATION_REQUIRED',
                'The previous maintenance executor has not relinquished physical ownership',
              )
            const operation = this.operations.get(input.operationId)
            if (!operation)
              throw new HbarError('STORAGE_RECONCILIATION_REQUIRED', 'The interrupted maintenance journal is missing')
            this.started(owner, version, operation)
            held.owner = owner
            return { verificationOnly: true }
          }
          this.options.kernel.assertIdle()
          if (this.options.coordinator.snapshot().claims)
            throw new HbarError('BUSY', 'Execution ownership claims have not settled')
          const job = this.jobs.get(input.operationId),
            storageOwner = this.options.storage.snapshot().owner
          if (!job || job.owner.incarnation !== owner.incarnation || !storageOwner)
            throw new HbarError(
              'STORAGE_WRITER_UNAVAILABLE',
              'An admitted maintenance job and current storage writer are required',
            )
          this.writer = { operationId: input.operationId, owner, storageOwner, exited: false }
          this.options.changed()
          await this.options.storage.beginMaintenance(input.operationId)
          this.writer.exited = true
          return { verificationOnly: false }
        }),
      ),
      peer.register(
        'maintenance.writer.end',
        procedure(
          z.strictObject({ operationId: id, receipt: chatDatabaseVacuumRecordSchema }),
          z.undefined(),
          async (input) => {
            this.assertOwner(owner)
            const held = this.writer,
              receipt = createChatDatabaseVacuumRecords(this.options.layout.sessions).read(input.operationId)
            if (
              !held ||
              held.owner.incarnation !== owner.incarnation ||
              held.operationId !== input.operationId ||
              !held.exited ||
              this.options.storage.snapshot().owner?.incarnation !== held.storageOwner.incarnation ||
              !receipt?.integrityVerified ||
              input.receipt.operationId !== input.operationId ||
              JSON.stringify(receipt) !== JSON.stringify(input.receipt)
            )
              throw new HbarError(
                'STORAGE_RECONCILIATION_REQUIRED',
                'Maintenance needs its exact verified durable receipt',
              )
            await this.options.storage.endMaintenance(input.operationId)
            this.writer = null
            for (const notify of this.waiting) notify()
            this.options.changed()
          },
        ),
      ),
    ]
    return () => {
      for (const dispose of cleanup) dispose()
      values.dispose()
    }
  }
  exited(owner: RuntimeOwner): void {
    if (owner.unitId !== 'maintenance') return
    this.idleWake.delete(owner.incarnation)
    this.restoringInspection.delete(owner.incarnation)
    this.inspectionSeals.delete(owner.incarnation)
    this.dead.add(owner.incarnation)
    this.resumed.delete(owner.incarnation)
    if (this.dead.size > 1_536)
      for (const incarnation of this.dead) {
        if (
          ![...this.jobs.values()].some((job) => job.owner.incarnation === incarnation) &&
          this.writer?.owner.incarnation !== incarnation
        ) {
          this.dead.delete(incarnation)
          break
        }
      }
  }
  reconcile(): Promise<void> {
    this.reconciling ??= this.resume().finally(() => {
      this.reconciling = undefined
    })
    return this.reconciling
  }
  async waitForWriter(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    if (!this.writer) return
    if (this.waiting.size >= 32)
      throw new HbarError('RUNTIME_PREPARATION_CAPACITY', 'Too many versions are waiting for the maintenance writer')
    await new Promise<void>((resolve, reject) => {
      const complete = () => {
        this.waiting.delete(complete)
        signal.removeEventListener('abort', cancel)
        resolve()
      }
      const cancel = () => {
        this.waiting.delete(complete)
        signal.removeEventListener('abort', cancel)
        reject(new HbarError('RUNTIME_CANCELLED', 'Waiting for maintenance ownership was cancelled'))
      }
      this.waiting.add(complete)
      signal.addEventListener('abort', cancel, { once: true })
      if (signal.aborted) cancel()
    })
  }
  private assertOwner(owner: RuntimeOwner): void {
    if (this.dead.has(owner.incarnation))
      throw new HbarError('EXECUTION_OWNER_REVOKED', 'The maintenance incarnation exited')
    this.options.coordinator.assertCanWrite(owner)
  }
  private cache(operation: ChatDatabaseOperation): void {
    if (this.operations.size >= 256 && !this.operations.has(operation.operationId)) {
      const expired = [...this.operations.keys()].find((id) => !this.jobs.has(id) && this.writer?.operationId !== id)
      if (!expired) throw new HbarError('MAINTENANCE_CAPACITY', 'Maintenance status capacity is exhausted')
      this.operations.delete(expired)
    }
    this.operations.set(operation.operationId, operation)
  }
  private started(owner: RuntimeOwner, version: RuntimeVersion, operation: ChatDatabaseOperation): void {
    this.assertOwner(owner)
    const existing = this.jobs.get(operation.operationId)
    if (existing?.owner.incarnation === owner.incarnation) return
    if (existing && !this.dead.has(existing.owner.incarnation))
      throw new HbarError('BUSY', 'Maintenance already belongs to a live executor')
    if (this.options.coordinator.role(owner) !== 'default')
      throw new HbarError('RUNTIME_DRAINING', 'Only the default admits new maintenance jobs')
    if (this.jobs.size >= 256 && !existing)
      throw new HbarError('MAINTENANCE_CAPACITY', 'Maintenance job ownership is exhausted')
    const resource = this.options.coordinator.acquireResource(owner, 'maintenance.job:' + operation.operationId)
    if (!resource) throw new HbarError('BUSY', 'The previous maintenance job still owns its physical lease')
    this.jobs.set(operation.operationId, { owner, version, resourceId: resource.id })
    this.cache(operation)
  }
  private async resume(): Promise<void> {
    const endpoint = this.options.current(),
      held = this.writer
    // Idle wake has its own exact ACK/cursor path; never substitute startup recovery.
    if (this.inspectionSeals.has(endpoint.owner.incarnation) || this.idleWake.has(endpoint.owner.incarnation)) return
    if (held) {
      if (!held.exited || !this.dead.has(held.owner.incarnation)) return
      const receipt = await endpoint.process.call(
        'maintenance.verifyWriter',
        { operationId: held.operationId },
        chatDatabaseVacuumRecordSchema,
        { timeoutMs: 120_000 },
      )
      const operation = await this.options.storage.call('chatDatabaseOperationUpdate', held.operationId, {
        status: receipt.status,
        stage: 'finished',
        processedCount: 1,
        deletedCount: Number(receipt.didVacuum),
        reclaimedBytes: receipt.reclaimedBytes,
        cancellationRequested: receipt.cancellationRequested,
        completedAt: receipt.status === 'unknown' ? null : receipt.updatedAt,
        error: receipt.error,
      })
      this.cache(operation)
      const job = this.jobs.get(held.operationId)
      if (job?.owner.incarnation === endpoint.owner.incarnation) {
        this.jobs.delete(held.operationId)
        this.options.coordinator.releaseResource(job.owner, job.resourceId)
      }
    }
    if (this.options.storage.snapshot().phase !== 'serving' || this.resumed.has(endpoint.owner.incarnation)) return
    const active = [...this.jobs.values()].some((job) => !this.dead.has(job.owner.incarnation))
    await endpoint.process.call('maintenance.resume', { recover: !active }, z.undefined(), { timeoutMs: 120_000 })
    // A physical exit may have cleared owner metadata while this RPC was pending.
    // Do not resurrect the retired incarnation when its known reply arrives late.
    if (this.dead.has(endpoint.owner.incarnation) || !this.sameOwner(this.options.current().owner, endpoint.owner))
      return
    this.resumed.add(endpoint.owner.incarnation)
  }
}
