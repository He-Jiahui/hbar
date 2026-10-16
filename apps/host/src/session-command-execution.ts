import { createHash } from 'node:crypto'
import { HbarError } from '@hbar/contracts'
import { deviceAccessOf } from '@hbar/contracts/device'
import { workspacePageSchema } from '@hbar/contracts/directory'
import { commandJobLogicalResultSchema } from '@hbar/commands/jobs'
import {
  commandExecutionIntentSchema,
  type CommandExecutionIdentity,
  type CommandExecutionIntent,
  type CommandExecutionReceipt,
  type CommandExecutionUpdate,
  type CommandReceiptPayload,
  type CommandExecutionOwner,
} from '@hbar/contracts/command-execution'
import { executionOwnershipSchema, type ExecutionOwnership } from '@hbar/contracts/runtime'
import {
  CommandError,
  createCommandExpectation,
  commandPhysicalSettlementSchema,
  type CommandExecutionTicket,
  type CommandPreparation,
  type TrackedCommandRoutingPort,
} from '@hbar/commands'
import type { StoragePort } from '@hbar/storage'
import { HostCommandExecutionScopes, type HostSourceApplication } from './command-execution-scopes'
import { CommandResultPayloads } from './command-result-payloads'
import { SessionCommandAuthorization } from './session-command-authorization'
import { CommandJobPayloadUnavailable } from './runtime-command-jobs'

export interface SessionCommandExecutionRequest {
  readonly source: ExecutionOwnership
  readonly callId: string
  readonly operationKey: string
  readonly prepared: CommandPreparation
  readonly signal?: AbortSignal
  readonly application?: HostSourceApplication
}
interface ActiveCommand {
  receipt: CommandExecutionReceipt | null
  serial: Promise<void>
  readonly delivered: {
    readonly promise: Promise<CommandExecutionReceipt>
    resolve(receipt: CommandExecutionReceipt): void
    reject(error: unknown): void
  }
  completion: Promise<void> | null
  ticket: CommandExecutionTicket | null
  owner: CommandExecutionOwner | null
  monitor: (() => Promise<void>) | null
  ownerTrackingFailed: boolean
}
const errorFact = (error: unknown) => ({
  code:
    error instanceof HbarError || error instanceof CommandError
      ? error.code.slice(0, 128) || 'EXECUTION_FAILED'
      : 'EXECUTION_FAILED',
  message:
    error instanceof HbarError || error instanceof CommandError
      ? error.message.slice(0, 8_192) || 'Command execution failed'
      : 'Command execution failed',
})
const keyOf = (identity: CommandExecutionIdentity) =>
  createHash('sha256')
    .update(JSON.stringify([identity.sessionId, identity.actorId, identity.operationKey]))
    .digest('hex')

/** Host application service. It persists acceptance/ownership/outcomes before releasing a real executor. */
export class SessionCommandExecution {
  private readonly active = new Map<string, ActiveCommand>()
  private readonly authorization: SessionCommandAuthorization
  constructor(
    private readonly options: {
      readonly storage: StoragePort
      readonly routing: TrackedCommandRoutingPort
      readonly scopes: HostCommandExecutionScopes
      readonly payloads: CommandResultPayloads
      readonly assertSource: (source: ExecutionOwnership) => void
    },
  ) {
    this.authorization = new SessionCommandAuthorization(options.storage)
  }

  async execute(request: SessionCommandExecutionRequest): Promise<CommandExecutionReceipt> {
    const source = executionOwnershipSchema.parse(request.source)
    request.signal?.throwIfAborted()
    const authorized = await this.authorization.authorize(
      source.sessionId,
      source.runId,
      request.prepared.descriptor,
      request.prepared.invocation,
    )
    const intent = commandExecutionIntentSchema.parse({
      sessionId: source.sessionId,
      actorId: authorized.principal.actorId,
      runId: source.runId,
      operationKey: request.operationKey,
      callId: request.callId,
      invocation: request.prepared.invocation,
      expectation: createCommandExpectation(request.prepared),
    })
    const key = keyOf(intent)
    const existing = this.active.get(key)
    if (existing) {
      await this.options.storage.call('commandExecutionAccept', intent)
      return this.deliver(
        source,
        request.operationKey,
        existing.receipt?.logical ? existing.receipt : existing.delivered.promise,
      )
    }
    if (this.active.size >= 64) throw new HbarError('BUSY', 'Session command execution capacity is full')
    const entry: ActiveCommand = {
      receipt: null,
      serial: Promise.resolve(),
      delivered: Promise.withResolvers(),
      completion: null,
      ticket: null,
      owner: null,
      monitor: null,
      ownerTrackingFailed: false,
    }
    void entry.delivered.promise.catch(() => undefined)
    this.active.set(key, entry)
    try {
      const prior = await this.options.storage.call('commandExecutionRead', {
        sessionId: intent.sessionId,
        actorId: intent.actorId,
        operationKey: intent.operationKey,
      })
      if (!prior) await this.assertReconciled(intent)
      const accepted = await this.options.storage.call('commandExecutionAccept', intent)
      entry.receipt = accepted.receipt
      if (!accepted.created) {
        if (!entry.receipt.physical && !entry.receipt.uncertainty)
          await this.change(entry, {
            kind: 'uncertain',
            error: {
              code: 'RESULT_UNKNOWN',
              message: 'The original executor must be reconciled before any command replay',
            },
          })
        entry.delivered.resolve(entry.receipt)
        this.active.delete(key)
      } else {
        this.options.assertSource(source)
        const ticket = this.options.scopes.run(
          {
            source,
            callId: request.callId,
            ...(request.application ? { application: request.application } : {}),
            beforeStart: async (owner, signal) => {
              entry.owner = owner
              signal.throwIfAborted()
              this.options.assertSource(source)
              await this.assertReconciled(intent)
              await this.authorization.authorize(
                source.sessionId,
                source.runId,
                intent.expectation.descriptor,
                intent.invocation,
              )
              signal.throwIfAborted()
              await this.change(entry, { kind: 'bind', owner })
              signal.throwIfAborted()
              this.options.assertSource(source)
            },
          },
          () =>
            this.options.routing.executePreparedTracked(
              intent.invocation,
              intent.actorId,
              intent.expectation,
              request.signal ? { signal: request.signal } : {},
            ),
        )
        entry.ticket = ticket
        entry.monitor = async () => {
          const observed = entry.ticket ?? ticket
          const logicalSource = { ...intent, channel: 'logical' as const }
          const physicalSource = { ...intent, channel: 'physical' as const }
          const logical = entry.receipt?.logical
            ? this.options.payloads.release(entry.receipt.logical, logicalSource)
            : observed.result
                .then(async (result) => ({
                  ok: true as const,
                  result: await this.authorization.projectResult(
                    source.sessionId,
                    source.runId,
                    intent.expectation.descriptor,
                    intent.invocation,
                    result,
                  ),
                }))
                .catch((error: unknown) => ({ ok: false as const, error: errorFact(error) }))
                .then((value) => this.options.payloads.save(value, logicalSource))
                .then(async (payload) => {
                  await this.change(entry, { kind: 'logical', payload })
                  await this.options.payloads.release(payload, logicalSource)
                })
          void logical.then(
            () => {
              if (entry.receipt) entry.delivered.resolve(entry.receipt)
            },
            (error) => entry.delivered.reject(error),
          )
          const physical = entry.receipt?.physical
            ? this.options.payloads.release(entry.receipt.physical.payload, physicalSource)
            : observed.settled
                .then(
                  async (raw) => {
                    const actual = commandPhysicalSettlementSchema.parse(raw)
                    let payload: CommandReceiptPayload
                    let value: unknown = actual
                    if (actual.status === 'succeeded') {
                      try {
                        value = {
                          ...actual,
                          result: await this.authorization.projectResult(
                            source.sessionId,
                            source.runId,
                            intent.expectation.descriptor,
                            intent.invocation,
                            actual.result,
                          ),
                        }
                      } catch (error) {
                        payload = { kind: 'unavailable', error: errorFact(error) }
                        return { status: actual.status, executionStarted: actual.executionStarted, payload }
                      }
                    }
                    payload = await this.options.payloads.save(value, physicalSource)
                    return { status: actual.status, executionStarted: actual.executionStarted, payload }
                  },
                  (error: unknown) => {
                    if (!(error instanceof CommandJobPayloadUnavailable)) {
                      entry.ownerTrackingFailed = true
                      throw error
                    }
                    return { ...error.physical, payload: { kind: 'unavailable' as const, error: errorFact(error) } }
                  },
                )
                .then(async (value) => {
                  await this.change(entry, { kind: 'settled', physical: value })
                  await this.options.payloads.release(value.payload, physicalSource)
                })
          await Promise.allSettled([logical, physical])
            .then((results) => {
              for (const result of results) if (result.status === 'rejected') throw result.reason
            })
            .then(async () => {
              if (!observed.acknowledge)
                throw new HbarError(
                  'COMMAND_ACKNOWLEDGMENT_REQUIRED',
                  'The command executor has no saved-receipt acknowledgment',
                )
              await observed.acknowledge()
              await this.change(entry, { kind: 'acknowledged' })
              this.active.delete(key)
            })
            .catch(async (error) => {
              if (['COMMAND_JOB_ACTIVE', 'COMMAND_JOB_INVALID'].includes(errorFact(error).code))
                entry.ownerTrackingFailed = true
              if (entry.receipt) await this.change(entry, { kind: 'uncertain', error: errorFact(error) })
              if (!entry.receipt?.logical) entry.delivered.reject(error)
            })
        }
        entry.completion = entry.monitor()
        void entry.completion.catch(() => {
          /* A failed persistence path keeps the original ticket retained for reconciliation. */
        })
      }
    } catch (error) {
      if (!entry.ticket) {
        if (entry.receipt) {
          try {
            await this.change(entry, { kind: 'uncertain', error: errorFact(error) })
          } catch {
            // Acceptance remains canonical even if the failure annotation itself needs later reconciliation.
          }
        }
        this.active.delete(key)
      }
      entry.delivered.reject(error)
      throw error
    }
    return this.deliver(source, request.operationKey, entry.delivered.promise)
  }
  async read(sessionId: string, runId: string, operationKey: string): Promise<CommandExecutionReceipt | null> {
    const source = await this.authorization.source(sessionId, runId)
    const receipt = await this.options.storage.call('commandExecutionRead', {
      sessionId,
      actorId: source.principal.actorId,
      operationKey,
    })
    if (!receipt) return null
    const access = deviceAccessOf(
      (await this.authorization.authorize(sessionId, runId, receipt.expectation.descriptor, receipt.invocation)).device,
    )
    if (receipt.invocation.commandId !== 'workspace.list' || access.workspaceIds === null) return receipt
    const allowed = new Set(access.workspaceIds)
    return {
      ...receipt,
      logical: receipt.logical ? await this.visibleDirectoryPayload(receipt.logical, 'logical', allowed) : null,
      physical: receipt.physical
        ? {
            ...receipt.physical,
            payload: await this.visibleDirectoryPayload(receipt.physical.payload, 'physical', allowed),
          }
        : null,
    }
  }
  async wait(sessionId: string, runId: string, operationKey: string): Promise<CommandExecutionReceipt | null> {
    const receipt = await this.read(sessionId, runId, operationKey)
    if (!receipt) return null
    const entry = this.active.get(keyOf(receipt))
    await entry?.completion
    return this.read(sessionId, runId, operationKey)
  }
  async reconcile(sessionId: string, runId: string, operationKey: string): Promise<CommandExecutionReceipt | null> {
    const receipt = await this.read(sessionId, runId, operationKey)
    if (!receipt) return null
    const entry = this.active.get(keyOf(receipt))
    await entry?.completion
    if (entry?.monitor && this.active.get(keyOf(receipt)) === entry) {
      if (entry.ownerTrackingFailed && entry.ticket?.follow) {
        entry.ownerTrackingFailed = false
        entry.ticket = entry.ticket.follow()
      }
      entry.completion = entry.monitor()
      await entry.completion
    }
    return this.read(sessionId, runId, operationKey)
  }
  assertCanClose(): void {
    if (this.active.size)
      throw new HbarError(
        'HOST_COMMANDS_ACTIVE',
        'Session command outcomes still require saved acknowledgment or reconciliation',
      )
  }
  private async assertReconciled(intent: CommandExecutionIntent): Promise<void> {
    if (intent.expectation.descriptor.metadata.stateEffect === 'none') return
    const pending = await this.options.storage.call('commandExecutionPending', intent.sessionId)
    const current = keyOf(intent)
    for (const item of pending.items) {
      if (keyOf(item) === current) continue
      const active = this.active.get(keyOf(item))
      if (
        item.reason === 'pending' &&
        active?.receipt?.runId === intent.runId &&
        !active.receipt.logical &&
        !active.receipt.uncertainty &&
        !active.ownerTrackingFailed
      )
        continue
      throw new HbarError(
        'COMMAND_RESULT_UNCONFIRMED',
        'An earlier command in this session requires result reconciliation before new mutations',
      )
    }
    if (pending.hasMore)
      throw new HbarError(
        'COMMAND_RESULT_UNCONFIRMED',
        'Additional unconfirmed commands require reconciliation before new mutations',
      )
  }
  private async deliver(
    source: ExecutionOwnership,
    operationKey: string,
    value: CommandExecutionReceipt | Promise<CommandExecutionReceipt>,
  ): Promise<CommandExecutionReceipt> {
    await value
    const receipt = await this.read(source.sessionId, source.runId, operationKey)
    if (!receipt) throw new HbarError('COMMAND_RECEIPT_REQUIRED', 'The saved command result is unavailable')
    return receipt
  }
  private async visibleDirectoryPayload(
    payload: CommandReceiptPayload,
    channel: 'logical' | 'physical',
    allowed: ReadonlySet<string>,
  ): Promise<CommandReceiptPayload> {
    if (payload.kind === 'unavailable') return payload
    try {
      const data = await this.options.payloads.read(payload)
      const outcome =
        channel === 'logical' ? commandJobLogicalResultSchema.parse(data) : commandPhysicalSettlementSchema.parse(data)
      if (!('result' in outcome)) return payload
      const result = workspacePageSchema.parse(outcome.result)
      if (
        result.items.every((item) => allowed.has(item.id)) &&
        (result.nextCursor === null || allowed.has(result.nextCursor))
      )
        return payload
      return {
        kind: 'unavailable',
        error: {
          code: 'COMMAND_RECEIPT_ACCESS_CHANGED',
          message: 'The saved directory result exceeds the device current workspace access',
        },
      }
    } catch (error) {
      return { kind: 'unavailable', error: errorFact(error) }
    }
  }
  private async change(entry: ActiveCommand, change: CommandExecutionUpdate['change']): Promise<void> {
    const action = entry.serial.then(async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const receipt = entry.receipt
        if (!receipt) throw new HbarError('COMMAND_RECEIPT_REQUIRED', 'Command acceptance has not been saved')
        const identity = { sessionId: receipt.sessionId, actorId: receipt.actorId, operationKey: receipt.operationKey }
        try {
          if (!receipt.owner && entry.owner && (change.kind === 'logical' || change.kind === 'settled'))
            entry.receipt = await this.options.storage.call('commandExecutionUpdate', {
              ...identity,
              expectedRevision: receipt.revision,
              change: { kind: 'bind', owner: entry.owner },
            })
          entry.receipt = await this.options.storage.call('commandExecutionUpdate', {
            ...identity,
            expectedRevision: entry.receipt?.revision ?? receipt.revision,
            change,
          })
          return
        } catch (error) {
          if (!(error instanceof HbarError) || error.code !== 'COMMAND_RECEIPT_REVISION_CONFLICT' || attempt === 3)
            throw error
          entry.receipt = await this.options.storage.call('commandExecutionRead', identity)
        }
      }
    })
    entry.serial = action.catch(() => undefined)
    return action
  }
}
