import type { ComposerIntentState, ComposerPlanModeState } from '@hbar/app-runtime'

export type ComposerGoalBlockedReason =
  | 'plan'
  | 'existingGoal'
  | 'goalLoading'
  | 'goalFailed'
  | 'planLoading'
  | 'planFailed'
  | 'planUnknown'
  | 'composerUnknown'
  | 'busy'
  | 'offline'
  | 'readonly'
  | 'unavailable'

export type ComposerGoalRecovery = 'exitPlan' | 'refreshGoal' | 'refreshPlan' | 'reconcilePlan' | 'reconcileComposer'
export type ComposerGoalAvailability =
  | { readonly kind: 'ready' | 'prepared' }
  | {
      readonly kind: 'blocked'
      readonly reason: ComposerGoalBlockedReason
      readonly recovery: ComposerGoalRecovery | null
    }

export interface ComposerGoalAvailabilityInput {
  readonly sessionId: string
  readonly connected: boolean
  readonly disabled: boolean
  readonly canPrepare: boolean
  readonly intent: ComposerIntentState
  readonly plan: ComposerPlanModeState
}

/** Derive only from canonical facts. In particular, another session's Goal is never this session's blocker. */
export function composerGoalAvailability(input: ComposerGoalAvailabilityInput): ComposerGoalAvailability {
  const block = (reason: ComposerGoalBlockedReason, recovery: ComposerGoalRecovery | null = null) =>
    ({ kind: 'blocked', reason, recovery }) as const
  const candidate = input.intent.entries[input.sessionId]
  const entry = candidate?.sessionId === input.sessionId ? candidate : undefined
  const modeCandidate = input.plan.entries[input.sessionId]
  const mode = modeCandidate?.sessionId === input.sessionId ? modeCandidate : undefined
  if (!input.connected) return block('offline')
  // Existing receipts may be inspected even when new preparation has become readonly.
  if (entry?.submission.status === 'unknown' || entry?.goalAction.status === 'unknown')
    return block('composerUnknown', 'reconcileComposer')
  if (input.plan.available && mode?.status === 'unknown') return block('planUnknown', 'reconcilePlan')
  if (
    input.disabled ||
    entry?.submission.status === 'submitting' ||
    entry?.goalAction.status === 'submitting' ||
    (input.plan.available && mode?.status === 'pending')
  )
    return block('busy')
  if (!input.canPrepare) return block('readonly')
  if (entry?.intent === 'goal') return { kind: 'prepared' }
  const facts = input.intent.facts
  if (facts.sessionId !== input.sessionId || facts.status === 'idle' || facts.status === 'loading')
    return block('goalLoading')
  if (facts.status === 'error')
    return facts.error === 'CAPABILITY_UNAVAILABLE' ? block('unavailable') : block('goalFailed', 'refreshGoal')
  if (!facts.snapshot || facts.snapshot.sessionId !== input.sessionId) return block('goalLoading')
  if (facts.snapshot.goal && facts.snapshot.goal.threadId !== input.sessionId) return block('goalLoading')
  if (facts.snapshot.goal && facts.snapshot.goal.status !== 'complete') return block('existingGoal')
  if (input.plan.available) {
    if (!mode || mode.status === 'loading') return block('planLoading')
    if (mode.status === 'failed' || !mode.mode) return block('planFailed', 'refreshPlan')
  }
  return { kind: 'ready' }
}

export interface ComposerIntentInteractionTarget {
  readonly sessionId: string
  readonly lifetime: number
}

/** A→B→A must not make an old promise current again, even if revisions happen to match. */
export function sameComposerIntentInteraction(
  captured: ComposerIntentInteractionTarget,
  current: ComposerIntentInteractionTarget | null,
): boolean {
  return Boolean(current && captured.sessionId === current.sessionId && captured.lifetime === current.lifetime)
}
