import { createStore } from 'zustand/vanilla'
import { rpcSchemas, type ThreadGoal } from '@hbar/contracts'

interface GoalDraft {
  readonly source: object
  readonly base: string
  readonly objective: string
  readonly budget: string
  readonly dirty: boolean
  readonly busy: boolean
  readonly stale: boolean
  readonly confirmingClear: boolean
  readonly error?: 'objective' | 'budget' | 'failed' | undefined
  readonly detail?: string | undefined
}
interface GoalDependencies {
  identity(): object | null
  snapshot(id: string): ThreadGoal | null
  save(id: string, goal: ThreadGoal | null, objective: string, budget: number | undefined): Promise<void>
  setPaused(id: string, goal: ThreadGoal, paused: boolean): Promise<void>
  clear(id: string): Promise<void>
}
function fingerprint(goal: ThreadGoal | null) {
  return JSON.stringify(goal && [goal.goalId, goal.objective, goal.tokenBudget])
}
export function createGoalDraftModel(dependencies: GoalDependencies) {
  const store = createStore<{ drafts: Readonly<Record<string, GoalDraft>> }>(() => ({ drafts: {} }))
  const write = (id: string, draft: GoalDraft) =>
    store.setState((state) => ({ drafts: { ...state.drafts, [id]: draft } }))
  const current = (id: string) => {
    const draft = store.getState().drafts[id]
    return draft?.source === dependencies.identity() ? draft : undefined
  }
  const fresh = (source: object, goal: ThreadGoal | null): GoalDraft => ({
    source,
    base: fingerprint(goal),
    objective: goal?.objective ?? '',
    budget: goal?.tokenBudget ? String(goal.tokenBudget) : '',
    dirty: false,
    busy: false,
    stale: false,
    confirmingClear: false,
  })
  function sync(id: string) {
    const source = dependencies.identity()
    if (!source) return
    const draft = current(id),
      goal = dependencies.snapshot(id)
    if (!draft || draft.base !== fingerprint(goal))
      write(id, draft?.dirty || draft?.busy || draft?.confirmingClear ? { ...draft, stale: true } : fresh(source, goal))
  }
  async function mutate(id: string, kind: 'save' | 'pause' | 'clear') {
    const draft = current(id),
      goal = dependencies.snapshot(id)
    if (!draft || draft.busy) return
    if (draft.stale || draft.base !== fingerprint(goal)) {
      write(id, { ...draft, stale: true })
      return
    }
    if (kind === 'clear' && (!draft.confirmingClear || !goal)) return
    if (kind === 'pause' && (!goal?.goalId || !['active', 'paused'].includes(goal.status))) return
    const budget = draft.budget.trim() ? Number(draft.budget) : undefined
    const parsed = rpcSchemas['goal.create'].safeParse({
      sessionId: id,
      objective: draft.objective,
      tokenBudget: budget,
    })
    if (kind === 'save' && !parsed.success) {
      write(id, {
        ...draft,
        error: parsed.error.issues.some((issue) => issue.path.includes('objective')) ? 'objective' : 'budget',
      })
      return
    }
    write(id, { ...draft, busy: true, error: undefined, detail: undefined })
    try {
      if (kind === 'clear') await dependencies.clear(id)
      else if (kind === 'pause' && goal) await dependencies.setPaused(id, goal, goal.status !== 'paused')
      else if (parsed.success) await dependencies.save(id, goal, parsed.data.objective, budget)
      if (dependencies.identity() !== draft.source) return
      const latest = dependencies.snapshot(id)
      const superseded =
        kind === 'save'
          ? latest?.objective !== draft.objective.trim() || latest?.tokenBudget !== (budget ?? null)
          : kind === 'clear' && latest !== null
      if (superseded) {
        write(id, { ...draft, busy: false, stale: true })
        return
      }
      // Pausing changes lifecycle only; keep any unsaved objective edits.
      write(
        id,
        kind === 'pause'
          ? { ...draft, busy: false, stale: draft.base !== fingerprint(dependencies.snapshot(id)) }
          : fresh(draft.source, dependencies.snapshot(id)),
      )
    } catch (cause) {
      if (dependencies.identity() === draft.source)
        write(id, {
          ...draft,
          busy: false,
          stale: draft.base !== fingerprint(dependencies.snapshot(id)),
          error: 'failed',
          detail: cause instanceof Error ? cause.message : undefined,
        })
    }
  }
  return {
    store,
    sync,
    save: (id: string) => mutate(id, 'save'),
    togglePaused: (id: string) => mutate(id, 'pause'),
    clear: (id: string) => mutate(id, 'clear'),
    edit(id: string, field: 'objective' | 'budget', value: string) {
      const draft = current(id)
      if (draft && !draft.busy)
        write(id, { ...draft, [field]: value, dirty: true, error: undefined, detail: undefined })
    },
    reset(id: string) {
      const draft = current(id)
      if (draft && !draft.busy) write(id, fresh(draft.source, dependencies.snapshot(id)))
    },
    confirmClear(id: string, open: boolean) {
      const draft = current(id)
      if (draft && !draft.busy) write(id, { ...draft, confirmingClear: open })
    },
  }
}
