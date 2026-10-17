import { autonomyRetryInput } from '@hbar/contracts/autonomy-retry'
import type { StoragePort } from '@hbar/storage'

/** Existing Goal/idle hooks get the first opportunity to own a continuation. */
export async function planAutonomyRetry(storage: StoragePort, sessionId: string) {
  const planned = await storage.call('autonomyRetryPlan', sessionId)
  if (!planned) return null
  if (planned.plan.wakeAt > Date.now()) return { kind: 'wait' as const, wakeAt: planned.plan.wakeAt }
  return {
    kind: 'submit' as const,
    admission: { plan: planned.plan, settingsRevision: planned.settingsRevision },
    submission: {
      requestId: planned.plan.requestId,
      input: autonomyRetryInput(planned.predecessor),
      modelId: planned.predecessor.modelId,
    },
  }
}
