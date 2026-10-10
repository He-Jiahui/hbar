import {
  diagnosticEvent,
  type DiagnosticEvent,
  type DiagnosticSink,
  type ReadonlyDiagnosticCorrelation,
} from '@hbar/contracts'
import {
  createDiagnosticJournal,
  type DiagnosticJournal,
  type DiagnosticJournalOptions,
  type DiagnosticJournalSnapshot,
} from '@hbar/kernel/diagnostics'
import { createDiagnosticScope, protectDiagnosticSink } from '@hbar/kernel/diagnostic-scope'

/**
 * Composition-root diagnostics for a Host process.
 *
 * The object deliberately exposes only the public sink/scope seams. Callers
 * never receive a database handle or a journal's internal queue, and all
 * event construction is validated before it reaches the asynchronous writer.
 */
export interface HostRuntimeDiagnosticsOptions extends Omit<DiagnosticJournalOptions, 'root' | 'fileName'> {
  readonly root: string
  readonly fileName?: string
  readonly instanceId?: string
}

export interface HostRuntimeDiagnostics {
  readonly journal: DiagnosticJournal
  readonly sink: DiagnosticSink
  readonly scope: ReturnType<typeof createDiagnosticScope>
  readonly filePath: string
  setInstanceId(instanceId: string): void
  emit(
    input: Omit<DiagnosticEvent, 'schemaVersion' | 'time' | 'monotonicMs' | 'component'> & {
      readonly component?: DiagnosticEvent['component']
      readonly time?: number
      readonly monotonicMs?: number
      readonly instanceId?: string
    },
  ): void
  run<T>(context: ReadonlyDiagnosticCorrelation, operation: () => T): T
  snapshot(): DiagnosticJournalSnapshot
  close(timeoutMs?: number): Promise<DiagnosticJournalSnapshot>
}

/** Creates the process-owned Host journal and correlation scope. */
export function createHostRuntimeDiagnostics(options: HostRuntimeDiagnosticsOptions): HostRuntimeDiagnostics {
  const developmentCoverage =
    process.env.HBAR_DESKTOP_DEV === '1' ||
    process.env.HBAR_DESKTOP_DEV?.toLowerCase() === 'true' ||
    process.env.NODE_ENV === 'development'
  const diagnosticsEnabled =
    developmentCoverage ||
    process.env.HBAR_DIAGNOSTICS === '1' ||
    process.env.HBAR_DIAGNOSTICS?.toLowerCase() === 'true'
  const diagnosticsFull =
    developmentCoverage ||
    process.env.HBAR_DIAGNOSTICS_FULL === '1' ||
    process.env.HBAR_DIAGNOSTICS_FULL?.toLowerCase() === 'true'
  const journal = createDiagnosticJournal({
    ...options,
    fileName: options.fileName ?? 'hbar-host-diagnostics.jsonl',
    enabled: options.enabled ?? diagnosticsEnabled,
    fullCoverage: options.fullCoverage ?? diagnosticsFull,
  })
  const scope = createDiagnosticScope()
  const sink = protectDiagnosticSink(journal, scope)
  let baseInstanceId = options.instanceId
  const emit = (input: Parameters<HostRuntimeDiagnostics['emit']>[0]): void => {
    try {
      const { component, time, monotonicMs, instanceId, ...rest } = input
      sink.emit(
        diagnosticEvent({
          ...rest,
          component: component ?? 'host',
          ...((instanceId ?? baseInstanceId) ? { instanceId: instanceId ?? baseInstanceId } : {}),
          ...(time === undefined ? {} : { time }),
          ...(monotonicMs === undefined ? {} : { monotonicMs }),
        }),
      )
    } catch {
      // Instrumentation is observational. A malformed event must never stop Host.
    }
  }
  return {
    journal,
    sink,
    scope,
    filePath: journal.filePath,
    setInstanceId(instanceId) {
      if (instanceId.length > 0) baseInstanceId = instanceId.slice(0, 160)
    },
    emit,
    run: (context, operation) => scope.run(context, operation),
    snapshot: () => journal.snapshot(),
    close: (timeoutMs) => journal.close(timeoutMs),
  }
}

/** Safe helper for process lifecycle events that have no request context. */
export function hostLifecycleEvent(
  runtime: HostRuntimeDiagnostics,
  event: string,
  input: Partial<Omit<Parameters<HostRuntimeDiagnostics['emit']>[0], 'event' | 'component'>> = {},
): void {
  runtime.emit({ ...input, level: input.level ?? 'info', event, component: 'host' })
}

/** Restricts a child-exit record to safe counters and lifecycle fields. */
export function supervisorLifecycleEvent(
  runtime: HostRuntimeDiagnostics | undefined,
  input: {
    readonly event:
      'supervisor.child_exit' | 'supervisor.child_spawn' | 'supervisor.backoff' | 'supervisor.recovery_limit'
    readonly outcome?: DiagnosticEvent['outcome']
    readonly errorCode?: string
    readonly durationMs?: number
    readonly processId?: number
    readonly childPid?: number
    readonly supervisorPid?: number
    readonly exitCode?: number
    readonly signal?: string
    readonly restartExpected?: boolean
    readonly recoveryAttempt?: number
    readonly recoveryLimit?: number
    readonly dropped?: number
  },
): void {
  if (!runtime) return
  runtime.emit({
    component: 'host',
    level: input.event === 'supervisor.recovery_limit' ? 'error' : 'info',
    ...input,
  })
}
