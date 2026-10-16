import { HbarError, type diagnosticEvent } from '@hbar/contracts'
import type { RuntimeOwner } from '@hbar/contracts/runtime'

export type IdleCheckpointStage =
  'admission' | 'catalog' | 'preview' | 'offer' | 'quiesce' | 'commit' | 'arm' | 'identity'
type Status = 'busy' | 'noop' | 'prepared' | 'unknown'
type Diagnostic = Parameters<typeof diagnosticEvent>[0]
const allowedCodes = new Set([
  'BUSY',
  'IPC_TIMEOUT',
  'IPC_DISCONNECTED',
  'IPC_PROTOCOL',
  'IPC_CAPACITY',
  'ABORTED',
  'RUNTIME_OWNER_REVOKED',
  'RUNTIME_RECOVERING',
  'SESSION_WAKE_FENCED',
  'SESSION_WAKE_STALE',
  'SESSION_WAKE_UNKNOWN',
  'SESSION_WAKE_NOT_DUE',
  'MAINTENANCE_INSPECTION_UNKNOWN',
  'MAINTENANCE_INSPECTION_BUSY',
  'MAINTENANCE_INSPECTION_STALE',
])
/** Fixed vocabulary only. Original errors and payloads never reach the observer. */
export class IdleCheckpointDiagnostic {
  private stage: IdleCheckpointStage = 'admission'
  private finished = false
  private readonly started: number
  constructor(
    private readonly options: {
      readonly domain: 'goal' | 'maintenance'
      readonly owner: RuntimeOwner
      readonly emit: (input: Diagnostic) => void
      readonly now?: () => number
    },
  ) {
    this.started = this.now()
  }
  private now(): number {
    return this.options.now?.() ?? performance.now()
  }
  at(stage: IdleCheckpointStage): void {
    this.stage = stage
  }
  result(status: Status, error?: unknown): { status: Status; owner: RuntimeOwner } {
    if (!this.finished) {
      this.finished = true
      let errorCode: string | undefined
      if (error !== undefined)
        errorCode = error instanceof HbarError && allowedCodes.has(error.code) ? error.code : 'IDLE_CHECKPOINT_ERROR'
      else if (status === 'unknown') errorCode = 'IDLE_CHECKPOINT_IDENTITY_UNCONFIRMED'
      const elapsed = this.now() - this.started
      const durationMs = Number.isFinite(elapsed) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, elapsed)) : 0
      try {
        this.options.emit({
          component: 'host',
          event: `host.runtime_idle_${this.options.domain}_checkpoint`,
          level: status === 'unknown' ? 'error' : 'debug',
          phase: `${this.stage}.generation.${this.options.owner.generation}`,
          contextId: this.options.owner.unitId,
          requestId: this.options.owner.incarnation,
          durationMs,
          outcome: status === 'unknown' ? 'unknown' : status === 'busy' ? 'skipped' : 'success',
          ...(errorCode ? { errorCode } : {}),
        })
      } catch {
        /* Observer failure cannot change checkpoint result or authority. */
      }
    }
    return { status, owner: this.options.owner }
  }
}
