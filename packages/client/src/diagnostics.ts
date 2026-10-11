import { diagnosticEvent, type DiagnosticEvent, type DiagnosticSink } from '@hbar/contracts'

export interface HbarClientOptions {
  /** Receives redacted, bounded client lifecycle and RPC diagnostics. */
  readonly diagnosticSink?: DiagnosticSink | undefined
  /** Fraction of successful fast calls to retain. Errors and slow calls are always retained. */
  readonly diagnosticSampleRate?: number | undefined
}

export interface ClientDiagnosticInput {
  readonly event: string
  readonly level?: DiagnosticEvent['level']
  readonly phase?: string | undefined
  readonly instanceId?: string | undefined
  readonly requestId?: string | undefined
  readonly rpcId?: string | undefined
  readonly method?: string | undefined
  readonly commandId?: DiagnosticEvent['commandId'] | undefined
  readonly errorCode?: string | undefined
  readonly outcome?: DiagnosticEvent['outcome'] | undefined
  readonly durationMs?: number | undefined
  readonly bytesIn?: number | undefined
  readonly bytesOut?: number | undefined
  readonly pending?: number | undefined
  readonly sampled?: boolean | undefined
}

const noopSink: DiagnosticSink = { emit: () => undefined }

function boundedSampleRate(value: number | undefined): number {
  if (value === undefined) return 0.1
  if (!Number.isFinite(value) || value < 0 || value > 1)
    throw new RangeError('diagnosticSampleRate must be between 0 and 1')
  return value
}

function validOpaque(value: string | undefined): string | undefined {
  if (!value) return undefined
  const normalized = value.trim().slice(0, 160)
  return normalized.length ? normalized : undefined
}

function validMethod(value: string | undefined): string | undefined {
  const normalized = validOpaque(value)
  return normalized && /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(normalized) ? normalized : undefined
}

function safeNumber(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : undefined
}

/** Internal Client-only diagnostic adapter. It never exposes request payloads or credentials. */
export class HbarClientDiagnostics {
  readonly sink: DiagnosticSink
  readonly sampleRate: number
  private fastCallCount = 0

  constructor(options?: HbarClientOptions) {
    this.sink = options?.diagnosticSink ?? noopSink
    this.sampleRate = boundedSampleRate(options?.diagnosticSampleRate)
  }

  emit(input: ClientDiagnosticInput, force = false): void {
    const durationMs = safeNumber(input.durationMs)
    const fast = input.outcome === 'success' && durationMs !== undefined && durationMs < 100
    const sampled = fast && !force ? this.sampleFastCall() : false
    if (fast && !force && !sampled) return
    try {
      const event = diagnosticEvent({
        component: 'client',
        level: input.level ?? (input.outcome === 'failure' ? 'error' : 'debug'),
        event: input.event,
        ...(input.phase ? { phase: input.phase } : {}),
        ...(validOpaque(input.instanceId) ? { instanceId: validOpaque(input.instanceId) } : {}),
        ...(validOpaque(input.requestId) ? { requestId: validOpaque(input.requestId) } : {}),
        ...(validOpaque(input.rpcId) ? { rpcId: validOpaque(input.rpcId) } : {}),
        ...(validMethod(input.method) ? { method: validMethod(input.method) } : {}),
        ...(input.commandId !== undefined ? { commandId: input.commandId } : {}),
        ...(input.errorCode && /^[A-Z][A-Z0-9_.-]{0,127}$/.test(input.errorCode) ? { errorCode: input.errorCode } : {}),
        ...(input.outcome ? { outcome: input.outcome } : {}),
        ...(durationMs !== undefined ? { durationMs } : {}),
        ...(safeNumber(input.bytesIn) !== undefined ? { bytesIn: safeNumber(input.bytesIn) } : {}),
        ...(safeNumber(input.bytesOut) !== undefined ? { bytesOut: safeNumber(input.bytesOut) } : {}),
        ...(input.pending !== undefined && Number.isSafeInteger(input.pending) && input.pending >= 0
          ? { pending: input.pending }
          : {}),
        ...(fast ? { sampled: true } : {}),
      })
      this.sink.emit(event)
    } catch {
      // Diagnostics must never alter transport, listener or cancellation behavior.
    }
  }

  private sampleFastCall(): boolean {
    this.fastCallCount = (this.fastCallCount + 1) % 10_000
    if (this.sampleRate <= 0) return false
    if (this.sampleRate >= 1) return true
    return this.fastCallCount % Math.max(1, Math.round(1 / this.sampleRate)) === 0
  }
}
