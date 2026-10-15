import { diagnosticEvent } from '@hbar/contracts/diagnostics'
import type { DiagnosticEvent } from '@hbar/contracts/diagnostics'
import type { RuntimeOwner } from '@hbar/contracts/runtime'

export type DriverStopReason =
  | 'stream_flush_scheduled_failure'
  | 'stream_flush_requeued_failure'
  | 'cancel_grace_expired'
  | 'completion_event_failure'
  | 'completion_flush_failure'
  | 'terminal_delivery_failure'

/** Observation only: the original fail-closed exit stays synchronous and never waits for IPC. */
export function stopDriverWithDiagnostic(options: {
  readonly owner: RuntimeOwner
  readonly reason: DriverStopReason
  readonly invocationId?: string
  readonly activeCount: number
  readonly notify: (event: DiagnosticEvent) => Promise<void>
  readonly exit: (code: number) => never
}): never {
  // The failing transport may also lose the structured event. Keep a bounded,
  // fixed-vocabulary fallback; never include the rejected operation's error.
  try {
    const event = diagnosticEvent({
      component: 'host',
      level: 'error',
      event: 'host.runtime_driver_stop',
      phase: options.reason,
      errorCode: `DRIVER_STOP_${options.reason.toUpperCase()}`,
      contextId: options.owner.unitId,
      requestId: options.owner.incarnation,
      processId: process.pid,
      exitCode: 76,
      outcome: 'failure',
      rpcId: crypto.randomUUID(),
      ...(options.invocationId &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(options.invocationId)
        ? { callId: options.invocationId }
        : {}),
      pending: Math.max(0, Math.min(64, Math.trunc(options.activeCount))),
    })
    try {
      console.error(`[hbar runtime] driver stop ${JSON.stringify(event)}`)
    } catch {
      /* Observation cannot own exit. */
    }
    options.notify(event).catch(() => {
      /* Failed diagnostics never delay or replace the original exit. */
    })
  } catch {
    try {
      console.error('[hbar runtime] driver stop diagnostic unavailable')
    } catch {
      /* Observation cannot own exit. */
    }
  }
  return options.exit(76)
}
