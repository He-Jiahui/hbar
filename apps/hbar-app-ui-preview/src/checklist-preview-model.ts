import { createStore } from 'zustand/vanilla'
import type { HbarAppUiAgentPlanChecklistContent } from 'hbar-app-ui/catalog'

type Content = HbarAppUiAgentPlanChecklistContent | undefined

function runningStepIds(content: Content): Set<string> {
  return new Set(
    content?.steps.filter((step) => step.state === 'running' && step.id.trim().length > 0).map((step) => step.id),
  )
}

function sameIds(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((id) => right.has(id))
}

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
      const sameRun = Boolean(next?.runId.trim() && next.runId === current.content?.runId)
      const unchangedHostState =
        next?.paused === current.content?.paused &&
        next?.busy === current.content?.busy &&
        sameIds(runningStepIds(next), runningStepIds(current.content))
      set({
        content: next,
        paused: sameRun && unchangedHostState ? current.paused : (next?.paused ?? false),
      })
    },
    pause(runId, paused) {
      const current = get().content
      if (
        !runId.trim() ||
        current?.runId !== runId ||
        current.busy ||
        !current.steps.some((step) => step.state === 'running')
      )
        return
      set({ paused })
    },
  }))
}

export function projectChecklistPreviewContent(state: ChecklistPreviewState): Content {
  return state.content && { ...state.content, paused: state.paused, onPausedChange: state.pause }
}
