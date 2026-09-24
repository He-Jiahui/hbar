import { createStore } from 'zustand/vanilla'
import type { HbarAppUiAgentPlanChecklistContent } from 'hbar-app-ui/catalog'

type Content = HbarAppUiAgentPlanChecklistContent | undefined

export interface ChecklistPreviewState {
  readonly content: Content
  readonly paused: boolean
  readonly replace: (content: Content) => void
  readonly pause: (runId: string, paused: boolean) => void
}

export function createChecklistPreviewStore(content: Content) {
  return createStore<ChecklistPreviewState>((set, get) => ({
    content,
    paused: content?.paused ?? false,
    replace(next) {
      const current = get()
      if (current.content === next) return
      set({
        content: next,
        paused:
          next?.runId === current.content?.runId && next?.paused === current.content?.paused
            ? current.paused
            : (next?.paused ?? false),
      })
    },
    pause(runId, paused) {
      const current = get().content
      if (current?.runId !== runId || current.busy || !current.steps.some((step) => step.state === 'running')) return
      set({ paused })
    },
  }))
}

export function projectChecklistPreviewContent(state: ChecklistPreviewState): Content {
  return state.content && { ...state.content, paused: state.paused, onPausedChange: state.pause }
}
