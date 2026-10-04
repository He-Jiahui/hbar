import { createStore } from 'zustand/vanilla'
import {
  uniqueHbarAppUiAgentApprovalItems,
  type HbarAppUiAgentApprovalContent,
  type HbarAppUiAgentApprovalQueueContent,
} from 'hbar-app-ui/catalog'

type QueueDecision = Parameters<HbarAppUiAgentApprovalQueueContent['onDecision']>[1]

export interface ApprovalPreviewState {
  readonly content: HbarAppUiAgentApprovalContent
  readonly decisions: ReadonlyMap<string, QueueDecision>
  readonly lastDecision: Readonly<{ id: string; decision: QueueDecision }> | undefined
  readonly replace: (content: HbarAppUiAgentApprovalContent) => void
  readonly decide: (id: string, decision: QueueDecision) => void
}

/** This preview is a local demo host. It does not execute any displayed tool. */
export function createApprovalPreviewStore(content: HbarAppUiAgentApprovalContent) {
  return createStore<ApprovalPreviewState>((set, get) => ({
    content,
    decisions: new Map(),
    lastDecision: undefined,
    replace(next) {
      if (get().content === next) return
      const ids = new Set(
        next.queue?.pending
          .filter((item) => item.state === 'queued' || item.state === 'needs-approval')
          .map((item) => item.id),
      )
      const decisions = new Map([...get().decisions].filter(([id]) => ids.has(id)))
      const lastDecision = get().lastDecision
      set({
        content: next,
        decisions,
        lastDecision: lastDecision && ids.has(lastDecision.id) ? lastDecision : undefined,
      })
    },
    decide(id, decision) {
      const current = get()
      const queue = current.content.queue
      if (!queue || queue.busyId === id) return
      const first = uniqueHbarAppUiAgentApprovalItems(queue.pending).find(
        (item) => (item.state === 'queued' || item.state === 'needs-approval') && !current.decisions.has(item.id),
      )
      if (first?.id !== id) return
      const decisions = new Map(current.decisions)
      decisions.set(id, decision)
      set({ decisions, lastDecision: { id, decision } })
    },
  }))
}

export function projectApprovalPreviewContent(state: ApprovalPreviewState): HbarAppUiAgentApprovalContent {
  const queue = state.content.queue
  if (!queue) return state.content
  return {
    ...state.content,
    queue: {
      ...queue,
      pending: uniqueHbarAppUiAgentApprovalItems(queue.pending).map((item) => {
        const decision = state.decisions.get(item.id)
        if (!decision) return item
        const outcome = queue.outcomes[decision]
        return {
          ...item,
          state: decision === 'approved' ? 'approved' : 'skipped',
          stateLabel: outcome.stateLabel,
          when: outcome.when,
        }
      }),
      announcement: state.lastDecision ? queue.outcomes[state.lastDecision.decision].announcement : queue.announcement,
      onDecision: state.decide,
    },
  }
}
