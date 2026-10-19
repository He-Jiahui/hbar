import { HbarError, type WireNotification } from '@hbar/contracts'
import {
  RUNTIME_NOTIFICATION_BATCH_MAX_BYTES,
  RUNTIME_NOTIFICATION_BATCH_MAX_EVENTS,
  runtimeWireNotificationBatchSchema,
  runtimeWireNotificationSchema,
} from '@hbar/contracts/runtime-notifications'

export type RuntimeNotificationClass = 'session-event' | 'stream-update' | 'other'
export interface RuntimeNotificationDeliverySnapshot {
  readonly queued: number
  readonly bufferedBytes: number
  readonly queuedPeak: number
  readonly bytesPeak: number
  readonly invalidEvents: number
  readonly acceptedEvents: number
  /** Events whose transport send promises resolved; this does not assert Host-side projection application. */
  readonly deliveredEvents: number
  readonly overflowCount: number
  readonly batchTransfers: number
  readonly singleTransfers: number
  readonly failure: string | null
  readonly queuedByClass: Readonly<Record<RuntimeNotificationClass, number>>
}
export interface RuntimeNotificationFailureSnapshot {
  readonly code: string
  readonly queued: number
  readonly bufferedBytes: number
  readonly queuedPeak: number
  readonly bytesPeak: number
  readonly overflowCount: number
  readonly acceptedEvents: number
  readonly deliveredEvents: number
  readonly batchTransfers: number
  readonly singleTransfers: number
  readonly rejectedBytes: number
  readonly incomingClass: RuntimeNotificationClass | null
  readonly queuedByClass: Readonly<Record<RuntimeNotificationClass, number>>
}

function notificationClass(event: WireNotification): RuntimeNotificationClass {
  if (event.method === 'session.event') return 'session-event'
  if (event.method === 'stream.update') return 'stream-update'
  return 'other'
}

function emptyClassCounts(): Record<RuntimeNotificationClass, number> {
  return { 'session-event': 0, 'stream-update': 0, other: 0 }
}

function plainEvent(value: unknown): void {
  let nodes = 0
  const ancestors = new Set<object>()
  const visit = (item: unknown, depth: number): void => {
    if (++nodes > 500_000 || depth > 48) throw new Error('Event structure exceeds its bound')
    if (item === null || item === undefined || typeof item === 'string' || typeof item === 'boolean') return
    if (typeof item === 'number' && Number.isFinite(item)) return
    if (typeof item !== 'object' || item === null || (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null))
      throw new Error('Event contains executable or instance data')
    if (ancestors.has(item)) throw new Error('Event contains a cycle')
    ancestors.add(item)
    try {
      for (const [key, child] of Object.entries(item)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw new Error('Event field is reserved')
        visit(child, depth + 1)
      }
    } finally { ancestors.delete(item) }
  }
  visit(value, 0)
}

export interface RuntimeNotificationDeliveryOptions {
  readonly send: (event: WireNotification) => Promise<void>
  readonly sendBatch?: (events: readonly WireNotification[]) => Promise<void>
  readonly failed: (code: string, snapshot: RuntimeNotificationFailureSnapshot) => void
  readonly diagnostic?: (code: string) => void
  readonly maximumQueued?: number
  readonly maximumBytes?: number
}
/** Capture event data before enqueueing, retain sequence order and bound both pending events and UTF-8 bytes. */
export class RuntimeNotificationDelivery {
  private readonly queue: Array<{ json: string; bytes: number; eventClass: RuntimeNotificationClass }> = []
  private bytes = 0
  private queuedPeak = 0
  private bytesPeak = 0
  private sending: Promise<void> | undefined
  private failure: string | null = null
  private closed = false
  private invalidEvents = 0
  private acceptedEvents = 0
  private deliveredEvents = 0
  private overflowCount = 0
  private batchTransfers = 0
  private singleTransfers = 0
  private readonly maximumQueued: number
  private readonly maximumBytes: number
  constructor(private readonly options: RuntimeNotificationDeliveryOptions) {
    this.maximumQueued = options.maximumQueued ?? 256
    this.maximumBytes = options.maximumBytes ?? 32 * 1024 * 1024
    if (!Number.isSafeInteger(this.maximumQueued) || this.maximumQueued < 1 || this.maximumQueued > 256 ||
      !Number.isSafeInteger(this.maximumBytes) || this.maximumBytes < 1 || this.maximumBytes > 32 * 1024 * 1024)
      throw new HbarError('INVALID_INPUT', 'Invalid notification delivery bound')
  }
  publish(value: WireNotification): void {
    if (this.closed || this.failure) return
    let json: string
    try { const parsed = runtimeWireNotificationSchema.parse(value); plainEvent(parsed); json = JSON.stringify(parsed) }
    catch {
      this.invalidEvents++
      try { this.options.diagnostic?.('RUNTIME_NOTIFICATION_INVALID') } catch { console.error('[hbar runtime] notification diagnostic observer failed') }
      return
    }
    const bytes = Buffer.byteLength(json)
    const eventClass = notificationClass(value)
    if (this.queue.length >= this.maximumQueued || this.bytes + bytes > this.maximumBytes) {
      this.fail('RUNTIME_NOTIFICATION_CAPACITY', bytes, eventClass); return
    }
    this.queue.push({ json, bytes, eventClass })
    this.bytes += bytes
    this.acceptedEvents++
    this.queuedPeak = Math.max(this.queuedPeak, this.queue.length)
    this.bytesPeak = Math.max(this.bytesPeak, this.bytes)
    this.flush()
  }
  idleCounts() {
    return {
      queued: this.queue.length,
      sending: Number(this.sending !== undefined),
      bytes: this.bytes,
      failed: this.failure !== null,
      closed: this.closed,
    }
  }
  snapshot(): RuntimeNotificationDeliverySnapshot {
    const queuedByClass = emptyClassCounts()
    for (const item of this.queue) queuedByClass[item.eventClass]++
    return { queued: this.queue.length, bufferedBytes: this.bytes, queuedPeak: this.queuedPeak, bytesPeak: this.bytesPeak,
      invalidEvents: this.invalidEvents, acceptedEvents: this.acceptedEvents, deliveredEvents: this.deliveredEvents,
      overflowCount: this.overflowCount, batchTransfers: this.batchTransfers, singleTransfers: this.singleTransfers,
      failure: this.failure, queuedByClass }
  }
  async settled(): Promise<void> { while (this.sending) await this.sending }
  dispose(): void { this.closed = true; this.queue.length = 0; this.bytes = 0 }
  private fail(code: string, rejectedBytes = 0, incomingClass: RuntimeNotificationClass | null = null): void {
    if (this.failure) return
    if (code === 'RUNTIME_NOTIFICATION_CAPACITY') this.overflowCount++
    this.failure = code
    const snapshot = this.snapshot()
    const failureSnapshot: RuntimeNotificationFailureSnapshot = { code, queued: snapshot.queued, bufferedBytes: snapshot.bufferedBytes,
      queuedPeak: snapshot.queuedPeak, bytesPeak: snapshot.bytesPeak, overflowCount: snapshot.overflowCount,
      acceptedEvents: snapshot.acceptedEvents, deliveredEvents: snapshot.deliveredEvents,
      batchTransfers: snapshot.batchTransfers, singleTransfers: snapshot.singleTransfers, rejectedBytes,
      incomingClass, queuedByClass: snapshot.queuedByClass }
    this.queue.length = 0
    this.bytes = 0
    try { this.options.failed(code, failureSnapshot) } catch { console.error('[hbar runtime] notification failure observer failed') }
  }
  private flush(): void {
    if (this.sending || this.closed || this.failure) return
    this.sending = Promise.resolve().then(async () => {
      while (!this.closed && !this.failure && this.queue.length) {
        const batch: typeof this.queue = []
        let batchBytes = 0
        for (const next of this.queue) {
          const envelopeBytes = batchBytes + next.bytes + batch.length + 2
          if (batch.length >= RUNTIME_NOTIFICATION_BATCH_MAX_EVENTS ||
            (batch.length > 0 && envelopeBytes > RUNTIME_NOTIFICATION_BATCH_MAX_BYTES)) break
          batch.push(next)
          batchBytes += next.bytes
        }
        const events = batch.map(item => {
          const decoded: unknown = JSON.parse(item.json)
          return runtimeWireNotificationSchema.parse(decoded)
        })
        if (this.options.sendBatch && events.length > 1) {
          await this.options.sendBatch(runtimeWireNotificationBatchSchema.parse(events))
          this.batchTransfers++
          this.deliveredEvents += events.length
        } else for (const event of events) {
          await this.options.send(event)
          this.singleTransfers++
          this.deliveredEvents++
        }
        for (const sent of batch) {
          if (this.queue[0] !== sent) break
          this.queue.shift()
          this.bytes -= sent.bytes
        }
      }
    }).catch(() => this.fail('RUNTIME_NOTIFICATION_DISCONNECTED')).finally(() => {
      this.sending = undefined
      if (this.queue.length && !this.closed && !this.failure) this.flush()
    })
  }
}
