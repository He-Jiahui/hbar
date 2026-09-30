import { createStore } from 'zustand/vanilla'
import type { HbarAppUiAgentApprovalCostContent } from 'hbar-app-ui/catalog'

type Content = HbarAppUiAgentApprovalCostContent | undefined
type Decision = 'approved' | 'rejected'

export interface CostPreviewState {
  readonly content: Content
  readonly decision: Decision | undefined
  readonly replace: (content: Content) => void
  readonly decide: (requestId: string, decision: Decision) => void
}

/** Preview-only confirmation; never starts a paid forecast or an external job. */
export function createCostPreviewStore(content: Content) {
  return createStore<CostPreviewState>((set, get) => ({
    content,
    decision: undefined,
    replace(next) {
      const current = get()
      if (current.content === next) return
      const sameRequest = next?.requestId === current.content?.requestId
      const authorityChanged = next?.state !== current.content?.state || next?.busy !== current.content?.busy
      set({ content: next, decision: sameRequest && !authorityChanged ? current.decision : undefined })
    },
    decide(requestId, decision) {
      const current = get()
      if (
        !current.content ||
        current.content.requestId !== requestId ||
        current.content.state !== 'pending' ||
        current.content.busy ||
        current.decision
      )
        return
      set({ decision })
    },
  }))
}

export function projectCostPreviewContent(state: CostPreviewState): Content {
  if (!state.content) return undefined
  return {
    ...state.content,
    state: state.content.state === 'pending' ? (state.decision ?? 'pending') : state.content.state,
    onDecision: state.decide,
  }
}
