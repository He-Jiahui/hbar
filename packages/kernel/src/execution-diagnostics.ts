import { diagnosticEvent, type DiagnosticCorrelation, type DiagnosticSink } from '@hbar/contracts'
import type { DiagnosticScopePort } from '@hbar/contracts'

export interface KernelExecutionDiagnosticsOptions {
  readonly sink?: DiagnosticSink | undefined
  readonly scope?: DiagnosticScopePort | undefined
  readonly instanceId?: string | undefined
}

export interface KernelRunDiagnosticIdentity extends DiagnosticCorrelation {
  readonly stepId?: string | undefined
  readonly callId?: string | undefined
}

export interface KernelModelDiagnosticIdentity extends KernelRunDiagnosticIdentity {
  readonly method?: string | undefined
}

/**
 * Redacted, bounded diagnostics for Kernel execution.
 *
 * This adapter deliberately accepts only identifiers and counters. It never
 * serializes prompts, model output, tool arguments, SQL, paths, or exception
 * text. Every call is best effort so instrumentation cannot alter execution.
 */
export class KernelExecutionDiagnostics {
  private readonly sink: DiagnosticSink | undefined
  private readonly scope: DiagnosticScopePort | undefined
  private readonly instanceId: string | undefined

  constructor(options: KernelExecutionDiagnosticsOptions = {}) {
    this.sink = options.sink
    this.scope = options.scope
    this.instanceId = options.instanceId
  }

  runStarted(identity: KernelRunDiagnosticIdentity, queueDepth?: number): void {
    this.emit('run.started', 'info', identity, {
      outcome: 'success',
      ...(boundedCount(queueDepth) === undefined ? {} : { queueDepth: boundedCount(queueDepth) }),
    })
  }

  runAdmitted(identity: KernelRunDiagnosticIdentity, queueDepth?: number): void {
    this.emit('run.admitted', 'debug', identity, {
      outcome: 'success',
      ...(boundedCount(queueDepth) === undefined ? {} : { queueDepth: boundedCount(queueDepth) }),
    })
  }

  compactionStarted(identity: KernelRunDiagnosticIdentity): void {
    this.emit('context.compaction_started', 'debug', identity, { outcome: 'success' })
  }

  compactionFailed(identity: KernelRunDiagnosticIdentity, errorCode?: string, durationMs?: number): void {
    this.emit('context.compaction_failed', 'error', identity, {
      outcome: 'failure',
      ...(safeErrorCode(errorCode) ? { errorCode: safeErrorCode(errorCode) } : {}),
      ...(durationMs === undefined ? {} : { durationMs: boundedDuration(durationMs) }),
    })
  }

  runSettled(
    identity: KernelRunDiagnosticIdentity,
    outcome: 'success' | 'failure' | 'unknown' | 'skipped',
    durationMs: number,
    errorCode?: string,
    phase?: string,
  ): void {
    this.emit('run.settled', outcome === 'success' ? 'info' : 'error', identity, {
      outcome,
      durationMs: boundedDuration(durationMs),
      ...(safeErrorCode(errorCode) ? { errorCode: safeErrorCode(errorCode) } : {}),
      ...(phase && safeMethod(phase) ? { phase } : {}),
    })
  }

  runFailure(identity: KernelRunDiagnosticIdentity, errorCode?: string, durationMs?: number, phase?: string): void {
    this.emit('run.failed', 'error', identity, {
      outcome: 'failure',
      ...(safeErrorCode(errorCode) ? { errorCode: safeErrorCode(errorCode) } : {}),
      ...(durationMs === undefined ? {} : { durationMs: boundedDuration(durationMs) }),
      ...(phase && safeMethod(phase) ? { phase } : {}),
    })
  }

  runCancelled(identity: KernelRunDiagnosticIdentity, durationMs?: number): void {
    this.emit('run.cancelled', 'warn', identity, {
      outcome: 'skipped',
      errorCode: 'USER_CANCELLED',
      ...(durationMs === undefined ? {} : { durationMs: boundedDuration(durationMs) }),
    })
  }

  runInterrupted(identity: KernelRunDiagnosticIdentity, errorCode = 'HOST_SHUTTING_DOWN', durationMs?: number): void {
    this.emit('run.interrupted', 'warn', identity, {
      outcome: 'unknown',
      ...(safeErrorCode(errorCode) ? { errorCode: safeErrorCode(errorCode) } : {}),
      ...(durationMs === undefined ? {} : { durationMs: boundedDuration(durationMs) }),
    })
  }

  modelPrepared(identity: KernelModelDiagnosticIdentity): void {
    this.emit('model.prepared', 'debug', identity, { outcome: 'success' })
  }

  modelStarted(identity: KernelModelDiagnosticIdentity): void {
    this.emit('model.started', 'info', identity, { outcome: 'success' })
  }

  modelFailed(identity: KernelModelDiagnosticIdentity, errorCode?: string, durationMs?: number): void {
    this.emit('model.failed', 'error', identity, {
      outcome: 'failure',
      ...(safeErrorCode(errorCode) ? { errorCode: safeErrorCode(errorCode) } : {}),
      ...(durationMs === undefined ? {} : { durationMs: boundedDuration(durationMs) }),
    })
  }

  modelSettled(
    identity: KernelModelDiagnosticIdentity,
    outcome: 'success' | 'failure' | 'unknown' | 'skipped',
    durationMs: number,
  ): void {
    this.emit('model.settled', outcome === 'success' ? 'info' : 'error', identity, {
      outcome,
      durationMs: boundedDuration(durationMs),
    })
  }

  toolAdmission(identity: KernelRunDiagnosticIdentity, method?: string): void {
    this.emit('tool.admission', 'debug', { ...identity, method }, { outcome: 'success' })
  }

  toolApproval(identity: KernelRunDiagnosticIdentity, method?: string): void {
    this.emit('tool.approval', 'info', { ...identity, method }, { outcome: 'success' })
  }

  toolStarted(identity: KernelRunDiagnosticIdentity, method?: string): void {
    this.emit('tool.started', 'info', { ...identity, method }, { outcome: 'success' })
  }

  toolFailed(identity: KernelRunDiagnosticIdentity, method?: string, errorCode?: string, durationMs?: number): void {
    this.emit(
      'tool.failed',
      'error',
      { ...identity, method },
      {
        outcome: 'failure',
        ...(safeErrorCode(errorCode) ? { errorCode: safeErrorCode(errorCode) } : {}),
        ...(durationMs === undefined ? {} : { durationMs: boundedDuration(durationMs) }),
      },
    )
  }

  toolTimeout(identity: KernelRunDiagnosticIdentity, method?: string, durationMs?: number): void {
    this.emit(
      'tool.timeout',
      'error',
      { ...identity, method },
      {
        outcome: 'unknown',
        errorCode: 'TOOL_TIMEOUT',
        ...(durationMs === undefined ? {} : { durationMs: boundedDuration(durationMs) }),
      },
    )
  }

  toolCancelled(identity: KernelRunDiagnosticIdentity, method?: string, durationMs?: number): void {
    this.emit(
      'tool.cancelled',
      'warn',
      { ...identity, method },
      {
        outcome: 'skipped',
        errorCode: 'USER_CANCELLED',
        ...(durationMs === undefined ? {} : { durationMs: boundedDuration(durationMs) }),
      },
    )
  }

  toolSettled(
    identity: KernelRunDiagnosticIdentity,
    outcome: 'success' | 'failure' | 'unknown' | 'skipped',
    durationMs: number,
    method?: string,
  ): void {
    this.emit(
      'tool.settled',
      outcome === 'success' ? 'info' : 'error',
      { ...identity, method },
      {
        outcome,
        durationMs: boundedDuration(durationMs),
      },
    )
  }

  compacted(identity: KernelRunDiagnosticIdentity, durationMs?: number): void {
    this.emit('context.compacted', 'info', identity, {
      outcome: 'success',
      ...(durationMs === undefined ? {} : { durationMs: boundedDuration(durationMs) }),
    })
  }

  recovery(identity: KernelRunDiagnosticIdentity, outcome: 'success' | 'failure', durationMs?: number): void {
    this.emit('run.recovery', outcome === 'success' ? 'info' : 'error', identity, {
      outcome,
      ...(durationMs === undefined ? {} : { durationMs: boundedDuration(durationMs) }),
    })
  }

  private emit(
    event: string,
    level: 'debug' | 'info' | 'warn' | 'error',
    identity: KernelRunDiagnosticIdentity & { method?: string | undefined },
    fields: Record<string, unknown>,
  ): void {
    if (!this.sink) return
    try {
      // A Run continues after the RPC that admitted it has returned. Do not
      // attach that background work to a stale RPC/context scope.
      const ambient = identity.runId === undefined ? this.scope?.current() : undefined
      const merged: Record<string, unknown> = {
        ...(this.instanceId ? { instanceId: this.instanceId } : {}),
        ...(ambient ?? {}),
        ...identityToEvent(identity),
        ...fields,
      }
      const method = safeMethod(merged.method)
      if (method) merged.method = method
      else delete merged.method
      const eventValue = diagnosticEvent({
        component: 'kernel',
        level,
        event,
        ...merged,
      })
      this.sink.emit(eventValue)
    } catch {
      // Diagnostics are observational and must never alter the execution path.
    }
  }
}

function identityToEvent(
  identity: KernelRunDiagnosticIdentity & { method?: string | undefined },
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of ['instanceId', 'contextId', 'rpcId', 'requestId', 'sessionId', 'runId'] as const) {
    const value = identity[key]
    if (value !== undefined) result[key] = safeIdentifier(value)
  }
  if (identity.stepId !== undefined) result.stepId = safeIdentifier(identity.stepId)
  if (identity.callId !== undefined) result.callId = safeIdentifier(identity.callId)
  if (identity.method !== undefined) result.method = identity.method
  return result
}

function safeIdentifier(value: string): string {
  return value.length <= 160 ? value : value.slice(0, 160)
}

function safeMethod(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(value) ? value : undefined
}

function safeErrorCode(value: string | undefined): string | undefined {
  if (!value) return undefined
  const normalized = value
    .replace(/[^A-Za-z0-9_.-]/g, '_')
    .toUpperCase()
    .slice(0, 128)
  return /^[A-Z][A-Z0-9_.-]{0,127}$/.test(normalized) ? normalized : undefined
}

function boundedDuration(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.min(value, Number.MAX_SAFE_INTEGER) : 0
}

function boundedCount(value: number | undefined): number | undefined {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000 ? value : undefined
}

export function createKernelExecutionDiagnostics(
  options: KernelExecutionDiagnosticsOptions = {},
): KernelExecutionDiagnostics {
  return new KernelExecutionDiagnostics(options)
}
