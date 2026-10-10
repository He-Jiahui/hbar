import { AsyncLocalStorage } from 'node:async_hooks'
import {
  diagnosticCorrelationSchema,
  diagnosticEventSchema,
  type DiagnosticCorrelation,
  type DiagnosticEvent,
  type DiagnosticScopePort,
  type DiagnosticSink,
  type ReadonlyDiagnosticCorrelation,
} from '@hbar/contracts'

const correlationKeys = ['instanceId', 'contextId', 'rpcId', 'requestId', 'sessionId', 'runId'] as const

function freezeCorrelation(input: ReadonlyDiagnosticCorrelation): ReadonlyDiagnosticCorrelation {
  const parsed = diagnosticCorrelationSchema.parse(input)
  return Object.freeze({ ...parsed })
}

/** Creates an async-local, bounded request correlation scope. */
export function createDiagnosticScope(): DiagnosticScopePort {
  const storage = new AsyncLocalStorage<ReadonlyDiagnosticCorrelation>()
  const run = <T>(context: ReadonlyDiagnosticCorrelation, operation: () => T): T =>
    storage.run(freezeCorrelation(context), operation)
  return {
    current: () => storage.getStore(),
    run,
  }
}

/**
 * Adds the current correlation IDs to validated events. Explicit event fields
 * win over ambient scope fields. Sink failures and malformed events are
 * contained so instrumentation cannot change business control flow.
 */
export function protectDiagnosticSink(sink: DiagnosticSink, scope: DiagnosticScopePort): DiagnosticSink {
  return {
    emit(event: DiagnosticEvent): void {
      try {
        const parsed = diagnosticEventSchema.safeParse(event)
        if (!parsed.success) return
        const ambient = scope.current()
        if (!ambient) {
          try {
            sink.emit(parsed.data)
          } catch {
            // Diagnostics are best effort and must never break the caller.
          }
          return
        }
        const merged: DiagnosticEvent & Partial<DiagnosticCorrelation> = { ...parsed.data }
        for (const key of correlationKeys) {
          if (merged[key] === undefined) merged[key] = ambient[key]
        }
        const safe = diagnosticEventSchema.safeParse(merged)
        if (!safe.success) return
        try {
          sink.emit(safe.data)
        } catch {
          // Diagnostics are best effort and must never break the caller.
        }
      } catch {
        // Includes throwing getters and hostile scope/sink implementations.
      }
    },
  }
}
