import { createStore, type StoreApi } from 'zustand/vanilla'

export type ApprovalDecisionPreviewVariant = 1 | 2
export type ApprovalDecisionPreviewOutcome = 'approved' | 'rejected' | 'always-allow'
export type ApprovalDecisionPreviewValue = 'pending' | ApprovalDecisionPreviewOutcome

export interface ApprovalDecisionPreviewSeed {
  readonly ownerId: string
  readonly variant: ApprovalDecisionPreviewVariant
  readonly requestId: string
  readonly state: ApprovalDecisionPreviewValue
  readonly busy: boolean
}

export interface ApprovalDecisionPreviewStoreState {
  readonly seed: ApprovalDecisionPreviewSeed
  readonly decision: ApprovalDecisionPreviewValue
  readonly decide: (requestId: string, decision: ApprovalDecisionPreviewOutcome) => boolean
  readonly reconcile: (seed: ApprovalDecisionPreviewSeed) => void
}

export type ApprovalDecisionPreviewStoreApi = StoreApi<ApprovalDecisionPreviewStoreState>

function allowsDecision(variant: ApprovalDecisionPreviewVariant, decision: ApprovalDecisionPreviewOutcome): boolean {
  return variant === 2 || decision !== 'always-allow'
}

/** Preview-only local acknowledgement; it never grants permission or runs a request. */
export function createApprovalDecisionPreviewStore(seed: ApprovalDecisionPreviewSeed): ApprovalDecisionPreviewStoreApi {
  return createStore<ApprovalDecisionPreviewStoreState>((set, get) => ({
    seed,
    decision: seed.state,
    decide(requestId, decision) {
      const current = get()
      if (
        !requestId.trim() ||
        requestId !== current.seed.requestId ||
        current.seed.busy ||
        current.seed.state !== 'pending' ||
        current.decision !== 'pending' ||
        !allowsDecision(current.seed.variant, decision)
      )
        return false

      set({ decision })
      return true
    },
    reconcile(next) {
      const current = get()
      if (next.ownerId !== current.seed.ownerId || next.variant !== current.seed.variant) return

      const requestChanged = next.requestId !== current.seed.requestId
      const authorityChanged = next.state !== current.seed.state || next.busy !== current.seed.busy
      set({ seed: next, decision: requestChanged || authorityChanged ? next.state : current.decision })
    },
  }))
}
