import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { CommandError, describeCommand, invocationSchema, type CommandExecutionExpectation, type CommandPreparedOptions } from '@hbar/commands'
import { commandJobStartSchema, commandJobSnapshotSchema } from '@hbar/commands/jobs'
import { chatDatabaseCommands, chatDatabaseOperationSchema, chatDatabasePreviewItemSchema, type ChatDatabaseOperation } from '@hbar/contracts/commands/chat-database'
import { settingsScopeSchema } from '@hbar/contracts/commands/settings'
import type { RuntimeOwner, RuntimeVersion } from '@hbar/contracts/runtime'
import type { KernelControllerPort } from '@hbar/kernel/controller'
import { RuntimeValuePort, procedure, type IpcPeer, type ManagedProcess, type RuntimeCoordinator } from '@hbar/runtime'
import { storageRpcCallSchema, chatDatabaseVacuumRecordSchema, createChatDatabaseVacuumRecords, type StableStoragePort, type PathLayout } from '@hbar/storage'
import type { RuntimeMaintenancePort } from './runtime-maintenance-contract'
import { trackRuntimeCommandJob, type RuntimeCommandJobTicket } from './runtime-command-jobs'

export interface RuntimeMaintenanceEndpoint {
  readonly owner: RuntimeOwner
  readonly version: RuntimeVersion
  readonly process: ManagedProcess
}
interface Job { readonly owner: RuntimeOwner; readonly version: RuntimeVersion; readonly resourceId: string }
interface Writer { readonly operationId: string; owner: RuntimeOwner; readonly storageOwner: RuntimeOwner; exited: boolean }
const id = z.string().min(1).max(160), number = z.number().int().nonnegative().safe()
const operationIdSchema = z.strictObject({ operationId: id })
const removalSchema = z.strictObject({ sessionId: id, operationId: id, expectedSeq: number, expectedActivityAt: number })
const resourceSchema = z.strictObject({ operationId: id, scope: settingsScopeSchema, item: chatDatabasePreviewItemSchema, cutoffAt: number })

/** Cross-generation job routing, a single maintenance gate, and verified physical writer handoff live in the stable base. */
export class RuntimeMaintenanceRelay implements RuntimeMaintenancePort {
  private readonly jobs = new Map<string, Job>()
  private readonly operations = new Map<string, ChatDatabaseOperation>()
  private readonly receipts = new Map<string, string>()
  private readonly dead = new Set<string>()
  private readonly resumed = new Set<string>()
  private readonly waiting = new Set<() => void>()
  private writer: Writer | null = null
  private reconciling: Promise<void> | undefined
  private readonly commandLifetime = new AbortController()
  constructor(private readonly options: {
    readonly storage: StableStoragePort
    readonly coordinator: RuntimeCoordinator
    readonly kernel: KernelControllerPort
    readonly layout: PathLayout
    readonly current: () => RuntimeMaintenanceEndpoint
    readonly resolve: (owner: RuntimeOwner) => RuntimeMaintenanceEndpoint
    readonly changed: () => void
  }) {}
  isWriting(): boolean { return this.writer !== null }
  describe(commandId: string) {
    const definition = Object.values(chatDatabaseCommands).find(definition => definition.metadata.id === commandId)
    if (!definition) throw new HbarError('COMMAND_NOT_FOUND', 'Maintenance command is not registered')
    return describeCommand(definition)
  }
  dispose(): void { this.commandLifetime.abort() }
  list() { return { revision: 1, items: Object.values(chatDatabaseCommands).map(describeCommand) } }
  readonly dispatch = async (value: unknown, actorId: string): Promise<unknown> => {
    return this.dispatchOwned(value, actorId)
  }
  readonly dispatchPrepared = (value: unknown, actorId: string, expectation: CommandExecutionExpectation, options: CommandPreparedOptions = {}): Promise<unknown> =>
    this.dispatchOwned(value, actorId, expectation, options)
  readonly dispatchPreparedTracked = (
    value: unknown,
    actorId: string,
    expectation: CommandExecutionExpectation,
    options: CommandPreparedOptions = {},
  ): RuntimeCommandJobTicket => {
    if (this.commandLifetime.signal.aborted || options.signal?.aborted)
      throw new CommandError('CANCELLED', 'Maintenance command cancelled before admission')
    const { invocation, endpoint } = this.destination(value, actorId)
    const jobId = crypto.randomUUID()
    const input = commandJobStartSchema.parse({ jobId, actorId, invocation, expectation })
    const resource = this.options.coordinator.acquireResource(endpoint.owner, `maintenance.command.job:${jobId}`)
    if (!resource) throw new CommandError('BUSY', 'Maintenance command already retains its owner')
    const release = () => this.options.coordinator.releaseResource(endpoint.owner, resource.id)
    try {
      return trackRuntimeCommandJob(
        endpoint.process,
        { jobId, actorId },
        (signal) => endpoint.process.call('maintenance.command.start', input, commandJobSnapshotSchema, {
          signal, timeoutMs: 30_000,
        }),
        {
          signal: options.signal,
          lifetime: this.commandLifetime.signal,
          onAcknowledged: release,
        },
      )
    } catch (error) {
      release()
      throw error
    }
  }
  private destination(value: unknown, actorId: string) {
    const invocation = invocationSchema.parse(value)
    this.describe(invocation.commandId)
    const target = z.object({ operationId: id.optional(), previewId: id.optional(), idempotencyKey: id.optional() }).safeParse(invocation.input)
    const operationId = target.success ? target.data.operationId ?? target.data.previewId ??
      (target.data.idempotencyKey ? this.receipts.get(`${actorId}:${target.data.idempotencyKey}`) : undefined) : undefined
    const job = operationId ? this.jobs.get(operationId) : undefined
    const endpoint = job && !this.dead.has(job.owner.incarnation) ? this.options.resolve(job.owner) : this.options.current()
    return { invocation, endpoint }
  }
  private async dispatchOwned(value: unknown, actorId: string, expectation?: CommandExecutionExpectation, options: CommandPreparedOptions = {}): Promise<unknown> {
    const { invocation, endpoint } = this.destination(value, actorId)
    const control = ['chatDatabase.cancel', 'chatDatabase.operation', 'chatDatabase.receipt'].includes(invocation.commandId)
    return endpoint.process.call(control ? 'maintenance.control' : 'maintenance.dispatch', { invocation, actorId, ...(expectation ? { expectation } : {}) }, z.unknown(), options)
  }
  attach(peer: IpcPeer, owner: RuntimeOwner, version: RuntimeVersion): () => void {
    const values = new RuntimeValuePort(peer, { prefix: 'maintenance.application' })
    const kernel = this.options.kernel
    const checked = <Value>(action: () => Value): Value => { this.assertOwner(owner); return action() }
    values.register('domain.idle', () => checked(() => kernel.chatDatabaseIsIdle()))
    values.register('domain.protection', ([input]) => checked(() => kernel.chatDatabaseSessionProtection(id.parse(input))))
    values.register('domain.roots', () => checked(() => kernel.plugins.protectedResourceRoots()))
    values.register('domain.removeSession', ([input]) => checked(() => kernel.removeChatDatabaseSession(removalSchema.parse(input))))
    values.register('domain.removeResource', ([input]) => checked(() => kernel.removeChatDatabaseResource(resourceSchema.parse(input))))
    values.register('domain.deleted', ([ids, revision]) => checked(() => kernel.notifyChatDatabaseDeleted(z.array(id).max(100).parse(ids), number.parse(revision))))
    values.register('domain.maintain', ([action]) => checked(() => {
      if (typeof action !== 'function') throw new HbarError('INVALID_INPUT', 'Maintenance needs its named action port')
      return kernel.maintainChatDatabase(async () => {
        this.assertOwner(owner)
        const result: unknown = await Reflect.apply(action, undefined, [])
        return result
      })
    }))
    const cleanup = [
      peer.register('maintenance.storage', procedure(storageRpcCallSchema, z.unknown(), async input => {
        this.assertOwner(owner)
        if (input.authority) throw new HbarError('EXECUTION_OWNER_MISMATCH', 'Maintenance does not submit Run execution claims')
        if (input.method === 'chatDatabaseOperationAccept' && this.options.coordinator.role(owner) !== 'default')
          throw new HbarError('RUNTIME_DRAINING', 'New maintenance jobs use the default generation')
        if (this.writer) {
          if (input.method === 'chatDatabaseOperationRead') {
            const cached = this.operations.get(id.parse(input.args[0])); if (cached) return cached
          }
          throw new HbarError('BUSY', 'Database ownership is handed to the maintenance Worker')
        }
        const result = await this.options.storage.executeRpc(input)
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
      })),
      peer.register('maintenance.job.started', procedure(z.strictObject({ operation: chatDatabaseOperationSchema }), z.undefined(), async input => {
        this.assertOwner(owner)
        const saved = await this.options.storage.call('chatDatabaseOperationRead', input.operation.operationId)
        this.started(owner, version, saved)
      })),
      peer.register('maintenance.job.finished', procedure(operationIdSchema, z.undefined(), async input => {
        this.assertOwner(owner)
        const job = this.jobs.get(input.operationId)
        if (!job || job.owner.incarnation !== owner.incarnation) return
        if (this.writer?.operationId === input.operationId) throw new HbarError('STORAGE_RECONCILIATION_REQUIRED', 'The physical writer must finish verification before releasing its job')
        const operation = await this.options.storage.call('chatDatabaseOperationRead', input.operationId)
        if (!['completed', 'cancelled', 'failed', 'unknown'].includes(operation.status)) throw new HbarError('MAINTENANCE_NOT_FINISHED', 'Maintenance has no durable terminal state')
        this.cache(operation); this.jobs.delete(input.operationId)
        this.options.coordinator.releaseResource(owner, job.resourceId)
        this.options.changed()
      })),
      peer.register('maintenance.writer.begin', procedure(operationIdSchema, z.strictObject({ verificationOnly: z.boolean() }), async input => {
        this.assertOwner(owner)
        const held = this.writer
        if (held) {
          if (held.operationId !== input.operationId || !held.exited || !this.dead.has(held.owner.incarnation))
            throw new HbarError('STORAGE_RECONCILIATION_REQUIRED', 'The previous maintenance executor has not relinquished physical ownership')
          const operation = this.operations.get(input.operationId)
          if (!operation) throw new HbarError('STORAGE_RECONCILIATION_REQUIRED', 'The interrupted maintenance journal is missing')
          this.started(owner, version, operation)
          held.owner = owner
          return { verificationOnly: true }
        }
        this.options.kernel.assertIdle()
        if (this.options.coordinator.snapshot().claims) throw new HbarError('BUSY', 'Execution ownership claims have not settled')
        const job = this.jobs.get(input.operationId), storageOwner = this.options.storage.snapshot().owner
        if (!job || job.owner.incarnation !== owner.incarnation || !storageOwner) throw new HbarError('STORAGE_WRITER_UNAVAILABLE', 'An admitted maintenance job and current storage writer are required')
        this.writer = { operationId: input.operationId, owner, storageOwner, exited: false }
        this.options.changed()
        await this.options.storage.beginMaintenance(input.operationId)
        this.writer.exited = true
        return { verificationOnly: false }
      })),
      peer.register('maintenance.writer.end', procedure(z.strictObject({ operationId: id, receipt: chatDatabaseVacuumRecordSchema }), z.undefined(), async input => {
        this.assertOwner(owner)
        const held = this.writer, receipt = createChatDatabaseVacuumRecords(this.options.layout.sessions).read(input.operationId)
        if (!held || held.owner.incarnation !== owner.incarnation || held.operationId !== input.operationId || !held.exited ||
          this.options.storage.snapshot().owner?.incarnation !== held.storageOwner.incarnation ||
          !receipt?.integrityVerified || input.receipt.operationId !== input.operationId || JSON.stringify(receipt) !== JSON.stringify(input.receipt))
          throw new HbarError('STORAGE_RECONCILIATION_REQUIRED', 'Maintenance needs its exact verified durable receipt')
        await this.options.storage.endMaintenance(input.operationId)
        this.writer = null
        for (const notify of this.waiting) notify()
        this.options.changed()
      })),
    ]
    return () => { for (const dispose of cleanup) dispose(); values.dispose() }
  }
  exited(owner: RuntimeOwner): void {
    if (owner.unitId !== 'maintenance') return
    this.dead.add(owner.incarnation); this.resumed.delete(owner.incarnation)
    if (this.dead.size > 1_536) for (const incarnation of this.dead) {
      if (![...this.jobs.values()].some(job => job.owner.incarnation === incarnation) && this.writer?.owner.incarnation !== incarnation) { this.dead.delete(incarnation); break }
    }
  }
  reconcile(): Promise<void> {
    this.reconciling ??= this.resume().finally(() => { this.reconciling = undefined })
    return this.reconciling
  }
  async waitForWriter(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    if (!this.writer) return
    if (this.waiting.size >= 32) throw new HbarError('RUNTIME_PREPARATION_CAPACITY', 'Too many versions are waiting for the maintenance writer')
    await new Promise<void>((resolve, reject) => {
      const complete = () => { this.waiting.delete(complete); signal.removeEventListener('abort', cancel); resolve() }
      const cancel = () => { this.waiting.delete(complete); signal.removeEventListener('abort', cancel); reject(new HbarError('RUNTIME_CANCELLED', 'Waiting for maintenance ownership was cancelled')) }
      this.waiting.add(complete); signal.addEventListener('abort', cancel, { once: true })
      if (signal.aborted) cancel()
    })
  }
  private assertOwner(owner: RuntimeOwner): void {
    if (this.dead.has(owner.incarnation)) throw new HbarError('EXECUTION_OWNER_REVOKED', 'The maintenance incarnation exited')
    this.options.coordinator.assertCanWrite(owner)
  }
  private cache(operation: ChatDatabaseOperation): void {
    if (this.operations.size >= 256 && !this.operations.has(operation.operationId)) {
      const expired = [...this.operations.keys()].find(id => !this.jobs.has(id) && this.writer?.operationId !== id)
      if (!expired) throw new HbarError('MAINTENANCE_CAPACITY', 'Maintenance status capacity is exhausted')
      this.operations.delete(expired)
    }
    this.operations.set(operation.operationId, operation)
  }
  private started(owner: RuntimeOwner, version: RuntimeVersion, operation: ChatDatabaseOperation): void {
    this.assertOwner(owner)
    const existing = this.jobs.get(operation.operationId)
    if (existing?.owner.incarnation === owner.incarnation) return
    if (existing && !this.dead.has(existing.owner.incarnation)) throw new HbarError('BUSY', 'Maintenance already belongs to a live executor')
    if (this.options.coordinator.role(owner) !== 'default') throw new HbarError('RUNTIME_DRAINING', 'Only the default admits new maintenance jobs')
    if (this.jobs.size >= 256 && !existing) throw new HbarError('MAINTENANCE_CAPACITY', 'Maintenance job ownership is exhausted')
    const resource = this.options.coordinator.acquireResource(owner, 'maintenance.job:' + operation.operationId)
    if (!resource) throw new HbarError('BUSY', 'The previous maintenance job still owns its physical lease')
    this.jobs.set(operation.operationId, { owner, version, resourceId: resource.id }); this.cache(operation)
  }
  private async resume(): Promise<void> {
    const endpoint = this.options.current(), held = this.writer
    if (held) {
      if (!held.exited || !this.dead.has(held.owner.incarnation)) return
      const receipt = await endpoint.process.call('maintenance.verifyWriter', { operationId: held.operationId }, chatDatabaseVacuumRecordSchema, { timeoutMs: 120_000 })
      const operation = await this.options.storage.call('chatDatabaseOperationUpdate', held.operationId, {
        status: receipt.status, stage: 'finished', processedCount: 1, deletedCount: Number(receipt.didVacuum),
        reclaimedBytes: receipt.reclaimedBytes, cancellationRequested: receipt.cancellationRequested,
        completedAt: receipt.status === 'unknown' ? null : receipt.updatedAt, error: receipt.error,
      })
      this.cache(operation)
      const job = this.jobs.get(held.operationId)
      if (job?.owner.incarnation === endpoint.owner.incarnation) {
        this.jobs.delete(held.operationId); this.options.coordinator.releaseResource(job.owner, job.resourceId)
      }
    }
    if (this.options.storage.snapshot().phase !== 'serving' || this.resumed.has(endpoint.owner.incarnation)) return
    const active = [...this.jobs.values()].some(job => !this.dead.has(job.owner.incarnation))
    await endpoint.process.call('maintenance.resume', { recover: !active }, z.undefined(), { timeoutMs: 120_000 })
    this.resumed.add(endpoint.owner.incarnation)
  }
}
