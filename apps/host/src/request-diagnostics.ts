import { diagnosticEvent, type DiagnosticEvent, type DiagnosticSink, type DiagnosticScopePort } from '@hbar/contracts'

/** Values supplied by a composition root when it can correlate a request safely. */
export interface DiagnosticContext {
  readonly instanceId?: string
  readonly connectionId?: string
  readonly contextId?: string
  readonly sessionId?: string
  readonly runId?: string
  readonly requestId?: string
}

/** Optional, pure context resolver. It must return identifiers only; request payloads are never logged. */
export interface DiagnosticContextPort {
  resolve(input: { method: string; rpcId: string | number; context: DiagnosticContext }): DiagnosticContext | undefined
}

export interface RequestDiagnosticsOptions {
  readonly sink?: DiagnosticSink
  readonly context?: DiagnosticContext
  readonly contextPort?: DiagnosticContextPort
  /** Fraction of successful fast calls retained. Failures and calls >= 100 ms are always retained. */
  readonly sampleRate?: number
  readonly full?: boolean
  readonly now?: () => { time: number; monotonicMs: number }
}

export type HostDiagnosticScope = DiagnosticScopePort

export interface RequestDiagnosticSpan {
  stage(phase: 'auth' | 'validate' | 'admission' | 'invoke' | 'reply', pending?: number): void
  success(input?: { bytesOut?: number; pending?: number }): void
  replySkipped(input?: { pending?: number }): void
  failure(errorCode: string, input?: { pending?: number }): void
}

export interface HostRequestDiagnostics {
  begin(input: {
    method: string
    rpcId: string | number
    requestId?: string
    connectionId?: string
    bytesIn: number
    pending: number
    context?: DiagnosticContext
  }): RequestDiagnosticSpan
  frame(direction: 'in' | 'out', bytes: number, context?: DiagnosticContext): void
}

const phaseEvents = new Set(['auth', 'validate', 'admission', 'invoke', 'reply'])

export function safeDiagnosticId(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined
  let text = ''
  for (const character of String(value)) {
    const code = character.charCodeAt(0)
    if (code < 32 || code === 127) continue
    text += character
  }
  text = text.slice(0, 160)
  return text.length ? text : undefined
}

function safeId(value: string | number | undefined): string | undefined {
  return safeDiagnosticId(value)
}

function safeMethod(value: string): string {
  return /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(value) ? value : 'unknown'
}

function safeCode(value: string): string {
  const text = value.replace(/[^A-Z0-9_.-]/g, '').slice(0, 128)
  return text || 'UNKNOWN'
}

function validRate(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0.1
  return Math.min(1, Math.max(0, value))
}

function safeContext(
  input: DiagnosticContextPort | undefined,
  method: string,
  rpcId: string | number,
  context: DiagnosticContext,
): DiagnosticContext {
  if (!input) return {}
  try {
    return input.resolve({ method, rpcId, context }) ?? {}
  } catch {
    return {}
  }
}

/** Host-side adapter. Sink failures are isolated so diagnostics cannot change RPC behaviour. */
export function createHostRequestDiagnostics(options: RequestDiagnosticsOptions = {}): HostRequestDiagnostics {
  const sink = options.sink
  const sampleRate = validRate(options.sampleRate)
  const full = options.full ?? process.env.HBAR_DIAGNOSTICS_FULL === '1'
  const now = options.now ?? (() => ({ time: Date.now(), monotonicMs: performance.now() }))
  const emit = (input: Omit<DiagnosticEvent, 'schemaVersion' | 'time' | 'monotonicMs'>): void => {
    if (!sink) return
    try {
      sink.emit(diagnosticEvent({ ...input, ...now() }))
    } catch {
      // A diagnostic sink is observational. Never let a malformed record or a closed journal break Host RPC.
    }
  }
  const selected = (durationMs?: number): boolean =>
    full || (durationMs !== undefined && durationMs >= 100) || Math.random() < sampleRate
  const contextOf = (input: {
    connectionId?: string
    context?: DiagnosticContext
    method: string
    rpcId: string | number
  }) => {
    const base: DiagnosticContext = {
      ...(options.context ?? {}),
      ...(input.context ?? {}),
      ...(input.connectionId ? { connectionId: input.connectionId } : {}),
    }
    return { ...base, ...safeContext(options.contextPort, input.method, input.rpcId, base) }
  }
  return {
    begin(input) {
      const started = now().monotonicMs
      const method = safeMethod(input.method)
      const rpcId = safeId(input.rpcId)
      const context = contextOf(input)
      const stages: Array<{ phase: string; durationMs: number; pending: number }> = []
      const base = {
        component: 'host' as const,
        method,
        ...(rpcId ? { rpcId } : {}),
        ...(safeId(context.instanceId) ? { instanceId: safeId(context.instanceId) } : {}),
        ...(safeId(context.connectionId) ? { contextId: safeId(context.connectionId) } : {}),
        ...(safeId(context.contextId) ? { contextId: safeId(context.contextId) } : {}),
        ...(safeId(context.sessionId) ? { sessionId: safeId(context.sessionId) } : {}),
        ...(safeId(context.runId) ? { runId: safeId(context.runId) } : {}),
        ...(safeId(context.requestId) ? { requestId: safeId(context.requestId) } : {}),
        ...(safeId(input.requestId) ? { requestId: safeId(input.requestId) } : {}),
      }
      const emitStage = (
        phase: string,
        durationMs: number,
        pending: number,
        outcome: 'success' | 'failure' = 'success',
        errorCode?: string,
      ) => {
        if (!phaseEvents.has(phase)) return
        emit({
          ...base,
          level: outcome === 'failure' ? 'error' : 'debug',
          event: outcome === 'failure' ? 'rpc.stage_failed' : 'rpc.stage',
          phase,
          outcome,
          durationMs,
          pending,
          ...(errorCode ? { errorCode: safeCode(errorCode) } : {}),
          sampled: !full,
        })
      }
      return {
        stage(phase, pending = input.pending) {
          if (stages.length < 6 && phaseEvents.has(phase))
            stages.push({ phase, durationMs: Math.max(0, now().monotonicMs - started), pending })
        },
        success(result = {}) {
          const durationMs = Math.max(0, now().monotonicMs - started)
          if (!selected(durationMs)) return
          emit({
            ...base,
            level: 'debug',
            event: 'rpc.ingress',
            phase: 'ingress',
            outcome: 'unknown',
            bytesIn: input.bytesIn,
            pending: input.pending,
            sampled: !full,
          })
          for (const stage of stages) emitStage(stage.phase, stage.durationMs, stage.pending)
          emit({
            ...base,
            level: durationMs >= 100 ? 'info' : 'debug',
            event: 'rpc.completed',
            phase: 'reply',
            outcome: 'success',
            durationMs,
            bytesIn: input.bytesIn,
            ...(result.bytesOut === undefined ? {} : { bytesOut: result.bytesOut }),
            pending: result.pending ?? input.pending,
            sampled: !full,
          })
        },
        failure(errorCode, result = {}) {
          const durationMs = Math.max(0, now().monotonicMs - started)
          emit({
            ...base,
            level: 'debug',
            event: 'rpc.ingress',
            phase: 'ingress',
            outcome: 'unknown',
            bytesIn: input.bytesIn,
            pending: input.pending,
            sampled: false,
          })
          const failedPhase = stages.at(-1)?.phase
          for (const stage of stages)
            emitStage(
              stage.phase,
              stage.durationMs,
              stage.pending,
              stage.phase === failedPhase ? 'failure' : 'success',
              stage.phase === failedPhase ? errorCode : undefined,
            )
          emit({
            ...base,
            level: 'error',
            event: 'rpc.failed',
            phase: 'reply',
            outcome: 'failure',
            durationMs,
            errorCode: safeCode(errorCode),
            bytesIn: input.bytesIn,
            pending: result.pending ?? input.pending,
            sampled: false,
          })
        },
        replySkipped(result = {}) {
          const durationMs = Math.max(0, now().monotonicMs - started)
          emit({
            ...base,
            level: 'warn',
            event: 'rpc.reply_skipped',
            phase: 'reply',
            outcome: 'skipped',
            durationMs,
            errorCode: 'REPLY_NOT_DELIVERED',
            bytesIn: input.bytesIn,
            pending: result.pending ?? input.pending,
            sampled: false,
          })
        },
      }
    },
    frame(direction, bytes, context = {}) {
      if (!full || !Number.isSafeInteger(bytes) || bytes < 0) return
      emit({
        component: 'host',
        level: 'trace',
        event: direction === 'in' ? 'rpc.frame_in' : 'rpc.frame_out',
        outcome: 'success',
        ...(safeId(context.instanceId) ? { instanceId: safeId(context.instanceId) } : {}),
        ...(safeId(context.connectionId) ? { contextId: safeId(context.connectionId) } : {}),
        ...(direction === 'in' ? { bytesIn: bytes } : { bytesOut: bytes }),
        sampled: false,
      })
    },
  }
}
