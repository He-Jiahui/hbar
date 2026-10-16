import { createHash } from 'node:crypto'
import { HbarError, type Device } from '@hbar/contracts'
import { deviceAccessOf } from '@hbar/contracts/device'
import {
  commandReceiptReadInputSchema,
  commandReceiptViewSchema,
  commandResultReadInputSchema,
  commandResultReadOutputSchema,
  type CommandReceiptReadInput,
  type CommandReceiptView,
  type CommandResultReadInput,
  type CommandResultReadOutput,
} from '@hbar/contracts/command-receipt-read'
import type {
  CommandExecutionReceipt,
  CommandReceiptPayload,
  CommandResultPage,
} from '@hbar/contracts/command-execution'
import type { StoragePort } from '@hbar/storage'
import { DeviceAuthorization } from './device-authorization'
import type { CommandResultPayloads } from './command-result-payloads'
import { restrictDirectoryReceiptPayload } from './command-result-view'

export const COMMAND_RECEIPT_READ_CHAIN_LIMIT = 8

function errorView(value: { code: string; message: string }) {
  let message = value.message.slice(0, 512)
  const last = message.charCodeAt(message.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) message = message.slice(0, -1)
  return {
    code: value.code,
    message: message || 'Command result unavailable',
    truncated: message.length < value.message.length,
  }
}
function payloadView(payload: CommandReceiptPayload) {
  if (payload.kind === 'unavailable') return { kind: payload.kind, error: errorView(payload.error) }
  if (payload.kind === 'artifacts') return { kind: payload.kind, bytes: payload.bytes, sha256: payload.sha256 }
  const bytes = new TextEncoder().encode(payload.json)
  return { kind: payload.kind, bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') }
}
function stamp(device: Device) {
  const access = deviceAccessOf(device)
  return JSON.stringify({
    role: access.role,
    workspaceIds: access.workspaceIds === null ? null : [...access.workspaceIds].sort(),
  })
}

/** Trusted callers supply their authenticated actor separately; no model-provided actor or artifact reference is accepted. */
export class CommandReceiptReader {
  private readonly authorization: DeviceAuthorization
  constructor(
    private readonly storage: StoragePort,
    private readonly payloads: CommandResultPayloads,
  ) {
    this.authorization = new DeviceAuthorization(storage, () => undefined)
  }
  private async device(actorId: string, sessionId: string): Promise<Device> {
    const device = await this.storage.call('deviceById', actorId)
    if (!device)
      throw new HbarError('COMMAND_PRINCIPAL_REVOKED', 'The device that owns this receipt is no longer paired')
    await this.authorization.assertSession(device, sessionId)
    return device
  }
  private async open(actorId: string, input: CommandReceiptReadInput, signal?: AbortSignal) {
    signal?.throwIfAborted()
    const device = await this.device(actorId, input.sessionId)
    const access = deviceAccessOf(device)
    const chain: CommandExecutionReceipt[] = []
    const seen = new Set<string>()
    const visit = async (identity: CommandReceiptReadInput): Promise<CommandExecutionReceipt | null> => {
      signal?.throwIfAborted()
      const key = JSON.stringify([identity.sessionId, identity.operationKey])
      if (seen.has(key))
        throw new HbarError('COMMAND_RESULT_CHAIN_CYCLE', 'Receipt reads cannot refer back to the same operation')
      if (chain.length >= COMMAND_RECEIPT_READ_CHAIN_LIMIT)
        throw new HbarError(
          'COMMAND_RESULT_CHAIN_LIMIT',
          'Read the original operation directly; the receipt reference chain is too long',
        )
      seen.add(key)
      await this.authorization.assertSession(device, identity.sessionId)
      const receipt = await this.storage.call('commandExecutionRead', { ...identity, actorId })
      if (!receipt) return null
      chain.push(receipt)
      await this.authorization.assertCommandResultTargets(device, receipt.expectation.descriptor, receipt.invocation)
      let view = receipt
      if (receipt.invocation.commandId === 'workspace.list' && access.workspaceIds !== null) {
        const allowed = new Set(access.workspaceIds)
        const [logical, physical] = await Promise.all([
          receipt.logical
            ? restrictDirectoryReceiptPayload(receipt.logical, 'logical', allowed, this.payloads, signal)
            : null,
          receipt.physical
            ? restrictDirectoryReceiptPayload(receipt.physical.payload, 'physical', allowed, this.payloads, signal)
            : null,
        ])
        view = {
          ...receipt,
          logical,
          physical: receipt.physical && physical ? { ...receipt.physical, payload: physical } : null,
        }
      }
      const id = receipt.invocation.commandId
      if (id === 'command.receipt.get' || id === 'command.result.read') {
        const reference =
          id === 'command.receipt.get'
            ? commandReceiptReadInputSchema.parse(receipt.invocation.input)
            : commandResultReadInputSchema.parse(receipt.invocation.input)
        const parent = await visit({ sessionId: reference.sessionId, operationKey: reference.operationKey })
        if (!parent)
          throw new HbarError(
            'COMMAND_RECEIPT_NOT_FOUND',
            'The referenced original receipt is unavailable; query the original operation directly',
          )
        const payloads =
          'channel' in reference
            ? [reference.channel === 'logical' ? parent.logical : parent.physical?.payload]
            : [parent.logical, parent.physical?.payload]
        if (payloads.some((payload) => payload?.kind === 'unavailable'))
          throw new HbarError(
            'COMMAND_RECEIPT_ACCESS_CHANGED',
            'The referenced result cannot be verified under current access; query the original operation directly',
          )
      }
      signal?.throwIfAborted()
      return view
    }
    let receipt: CommandExecutionReceipt | null
    try {
      receipt = await visit(input)
    } catch (error) {
      const original = chain[0]
      if (original) await this.verify(actorId, original, stamp(device), chain, signal)
      throw error
    }
    if (!receipt) return null
    signal?.throwIfAborted()
    return { receipt, accessStamp: stamp(device), chain }
  }
  private async verify(
    actorId: string,
    receipt: CommandExecutionReceipt,
    expectedStamp: string,
    chain: readonly CommandExecutionReceipt[],
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted()
    const current = await this.device(actorId, receipt.sessionId)
    if (stamp(current) !== expectedStamp)
      throw new HbarError(
        'COMMAND_RESULT_VIEW_CHANGED',
        'The current receipt access changed; read again from offset zero',
      )
    for (const ancestor of chain) {
      signal?.throwIfAborted()
      await this.authorization.assertSession(current, ancestor.sessionId)
      await this.authorization.assertCommandResultTargets(current, ancestor.expectation.descriptor, ancestor.invocation)
    }
    signal?.throwIfAborted()
  }
  /** Host-only raw view for original receipt reconciliation; public commands expose only get/page DTOs. */
  async readReceipt(
    actorId: string,
    raw: CommandReceiptReadInput,
    signal?: AbortSignal,
  ): Promise<CommandExecutionReceipt | null> {
    const opened = await this.open(actorId, commandReceiptReadInputSchema.parse(raw), signal)
    if (!opened) return null
    await this.verify(actorId, opened.receipt, opened.accessStamp, opened.chain, signal)
    return opened.receipt
  }
  async get(actorId: string, raw: CommandReceiptReadInput, signal?: AbortSignal): Promise<CommandReceiptView | null> {
    const input = commandReceiptReadInputSchema.parse(raw)
    const opened = await this.open(actorId, input, signal)
    if (!opened) return null
    const { receipt, accessStamp, chain } = opened
    await this.verify(actorId, receipt, accessStamp, chain, signal)
    return commandReceiptViewSchema.parse({
      version: 1,
      sessionId: receipt.sessionId,
      actorId: receipt.actorId,
      operationKey: receipt.operationKey,
      runId: receipt.runId,
      callId: receipt.callId,
      commandId: receipt.invocation.commandId,
      commandVersion: receipt.invocation.commandVersion,
      revision: receipt.revision,
      createdAt: receipt.createdAt,
      updatedAt: receipt.updatedAt,
      owner: receipt.owner,
      logical: receipt.logical ? payloadView(receipt.logical) : null,
      physical: receipt.physical
        ? {
            status: receipt.physical.status,
            executionStarted: receipt.physical.executionStarted,
            payload: payloadView(receipt.physical.payload),
          }
        : null,
      uncertainty: receipt.uncertainty ? errorView(receipt.uncertainty) : null,
      acknowledgedAt: receipt.acknowledgedAt,
    })
  }
  async page(actorId: string, raw: CommandResultReadInput, signal?: AbortSignal): Promise<CommandResultReadOutput> {
    const input = commandResultReadInputSchema.parse(raw)
    const opened = await this.open(actorId, { sessionId: input.sessionId, operationKey: input.operationKey }, signal)
    if (!opened) throw new HbarError('COMMAND_RECEIPT_NOT_FOUND', 'The original command receipt is unavailable')
    const { receipt, accessStamp, chain } = opened
    const payload = input.channel === 'logical' ? receipt.logical : receipt.physical?.payload
    if (!payload) throw new HbarError('COMMAND_RESULT_PENDING', 'This command result channel has not been committed')
    let page: CommandResultPage
    try {
      page = await this.payloads.readPage(
        payload,
        {
          offset: input.offset,
          limit: input.limit,
          ...(input.expectedSha256 !== undefined ? { expectedSha256: input.expectedSha256 } : {}),
        },
        signal,
      )
    } finally {
      await this.verify(actorId, receipt, accessStamp, chain, signal)
    }
    return commandResultReadOutputSchema.parse({
      sessionId: receipt.sessionId,
      actorId: receipt.actorId,
      operationKey: receipt.operationKey,
      commandId: receipt.invocation.commandId,
      commandVersion: receipt.invocation.commandVersion,
      revision: receipt.revision,
      channel: input.channel,
      physicalStatus: receipt.physical?.status ?? null,
      acknowledged: receipt.acknowledgedAt !== null,
      uncertainty: receipt.uncertainty ? errorView(receipt.uncertainty) : null,
      page,
    })
  }
}
