import { z } from 'zod'
import {
  CommandError,
  invocationSchema,
  commandExecutionExpectationSchema,
  type CommandExecutionTicket,
  type CommandPhysicalSettlement,
} from './protocol'

const identity = z.string().min(1).max(160).regex(/\S/)
const errorSchema = z.strictObject({ code: z.string().min(1).max(128), message: z.string().min(1).max(8_192) })
export const commandJobIdentitySchema = z.strictObject({ jobId: identity, actorId: identity })
export type CommandJobIdentity = z.infer<typeof commandJobIdentitySchema>
export const commandJobStartSchema = commandJobIdentitySchema.extend({
  invocation: invocationSchema,
  expectation: commandExecutionExpectationSchema,
})
export const commandJobLogicalResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), result: z.unknown() }),
  z.strictObject({ ok: z.literal(false), error: errorSchema }),
])
export type CommandJobLogicalResult = z.infer<typeof commandJobLogicalResultSchema>
const payloadSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('json'),
    bytes: z.number().int().min(1).max(33_554_432),
    units: z.number().int().min(1).max(33_554_432),
  }),
  z.strictObject({ kind: z.literal('unavailable'), error: errorSchema }),
])
export type CommandJobPayload = z.infer<typeof payloadSchema>
export const commandJobSnapshotSchema = z.strictObject({
  jobId: identity,
  revision: z.number().int().positive().safe(),
  logical: payloadSchema.nullable(),
  physical: z.discriminatedUnion('phase', [
    z.strictObject({ phase: z.literal('pending') }),
    z.strictObject({
      phase: z.literal('settled'),
      status: z.enum(['succeeded', 'failed']),
      executionStarted: z.boolean(),
      payload: payloadSchema,
    }),
    z.strictObject({ phase: z.literal('unconfirmed'), error: errorSchema }),
  ]),
})
export type CommandJobSnapshot = z.infer<typeof commandJobSnapshotSchema>
export const commandJobWatchSchema = commandJobIdentitySchema.extend({
  afterRevision: z.number().int().nonnegative().safe(),
  waitMs: z.number().int().min(1).max(25_000).default(25_000),
})
export const commandJobReadSchema = commandJobIdentitySchema.extend({
  channel: z.enum(['logical', 'physical']),
  offset: z.number().int().nonnegative().max(33_554_432),
  limit: z.number().int().min(1).max(65_536).default(32_768),
})
export const commandJobChunkSchema = z.strictObject({
  text: z.string().max(65_536),
  totalUnits: z.number().int().min(1).max(33_554_432),
  nextOffset: z.number().int().nonnegative().max(33_554_432).nullable(),
})
export interface CommandExecutionJobsOptions {
  readonly maxJobs?: number
  readonly maxWaiters?: number
  readonly maxPayloadBytes?: number
  readonly maxBufferedBytes?: number
}
interface StoredPayload {
  readonly description: CommandJobPayload
  readonly encoded: string | null
}
interface Waiter {
  finish(error?: unknown): void
}
interface Job {
  readonly actorId: string
  readonly controller: AbortController
  readonly waiting: Set<Waiter>
  state: CommandJobSnapshot
  logical: StoredPayload | null
  physical: StoredPayload | null
}

function knownError(error: unknown): z.infer<typeof errorSchema> {
  return error instanceof CommandError
    ? {
        code: error.code.slice(0, 128) || 'EXECUTION_FAILED',
        message: error.message.slice(0, 8_192) || 'Command failed',
      }
    : { code: 'EXECUTION_FAILED', message: 'Command execution failed' }
}
function bound(value: number, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new CommandError('INVALID_DEFINITION', 'Command job capacity is invalid')
  return value
}

/** Validate bounded JSON before encoding. Optional undefined object fields follow ordinary JSON transport semantics. */
export function encodeCommandResult(value: unknown, maxBytes = 33_554_432): string {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 33_554_432)
    throw new RangeError('Command result byte capacity is invalid')
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }]
  let nodes = 0,
    estimatedBytes = 0
  while (pending.length) {
    const item = pending.pop()
    if (!item || ++nodes > 65_536 || item.depth > 64) throw new Error('Payload structure exceeds bounds')
    const data = item.value
    if (typeof data === 'string') estimatedBytes += new TextEncoder().encode(data).byteLength
    else if (typeof data === 'number') {
      if (!Number.isFinite(data)) throw new Error('Non-finite payload number')
    } else if (data !== null && typeof data === 'object') {
      const prototype: unknown = Object.getPrototypeOf(data)
      const array = Array.isArray(data)
      if ((!array && prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(data).length)
        throw new Error('Payload must contain JSON data')
      const entries = Object.entries(Object.getOwnPropertyDescriptors(data))
      let elements = 0
      for (const [key, descriptor] of entries) {
        if (!descriptor.enumerable) continue
        if (descriptor.get || descriptor.set) throw new Error('Payload accessors are not allowed')
        if (array && !/^(0|[1-9][0-9]*)$/.test(key)) throw new Error('Array properties are not JSON data')
        elements++
        estimatedBytes += new TextEncoder().encode(key).byteLength
        const child: unknown = descriptor.value
        if (child === undefined && !array) continue
        pending.push({ value: child, depth: item.depth + 1 })
        if (nodes + pending.length > 65_536 || estimatedBytes > maxBytes) throw new Error('Payload exceeds bounds')
      }
      if (array && elements !== data.length) throw new Error('Sparse arrays are not JSON data')
    } else if (data !== null && typeof data !== 'boolean') throw new Error('Payload must contain JSON data')
    if (estimatedBytes > maxBytes) throw new Error('Payload exceeds bounds')
  }
  const encoded = JSON.stringify(value)
  if (encoded === undefined || new TextEncoder().encode(encoded).byteLength > maxBytes)
    throw new Error('Payload exceeds bounds')
  return encoded
}

/** Owner-local, bounded receipts. A transport publishes snapshots/chunks and acknowledges only after saving the result. */
export class CommandExecutionJobs {
  private readonly jobs = new Map<string, Job>()
  private readonly maxJobs: number
  private readonly maxWaiters: number
  private readonly maxPayloadBytes: number
  private readonly maxBufferedBytes: number
  private bufferedBytes = 0
  private waiters = 0
  private closed = false
  constructor(options: CommandExecutionJobsOptions = {}) {
    this.maxJobs = bound(options.maxJobs ?? 128, 1, 128)
    this.maxWaiters = bound(options.maxWaiters ?? 64, 1, 64)
    this.maxPayloadBytes = bound(options.maxPayloadBytes ?? 33_554_432, 128, 33_554_432)
    this.maxBufferedBytes = bound(options.maxBufferedBytes ?? 100_663_296, 128, 134_217_728)
  }
  start(value: CommandJobIdentity, execute: (signal: AbortSignal) => CommandExecutionTicket): CommandJobSnapshot {
    const input = commandJobIdentitySchema.parse(value)
    if (this.closed) throw new CommandError('CANCELLED', 'Command job owner is closing')
    if (this.jobs.has(input.jobId)) {
      this.job(input)
      throw new CommandError(
        'COMMAND_JOB_CONFLICT',
        'This job already exists; read its receipt instead of executing again',
      )
    }
    if (this.jobs.size >= this.maxJobs) throw new CommandError('BUSY', 'Command job capacity is exhausted')
    const job: Job = {
      actorId: input.actorId,
      controller: new AbortController(),
      waiting: new Set(),
      state: { jobId: input.jobId, revision: 1, logical: null, physical: { phase: 'pending' } },
      logical: null,
      physical: null,
    }
    this.jobs.set(input.jobId, job)
    try {
      const ticket = execute(job.controller.signal)
      void ticket.result.then(
        (result) => this.logical(job, { ok: true, result }),
        (error) => this.logical(job, { ok: false, error: knownError(error) }),
      )
      void ticket.settled.then(
        (result) => this.physical(job, result),
        (error) => {
          job.state.physical = { phase: 'unconfirmed', error: knownError(error) }
          this.changed(job)
        },
      )
    } catch (error) {
      const failure = knownError(error)
      this.logical(job, {
        ok: false,
        error: {
          code: 'RESULT_UNKNOWN',
          message: 'The job factory failed without proving physical settlement; inspect state before retrying',
        },
      })
      // A broken factory may have performed work before throwing; only a ticket can prove its physical outcome.
      job.state.physical = { phase: 'unconfirmed', error: failure }
      this.changed(job)
    }
    return this.snapshot(job)
  }
  get(input: CommandJobIdentity): CommandJobSnapshot {
    return this.snapshot(this.job(input))
  }
  cancel(input: CommandJobIdentity): { accepted: boolean } {
    const job = this.job(input)
    if (job.state.physical.phase === 'settled' || job.controller.signal.aborted) return { accepted: false }
    job.controller.abort(new CommandError('CANCELLED', 'Command job cancellation requested'))
    return { accepted: true }
  }
  acknowledge(input: CommandJobIdentity): { released: boolean } {
    const identity = commandJobIdentitySchema.parse(input)
    if (!this.jobs.has(identity.jobId)) return { released: false }
    const job = this.job(identity)
    if (job.state.physical.phase !== 'settled' || job.state.logical === null)
      throw new CommandError(
        'COMMAND_JOB_ACTIVE',
        'Physical settlement and logical result must be recorded before acknowledgment',
      )
    this.remove(job)
    return { released: true }
  }
  watch(value: z.input<typeof commandJobWatchSchema>, signal: AbortSignal): Promise<CommandJobSnapshot> {
    const input = commandJobWatchSchema.parse(value),
      job = this.job({ jobId: input.jobId, actorId: input.actorId })
    if (signal.aborted) return Promise.reject(new CommandError('CANCELLED', 'Command job watch cancelled'))
    if (input.afterRevision > job.state.revision)
      return Promise.reject(new CommandError('INVALID_INPUT', 'Command job cursor is ahead of its owner'))
    if (job.state.revision > input.afterRevision) return Promise.resolve(this.snapshot(job))
    if (this.closed) return Promise.reject(new CommandError('CANCELLED', 'Command job owner is closing'))
    if (this.waiters >= this.maxWaiters || job.waiting.size >= 2)
      return Promise.reject(new CommandError('BUSY', 'Command job watch capacity is exhausted'))
    return new Promise((resolve, reject) => {
      const abort = () => waiter.finish(new CommandError('CANCELLED', 'Command job watch cancelled'))
      const timer = setTimeout(() => waiter.finish(), input.waitMs)
      const waiter: Waiter = {
        finish: (error) => {
          if (!job.waiting.delete(waiter)) return
          this.waiters--
          clearTimeout(timer)
          signal.removeEventListener('abort', abort)
          if (error !== undefined) reject(error)
          else resolve(this.snapshot(job))
        },
      }
      job.waiting.add(waiter)
      this.waiters++
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
    })
  }
  read(value: z.input<typeof commandJobReadSchema>): z.infer<typeof commandJobChunkSchema> {
    const input = commandJobReadSchema.parse(value),
      job = this.job({ jobId: input.jobId, actorId: input.actorId }),
      payload = job[input.channel]
    if (!payload) throw new CommandError('COMMAND_JOB_PENDING', 'The requested command result has not arrived')
    if (payload.encoded === null)
      throw new CommandError(
        'COMMAND_RESULT_UNAVAILABLE',
        'This result could not be retained; inspect its job status before retrying',
      )
    if (input.offset > payload.encoded.length)
      throw new CommandError('INVALID_INPUT', 'Command result offset exceeds its size')
    const end = Math.min(payload.encoded.length, input.offset + input.limit)
    return {
      text: payload.encoded.slice(input.offset, end),
      totalUnits: payload.encoded.length,
      nextOffset: end < payload.encoded.length ? end : null,
    }
  }
  stats(): { jobs: number; active: number; waiters: number; bufferedBytes: number } {
    return {
      jobs: this.jobs.size,
      active: [...this.jobs.values()].filter((job) => job.state.physical.phase !== 'settled').length,
      waiters: this.waiters,
      bufferedBytes: this.bufferedBytes,
    }
  }
  dispose(): void {
    this.closed = true
    for (const job of this.jobs.values()) {
      job.controller.abort(new CommandError('CANCELLED', 'Command job owner is closing'))
      for (const waiter of [...job.waiting])
        waiter.finish(new CommandError('CANCELLED', 'Command job owner is closing'))
      if (job.state.physical.phase === 'settled') this.remove(job)
    }
  }
  private job(value: CommandJobIdentity): Job {
    const input = commandJobIdentitySchema.parse(value),
      job = this.jobs.get(input.jobId)
    if (!job) throw new CommandError('COMMAND_JOB_NOT_FOUND', 'Command job is not retained by this owner')
    if (job.actorId !== input.actorId) throw new CommandError('FORBIDDEN', 'Command job belongs to another actor')
    return job
  }
  private snapshot(job: Job): CommandJobSnapshot {
    return structuredClone(job.state)
  }
  private changed(job: Job): void {
    job.state.revision++
    for (const waiter of [...job.waiting]) waiter.finish()
    if (this.closed && job.state.physical.phase === 'settled') this.remove(job)
  }
  private capture(value: unknown): StoredPayload {
    try {
      const encoded = encodeCommandResult(
        value,
        Math.min(this.maxPayloadBytes, this.maxBufferedBytes - this.bufferedBytes),
      )
      const bytes = new TextEncoder().encode(encoded).byteLength
      this.bufferedBytes += bytes
      return { description: { kind: 'json', bytes, units: encoded.length }, encoded }
    } catch {
      return {
        description: {
          kind: 'unavailable',
          error: {
            code: 'COMMAND_RESULT_UNAVAILABLE',
            message: 'Result exceeds owner capacity or is not JSON data; inspect state before retrying',
          },
        },
        encoded: null,
      }
    }
  }
  private logical(job: Job, result: CommandJobLogicalResult): void {
    if (!this.jobs.has(job.state.jobId) || job.logical !== null) return
    job.logical = this.capture(result.ok && result.result === undefined ? undefined : result)
    job.state.logical = job.logical.description
    this.changed(job)
  }
  private physical(job: Job, result: CommandPhysicalSettlement): void {
    if (!this.jobs.has(job.state.jobId) || job.physical !== null) return
    job.physical = this.capture(result.status === 'succeeded' && result.result === undefined ? undefined : result)
    job.state.physical = {
      phase: 'settled',
      status: result.status,
      executionStarted: result.executionStarted,
      payload: job.physical.description,
    }
    this.changed(job)
  }
  private remove(job: Job): void {
    if (!this.jobs.delete(job.state.jobId)) return
    for (const value of [job.logical, job.physical])
      if (value?.description.kind === 'json') this.bufferedBytes -= value.description.bytes
    for (const waiter of [...job.waiting])
      waiter.finish(new CommandError('COMMAND_JOB_NOT_FOUND', 'Command job was acknowledged'))
  }
}
