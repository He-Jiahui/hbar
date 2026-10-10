import { diagnosticEventSchema, type DiagnosticEvent, type DiagnosticSink } from '@hbar/contracts'
import type { HbarClientOptions } from '@hbar/client'

const RING_CAPACITY = 4096
const sharedRing: DiagnosticEvent[] = []

export interface DevelopmentDiagnosticOptions {
  /** Override the environment decision in tests or an explicitly enabled preview. */
  readonly enabled?: boolean | undefined
  /** Keep console output injectable so diagnostics never depend on a console implementation. */
  readonly console?: Pick<Console, 'debug' | 'info' | 'warn' | 'error'> | undefined
}

export interface DevelopmentDiagnostics {
  readonly enabled: boolean
  readonly options: HbarClientOptions
  readonly sink: DiagnosticSink
  /** Returns a detached snapshot which remains readable while the Host is unavailable. */
  readonly recent: () => readonly DiagnosticEvent[]
  readonly clear: () => void
}

type DiagnosticConsole = Pick<Console, 'debug' | 'info' | 'warn' | 'error'>

function environmentOptIn(): boolean {
  try {
    const environment = import.meta.env as ImportMetaEnv & Record<string, unknown>
    const enabled = (value: unknown) => value === '1' || value === 'true'
    return (
      import.meta.env.DEV === true ||
      enabled(environment.HBAR_DIAGNOSTICS) ||
      enabled(environment.HBAR_WEB_DIAGNOSTICS) ||
      enabled(environment.VITE_HBAR_DIAGNOSTICS)
    )
  } catch {
    return false
  }
}

function writeConsole(output: DiagnosticConsole, event: DiagnosticEvent): void {
  try {
    const method =
      event.level === 'fatal' || event.level === 'error'
        ? 'error'
        : event.level === 'warn'
          ? 'warn'
          : event.level === 'info'
            ? 'info'
            : 'debug'
    output[method]('[hbar diagnostic]', event)
  } catch {
    // A browser console extension must never affect Client transport.
  }
}

function retainInProduction(event: DiagnosticEvent): boolean {
  return (
    event.level === 'error' ||
    event.level === 'fatal' ||
    event.level === 'warn' ||
    (event.durationMs !== undefined && event.durationMs >= 100) ||
    event.event.startsWith('connection.')
  )
}

function snapshotRing(): readonly DiagnosticEvent[] {
  return Object.freeze(sharedRing.map((event) => Object.freeze({ ...event })))
}

/** Reads the process-local Web ring without consulting Host or Storage. */
export function getDevelopmentDiagnosticSnapshot(): readonly DiagnosticEvent[] {
  return snapshotRing()
}

/**
 * Creates a local, bounded diagnostic sink for the Web Client.
 *
 * It deliberately keeps events in memory instead of using app Storage. This means
 * connection and STORAGE_CLOSED failures remain inspectable until the page closes.
 */
export function createDevelopmentDiagnostics(options: DevelopmentDiagnosticOptions = {}): DevelopmentDiagnostics {
  const enabled = options.enabled ?? environmentOptIn()
  const output = options.console ?? (typeof console === 'undefined' ? undefined : console)
  const sink: DiagnosticSink = {
    emit(event) {
      try {
        const parsed = diagnosticEventSchema.safeParse(event)
        if (!parsed.success) return
        const safeEvent = parsed.data
        if (!enabled && !retainInProduction(safeEvent)) return
        if (sharedRing.length >= RING_CAPACITY) sharedRing.shift()
        sharedRing.push(safeEvent)
        if (output && (enabled || retainInProduction(safeEvent))) writeConsole(output, safeEvent)
      } catch {
        // Malformed event getters and console failures must not break a connection.
      }
    },
  }
  return {
    enabled,
    // Keep the sink connected in production too: Client force-emits failures,
    // slow calls and connection lifecycle events even with a zero fast-call rate.
    options: { diagnosticSink: sink, diagnosticSampleRate: enabled ? 1 : 0 },
    sink,
    recent: getDevelopmentDiagnosticSnapshot,
    clear: () => {
      sharedRing.length = 0
    },
  }
}

export { RING_CAPACITY as DEVELOPMENT_DIAGNOSTIC_RING_CAPACITY }
