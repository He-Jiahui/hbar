import { diagnosticEvent, type DiagnosticEvent } from '@hbar/contracts'

export type StorageWorkerDiagnosticMessage = {
  readonly type: 'diagnostic'
  readonly event: DiagnosticEvent
  /** Internal worker request sequence, kept outside the public event schema for Host correlation. */
  readonly operationId?: number
}

export interface StorageWorkerDiagnosticPort {
  postMessage(message: StorageWorkerDiagnosticMessage): void
}

export interface StorageWorkerDiagnosticOptions {
  readonly enabled?: boolean
  readonly fullCoverage?: boolean
  readonly instanceId?: string
  readonly port?: StorageWorkerDiagnosticPort | null
}

const FAST_SAMPLE_EVERY = 16
const SQLITE_ERROR_PREFIX =
  /^SQLITE_(?:ABORT|AUTH|BUSY|CANTOPEN|CONSTRAINT|CORRUPT|DONE|EMPTY|ERROR|EXIST|FULL|INTERRUPT|IOERR|LOCKED|MISMATCH|MISUSE|NOLFS|NOMEM|NOTADB|NOTICE|PERM|PROTOCOL|RANGE|READONLY|SCHEMA|TOOBIG|UNKNOWN|WARNING)(?:_[A-Z0-9]+)*$/
const STORAGE_ERROR_CODES = new Set([
  'STORAGE_CLOSED',
  'STORAGE_TIMEOUT',
  'STORAGE_WORKER_EXITED',
  'STORAGE_WORKER_FAILED',
  'STORAGE_ERROR',
])

export function safeStorageErrorCode(error: unknown, fallback = 'STORAGE_ERROR'): string {
  try {
    if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
      const code = error.code
        .toUpperCase()
        .replace(/[^A-Z0-9_.-]/g, '_')
        .slice(0, 128)
      if (SQLITE_ERROR_PREFIX.test(code) || STORAGE_ERROR_CODES.has(code)) return code
    }
  } catch {
    // An error object can expose a throwing getter. Diagnostics must not observe it.
  }
  const safeFallback = fallback
    .toUpperCase()
    .replace(/[^A-Z0-9_.-]/g, '_')
    .slice(0, 128)
  return /^[A-Z][A-Z0-9_.-]*$/.test(safeFallback) ? safeFallback : 'STORAGE_ERROR'
}

export function createStorageWorkerDiagnostics(options: StorageWorkerDiagnosticOptions = {}) {
  let sequence = 0
  let dropped = 0
  const enabled = options.enabled ?? true
  const fullCoverage = options.fullCoverage ?? false
  const port = options.port

  function emit(
    input: Omit<DiagnosticEvent, 'schemaVersion' | 'time' | 'monotonicMs' | 'component' | 'instanceId'> & {
      readonly component?: DiagnosticEvent['component']
      readonly instanceId?: string
      readonly operationId?: number
    },
  ): void {
    if (!enabled || !port) return
    try {
      const { component: providedComponent, instanceId: providedInstanceId, operationId, ...rest } = input
      const event = diagnosticEvent({
        ...rest,
        component: providedComponent ?? 'sqlite',
        ...((providedInstanceId ?? options.instanceId) ? { instanceId: providedInstanceId ?? options.instanceId } : {}),
      })
      port.postMessage({ type: 'diagnostic', event, ...(operationId === undefined ? {} : { operationId }) })
    } catch {
      dropped += 1
    }
  }

  function operation(
    id: number,
    method: string,
    startedAt: number,
    outcome: 'success' | 'failure' | 'unknown',
    error?: unknown,
  ): void {
    try {
      sequence += 1
      const failed = outcome !== 'success'
      const executionMs = Math.max(0, performance.now() - startedAt)
      const slow = executionMs >= 100
      const sampled = fullCoverage || failed || slow || sequence % FAST_SAMPLE_EVERY === 0
      if (!sampled) return
      emit({
        event: failed ? 'sqlite.request_failed' : 'sqlite.request_completed',
        phase: 'execute',
        level: failed ? 'error' : slow ? 'warn' : 'debug',
        method,
        storageRequestId: id,
        operationId: id,
        outcome,
        executionMs,
        durationMs: executionMs,
        sampled: true,
        ...(failed ? { errorCode: safeStorageErrorCode(error) } : {}),
      })
    } catch {
      dropped += 1
    }
  }

  function started(id: number, method: string): void {
    if (!fullCoverage) return
    emit({
      event: 'sqlite.request_started',
      phase: 'execute',
      level: 'debug',
      method,
      storageRequestId: id,
      operationId: id,
      outcome: 'unknown',
      sampled: true,
    })
  }

  return {
    emit,
    started,
    operation,
    getDroppedCount: () => dropped,
  }
}

export type StorageWorkerDiagnostics = ReturnType<typeof createStorageWorkerDiagnostics>
