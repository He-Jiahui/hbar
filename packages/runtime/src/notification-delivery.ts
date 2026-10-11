import { HbarError, type WireNotification } from '@hbar/contracts'
import { runtimeWireNotificationSchema } from '@hbar/contracts/runtime-notifications'

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
  readonly failed: (code: string) => void
  readonly diagnostic?: (code: string) => void
  readonly maximumQueued?: number
  readonly maximumBytes?: number
}
/** Capture event data before enqueueing, retain sequence order and bound both pending events and UTF-8 bytes. */
export class RuntimeNotificationDelivery {
  private readonly queue: Array<{ json: string; bytes: number }> = []
  private bytes = 0
  private queuedPeak = 0
  private bytesPeak = 0
  private sending: Promise<void> | undefined
  private failure: string | null = null
  private closed = false
  private invalidEvents = 0
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
    if (this.queue.length >= this.maximumQueued || this.bytes + bytes > this.maximumBytes) {
      this.fail('RUNTIME_NOTIFICATION_CAPACITY'); return
    }
    this.queue.push({ json, bytes })
    this.bytes += bytes
    this.queuedPeak = Math.max(this.queuedPeak, this.queue.length)
    this.bytesPeak = Math.max(this.bytesPeak, this.bytes)
    this.flush()
  }
  snapshot() { return { queued: this.queue.length, bufferedBytes: this.bytes, queuedPeak: this.queuedPeak, bytesPeak: this.bytesPeak, invalidEvents: this.invalidEvents, failure: this.failure } }
  async settled(): Promise<void> { await this.sending }
  dispose(): void { this.closed = true; this.queue.length = 0; this.bytes = 0 }
  private fail(code: string): void {
    this.failure = code
    this.queue.length = 0
    this.bytes = 0
    try { this.options.failed(code) } catch { console.error('[hbar runtime] notification failure observer failed') }
  }
  private flush(): void {
    if (this.sending || this.closed || this.failure) return
    this.sending = Promise.resolve().then(async () => {
      while (!this.closed && !this.failure && this.queue.length) {
        const next = this.queue[0]!
        await this.options.send(runtimeWireNotificationSchema.parse(JSON.parse(next.json)))
        if (this.queue[0] === next) { this.queue.shift(); this.bytes -= next.bytes }
      }
    }).catch(() => this.fail('RUNTIME_NOTIFICATION_DISCONNECTED')).finally(() => { this.sending = undefined })
  }
}
