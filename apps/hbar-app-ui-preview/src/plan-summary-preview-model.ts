import { createStore } from 'zustand/vanilla'
import type { HbarAppUiAgentPlanSummaryContent } from 'hbar-app-ui/catalog'

type Content = HbarAppUiAgentPlanSummaryContent | undefined
export interface PlanSummaryPreviewState {
  readonly content: Content
  readonly goal: string
  readonly draft: string
  readonly editing: boolean
  readonly running: boolean
  readonly replace: (content: Content) => void
  readonly edit: (planId: string) => void
  readonly changeDraft: (planId: string, value: string) => void
  readonly save: (planId: string) => void
  readonly cancel: (planId: string) => void
  readonly setRunning: (planId: string, running: boolean) => void
}
function owns(state: PlanSummaryPreviewState, planId: string): boolean {
  return state.content?.interaction?.planId === planId && !state.content.interaction.busy
}
export function createPlanSummaryPreviewStore(content: Content) {
  return createStore<PlanSummaryPreviewState>((set, get) => ({
    content,
    goal: content?.goal ?? '',
    draft: content?.interaction?.draft ?? '',
    editing: content?.interaction?.editing ?? false,
    running: content?.interaction?.running ?? false,
    replace(next) {
      const previous = get()
      if (previous.content === next) return
      const same = next?.interaction?.planId === previous.content?.interaction?.planId
      const sameGoal = same && next?.goal === previous.content?.goal
      set({
        content: next,
        goal: sameGoal ? previous.goal : (next?.goal ?? ''),
        draft:
          sameGoal && next?.interaction?.draft === previous.content?.interaction?.draft
            ? previous.draft
            : (next?.interaction?.draft ?? ''),
        editing:
          sameGoal && next?.interaction?.editing === previous.content?.interaction?.editing
            ? previous.editing
            : (next?.interaction?.editing ?? false),
        running:
          same && next?.interaction?.running === previous.content?.interaction?.running
            ? previous.running
            : (next?.interaction?.running ?? false),
      })
    },
    edit(planId) {
      const state = get()
      if (owns(state, planId) && !state.running && !state.editing) set({ editing: true, draft: state.goal })
    },
    changeDraft(planId, draft) {
      const state = get()
      if (owns(state, planId) && state.editing && !state.running) set({ draft })
    },
    save(planId) {
      const state = get()
      if (owns(state, planId) && state.editing && !state.running)
        set({ goal: state.draft.trim() || state.goal, editing: false })
    },
    cancel(planId) {
      const state = get()
      if (owns(state, planId) && state.editing && !state.running) set({ editing: false, draft: state.goal })
    },
    setRunning(planId, running) {
      const state = get()
      if (owns(state, planId) && !state.editing) set({ running })
    },
  }))
}
export function projectPlanSummaryPreviewContent(state: PlanSummaryPreviewState): Content {
  const content = state.content
  if (!content?.interaction) return content
  const interaction = content.interaction
  const id = interaction.planId
  return {
    ...content,
    goal: state.goal,
    interaction: {
      ...interaction,
      draft: state.draft,
      editing: state.editing,
      running: state.running,
      onEdit: () => state.edit(id),
      onDraftChange: (value) => state.changeDraft(id, value),
      onSave: () => state.save(id),
      onCancel: () => state.cancel(id),
      onRun: () => state.setRunning(id, true),
      onStop: () => state.setRunning(id, false),
    },
  }
}
