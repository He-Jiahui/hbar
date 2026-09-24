import { createStore } from 'zustand/vanilla'
import type { HbarAppUiAgentPlanEditableContent, HbarAppUiAgentPlanStep } from 'hbar-app-ui/catalog'

type Content = HbarAppUiAgentPlanEditableContent | undefined
type Announcement =
  | { readonly kind: 'moved'; readonly title: string; readonly position: number; readonly total: number }
  | { readonly kind: 'added'; readonly title: string }
export interface PlanReviewPreviewState {
  readonly content: Content
  readonly steps: readonly HbarAppUiAgentPlanStep[]
  readonly draft: string
  readonly running: boolean
  readonly announcement: Announcement | undefined
  readonly replace: (content: Content) => void
  readonly changeDraft: (planId: string, value: string) => void
  readonly add: (planId: string) => void
  readonly move: (planId: string, stepId: string, direction: -1 | 1) => void
  readonly toggleSkip: (planId: string, stepId: string) => void
  readonly setRunning: (planId: string, running: boolean) => void
}

function unique(steps: readonly HbarAppUiAgentPlanStep[]) {
  const seen = new Set<string>()
  return steps.filter((step) => {
    if (seen.has(step.id)) return false
    seen.add(step.id)
    return true
  })
}

function editable(
  state: PlanReviewPreviewState,
  planId: string,
): state is PlanReviewPreviewState & { readonly content: HbarAppUiAgentPlanEditableContent } {
  return state.content?.planId === planId && !state.content.busy && !state.running
}

export function createPlanReviewPreviewStore(content: Content, createId: () => string = () => crypto.randomUUID()) {
  return createStore<PlanReviewPreviewState>((set, get) => ({
    content,
    steps: unique(content?.steps ?? []),
    draft: content?.draft ?? '',
    running: content?.running ?? false,
    announcement: undefined,
    replace(next) {
      const current = get()
      if (current.content === next) return
      const same = next?.planId === current.content?.planId
      const sameSteps = same && next?.steps === current.content?.steps
      set({
        content: next,
        steps: sameSteps ? current.steps : unique(next?.steps ?? []),
        draft: same && next?.draft === current.content?.draft ? current.draft : (next?.draft ?? ''),
        running: same && next?.running === current.content?.running ? current.running : (next?.running ?? false),
        announcement: sameSteps ? current.announcement : undefined,
      })
    },
    changeDraft(planId, draft) {
      const current = get()
      if (editable(current, planId) && current.content.canAdd) set({ draft })
    },
    add(planId) {
      const current = get()
      if (!editable(current, planId) || !current.content.canAdd) return
      const title = current.draft.trim()
      if (!title) return
      const id = createId()
      if (!id || current.steps.some((step) => step.id === id)) return
      set({
        steps: [...current.steps, { id, title, state: 'queued', stateLabel: current.content.labels.newStepStateLabel }],
        draft: '',
        announcement: { kind: 'added', title },
      })
    },
    move(planId, stepId, direction) {
      const current = get()
      if (!editable(current, planId)) return
      const index = current.steps.findIndex((step) => step.id === stepId)
      const target = index + direction
      const item = current.steps[index]
      const other = current.steps[target]
      if (!item || !other) return
      const steps = [...current.steps]
      steps[index] = other
      steps[target] = item
      set({ steps, announcement: { kind: 'moved', title: item.title, position: target + 1, total: steps.length } })
    },
    toggleSkip(planId, stepId) {
      const current = get()
      if (!editable(current, planId) || !current.steps.some((step) => step.id === stepId)) return
      set({
        steps: current.steps.map((step) =>
          step.id === stepId ? { ...step, state: step.state === 'skipped' ? 'queued' : 'skipped' } : step,
        ),
      })
    },
    setRunning(planId, running) {
      const current = get()
      if (current.content?.planId !== planId || current.content.busy) return
      if (running && (!current.content.canSubmit || !current.steps.some((step) => step.state !== 'skipped'))) return
      set({ running })
    },
  }))
}

export function projectPlanReviewPreviewContent(state: PlanReviewPreviewState): Content {
  const content = state.content
  if (!content) return undefined
  const { planId, labels } = content
  const message = state.announcement
  return {
    ...content,
    steps: state.steps,
    draft: state.draft,
    running: state.running,
    announcement: message
      ? message.kind === 'added'
        ? labels.added(message.title)
        : labels.moved(message.title, message.position, message.total)
      : content.announcement,
    onDraftChange: (value) => state.changeDraft(planId, value),
    onAdd: () => state.add(planId),
    onMove: (id, direction) => state.move(planId, id, direction),
    onRemove: (id) => state.toggleSkip(planId, id),
    onSubmit: () => state.setRunning(planId, true),
    onStop: () => state.setRunning(planId, false),
  }
}
