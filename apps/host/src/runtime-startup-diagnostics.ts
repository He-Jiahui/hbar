import { diagnosticEvent, type DiagnosticSink } from '@hbar/contracts'
import { runtimeDomainError } from '@hbar/runtime'

/** Keeps startup phase diagnostics bounded to the public, non-sensitive event fields. */
export class RuntimeStartupDiagnostics {
  private phase = 'prepare'
  private lastSuccessfulPhase: string | undefined
  private phaseStartedAt = performance.now()

  constructor(
    private readonly sink: DiagnosticSink | undefined,
    private readonly processId: number,
  ) {}

  beginAttempt(): void {
    this.lastSuccessfulPhase = undefined
  }

  begin(phase: string): void {
    const normalized = phase
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, '_')
      .slice(0, 48)
    this.phase = /^[a-z]/.test(normalized) ? normalized : `phase.${normalized}`.slice(0, 48)
    this.phaseStartedAt = performance.now()
  }

  succeeded(recoveryAttempt: number): void {
    this.emit({
      event: 'host.runtime_startup_phase',
      level: 'info',
      outcome: 'success',
      phase: this.phase,
      recoveryAttempt,
    })
    this.lastSuccessfulPhase = this.phase
  }

  failed(errorCode: string, recoveryAttempt: number): void {
    const phase = this.lastSuccessfulPhase
      ? `failed.${this.phase.slice(-24)}.after.${this.lastSuccessfulPhase.slice(-24)}`
      : `failed.${this.phase.slice(-56)}`
    this.emit({
      event: 'host.runtime_startup_failed',
      level: 'error',
      outcome: 'failure',
      phase,
      errorCode,
      recoveryAttempt,
    })
  }

  private emit(input: {
    readonly event: string
    readonly level: 'info' | 'error'
    readonly outcome: 'success' | 'failure'
    readonly phase: string
    readonly recoveryAttempt: number
    readonly errorCode?: string
  }): void {
    if (!this.sink) return
    try {
      this.sink.emit(
        diagnosticEvent({
          component: 'host',
          processId: this.processId,
          ...input,
          durationMs: Math.max(0, performance.now() - this.phaseStartedAt),
        }),
      )
    } catch {
      // Startup diagnostics must never change recovery behavior.
    }
  }
}

/** Records the retry boundary without exposing an exception message or cause payload. */
export function recordRuntimeStartupFailure(
  diagnostics: RuntimeStartupDiagnostics,
  error: unknown,
  recoveryAttempt: number,
): void {
  diagnostics.failed(runtimeDomainError(error)?.code ?? 'RUNTIME_START_FAILED', recoveryAttempt)
}
