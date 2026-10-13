/**
 * Host-owned bridge for reconciling durable remote execution intents.
 * The Kernel never retains a plugin invocation or exposes this port over RPC.
 */
export interface NodeIntentRecoveryPort {
  /**
   * Read and settle every pending node intent for this Run using a fresh, bounded
   * authenticated Host-to-node request. `waiting` means receipt authority is not
   * currently available; the Run must remain fenced and must not be resumed.
   */
  reconcileRun(runId: string, signal: AbortSignal): Promise<'settled' | 'waiting'>
}
