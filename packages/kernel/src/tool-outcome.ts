import { HbarError, type ToolOutcome } from '@hbar/contracts'

/** Only call with the actual Host-owned AbortSignal reason, never plugin error metadata. */
export function hostAbortToolOutcome(reason: unknown, executionStarted: boolean): ToolOutcome {
  const kind =
    reason instanceof HbarError
      ? reason.code === 'USER_CANCELLED'
        ? 'cancelled'
        : reason.code === 'HOST_SHUTTING_DOWN'
          ? 'interrupted'
          : 'failed'
      : 'failed'
  return { kind, executionStarted }
}
