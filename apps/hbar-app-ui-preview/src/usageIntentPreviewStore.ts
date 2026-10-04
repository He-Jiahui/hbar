import { createStore } from 'zustand/vanilla'

export type UsagePreviewAction = 'request-increase' | 'stay-on-overage' | 'upgrade' | 'details'
export interface UsagePreviewIntent {
  readonly actionId: UsagePreviewAction
  readonly targetId: string | undefined
}
export interface UsageIntentPreviewSeed {
  readonly ownerId: string
  readonly targets: readonly UsagePreviewIntent[]
}
export interface UsageIntentPreviewState {
  readonly seed: UsageIntentPreviewSeed
  readonly intent: UsagePreviewIntent | undefined
  readonly request: (ownerId: string, actionId: UsagePreviewAction, targetId: string | undefined) => boolean
  readonly reconcile: (seed: UsageIntentPreviewSeed) => void
}

function allowed(seed: UsageIntentPreviewSeed, intent: UsagePreviewIntent): boolean {
  return (
    Boolean(seed.ownerId.trim()) &&
    (intent.targetId === undefined || Boolean(intent.targetId.trim())) &&
    seed.targets.some((target) => target.actionId === intent.actionId && target.targetId === intent.targetId)
  )
}

/** Captures an owned preview request only; it performs no billing, navigation or service I/O. */
export function createUsageIntentPreviewStore(seed: UsageIntentPreviewSeed) {
  return createStore<UsageIntentPreviewState>((set, get) => ({
    seed,
    intent: undefined,
    request(ownerId, actionId, targetId) {
      const current = get()
      const intent = { actionId, targetId }
      if (ownerId !== current.seed.ownerId || !allowed(current.seed, intent)) return false
      if (current.intent?.actionId === actionId && current.intent.targetId === targetId) return false
      set({ intent })
      return true
    },
    reconcile(next) {
      const current = get()
      if (next.ownerId !== current.seed.ownerId) return
      set({ seed: next, intent: current.intent && allowed(next, current.intent) ? current.intent : undefined })
    },
  }))
}
