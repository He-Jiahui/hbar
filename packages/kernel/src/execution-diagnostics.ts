import {
  diagnosticEvent,
  diagnosticEventSchema,
  type DiagnosticCorrelation,
  type DiagnosticEvent,
  type DiagnosticSink,
} from '@hbar/contracts'
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

export interface KernelRunSettlementFacts {
  readonly startedStepCount?: number | undefined
  readonly completedStepCount?: number | undefined
  readonly hardStepLimit?: number | undefined
}

export interface KernelModelDiagnosticIdentity extends KernelRunDiagnosticIdentity {
  readonly method?: string | undefined
  readonly providerId?: string | undefined
  readonly modelSelectionId?: string | undefined
  readonly modelRequestId?: string | undefined
  readonly attemptId?: string | undefined
  readonly model?: string | undefined
  readonly protocol?: string | undefined
  readonly stopReason?: 'stop' | 'toolUse' | 'length' | 'aborted' | 'error' | undefined
  readonly httpStatus?: number | undefined
  readonly upstreamRequestIdSha256?: string | undefined
  readonly transportKind?: DiagnosticEvent['transportKind'] | undefined
  readonly transportCode?: DiagnosticEvent['transportCode'] | undefined
  readonly failureKind?: DiagnosticEvent['failureKind'] | undefined
  readonly failurePhase?: DiagnosticEvent['failurePhase'] | undefined
  readonly errorCode?: string | undefined
  readonly inputEstimatedTokens?: number | undefined
  readonly inputLimit?: number | undefined
  readonly summaryMaxOutput?: number | undefined
  readonly chunkIndex?: number | undefined
  readonly chunkCount?: number | undefined
  readonly thresholdRatio?: number | undefined
}

export interface KernelContinuationDiagnostic {
  readonly sessionId: string
  readonly runId?: string | undefined
  readonly goalId?: string | undefined
  readonly intentId?: string | undefined
  readonly phase: 'pending' | 'queued' | 'running' | 'waiting' | 'stopped'
  readonly reason:
    | 'goal_active'
    | 'model_unavailable'
    | 'workflow_wait'
    | 'plan_mode'
    | 'budget_exhausted'
    | 'paused'
    | 'complete'
    | 'blocked'
    | 'usage_limited'
    | 'no_tool_calls'
    | 'no_progress'
    | 'continuation_limit'
    | 'disabled'
    | 'interrupted'
    | 'result_unknown'
    | 'stale_goal'
    | 'user_turn'
    | 'run_failed'
    | 'repair'
    | 'repair_exhausted'
    | 'retry_wait'
    | 'retry_exhausted'
  readonly triggerKind: 'step_limit' | 'run_completed' | 'retry' | 'revalidate' | 'startup' | 'manual' | 'unknown'
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

  compactionStage(
    identity: KernelModelDiagnosticIdentity,
    stage:
      | 'prepared'
      | 'summary_started'
      | 'summary_completed'
      | 'summary_failed'
      | 'summary_cancelled'
      | 'chunk_limit'
      | 'rebuilt_capacity'
      | 'persist_started'
      | 'persist_completed'
      | 'persist_failed',
    fields: Record<string, unknown> = {},
    outcome: 'success' | 'failure' | 'unknown' | 'skipped' = stage === 'summary_failed' ||
    stage === 'persist_failed' ||
    stage === 'chunk_limit'
      ? 'failure'
      : stage === 'summary_cancelled'
        ? 'skipped'
        : 'success',
  ): void {
    this.emit('context.compaction_stage', outcome === 'failure' ? 'error' : 'debug', identity, {
      outcome,
      phase: stage,
      ...compactionFields(fields),
    })
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
    facts?: KernelRunSettlementFacts,
  ): void {
    this.emit('run.settled', outcome === 'success' ? 'info' : 'error', identity, {
      outcome,
      durationMs: boundedDuration(durationMs),
      ...(safeErrorCode(errorCode) ? { errorCode: safeErrorCode(errorCode) } : {}),
      ...(phase && safeMethod(phase) ? { phase } : {}),
      ...safeStepFacts(facts),
    })
  }

  runFailure(
    identity: KernelRunDiagnosticIdentity,
    errorCode?: string,
    durationMs?: number,
    phase?: string,
    facts?: KernelRunSettlementFacts,
  ): void {
    this.emit('run.failed', 'error', identity, {
      outcome: 'failure',
      ...(safeErrorCode(errorCode) ? { errorCode: safeErrorCode(errorCode) } : {}),
      ...(durationMs === undefined ? {} : { durationMs: boundedDuration(durationMs) }),
      ...(phase && safeMethod(phase) ? { phase } : {}),
      ...safeStepFacts(facts),
    })
  }

  continuationUpdated(value: KernelContinuationDiagnostic): void {
    const fields: Record<string, unknown> = {
      outcome: 'success',
      continuationPhase: value.phase,
      continuationReason: value.reason,
      continuationTriggerKind: value.triggerKind,
    }
    if (value.goalId) fields.continuationGoalId = safeIdentifier(value.goalId)
    if (value.intentId) fields.continuationIntentId = safeIdentifier(value.intentId)
    this.emit(
      'goal.continuation',
      'info',
      {
        sessionId: value.sessionId,
        ...(value.runId ? { runId: value.runId } : {}),
      },
      {
        ...fields,
      },
    )
  }

  runCancelled(identity: KernelRunDiagnosticIdentity, durationMs?: number, facts?: KernelRunSettlementFacts): void {
    this.emit('run.cancelled', 'warn', identity, {
      outcome: 'skipped',
      errorCode: 'USER_CANCELLED',
      ...(durationMs === undefined ? {} : { durationMs: boundedDuration(durationMs) }),
      ...safeStepFacts(facts),
    })
  }

  runInterrupted(
    identity: KernelRunDiagnosticIdentity,
    errorCode = 'HOST_SHUTTING_DOWN',
    durationMs?: number,
    facts?: KernelRunSettlementFacts,
  ): void {
    this.emit('run.interrupted', 'warn', identity, {
      outcome: 'unknown',
      ...(safeErrorCode(errorCode) ? { errorCode: safeErrorCode(errorCode) } : {}),
      ...(durationMs === undefined ? {} : { durationMs: boundedDuration(durationMs) }),
      ...safeStepFacts(facts),
    })
  }

  modelPrepared(identity: KernelModelDiagnosticIdentity): void {
    this.emit('model.prepared', 'debug', identity, { outcome: 'success' })
  }

  modelStarted(identity: KernelModelDiagnosticIdentity): void {
    this.emit('model.started', 'info', identity, { outcome: 'success' })
  }
  providerRequestStarted(identity: KernelModelDiagnosticIdentity): void {
    this.emit('provider.request_started', 'info', identity, { outcome: 'success' })
  }
  providerResponse(identity: KernelModelDiagnosticIdentity): void {
    this.emit('provider.response', (identity.httpStatus ?? 0) >= 400 ? 'warn' : 'info', identity, {
      outcome: 'unknown',
      phase: 'response',
    })
  }
  providerTransportFailure(
    identity: KernelModelDiagnosticIdentity,
    transportKind?: DiagnosticEvent['transportKind'],
    transportCode?: DiagnosticEvent['transportCode'],
  ): void {
    this.emit('provider.transport_failure', transportKind === 'abort' ? 'warn' : 'error', identity, {
      outcome: transportKind === 'abort' ? 'skipped' : 'failure',
      phase: 'transport_failure',
      ...(transportKind ? { transportKind } : {}),
      ...(transportCode ? { transportCode } : {}),
    })
  }
  providerRequestSettled(
    identity: KernelModelDiagnosticIdentity,
    outcome: 'success' | 'failure' | 'skipped',
    durationMs: number,
  ): void {
    this.emit('provider.request_settled', outcome === 'success' ? 'info' : 'error', identity, {
      outcome,
      durationMs: boundedDuration(durationMs),
    })
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
    identity: KernelModelDiagnosticIdentity,
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

function identityToEvent(identity: KernelModelDiagnosticIdentity): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of ['instanceId', 'contextId', 'rpcId', 'requestId', 'sessionId', 'runId'] as const) {
    const value = identity[key]
    if (value !== undefined) result[key] = safeIdentifier(value)
  }
  if (identity.stepId !== undefined) result.stepId = safeIdentifier(identity.stepId)
  if (identity.callId !== undefined) result.callId = safeIdentifier(identity.callId)
  if (identity.method !== undefined) result.method = identity.method
  for (const key of [
    'providerId',
    'modelSelectionId',
    'modelRequestId',
    'attemptId',
    'model',
    'protocol',
    'stopReason',
  ] as const) {
    const value = identity[key]
    if (typeof value === 'string' && value.length > 0 && value.length <= 160 && safeDiagnosticString(key, value))
      result[key] = value
  }
  for (const key of ['inputEstimatedTokens', 'inputLimit', 'summaryMaxOutput', 'chunkIndex', 'chunkCount'] as const) {
    const value = identity[key]
    if (
      value !== undefined &&
      Number.isSafeInteger(value) &&
      value >= 0 &&
      value <= (key === 'chunkIndex' || key === 'chunkCount' ? 1_000_000 : Number.MAX_SAFE_INTEGER)
    )
      result[key] = value
  }
  if (
    identity.thresholdRatio !== undefined &&
    Number.isFinite(identity.thresholdRatio) &&
    identity.thresholdRatio >= 0 &&
    identity.thresholdRatio <= 1
  )
    result.thresholdRatio = identity.thresholdRatio
  if (
    identity.httpStatus !== undefined &&
    Number.isInteger(identity.httpStatus) &&
    identity.httpStatus >= 100 &&
    identity.httpStatus <= 599
  )
    result.httpStatus = identity.httpStatus
  if (identity.upstreamRequestIdSha256 !== undefined && /^[a-f0-9]{64}$/.test(identity.upstreamRequestIdSha256))
    result.upstreamRequestIdSha256 = identity.upstreamRequestIdSha256
  for (const key of ['transportKind', 'transportCode', 'failureKind', 'failurePhase'] as const) {
    const value = identity[key]
    if (value !== undefined && diagnosticEventSchema.shape[key].safeParse(value).success) result[key] = value
  }
  if (safeErrorCode(identity.errorCode)) result.errorCode = safeErrorCode(identity.errorCode)
  return result
}

function safeDiagnosticString(key: string, value: string): boolean {
  if (key === 'stopReason') return ['stop', 'toolUse', 'length', 'aborted', 'error'].includes(value)
  if (key === 'protocol') return /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(value)
  if (key === 'providerId') return /^[A-Za-z0-9_.:-]{1,160}$/.test(value)
  if (key === 'modelSelectionId') return /^[A-Za-z0-9_.:/@+-]{1,160}$/.test(value)
  return /^[A-Za-z0-9_.:/@+-]{1,160}$/.test(value)
}

function safeIdentifier(value: string): string {
  return value.length <= 160 ? value : value.slice(0, 160)
}

function compactionFields(fields: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of ['inputEstimatedTokens', 'inputLimit', 'summaryMaxOutput', 'chunkIndex', 'chunkCount'] as const) {
    const value = fields[key]
    if (
      typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= 0 &&
      value <= (key === 'chunkIndex' || key === 'chunkCount' ? 1_000_000 : Number.MAX_SAFE_INTEGER)
    )
      result[key] = value
  }
  const threshold = fields.thresholdRatio
  if (typeof threshold === 'number' && Number.isFinite(threshold) && threshold >= 0 && threshold <= 1)
    result.thresholdRatio = threshold
  return result
}

function safeMethod(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(value) ? value : undefined
}

function safeStepFacts(facts: KernelRunSettlementFacts | undefined): Record<string, number> {
  if (!facts) return {}
  try {
    const result: Record<string, number> = {}
    for (const key of ['startedStepCount', 'completedStepCount', 'hardStepLimit'] as const) {
      const value = facts[key]
      if (
        value !== undefined &&
        Number.isSafeInteger(value) &&
        value >= (key === 'hardStepLimit' ? 1 : 0) &&
        value <= 1_000_000
      )
        result[key] = value
    }
    return result
  } catch {
    return {}
  }
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
