import { z } from 'zod'
import { HbarError } from '@hbar/contracts/errors'

const id = z.string().uuid()
/** Physical provider receipts stay separate from observational diagnostics and model step IDs. */
export class RuntimeModelActivities {
  private readonly active = new Set<string>()
  private readonly settled = new Set<string>()
  private known = false
  private opaque = false
  markOpaque(): void {
    this.opaque = true
  }
  begin(raw: string): string {
    const requestId = id.parse(raw)
    if (this.settled.has(requestId))
      throw new HbarError('MODEL_ACTIVITY_EXPIRED', 'A settled physical request receipt cannot start another request')
    if (this.active.has(requestId)) return requestId
    if (this.active.size >= 64) throw new HbarError('BUSY', 'Physical model request capacity is full')
    this.active.add(requestId)
    this.known = true
    return requestId
  }
  settle(raw: string): void {
    const requestId = id.parse(raw)
    if (this.settled.has(requestId)) return
    if (!this.active.delete(requestId))
      throw new HbarError('MODEL_ACTIVITY_EXPIRED', 'The original physical model request receipt is unavailable')
    this.settled.add(requestId)
    while (this.settled.size > 128) {
      const oldest = this.settled.values().next().value
      if (oldest) this.settled.delete(oldest)
    }
  }
  /** An opaque driver that never reports physical requests remains conservatively active. */
  get quiescent(): boolean {
    return this.known && !this.opaque && this.active.size === 0
  }
  snapshot() {
    return { known: this.known, active: this.active.size, settled: this.settled.size }
  }
}
