import { createHash } from 'node:crypto'
import { createStorageWorkerDiagnostics } from './worker-diagnostics'
import type { DiagnosticEvent, DiagnosticSink } from '@hbar/contracts'
import { Worker } from 'node:worker_threads'
import {
  createPartitionLayout,
  partitionIdSchema,
  partitionOwnerSchema,
  type PartitionLayout,
  type PartitionOwner,
} from './partition-layout'
import {
  poolRequestSchema,
  poolResponseSchema,
  poolStatsSchema,
  poolStorageReplySchema,
  type PoolRequest,
} from './partition-pool-protocol'
import type { StorageCall, StorageReply } from './types'

export interface PartitionPoolOptions {
  readonly layout: PartitionLayout
  readonly generation: string
  readonly workers?: number
  readonly maxConnectionsPerWorker?: number
  readonly maxPending?: number
  readonly maxPendingBytes?: number
  readonly maxOwnerPending?: number
  readonly diagnostics?: DiagnosticSink
  readonly diagnosticsEnabled?: boolean
  readonly diagnosticsFullCoverage?: boolean
  readonly timeoutMs?: number
}
export interface PartitionPoolCallOptions {
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
}
interface Pending {
  readonly request: PoolRequest
  readonly owner: string
  readonly bytes: number
  readonly resolve: (value: unknown) => void
  readonly reject: (error: unknown) => void
  readonly signal: AbortSignal | undefined
  abort: () => void
  timer: ReturnType<typeof setTimeout> | undefined
  readonly deadline: number
  settled: boolean
}
interface Slot {
  worker: Worker | undefined
  exit: Promise<void> | undefined
  active: Pending | undefined
  exited: boolean
  readonly queue: Pending[]
}
function bounded(value: number | undefined, fallback: number, maximum: number): number {
  const result = value ?? fallback
  if (!Number.isSafeInteger(result) || result < 1 || result > maximum)
    throw new RangeError('PARTITION_POOL_LIMIT_INVALID')
  return result
}

/** Internal executor only: does not activate partition routing on the public Storage port. */
export class PartitionPool {
  private readonly slots: Slot[]
  private readonly generation: string
  private readonly layout: PartitionLayout
  private readonly connections: number
  private readonly maximum: number
  private readonly maximumBytes: number
  private readonly ownerMaximum: number
  private readonly timeoutMs: number
  private readonly diagnosticSink: DiagnosticSink | undefined
  private readonly diagnosticEnabled: boolean
  private readonly fullCoverage: boolean
  private readonly telemetry: ReturnType<typeof createStorageWorkerDiagnostics>
  private droppedDiagnostics = 0
  private readonly diagnosticEvents: DiagnosticEvent[] = []
  private sequence = 0
  private count = 0
  private bytes = 0
  private readonly owners = new Map<string, number>()
  private closed = false
  private fatal: Promise<void> | undefined
  private closeTask: Promise<void> | undefined
  constructor(options: PartitionPoolOptions) {
    this.diagnosticSink = options.diagnostics
    this.diagnosticEnabled =
      options.diagnosticsEnabled ??
      (process.env.HBAR_DIAGNOSTICS === undefined
        ? process.env.NODE_ENV !== 'production'
        : process.env.HBAR_DIAGNOSTICS === '1')
    this.fullCoverage = options.diagnosticsFullCoverage ?? process.env.HBAR_DIAGNOSTICS_FULL === '1'
    this.telemetry = createStorageWorkerDiagnostics({
      enabled: this.diagnosticEnabled,
      fullCoverage: this.fullCoverage,
      port: {
        postMessage: (message) => {
          this.deliver(message.event)
        },
      },
    })
    this.layout = createPartitionLayout(options.layout.root)
    if (this.layout.manifest !== options.layout.manifest || this.layout.switchLock !== options.layout.switchLock)
      throw new Error('PARTITION_POOL_LAYOUT_INVALID')
    this.generation = partitionIdSchema.parse(options.generation)
    this.connections = bounded(options.maxConnectionsPerWorker, 2, 4)
    this.maximum = bounded(options.maxPending, 64, 4096)
    this.maximumBytes = bounded(options.maxPendingBytes, 4 * 1024 * 1024, 64 * 1024 * 1024)
    this.ownerMaximum = bounded(options.maxOwnerPending, Math.min(16, this.maximum), this.maximum)
    this.timeoutMs = bounded(options.timeoutMs, 10000, 120000)
    this.slots = Array.from({ length: bounded(options.workers, 2, 4) }, () => ({
      worker: undefined,
      exit: undefined,
      active: undefined,
      exited: false,
      queue: [],
    }))
  }
  private deliver(event: Parameters<DiagnosticSink['emit']>[0]): void {
    if (this.diagnosticEvents.length === 128) {
      this.diagnosticEvents.shift()
      this.droppedDiagnostics++
    }
    this.diagnosticEvents.push(event)
    try {
      this.diagnosticSink?.emit(event)
    } catch {
      this.droppedDiagnostics++
    }
  }
  private observe(event: string, pending?: Pending): void {
    this.telemetry.emit({
      event,
      phase: 'pool',
      level: 'debug',
      ...(pending
        ? {
            storageRequestId: pending.request.id,
            method: pending.request.kind === 'call' ? pending.request.call.method : pending.request.kind,
            instanceId: pending.owner
              ? createHash('sha256')
                  .update(this.generation + pending.owner)
                  .digest('hex')
              : this.generation,
          }
        : {}),
    })
  }
  drainDiagnostics(): DiagnosticEvent[] {
    return this.diagnosticEvents.splice(0)
  }
  diagnosticsSnapshot(): { dropped: number } {
    return { dropped: this.droppedDiagnostics }
  }
  lifecycle(): { started: number; exited: number } {
    return {
      started: this.slots.filter((slot) => slot.worker).length,
      exited: this.slots.filter((slot) => slot.exited).length,
    }
  }
  workerIndex(owner: PartitionOwner): number {
    const key = JSON.stringify(partitionOwnerSchema.parse(owner))
    let hash = 2166136261
    for (const character of key) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
    return (hash >>> 0) % this.slots.length
  }
  call(owner: PartitionOwner, call: StorageCall, options: PartitionPoolCallOptions = {}): Promise<StorageReply> {
    return this.enqueue(owner, { kind: 'call', id: ++this.sequence, owner, call }, options).then((reply) =>
      poolStorageReplySchema.parse(reply),
    )
  }
  async pin(owner: PartitionOwner): Promise<void> {
    await this.enqueue(owner, { kind: 'open', id: ++this.sequence, owner, pin: 1 })
  }
  async unpin(owner: PartitionOwner): Promise<void> {
    await this.enqueue(owner, { kind: 'open', id: ++this.sequence, owner, pin: -1 })
  }
  async stats(): Promise<{
    workers: number
    pending: number
    pendingBytes: number
    connections: number
    pins: number
  }> {
    const values = await Promise.all(
      this.slots.map((slot) =>
        slot.worker
          ? this.enqueueSlot(slot, { kind: 'stats', id: ++this.sequence }, '', {})
          : Promise.resolve({ connections: 0, pins: 0 }),
      ),
    )
    const parsed = values.map((value) => poolStatsSchema.parse(value))
    return {
      workers: this.slots.filter((slot) => slot.worker).length,
      pending: this.count,
      pendingBytes: this.bytes,
      connections: parsed.reduce((sum, value) => sum + value.connections, 0),
      pins: parsed.reduce((sum, value) => sum + value.pins, 0),
    }
  }
  private enqueue(
    owner: PartitionOwner,
    request: PoolRequest,
    options: PartitionPoolCallOptions = {},
  ): Promise<unknown> {
    const slot = this.slots[this.workerIndex(owner)]
    if (!slot) return Promise.reject(new Error('PARTITION_POOL_SLOT_INVALID'))
    return this.enqueueSlot(slot, request, JSON.stringify(partitionOwnerSchema.parse(owner)), options)
  }
  private enqueueSlot(
    slot: Slot,
    raw: PoolRequest,
    owner: string,
    options: PartitionPoolCallOptions,
    internal = false,
  ): Promise<unknown> {
    if (this.closed && !internal) return Promise.reject(new Error('PARTITION_POOL_CLOSED'))
    if (options.signal?.aborted) return Promise.reject(new Error('PARTITION_POOL_CANCELLED'))
    const request = poolRequestSchema.parse(raw)
    const bytes = Buffer.byteLength(JSON.stringify(request))
    const ownerCount = this.owners.get(owner) ?? 0
    if (
      !internal &&
      (this.count >= this.maximum || this.bytes + bytes > this.maximumBytes || ownerCount >= this.ownerMaximum)
    )
      return Promise.reject(new Error('PARTITION_POOL_QUEUE_CAPACITY'))
    const timeoutMs = bounded(options.timeoutMs, this.timeoutMs, 120000)
    return new Promise((resolve, reject) => {
      const pending: Pending = {
        request,
        owner,
        bytes,
        resolve,
        reject,
        signal: options.signal,
        abort: () => {},
        timer: undefined,
        deadline: performance.now() + timeoutMs,
        settled: false,
      }
      pending.abort = () => {
        const index = slot.queue.indexOf(pending)
        if (index < 0) return // A dispatched synchronous SQLite request has no cancellation claim.
        slot.queue.splice(index, 1)
        this.observe('sqlite.pool_queued_cancelled', pending)
        this.settle(pending, new Error('PARTITION_POOL_CANCELLED'), true)
      }
      this.count++
      this.bytes += bytes
      this.owners.set(owner, ownerCount + 1)
      slot.queue.push(pending)
      pending.timer = setTimeout(() => this.expire(slot, pending), timeoutMs)
      this.observe('sqlite.pool_queued', pending)
      options.signal?.addEventListener('abort', pending.abort, { once: true })
      if (options.signal?.aborted) pending.abort()
      this.dispatch(slot)
    })
  }
  private expire(slot: Slot, pending: Pending): void {
    if (pending.settled || this.fatal) return
    const index = slot.queue.indexOf(pending)
    if (index >= 0) {
      slot.queue.splice(index, 1)
      this.observe('sqlite.pool_queue_timeout', pending)
      this.settle(pending, new Error('PARTITION_POOL_QUEUE_TIMEOUT'), true)
      this.dispatch(slot)
    } else if (slot.active === pending) {
      // Once dispatched, synchronous SQLite writes have an unknown outcome.
      // fail() settles only after all owned Workers have physically exited.
      this.fail()
    }
  }
  private settle(pending: Pending, value: unknown, failed = false): void {
    if (pending.settled) return
    pending.settled = true
    if (pending.timer) clearTimeout(pending.timer)
    pending.signal?.removeEventListener('abort', pending.abort)
    this.observe(failed ? 'sqlite.pool_failed' : 'sqlite.pool_completed', pending)
    this.count--
    this.bytes -= pending.bytes
    const remaining = (this.owners.get(pending.owner) ?? 1) - 1
    if (remaining) this.owners.set(pending.owner, remaining)
    else this.owners.delete(pending.owner)
    if (failed) pending.reject(value)
    else pending.resolve(value)
  }
  private dispatch(slot: Slot): void {
    if (slot.active || this.fatal) return
    const pending = slot.queue.shift()
    if (!pending) return
    if (performance.now() >= pending.deadline) {
      this.observe('sqlite.pool_queue_timeout', pending)
      this.settle(pending, new Error('PARTITION_POOL_QUEUE_TIMEOUT'), true)
      this.dispatch(slot)
      return
    }
    slot.active = pending
    if (!slot.worker) {
      let worker: Worker
      try {
        worker = new Worker(new URL('./partition-pool-worker.ts', import.meta.url), {
          workerData: {
            root: this.layout.root,
            generation: this.generation,
            connections: this.connections,
            diagnostics: this.diagnosticEnabled,
            fullCoverage: this.fullCoverage,
          },
        })
      } catch {
        this.fail()
        return
      }
      slot.worker = worker
      slot.exit = new Promise<void>((resolve) =>
        worker.once('exit', () => {
          this.observe('sqlite.pool_worker_exited')
          slot.exited = true
          resolve()
          if (!this.closed || slot.active || slot.queue.length) this.fail()
        }),
      )
      worker.on('error', () => this.fail())
      worker.on('message', (raw: unknown) => {
        if (this.fatal) return
        const result = poolResponseSchema.safeParse(raw)
        const active = slot.active
        if (!result.success || !active || result.data.id !== active.request.id) {
          this.fail()
          return
        }
        this.droppedDiagnostics += result.data.droppedDiagnostics
        for (const event of result.data.diagnostics)
          this.deliver({
            ...event,
            storageRequestId: active.request.id,
            instanceId: active.owner
              ? createHash('sha256')
                  .update(this.generation + active.owner)
                  .digest('hex')
              : this.generation,
          })
        if (active.request.kind === 'call' && result.data.ok) {
          const reply = poolStorageReplySchema.safeParse(result.data.result)
          if (!reply.success || (!reply.data.ok && reply.data.code === 'STORAGE_RESULT_UNKNOWN')) {
            this.fail()
            return
          }
        }
        slot.active = undefined
        this.settle(active, result.data.ok ? result.data.result : new Error(result.data.code), !result.data.ok)
        this.dispatch(slot)
      })
    }
    this.observe('sqlite.pool_dispatched', pending)
    try {
      slot.worker.postMessage(pending.request)
    } catch {
      this.fail()
    }
  }
  private fail(): void {
    if (this.fatal) return
    this.observe('sqlite.pool_fatal')
    this.closed = true
    this.fatal = Promise.resolve().then(async () => {
      await Promise.all(
        this.slots.map(async (slot) => {
          if (slot.worker) await slot.worker.terminate()
          if (slot.exit) await slot.exit
        }),
      )
      for (const slot of this.slots) {
        if (slot.active) {
          this.settle(slot.active, new Error('STORAGE_RESULT_UNKNOWN'), true)
          slot.active = undefined
        }
        for (const pending of slot.queue.splice(0)) this.settle(pending, new Error('PARTITION_POOL_CLOSED'), true)
      }
    })
    this.fatal.catch((error: unknown) => {
      for (const slot of this.slots) {
        if (slot.active) {
          this.settle(slot.active, error, true)
          slot.active = undefined
        }
        for (const pending of slot.queue.splice(0)) this.settle(pending, error, true)
      }
    })
  }
  close(): Promise<void> {
    if (this.closeTask) return this.closeTask
    this.closed = true
    this.closeTask = (async () => {
      if (this.fatal) {
        await this.fatal
        return
      }
      try {
        await Promise.all(
          this.slots.map(async (slot) => {
            if (!slot.worker && !slot.queue.length) return
            await this.enqueueSlot(slot, { kind: 'close', id: ++this.sequence }, '', {}, true)
            if (slot.exit) await slot.exit
          }),
        )
      } catch (error: unknown) {
        this.fail()
        await this.fatal
        throw error
      }
    })()
    return this.closeTask
  }
}
