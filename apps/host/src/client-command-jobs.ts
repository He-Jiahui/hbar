import { isDeepStrictEqual } from 'node:util'
import {
  CommandError,
  createCommandExpectation,
  describeCommand,
  invocationSchema,
  type CommandPreparation,
} from '@hbar/commands'
import { commandJobSnapshotSchema, commandJobStartSchema } from '@hbar/commands/jobs'
import {
  clientCommandPreparationSchema,
  clientCommandTargetSchema,
  type ClientCommandTarget,
} from '@hbar/contracts/client-commands'
import { surfaceCommands } from '@hbar/contracts/commands/surfaces'
import type { IpcPeer } from '@hbar/runtime'
import type { ClientCommandRelay } from './client-command-relay'
import type { HostCommandExecutionScopes } from './command-execution-scopes'
import { trackRuntimeCommandJob, type RuntimeCommandJobTicket } from './runtime-command-jobs'

const definitions = new Map(
  Object.values(surfaceCommands)
    .filter((definition) => definition.metadata.visibility !== 'internal')
    .map((definition) => [definition.metadata.id, definition]),
)

/** The client may prepare arguments, but cannot redefine the reviewed public command contract. */
export function captureClientCommandPreparation(raw: unknown): CommandPreparation {
  const prepared = clientCommandPreparationSchema.parse(raw)
  const definition = definitions.get(prepared.invocation.commandId)
  if (!definition || !isDeepStrictEqual(prepared.descriptor, describeCommand(definition)))
    throw new CommandError(
      'COMMAND_ADMISSION_UNAVAILABLE',
      'The client command definition differs from the Host catalog',
    )
  const expectation = createCommandExpectation({
    descriptor: prepared.descriptor,
    invocation: { ...prepared.invocation, input: definition.input.parse(prepared.invocation.input) },
  })
  return {
    descriptor: expectation.descriptor,
    invocation: { ...prepared.invocation, input: expectation.input },
  }
}

export interface ClientCommandJobsOptions {
  readonly relay: ClientCommandRelay
  readonly scopes: HostCommandExecutionScopes
  readonly retainSource: (jobId: string) => () => void
  readonly maxTrackingMs?: number
}

/** Retains the actual source Run until its original client job and durable result are acknowledged. */
export class ClientCommandJobs {
  private readonly lifetime = new AbortController()
  private readonly retained = new Map<string, () => void>()
  constructor(private readonly options: ClientCommandJobsOptions) {}

  assertAvailable(target: ClientCommandTarget, actorId: string, prepared: CommandPreparation): void {
    this.lifetime.signal.throwIfAborted()
    const captured = captureClientCommandPreparation(prepared)
    this.options.relay.assertTarget(target, actorId, captured.invocation.commandId)
  }

  async prepare(
    target: ClientCommandTarget,
    actorId: string,
    raw: unknown,
    signal: AbortSignal,
  ): Promise<CommandPreparation> {
    this.lifetime.signal.throwIfAborted()
    const invocation = invocationSchema.parse(raw)
    const prepared = captureClientCommandPreparation(
      await this.options.relay.call(target, actorId, 'prepare', invocation, clientCommandPreparationSchema, { signal }),
    )
    if (
      prepared.invocation.protocol !== invocation.protocol ||
      prepared.invocation.requestId !== invocation.requestId ||
      prepared.invocation.commandId !== invocation.commandId ||
      prepared.invocation.commandVersion !== invocation.commandVersion ||
      prepared.invocation.idempotencyKey !== invocation.idempotencyKey
    )
      throw new CommandError('COMMAND_PREPARATION_INVALID', 'The client changed the original command identity')
    return prepared
  }

  execute(
    rawTarget: ClientCommandTarget,
    actorId: string,
    raw: CommandPreparation,
    options: { readonly signal?: AbortSignal | undefined } = {},
  ): RuntimeCommandJobTicket {
    this.lifetime.signal.throwIfAborted()
    const target = clientCommandTargetSchema.parse(rawTarget)
    const prepared = captureClientCommandPreparation(raw)
    this.assertAvailable(target, actorId, prepared)
    if (!this.options.scopes.hasSource())
      throw new CommandError('EXECUTION_SOURCE_REQUIRED', 'Client commands require their authenticated source Run')
    if (this.retained.size >= 64) throw new CommandError('BUSY', 'Client command execution capacity is full')
    const input = commandJobStartSchema.parse({
      actorId,
      jobId: crypto.randomUUID(),
      invocation: prepared.invocation,
      expectation: createCommandExpectation(prepared),
    })
    const identity = { actorId: input.actorId, jobId: input.jobId }
    const peer: Pick<IpcPeer, 'call'> = {
      call: (method, value, output, callOptions) =>
        this.options.relay.call(target, actorId, method, value, output, callOptions),
    }
    const release = this.options.retainSource(input.jobId)
    this.retained.set(input.jobId, release)
    try {
      return trackRuntimeCommandJob(
        peer,
        identity,
        (signal) =>
          this.options.relay.call(target, actorId, 'command.jobs.start', input, commandJobSnapshotSchema, { signal }),
        {
          signal: options.signal,
          lifetime: this.lifetime.signal,
          maxTrackingMs: this.options.maxTrackingMs,
          beforeStart: this.options.scopes.beforeStart({ kind: 'client', ...target, jobId: input.jobId }),
          onAcknowledged: () => {
            const retained = this.retained.get(input.jobId)
            this.retained.delete(input.jobId)
            retained?.()
          },
        },
      )
    } catch (error) {
      this.retained.delete(input.jobId)
      release()
      throw error
    }
  }

  assertCanClose(): void {
    if (this.retained.size)
      throw new CommandError(
        'CLIENT_COMMANDS_ACTIVE',
        'Client jobs require confirmed settlement and saved acknowledgment',
      )
  }
  dispose(): void {
    this.assertCanClose()
    this.lifetime.abort(new CommandError('CANCELLED', 'Client command tracking is closing'))
  }
}
