import { createStore } from 'zustand/vanilla'
import type { HbarAppUiAgentPlanTreeContent, HbarAppUiAgentPlanGroup } from 'hbar-app-ui/catalog'

type Content = HbarAppUiAgentPlanTreeContent | undefined
type Target = Readonly<{ groupId: string; stepId: string }>

export interface PlanTreePreviewState {
  readonly content: Content
  readonly retried: readonly Target[]
  readonly replace: (content: Content) => void
  readonly retry: (runId: string, groupId: string, stepId: string) => void
}

export function createPlanTreePreviewStore(content: Content) {
  return createStore<PlanTreePreviewState>((set, get) => ({
    content,
    retried: [],
    replace(next) {
      const current = get()
      if (current.content === next) return
      set({
        content: next,
        retried:
          next?.runId === current.content?.runId && next?.groups === current.content?.groups ? current.retried : [],
      })
    },
    retry(runId, groupId, stepId) {
      const current = get()
      if (current.content?.runId !== runId || current.content.busy) return
      const step = current.content.groups
        .find((group) => group.id === groupId)
        ?.items.find((item) => item.id === stepId)
      if (
        step?.state !== 'failed' ||
        current.retried.some((target) => target.groupId === groupId && target.stepId === stepId)
      )
        return
      set({ retried: [...current.retried, { groupId, stepId }] })
    },
  }))
}

export function projectPlanTreePreviewContent(state: PlanTreePreviewState): Content {
  const content = state.content
  if (!content) return undefined
  const groups: readonly HbarAppUiAgentPlanGroup[] = content.groups.map((group) => ({
    ...group,
    items: group.items.map((item) =>
      state.retried.some((target) => target.groupId === group.id && target.stepId === item.id)
        ? { ...item, state: 'running', stateLabel: content.labels.running }
        : item,
    ),
  }))
  return { ...content, groups, onRetry: state.retry }
}
