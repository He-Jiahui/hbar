import { createStore } from 'zustand/vanilla'
import { rpcSchemas, type SessionBudget } from '@hbar/contracts'

interface BudgetDraft {
  readonly source: object
  readonly base: string
  readonly value: string
  readonly dirty: boolean
  readonly busy: boolean
  readonly stale: boolean
  readonly error?: 'invalid' | 'failed' | undefined
  readonly detail?: string | undefined
}
interface BudgetDependencies {
  identity(): object | null
  snapshot(id: string): SessionBudget | null
  save(id: string, limit: number): Promise<SessionBudget>
  clear(id: string): Promise<void>
}
function fingerprint(budget: SessionBudget | null) {
  return JSON.stringify(budget && [budget.budgetId, budget.limit])
}
export function createBudgetDraftModel(dependencies: BudgetDependencies) {
  const store = createStore<{ drafts: Readonly<Record<string, BudgetDraft>> }>(() => ({ drafts: {} }))
  function write(id: string, draft: BudgetDraft) {
    store.setState((state) => ({ drafts: { ...state.drafts, [id]: draft } }))
  }
  function current(id: string) {
    const draft = store.getState().drafts[id]
    return draft?.source === dependencies.identity() ? draft : undefined
  }
  function fresh(source: object, budget: SessionBudget | null): BudgetDraft {
    return {
      source,
      base: fingerprint(budget),
      value: budget ? String(budget.limit) : '',
      dirty: false,
      busy: false,
      stale: false,
    }
  }
  function sync(id: string) {
    const source = dependencies.identity()
    if (!source) return
    const draft = current(id),
      budget = dependencies.snapshot(id)
    if (!draft || draft.base !== fingerprint(budget))
      write(id, draft?.dirty || draft?.busy ? { ...draft, stale: true } : fresh(source, budget))
  }
  async function mutate(id: string, clear: boolean) {
    const draft = current(id)
    if (!draft || draft.busy) return
    if (draft.stale || draft.base !== fingerprint(dependencies.snapshot(id))) {
      write(id, { ...draft, stale: true })
      return
    }
    const parsed = rpcSchemas['budget.set'].safeParse({ sessionId: id, limit: Number(draft.value) })
    if (!clear && !parsed.success) {
      write(id, { ...draft, error: 'invalid' })
      return
    }
    write(id, { ...draft, busy: true, error: undefined, detail: undefined })
    try {
      if (clear) await dependencies.clear(id)
      else if (parsed.success) await dependencies.save(id, parsed.data.limit)
      if (dependencies.identity() === draft.source) write(id, fresh(draft.source, dependencies.snapshot(id)))
    } catch (cause) {
      if (dependencies.identity() === draft.source)
        write(id, {
          ...draft,
          busy: false,
          stale: draft.stale || draft.base !== fingerprint(dependencies.snapshot(id)),
          error: 'failed',
          detail: cause instanceof Error ? cause.message : undefined,
        })
    }
  }
  return {
    store,
    sync,
    save: (id: string) => mutate(id, false),
    clear: (id: string) => mutate(id, true),
    setValue(id: string, value: string) {
      const draft = current(id)
      if (draft && !draft.busy) write(id, { ...draft, value, dirty: true, error: undefined, detail: undefined })
    },
    reset(id: string) {
      const draft = current(id)
      if (draft && !draft.busy) write(id, fresh(draft.source, dependencies.snapshot(id)))
    },
  }
}
