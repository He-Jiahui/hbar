import { writeSync } from 'node:fs'
import { diagnosticEvent, type DiagnosticEvent } from '@hbar/contracts/diagnostics'
import type { RuntimeOwner } from '@hbar/contracts/runtime'

const bounded = (value: number): number =>
  Number.isFinite(value) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, value)) : 0
export class HeartbeatEvidence {
  private wallReceived: number
  private monoReceived: number
  private monitorAt: number
  private tickAt: number
  private reportedAt = Number.NEGATIVE_INFINITY
  private failures = false
  constructor(
    private readonly cadence: number,
    wall: number,
    mono: number,
  ) {
    this.wallReceived = wall
    this.monoReceived = mono
    this.monitorAt = mono
    this.tickAt = mono
  }
  received(wall: number, mono: number): void {
    this.wallReceived = wall
    this.monoReceived = mono
  }
  monitor(wall: number, mono: number, interval: number) {
    const result = {
      durationMs: bounded(wall - this.wallReceived),
      executionMs: bounded(mono - this.monoReceived),
      queueWaitMs: bounded(mono - this.monitorAt - interval),
    }
    this.monitorAt = mono
    return result
  }
  tick(mono: number): number {
    const gap = bounded(mono - this.tickAt - this.cadence)
    this.tickAt = mono
    return gap
  }
  /** At most one nonfatal anomaly per30s; the first send failure is always preserved. */
  shouldReport(mono: number, failure = false): boolean {
    if (failure) {
      if (this.failures) return false
      this.failures = true
      return true
    }
    if (mono - this.reportedAt < 30_000) return false
    this.reportedAt = mono
    return true
  }
}

export function writeHeartbeatEvidence(
  owner: RuntimeOwner,
  phase: 'parent_timeout' | 'child_tick_delayed' | 'child_ack_slow' | 'child_send_failed',
  values: Pick<
    DiagnosticEvent,
    'durationMs' | 'executionMs' | 'queueWaitMs' | 'replyMs' | 'pending' | 'recordsIn' | 'bytesIn'
  >,
  write: (line: string) => void = (line) => {
    writeSync(2, line)
  },
): void {
  try {
    const event = diagnosticEvent({
      component: 'host',
      level: 'error',
      event: 'host.runtime_heartbeat_evidence',
      phase,
      contextId: owner.unitId,
      requestId: owner.incarnation,
      processId: process.pid,
      errorCode:
        phase === 'parent_timeout'
          ? 'RUNTIME_HEARTBEAT_TIMEOUT'
          : phase === 'child_send_failed'
            ? 'RUNTIME_HEARTBEAT_SEND_FAILED'
            : 'RUNTIME_HEARTBEAT_DELAYED',
      outcome: 'unknown',
      ...values,
    })
    write(JSON.stringify(event) + '\n')
  } catch {
    /* Diagnostics cannot alter fencing, heartbeat or exit. */
  }
}
