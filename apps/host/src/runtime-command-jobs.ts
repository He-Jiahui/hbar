import { z } from 'zod'
import {
  CommandError,
  commandPhysicalSettlementSchema,
  type CommandExecutionTicket,
  type CommandPhysicalSettlement,
} from '@hbar/commands'
import {
  CommandExecutionJobs,
  commandJobIdentitySchema,
  commandJobWatchSchema,
  commandJobReadSchema,
  commandJobChunkSchema,
  commandJobSnapshotSchema,
  commandJobLogicalResultSchema,
  type CommandJobIdentity,
  type CommandJobSnapshot,
  type CommandJobPayload,
  type CommandJobLogicalResult,
} from '@hbar/commands/jobs'
import { procedure, runtimeDomainError, type IpcPeer } from '@hbar/runtime'

export { RUNTIME_COMMAND_JOB_CONTROLS, RUNTIME_COMMAND_JOB_SCHEMAS } from './runtime-command-job-contract'

/** Named, data-only endpoints. Watches consume normal slots so cancellation keeps its reserved capacity. */
export function attachRuntimeCommandJobs(peer: IpcPeer, jobs: CommandExecutionJobs): () => void {
  const cleanup = [
    peer.register(
      'command.jobs.get',
      procedure(commandJobIdentitySchema, commandJobSnapshotSchema, (input) => jobs.get(input)),
    ),
    peer.register(
      'command.jobs.watch',
      procedure(commandJobWatchSchema, commandJobSnapshotSchema, (input, call) => jobs.watch(input, call.signal)),
    ),
    peer.register(
      'command.jobs.read',
      procedure(commandJobReadSchema, commandJobChunkSchema, (input) => jobs.read(input)),
    ),
    peer.register(
      'command.jobs.cancel',
      procedure(commandJobIdentitySchema, z.strictObject({ accepted: z.boolean() }), (input) => jobs.cancel(input)),
    ),
    peer.register(
      'command.jobs.acknowledge',
      procedure(commandJobIdentitySchema, z.strictObject({ released: z.boolean() }), (input) =>
        jobs.acknowledge(input),
      ),
    ),
  ]
  return () => {
    for (const dispose of cleanup) dispose()
  }
}
export interface RuntimeCommandJobTicket extends CommandExecutionTicket {
  readonly jobId: string
  acknowledge(): Promise<void>
  follow(options?: { readonly signal?: AbortSignal }): RuntimeCommandJobTicket
}
/** A validated owner header proves physical completion even when its bounded payload was explicitly unavailable. */
export class CommandJobPayloadUnavailable extends CommandError {
  constructor(readonly physical: Readonly<{ status: 'succeeded' | 'failed'; executionStarted: boolean }>) {
    super('RESULT_UNKNOWN', 'The command physically settled but its complete result could not be retained')
    Object.freeze(physical)
  }
}
export interface RuntimeCommandJobTrackingOptions {
  /** Bounded persistence only; wait for accepted writes to settle, and check cancellation before starting new work. */
  readonly beforeStart?: ((signal: AbortSignal) => Promise<void>) | undefined
  readonly signal?: AbortSignal | undefined
  readonly lifetime?: AbortSignal | undefined
  readonly maxTrackingMs?: number | undefined
  readonly onLogicalResult?: ((result: CommandJobLogicalResult) => void) | undefined
  readonly onTrackingStopped?: ((physicallyConfirmed: boolean) => void) | undefined
  readonly onAcknowledged?: (() => void) | undefined
}
function deferred<Value>() {
  let resolve: (value: Value) => void = () => {
    throw new Error('Deferred has not initialized')
  }
  let reject: (error: unknown) => void = () => {
    throw new Error('Deferred has not initialized')
  }
  const promise = new Promise<Value>((done, fail) => {
    resolve = done
    reject = fail
  })
  // Both outcomes may arrive before the consumer gets to its corresponding await.
  void promise.catch(() => undefined)
  return { promise, resolve, reject }
}
async function readPayload(
  peer: Pick<IpcPeer, 'call'>,
  source: CommandJobIdentity,
  channel: 'logical' | 'physical',
  description: CommandJobPayload,
  signal: AbortSignal,
): Promise<unknown> {
  if (description.kind === 'unavailable')
    throw new CommandError('COMMAND_RESULT_UNAVAILABLE', description.error.message)
  const chunks: string[] = []
  let offset = 0
  for (let page = 0; page <= Math.ceil(description.units / 65_536); page++) {
    signal.throwIfAborted()
    const chunk = await peer.call(
      'command.jobs.read',
      { ...source, channel, offset, limit: 65_536 },
      commandJobChunkSchema,
      { signal, timeoutMs: 30_000 },
    )
    const end = offset + chunk.text.length
    if (
      chunk.totalUnits !== description.units ||
      end > description.units ||
      end <= offset ||
      (chunk.nextOffset !== null && chunk.nextOffset !== end) ||
      (chunk.nextOffset === null && end !== description.units)
    )
      throw new CommandError('COMMAND_JOB_INVALID', 'Command result chunks did not preserve their declared cursor')
    chunks.push(chunk.text)
    offset = end
    if (chunk.nextOffset === null) {
      const text = chunks.join('')
      if (new TextEncoder().encode(text).byteLength !== description.bytes)
        throw new CommandError('COMMAND_JOB_INVALID', 'Command result bytes differ from their receipt')
      const value: unknown = JSON.parse(text)
      return value
    }
  }
  throw new CommandError('COMMAND_JOB_INVALID', 'Command result did not finish within its declared page bound')
}

/** Start once, follow the accepted owner, and retain its record until the caller explicitly acknowledges saved results. */
export function trackRuntimeCommandJob(
  peer: Pick<IpcPeer, 'call'>,
  identity: CommandJobIdentity,
  start: (signal: AbortSignal) => Promise<CommandJobSnapshot>,
  options: RuntimeCommandJobTrackingOptions = {},
): RuntimeCommandJobTicket {
  const source = commandJobIdentitySchema.parse(identity)
  if (options.signal?.aborted) throw new CommandError('CANCELLED', 'Command cancelled before job admission')
  const maxTrackingMs = options.maxTrackingMs ?? 1_325_000
  if (!Number.isSafeInteger(maxTrackingMs) || maxTrackingMs < 1 || maxTrackingMs > 1_325_000)
    throw new CommandError('INVALID_INPUT', 'Command tracking deadline is invalid')
  const result = deferred<unknown>(),
    settled = deferred<CommandPhysicalSettlement>(),
    controller = new AbortController()
  const lifetime = options.lifetime ? AbortSignal.any([options.lifetime, controller.signal]) : controller.signal
  let started = false,
    attempted = false,
    logicalKnown = false,
    physicalKnown = false,
    confirmed = false,
    receiptValid = true,
    acknowledged = false
  let acknowledgment: Promise<void> | undefined
  const timer = setTimeout(
    () => controller.abort(new CommandError('RESULT_UNKNOWN', 'Command tracking requires reconciliation')),
    maxTrackingMs,
  )
  const uncertain = () =>
    new CommandError(
      'RESULT_UNKNOWN',
      'The accepted command may have executed; inspect its retained receipt before retrying',
    )
  const cancel = () => {
    if (!started || physicalKnown) return
    void peer
      .call('command.jobs.cancel', source, z.strictObject({ accepted: z.boolean() }), { timeoutMs: 5_000 })
      .catch(() => {
        /* Tracking continues; a lost cancellation acknowledgment is not proof of stopping. */
      })
  }
  options.signal?.addEventListener('abort', cancel, { once: true })
  const tracking = (async () => {
    try {
      if (options.beforeStart)
        await options.beforeStart(options.signal ? AbortSignal.any([lifetime, options.signal]) : lifetime)
      lifetime.throwIfAborted()
      options.signal?.throwIfAborted()
    } catch (error) {
      const failure = {
        code:
          lifetime.aborted || options.signal?.aborted
            ? 'CANCELLED'
            : (runtimeDomainError(error)?.code ?? 'COMMAND_NOT_STARTED'),
        message:
          (error instanceof Error ? error.message : 'Command preparation failed before dispatch').slice(0, 8_192) ||
          'Command was not dispatched',
      }
      logicalKnown = true
      physicalKnown = true
      confirmed = true
      result.reject(new CommandError(failure.code, failure.message))
      settled.resolve({ status: 'failed', executionStarted: false, error: failure })
      options.onLogicalResult?.({ ok: false, error: failure })
      return
    }
    attempted = true
    let state = commandJobSnapshotSchema.parse(await start(lifetime))
    started = true
    if (options.signal?.aborted) cancel()
    let revision = 0
    while (true) {
      lifetime.throwIfAborted()
      if (state.jobId !== source.jobId || state.revision < revision)
        throw new CommandError('COMMAND_JOB_INVALID', 'Command receipt identity or revision changed')
      revision = state.revision
      if (!logicalKnown && state.logical) {
        logicalKnown = true
        try {
          const logical = commandJobLogicalResultSchema.parse(
            await readPayload(peer, source, 'logical', state.logical, lifetime),
          )
          options.onLogicalResult?.(logical)
          if (logical.ok) result.resolve(logical.result)
          else result.reject(new CommandError(logical.error.code, logical.error.message))
        } catch {
          receiptValid = state.logical.kind === 'unavailable'
          const error = uncertain()
          result.reject(error)
          options.onLogicalResult?.({ ok: false, error: { code: error.code, message: error.message } })
        }
      }
      if (!physicalKnown && state.physical.phase === 'settled') {
        physicalKnown = true
        confirmed = true
        try {
          const physical = commandPhysicalSettlementSchema.parse(
            await readPayload(peer, source, 'physical', state.physical.payload, lifetime),
          )
          if (
            physical.status !== state.physical.status ||
            physical.executionStarted !== state.physical.executionStarted
          )
            throw new CommandError('COMMAND_JOB_INVALID', 'Command settlement differs from its retained header')
          settled.resolve(physical)
        } catch {
          receiptValid = receiptValid && state.physical.payload.kind === 'unavailable'
          if (state.physical.payload.kind !== 'unavailable') confirmed = false
          if (state.physical.status === 'succeeded' && !state.physical.executionStarted) {
            receiptValid = false
            confirmed = false
          }
          settled.reject(
            confirmed
              ? new CommandJobPayloadUnavailable({
                  status: state.physical.status,
                  executionStarted: state.physical.executionStarted,
                })
              : uncertain(),
          )
        }
      } else if (state.physical.phase === 'unconfirmed') throw uncertain()
      if (logicalKnown && physicalKnown) break
      state = await peer.call(
        'command.jobs.watch',
        { ...source, afterRevision: revision, waitMs: 25_000 },
        commandJobSnapshotSchema,
        { signal: lifetime, timeoutMs: 30_000 },
      )
    }
  })()
    .catch(() => {
      if (!logicalKnown) result.reject(uncertain())
      if (!physicalKnown) settled.reject(uncertain())
    })
    .finally(() => {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', cancel)
      options.onTrackingStopped?.(confirmed)
    })
  return {
    jobId: source.jobId,
    result: result.promise,
    settled: settled.promise,
    follow: (followOptions) =>
      trackRuntimeCommandJob(
        peer,
        source,
        (signal) => peer.call('command.jobs.get', source, commandJobSnapshotSchema, { signal, timeoutMs: 30_000 }),
        {
          ...options,
          beforeStart: undefined,
          signal: followOptions?.signal,
        },
      ),
    acknowledge: () => {
      if (acknowledged) return Promise.resolve()
      if (!confirmed || !physicalKnown || !logicalKnown)
        return Promise.reject(
          new CommandError('COMMAND_JOB_ACTIVE', 'The command has no confirmed complete receipt to acknowledge'),
        )
      if (!receiptValid)
        return Promise.reject(
          new CommandError('COMMAND_JOB_INVALID', 'The retained receipt must be reconciled before acknowledgment'),
        )
      acknowledgment ??= (async () => {
        await tracking
        if (attempted)
          await peer.call('command.jobs.acknowledge', source, z.strictObject({ released: z.boolean() }), {
            timeoutMs: 5_000,
          })
        acknowledged = true
        options.onAcknowledged?.()
      })().catch((error) => {
        acknowledgment = undefined
        throw error
      })
      return acknowledgment
    },
  }
}
