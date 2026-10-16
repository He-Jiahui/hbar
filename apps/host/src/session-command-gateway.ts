import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { HbarError } from '@hbar/contracts'
import type { ExecutionOwnership } from '@hbar/contracts/runtime'
import type { CommandExecutionReceipt } from '@hbar/contracts/command-execution'
import { commandJobLogicalResultSchema } from '@hbar/commands/jobs'
import { createCommandExpectation } from '@hbar/commands'
import {
  sessionCommandCallSchema,
  sessionCommandPreparationSchema,
  sessionCommandToolResultSchema,
  SESSION_COMMAND_DIRECTORY_QUERY_IDS,
  type SessionCommandCall,
  type SessionCommandPreparation,
  type SessionCommandToolResult,
} from '@hbar/kernel/session-command-port'
import type { StoragePort } from '@hbar/storage'
import { SessionCommandAuthorization } from './session-command-authorization'
import type { SessionCommandDiscovery } from './session-command-discovery'
import type { SessionCommandExecution } from './session-command-execution'

const readCommands = new Set<string>(SESSION_COMMAND_DIRECTORY_QUERY_IDS)
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength
type ExecutionPort = Pick<SessionCommandExecution, 'execute' | 'wait'>

/** Host use case. Preparation has no execution effects; its signature fixes all final admission facts. */
export class SessionCommandGateway {
  private readonly secret = randomBytes(32)
  private readonly authorization: SessionCommandAuthorization
  constructor(
    private readonly options: {
      readonly storage: StoragePort
      readonly discovery: Pick<SessionCommandDiscovery, 'prepare'>
      readonly execution: () => ExecutionPort | undefined
      readonly assertSource: (source: ExecutionOwnership) => void
    },
  ) {
    this.authorization = new SessionCommandAuthorization(options.storage)
  }

  async prepare(
    source: ExecutionOwnership,
    callId: string,
    raw: SessionCommandCall,
    signal: AbortSignal,
  ): Promise<SessionCommandPreparation> {
    signal.throwIfAborted()
    this.options.assertSource(source)
    const call = sessionCommandCallSchema.parse(raw)
    if (bytes(call) > 262_144)
      throw new HbarError('INPUT_TOO_LARGE', 'The session command exceeds its tool input capacity')
    if (call.target)
      throw new HbarError(
        'COMMAND_TARGET_UNAVAILABLE',
        'Client and platform execution admission is not available on this gateway yet',
      )
    if (!readCommands.has(call.commandId))
      throw new HbarError(
        'COMMAND_ADMISSION_UNAVAILABLE',
        'This command needs a concrete admission rule before a session can execute it',
      )
    const identity = await this.authorization.source(source.sessionId, source.runId)
    const prepared = await this.options.discovery.prepare(
      {
        protocol: 1,
        requestId: `session-command-${createHash('sha256')
          .update(JSON.stringify([source.runId, callId]))
          .digest('hex')}`,
        commandId: call.commandId,
        commandVersion: call.commandVersion,
        idempotencyKey: `session-command-${createHash('sha256')
          .update(JSON.stringify([source.sessionId, identity.principal.actorId, call.operationKey]))
          .digest('hex')}`,
        input: call.input,
      },
      signal,
    )
    const metadata = prepared.descriptor.metadata
    if (
      metadata.id !== call.commandId ||
      metadata.version !== call.commandVersion ||
      metadata.owner !== 'hbar.core' ||
      metadata.kind !== 'query' ||
      metadata.stateEffect !== 'none' ||
      metadata.execution !== 'host' ||
      metadata.visibility === 'internal'
    )
      throw new HbarError(
        'COMMAND_ADMISSION_UNAVAILABLE',
        'The concrete command definition does not match its reviewed admission rule',
      )
    await this.authorization.authorize(source.sessionId, source.runId, prepared.descriptor, prepared.invocation)
    signal.throwIfAborted()
    this.options.assertSource(source)
    const argumentsValue = sessionCommandCallSchema.parse({
      ...call,
      input: JSON.parse(JSON.stringify(prepared.invocation.input)) as unknown,
    })
    const unsigned = sessionCommandPreparationSchema.omit({ signature: true }).parse({
      ...prepared,
      arguments: argumentsValue,
      admission: { effect: 'read', workspaceAccess: { kind: 'none' }, timeoutMs: metadata.timeoutMs },
    })
    if (bytes(unsigned) > 524_288)
      throw new HbarError('INPUT_TOO_LARGE', 'The prepared session command exceeds its capacity')
    return { ...unsigned, signature: this.signature(source, callId, unsigned) }
  }

  async execute(
    source: ExecutionOwnership,
    callId: string,
    raw: SessionCommandPreparation,
    signal: AbortSignal,
  ): Promise<SessionCommandToolResult> {
    signal.throwIfAborted()
    this.options.assertSource(source)
    const signed = sessionCommandPreparationSchema.parse(raw)
    if (bytes(signed) > 524_416)
      throw new HbarError('INPUT_TOO_LARGE', 'The prepared session command exceeds its capacity')
    const { signature, ...unsigned } = signed
    const expected = this.signature(source, callId, unsigned)
    if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex')))
      throw new HbarError(
        'COMMAND_PREPARATION_INVALID',
        'Command preparation no longer belongs to this Host, source Run and tool call',
      )
    const execution = this.options.execution()
    if (!execution)
      throw new HbarError(
        'COMMAND_EXECUTION_UNAVAILABLE',
        'The Host listener has not attached its command execution service',
      )
    const receipt = await execution.execute({
      source,
      callId,
      operationKey: signed.arguments.operationKey,
      prepared: signed,
      signal,
    })
    const settled = await execution.wait(source.sessionId, source.runId, signed.arguments.operationKey)
    return this.result(settled ?? receipt)
  }

  private signature(
    source: ExecutionOwnership,
    callId: string,
    value: Omit<SessionCommandPreparation, 'signature'>,
  ): string {
    const normalized = createCommandExpectation(value)
    return createHmac('sha256', this.secret)
      .update(JSON.stringify([source, callId, normalized, value.invocation, value.admission, value.arguments]))
      .digest('hex')
  }

  private result(receipt: CommandExecutionReceipt) {
    const common = {
      operationKey: receipt.operationKey,
      commandId: receipt.invocation.commandId,
      revision: receipt.revision,
      physical: receipt.physical?.status ?? 'pending',
      acknowledged: receipt.acknowledgedAt !== null,
      ...(receipt.uncertainty ? { reconciliation: receipt.uncertainty } : {}),
    }
    const logical = receipt.logical
    let status: string, content: object, isError: boolean
    if (!logical || logical.kind === 'unavailable') {
      status = 'unknown'
      isError = true
      content = {
        error: logical?.error ?? { code: 'RESULT_UNKNOWN', message: 'Read the original receipt before any replay' },
      }
    } else if (logical.kind === 'artifacts') {
      status = 'result_available'
      isError = !!receipt.uncertainty
      content = { resultReference: logical }
    } else {
      const outcome = commandJobLogicalResultSchema.parse(JSON.parse(logical.json) as unknown)
      status = outcome.ok ? 'succeeded' : 'failed'
      isError = !outcome.ok || !!receipt.uncertainty
      content = outcome.ok ? { result: outcome.result } : { error: outcome.error }
    }
    const text = JSON.stringify({ ...common, status, ...content })
    if (new TextEncoder().encode(text).byteLength > 131_072)
      throw new HbarError(
        'COMMAND_RESULT_TOO_LARGE',
        'Read the original receipt with a smaller command page; do not replay the operation',
      )
    return sessionCommandToolResultSchema.parse({ text, isError })
  }
}
