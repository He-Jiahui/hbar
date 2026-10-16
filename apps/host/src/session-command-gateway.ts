import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { HbarError } from '@hbar/contracts'
import type { ExecutionOwnership } from '@hbar/contracts/runtime'
import type { CommandExecutionReceipt } from '@hbar/contracts/command-execution'
import { commandJobLogicalResultSchema } from '@hbar/commands/jobs'
import { createCommandExpectation } from '@hbar/commands'
import { sessionFileTargetSchema } from '@hbar/contracts/commands/files'
import {
  sessionCommandCallSchema,
  sessionCommandPreparationSchema,
  sessionCommandToolResultSchema,
  SESSION_COMMAND_DIRECTORY_QUERY_IDS,
  SESSION_COMMAND_FILE_IDS,
  SESSION_COMMAND_DECISION_READ_IDS,
  type SessionCommandCall,
  type SessionCommandPreparation,
  type SessionCommandToolResult,
} from '@hbar/kernel/session-command-port'
import type { StoragePort } from '@hbar/storage'
import { SessionCommandAuthorization } from './session-command-authorization'
import { bindSessionGitInput, sessionGitCommand } from './session-command-git'
import { bindInteractionSession, sessionInteractionCommand } from './session-command-interaction'
import type { SessionCommandDiscovery } from './session-command-discovery'
import type { SessionCommandExecution } from './session-command-execution'
import type { HostSourceApplication } from './command-execution-scopes'

const readCommands = new Set<string>(SESSION_COMMAND_DIRECTORY_QUERY_IDS)
const fileCommands = new Set<string>(SESSION_COMMAND_FILE_IDS)
const decisionQueries = new Set<string>(SESSION_COMMAND_DECISION_READ_IDS)
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
    const file = fileCommands.has(call.commandId)
    const decision = decisionQueries.has(call.commandId)
    const git = sessionGitCommand(call.commandId, call.input)
    const interaction = sessionInteractionCommand(call.commandId, call.input)
    const fileWrite = call.commandId === 'file.write'
    if (!readCommands.has(call.commandId) && !file && !decision && !git && !interaction)
      throw new HbarError(
        'COMMAND_ADMISSION_UNAVAILABLE',
        'This command needs a concrete admission rule before a session can execute it',
      )
    const identity = await this.authorization.source(source.sessionId, source.runId)
    let input = call.input
    if (git) input = sessionCommandCallSchema.shape.input.parse(bindSessionGitInput(source, call.commandId, input))
    if (interaction) input = sessionCommandCallSchema.shape.input.parse(bindInteractionSession(source.sessionId, input))
    if (file) {
      const session = await this.options.storage.call('session', source.sessionId)
      if (input.workspaceId !== session.workspaceId)
        throw new HbarError('COMMAND_SOURCE_WORKSPACE_MISMATCH', 'File commands must use the source Session workspace')
      const target = await this.options.storage.call('sessionLaunchTarget', session.id)
      if (input.sessionTarget !== undefined) {
        const supplied = sessionFileTargetSchema.parse(input.sessionTarget)
        if (supplied.sessionId !== session.id)
          throw new HbarError(
            'COMMAND_SOURCE_WORKSPACE_MISMATCH',
            'File commands cannot borrow another Session execution root',
          )
        if (supplied.expectedRevision !== target.revision)
          throw new HbarError(
            'COMMAND_CONFLICT',
            'The Session execution target changed; inspect it before a new operation',
          )
      }
      input = { ...input, sessionTarget: { sessionId: session.id, expectedRevision: target.revision } }
    }
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
        input,
      },
      signal,
    )
    const metadata = prepared.descriptor.metadata
    const finalInput = sessionCommandCallSchema.shape.input.parse(prepared.invocation.input)
    const finalGit = sessionGitCommand(call.commandId, finalInput)
    if (finalGit) bindSessionGitInput(source, call.commandId, finalInput)
    const finalInteraction = sessionInteractionCommand(call.commandId, finalInput)
    if (finalInteraction) bindInteractionSession(source.sessionId, finalInput)
    const write = fileWrite || finalGit?.write === true
    const mutatingDefinition = fileWrite || finalGit?.mutation === true
    if (
      metadata.id !== call.commandId ||
      metadata.version !== call.commandVersion ||
      (interaction !== undefined && metadata.version !== interaction.metadata.version) ||
      metadata.owner !==
        (interaction?.metadata.owner ??
          (file ? 'hbar.files' : decision ? 'hbar.decisions' : git ? 'hbar.git' : 'hbar.core')) ||
      metadata.kind !== (interaction?.metadata.kind ?? (mutatingDefinition ? 'command' : 'query')) ||
      metadata.stateEffect !==
        (interaction?.metadata.stateEffect ?? (mutatingDefinition ? (git ? 'external' : 'persistent') : 'none')) ||
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
      input: finalInput,
    })
    const unsigned = sessionCommandPreparationSchema.omit({ signature: true }).parse({
      ...prepared,
      arguments: argumentsValue,
      sourceMethods: file
        ? [
            'launchTarget.workspaceForRun',
            'workspaceSandbox.prepare',
            ...(call.commandId === 'file.find'
              ? ['workspaceQuery.find']
              : call.commandId === 'file.list'
                ? ['execution.list']
                : write
                  ? ['execution.readBytes', 'execution.write']
                  : ['execution.readBytes']),
          ]
        : finalGit
          ? [finalGit.method]
          : finalInteraction
            ? [call.commandId]
            : [],
      admission: {
        effect: finalInteraction?.effect ?? (write ? 'write' : 'read'),
        workspaceAccess: file
          ? {
              kind: 'paths',
              arguments: [{ field: 'input.path', fieldPath: ['input', 'path'], access: write ? 'write' : 'read' }],
            }
          : finalGit
            ? { kind: 'workspace' }
            : { kind: 'none' },
        ...(finalGit
          ? {
              requiresProcess: true,
              permissionAliases: [{ name: finalGit.alias, arguments: finalInput }],
            }
          : {}),
        ...(finalInteraction
          ? {
              permissionAliases: [{ name: finalInteraction.alias, arguments: finalInteraction.arguments }],
            }
          : {}),
        timeoutMs: metadata.timeoutMs,
      },
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
    application?: HostSourceApplication,
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
    if (signed.sourceMethods.length && !application)
      throw new HbarError(
        'COMMAND_SOURCE_APPLICATION_REQUIRED',
        'This command needs its admitted source capability port',
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
      ...(application ? { application } : {}),
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
      .update(
        JSON.stringify([
          source,
          callId,
          { ...value, descriptor: normalized.descriptor, invocation: { ...value.invocation, input: normalized.input } },
        ]),
      )
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
