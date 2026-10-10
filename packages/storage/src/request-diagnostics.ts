import {
  diagnosticCorrelationSchema,
  diagnosticEvent,
  diagnosticEventSchema,
  type DiagnosticEvent,
  type DiagnosticScopePort,
  type DiagnosticSink,
  type ReadonlyDiagnosticCorrelation,
} from '@hbar/contracts'

export interface StorageRequestDiagnosticsOptions {
  readonly sink?: DiagnosticSink
  readonly scope?: DiagnosticScopePort
  readonly instanceId?: string
  readonly fullCoverage?: boolean
}

/** Owns only diagnostic metadata. It never observes operation arguments or results. */
export function createStorageRequestDiagnostics(options: StorageRequestDiagnosticsOptions = {}) {
  let sequence = 0
  let dropped = 0

  function capture(): ReadonlyDiagnosticCorrelation | undefined {
    try {
      const ambient = options.scope?.current()
      const parsed = diagnosticCorrelationSchema.safeParse({
        ...ambient,
        ...(options.instanceId === undefined ? {} : { instanceId: options.instanceId }),
      })
      return parsed.success ? Object.freeze(parsed.data) : undefined
    } catch {
      dropped += 1
      return undefined
    }
  }

  function forward(event: DiagnosticEvent, correlation?: ReadonlyDiagnosticCorrelation): void {
    try {
      const parsed = diagnosticEventSchema.safeParse({ ...correlation, ...event })
      if (!parsed.success) {
        dropped += 1
        return
      }
      options.sink?.emit(parsed.data)
    } catch {
      dropped += 1
    }
  }

  function record(
    input: Omit<DiagnosticEvent, 'schemaVersion' | 'time' | 'monotonicMs' | 'component'>,
    correlation?: ReadonlyDiagnosticCorrelation,
  ): void {
    try {
      forward(diagnosticEvent({ component: 'storage', ...input }), correlation ?? capture())
    } catch {
      dropped += 1
    }
  }

  function settled(input: {
    readonly id: number
    readonly method: string
    readonly startedAt: number
    readonly pending: number
    readonly outcome: 'success' | 'failure' | 'unknown'
    readonly errorCode?: string
    readonly correlation?: ReadonlyDiagnosticCorrelation
  }): void {
    try {
      sequence += 1
      const durationMs = Math.max(0, performance.now() - input.startedAt)
      const slow = durationMs >= 100
      if (input.outcome === 'success' && !slow && !options.fullCoverage && sequence % 16 !== 0) return
      record(
        {
          event: input.outcome === 'success' ? 'storage.request_completed' : 'storage.request_failed',
          phase: 'roundtrip',
          level: input.outcome !== 'success' ? 'error' : slow ? 'warn' : 'debug',
          storageRequestId: input.id,
          method: input.method,
          durationMs,
          pending: input.pending,
          outcome: input.outcome,
          sampled: true,
          ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
        },
        input.correlation,
      )
    } catch {
      dropped += 1
    }
  }

  function dispatched(input: {
    readonly id: number
    readonly method: string
    readonly pending: number
    readonly correlation?: ReadonlyDiagnosticCorrelation
  }): void {
    try {
      if (!options.fullCoverage) return
      record(
        {
          event: 'storage.request_dispatched',
          phase: 'dispatch',
          level: 'debug',
          storageRequestId: input.id,
          method: input.method,
          pending: input.pending,
          outcome: 'unknown',
          sampled: true,
        },
        input.correlation,
      )
    } catch {
      dropped += 1
    }
  }

  return { capture, forward, record, dispatched, settled, getDroppedCount: () => dropped }
}
