import { z } from 'zod'
import { CommandError, type CommandExecutionTicket } from '@hbar/commands'
import {
  CommandExecutionJobs,
  commandJobIdentitySchema,
  commandJobReadSchema,
  commandJobWatchSchema,
  type CommandExecutionJobsOptions,
} from '@hbar/commands/jobs'
import type { IpcCallOptions } from '@hbar/runtime'
import type { HostCommandExecutionScopes } from './command-execution-scopes'
import { trackRuntimeCommandJob, type RuntimeCommandJobTicket } from './runtime-command-jobs'

export interface LocalCommandJobsOptions extends CommandExecutionJobsOptions {
  readonly instanceId?: string
  readonly scopes?: HostCommandExecutionScopes
  /** Must retain the actual stable Host lifetime against the authenticated source Run. */
  readonly retainSource?: (jobId: string) => () => void
}

/** The stable Host uses the same bounded job protocol as child owners, without a second transport. */
export class LocalCommandJobs {
  readonly instanceId: string
  private readonly jobs: CommandExecutionJobs
  private readonly lifetime = new AbortController()
  private readonly resources = new Map<string, () => void>()
  private readonly slots = new Set<string>()
  constructor(private readonly options: LocalCommandJobsOptions = {}) {
    this.instanceId = z
      .string()
      .min(1)
      .max(160)
      .parse(options.instanceId ?? crypto.randomUUID())
    this.jobs = new CommandExecutionJobs(options)
  }
  execute(
    actorId: string,
    factory: (signal: AbortSignal) => CommandExecutionTicket,
    options: { readonly signal?: AbortSignal | undefined } = {},
  ): RuntimeCommandJobTicket {
    this.lifetime.signal.throwIfAborted()
    const identity = commandJobIdentitySchema.parse({ actorId, jobId: crypto.randomUUID() })
    if (this.slots.size >= (this.options.maxJobs ?? 128))
      throw new CommandError('BUSY', 'Stable Host command job capacity is exhausted')
    if (this.options.scopes?.hasSource()) {
      if (!this.options.retainSource)
        throw new CommandError('CAPABILITY_UNAVAILABLE', 'The stable Host source lifetime is not available')
      this.resources.set(identity.jobId, this.options.retainSource(identity.jobId))
    }
    this.slots.add(identity.jobId)
    try {
      return trackRuntimeCommandJob(this, identity, () => Promise.resolve(this.jobs.start(identity, factory)), {
        signal: options.signal,
        lifetime: this.lifetime.signal,
        beforeStart: this.options.scopes?.beforeStart({
          kind: 'host',
          instanceId: this.instanceId,
          jobId: identity.jobId,
        }),
        onAcknowledged: () => this.release(identity.jobId),
      })
    } catch (error) {
      this.release(identity.jobId)
      throw error
    }
  }
  follow(
    owner: { readonly instanceId: string; readonly jobId: string },
    actorId: string,
    options: { readonly signal?: AbortSignal | undefined } = {},
  ): RuntimeCommandJobTicket {
    this.lifetime.signal.throwIfAborted()
    if (owner.instanceId !== this.instanceId)
      throw new CommandError('RESULT_UNKNOWN', 'The original stable Host is unavailable; reconcile its saved receipt')
    const identity = commandJobIdentitySchema.parse({ jobId: owner.jobId, actorId })
    this.jobs.get(identity)
    return trackRuntimeCommandJob(this, identity, () => Promise.resolve(this.jobs.get(identity)), {
      signal: options.signal,
      lifetime: this.lifetime.signal,
      onAcknowledged: () => this.release(identity.jobId),
    })
  }
  async call<Output>(
    method: string,
    input: unknown,
    schema: z.ZodType<Output>,
    options: IpcCallOptions = {},
  ): Promise<Output> {
    options.signal?.throwIfAborted()
    let result: unknown
    switch (method) {
      case 'command.jobs.get':
        result = this.jobs.get(commandJobIdentitySchema.parse(input))
        break
      case 'command.jobs.watch':
        result = await this.jobs.watch(commandJobWatchSchema.parse(input), options.signal ?? this.lifetime.signal)
        break
      case 'command.jobs.read':
        result = this.jobs.read(commandJobReadSchema.parse(input))
        break
      case 'command.jobs.cancel':
        result = this.jobs.cancel(commandJobIdentitySchema.parse(input))
        break
      case 'command.jobs.acknowledge':
        result = this.jobs.acknowledge(commandJobIdentitySchema.parse(input))
        break
      default:
        throw new CommandError('CAPABILITY_UNAVAILABLE', 'The local command job operation is unavailable')
    }
    return schema.parse(result)
  }
  stats(): ReturnType<CommandExecutionJobs['stats']> {
    return this.jobs.stats()
  }
  dispose(): void {
    this.assertCanClose()
    this.lifetime.abort(new CommandError('CANCELLED', 'Stable Host command jobs are closing'))
    this.jobs.dispose()
    // Cancellation is not proof of physical termination; source resources remain until a confirmed acknowledgment.
  }
  assertCanClose(): void {
    if (this.resources.size)
      throw new CommandError(
        'HOST_COMMANDS_ACTIVE',
        'Stable Host commands require settlement and saved acknowledgment before closing',
      )
  }
  private release(jobId: string): void {
    const release = this.resources.get(jobId)
    this.slots.delete(jobId)
    this.resources.delete(jobId)
    release?.()
  }
}
