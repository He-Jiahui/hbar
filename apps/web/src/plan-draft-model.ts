import { createStore } from 'zustand/vanilla'
import { MAX_PLAN_STEPS, planStepSchema, type PlanState, type PlanStep } from '@hbar/contracts'

export interface PlanDraftStep extends PlanStep {
  readonly id: string
}
export interface PlanDraft {
  readonly source: object
  readonly base: string
  readonly steps: readonly PlanDraftStep[]
  readonly explanation: string
  readonly newStep: string
  readonly dirty: boolean
  readonly stale: boolean
  readonly saving: boolean
  readonly error?: 'empty' | 'limit' | 'invalid' | 'stale' | 'failed' | undefined
  readonly detail?: string | undefined
}
interface PlanDraftDependencies {
  identity(): object | null
  snapshot(sessionId: string): PlanState | null
  save(sessionId: string, steps: PlanStep[], explanation: string | null): Promise<PlanState>
  clear(sessionId: string): Promise<void>
}
export function planSnapshotKey(plan: PlanState | null): string {
  return JSON.stringify(
    plan && [
      plan.sessionId,
      plan.turnId,
      plan.updatedAt,
      plan.explanation,
      plan.plan.map(({ step, status }) => [step, status]),
    ],
  )
}
export function createPlanDraftModel(dependencies: PlanDraftDependencies) {
  const store = createStore<{ drafts: Readonly<Record<string, PlanDraft>> }>(() => ({ drafts: {} }))
  function put(sessionId: string, value: PlanDraft) {
    store.setState((state) => ({ drafts: { ...state.drafts, [sessionId]: value } }))
  }
  function current(sessionId: string) {
    const draft = store.getState().drafts[sessionId]
    return draft?.source === dependencies.identity() ? draft : undefined
  }
  function fresh(source: object, plan: PlanState | null): PlanDraft {
    return {
      source,
      base: planSnapshotKey(plan),
      steps: (plan?.plan ?? []).map((step) => ({ ...step, id: crypto.randomUUID() })),
      explanation: plan?.explanation ?? '',
      newStep: '',
      dirty: false,
      stale: false,
      saving: false,
    }
  }
  function sync(sessionId: string) {
    const source = dependencies.identity()
    if (!source) return
    const draft = current(sessionId),
      plan = dependencies.snapshot(sessionId)
    if (!draft) {
      put(sessionId, fresh(source, plan))
      return
    }
    if (draft.base === planSnapshotKey(plan)) return
    put(sessionId, draft.dirty || draft.saving ? { ...draft, stale: true } : fresh(source, plan))
  }
  function edit(sessionId: string, change: (draft: PlanDraft) => Partial<PlanDraft>) {
    const draft = current(sessionId)
    if (!draft || draft.saving) return
    put(sessionId, { ...draft, dirty: true, error: undefined, detail: undefined, ...change(draft) })
  }
  async function save(sessionId: string) {
    const draft = current(sessionId)
    if (!draft || draft.saving) return
    if (draft.stale || draft.base !== planSnapshotKey(dependencies.snapshot(sessionId))) {
      put(sessionId, { ...draft, stale: true, error: 'stale' })
      return
    }
    if (!draft.steps.length) {
      put(sessionId, { ...draft, error: 'empty' })
      return
    }
    if (draft.steps.length > MAX_PLAN_STEPS) {
      put(sessionId, { ...draft, error: 'limit' })
      return
    }
    const steps = draft.steps.map(({ step, status }) => ({ step: step.trim(), status }))
    if (steps.some((step) => !planStepSchema.safeParse(step).success)) {
      put(sessionId, { ...draft, error: 'invalid' })
      return
    }
    put(sessionId, { ...draft, saving: true, error: undefined, detail: undefined })
    try {
      const result = await dependencies.save(sessionId, steps, draft.explanation.trim() || null)
      if (dependencies.identity() !== draft.source) return
      const latest = dependencies.snapshot(sessionId)
      if (latest && latest.updatedAt > result.updatedAt) {
        put(sessionId, { ...draft, saving: false, stale: true, error: 'stale' })
      } else {
        put(sessionId, {
          ...draft,
          steps: draft.steps.map((step, index) => ({ ...step, ...steps[index] })),
          explanation: result.explanation ?? '',
          base: planSnapshotKey(result),
          dirty: false,
          stale: false,
          saving: false,
          error: undefined,
        })
      }
    } catch (cause) {
      if (dependencies.identity() === draft.source)
        put(sessionId, {
          ...draft,
          saving: false,
          error: 'failed',
          detail: cause instanceof Error ? cause.message : undefined,
        })
    }
  }
  async function clear(sessionId: string) {
    const draft = current(sessionId)
    if (!draft || draft.saving) return
    put(sessionId, { ...draft, saving: true, error: undefined })
    try {
      await dependencies.clear(sessionId)
      if (dependencies.identity() === draft.source) put(sessionId, fresh(draft.source, null))
    } catch (cause) {
      if (dependencies.identity() === draft.source)
        put(sessionId, {
          ...draft,
          saving: false,
          error: 'failed',
          detail: cause instanceof Error ? cause.message : undefined,
        })
    }
  }
  return {
    store,
    sync,
    save,
    clear,
    reset(sessionId: string) {
      const draft = current(sessionId)
      if (draft && !draft.saving) put(sessionId, fresh(draft.source, dependencies.snapshot(sessionId)))
    },
    acknowledge(sessionId: string) {
      const draft = current(sessionId)
      if (draft && !draft.saving)
        put(sessionId, {
          ...draft,
          base: planSnapshotKey(dependencies.snapshot(sessionId)),
          stale: false,
          error: undefined,
        })
    },
    setNewStep(sessionId: string, value: string) {
      edit(sessionId, () => ({ newStep: value }))
    },
    setExplanation(sessionId: string, value: string) {
      edit(sessionId, () => ({ explanation: value }))
    },
    add(sessionId: string) {
      edit(sessionId, (draft) =>
        draft.steps.length >= MAX_PLAN_STEPS
          ? { error: 'limit' }
          : {
              steps: [...draft.steps, { id: crypto.randomUUID(), step: draft.newStep.trim(), status: 'pending' }],
              newStep: '',
            },
      )
    },
    update(sessionId: string, id: string, patch: Partial<PlanStep>) {
      edit(sessionId, (draft) => ({
        steps: draft.steps.map((step) => (step.id === id ? { ...step, ...patch } : step)),
      }))
    },
    remove(sessionId: string, id: string) {
      edit(sessionId, (draft) => ({ steps: draft.steps.filter((step) => step.id !== id) }))
    },
    move(sessionId: string, id: string, direction: -1 | 1) {
      edit(sessionId, (draft) => {
        const steps = [...draft.steps],
          index = steps.findIndex((step) => step.id === id),
          target = index + direction
        if (index < 0 || target < 0 || target >= steps.length) return {}
        const item = steps[index]!,
          other = steps[target]!
        steps[index] = other
        steps[target] = item
        return { steps }
      })
    },
  }
}
