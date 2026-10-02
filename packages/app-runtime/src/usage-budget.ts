import { CommandError, type CommandExecutor } from '@hbar/commands'
import { budgetReceiptSchema, setBudgetInputSchema } from '@hbar/contracts/commands/budget'
import type { SessionBudget } from '@hbar/contracts'
import { createState, type StateReader } from './state'

export interface UsageBudgetTarget { readonly sessionId: string }
export interface UsageBudgetState {
  readonly targetSessionId: string | null
  readonly status: 'idle' | 'loading' | 'ready' | 'submitting' | 'unknown' | 'error'
  readonly budget: SessionBudget | null
  readonly draftLimit: string
  readonly error: string | null
  readonly receipt: ReturnType<typeof budgetReceiptSchema.parse> | null
}
export interface UsageBudgetRuntime {
  readonly state: StateReader<UsageBudgetState>
  readonly setDraftLimit: (value: string) => void
  readonly refresh: () => Promise<void>
  readonly save: () => Promise<void>
  readonly reconcile: () => Promise<ReturnType<typeof budgetReceiptSchema.parse> | null>
  readonly dispose: () => void
}
export interface UsageBudgetOptions {
  readonly commands: CommandExecutor
  readonly target: StateReader<UsageBudgetTarget | null>
  readonly getReceipt?: (sessionId: string, idempotencyKey: string) => Promise<unknown | null>
  readonly onError?: (error: unknown) => void
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Budget action failed'
}
function key(sessionId: string, limit: number, revision: number | null): string {
  return `usage-budget:${sessionId}:${limit}:${revision ?? 'none'}`
}

export function createUsageBudget(options: UsageBudgetOptions): UsageBudgetRuntime {
  const state = createState<UsageBudgetState>({
    targetSessionId: null,
    status: 'idle',
    budget: null,
    draftLimit: '',
    error: null,
    receipt: null,
  }, options.onError ?? (() => undefined))
  let disposed = false
  let generation = 0
  let pending: { readonly sessionId: string; readonly key: string } | null = null
  let unsubscribeTarget = options.target.subscribe(() => { void refresh() })

  function currentTarget(): string {
    const sessionId = options.target.getSnapshot()?.sessionId
    if (!sessionId) throw new CommandError('INVALID_INPUT', 'A session target is required')
    return sessionId
  }
  function replace(next: UsageBudgetState): void { if (!disposed) state.replace(next) }
  async function refresh(): Promise<void> {
    const sessionId = currentTarget(); const token = ++generation
    replace({ ...state.reader.getSnapshot(), targetSessionId: sessionId, status: 'loading', error: null })
    try {
      const budget = await options.commands.execute('session.getBudget', { sessionId })
      if (disposed || token !== generation || currentTarget() !== sessionId) return
      replace({ ...state.reader.getSnapshot(), targetSessionId: sessionId, status: 'ready', budget, draftLimit: budget ? String(budget.limit) : '', error: null })
    } catch (error) {
      if (disposed || token !== generation) return
      replace({ ...state.reader.getSnapshot(), targetSessionId: sessionId, status: 'error', error: message(error) })
      options.onError?.(error)
    }
  }
  async function save(): Promise<void> {
    const sessionId = currentTarget(); const snapshot = state.reader.getSnapshot();
    const limit = Number(snapshot.draftLimit)
    const parsed = setBudgetInputSchema.safeParse({ sessionId, tokens: limit, expectedRevision: snapshot.budget?.revision ?? null })
    if (!parsed.success) throw new CommandError('INVALID_INPUT', 'Token budget must be a positive whole number')
    if (snapshot.status === 'submitting') return
    const requestKey = key(sessionId, limit, snapshot.budget?.revision ?? null); pending = { sessionId, key: requestKey }
    replace({ ...snapshot, targetSessionId: sessionId, status: 'submitting', error: null })
    try {
      const receipt = budgetReceiptSchema.parse(await options.commands.execute('session.setBudget', parsed.data, { idempotencyKey: requestKey }))
      if (disposed || currentTarget() !== sessionId) return
      replace({ ...state.reader.getSnapshot(), targetSessionId: sessionId, status: 'ready', budget: receipt.budget, draftLimit: String(receipt.budget.limit), receipt, error: null }); pending = null
    } catch (error) {
      if (disposed) return
      if (error instanceof CommandError && error.code === 'RESULT_UNKNOWN') {
        replace({ ...state.reader.getSnapshot(), status: 'unknown', error: message(error) }); return
      }
      pending = null; replace({ ...state.reader.getSnapshot(), status: 'error', error: message(error) }); options.onError?.(error)
    }
  }
  async function reconcile() {
    const current = pending; if (!current || !options.getReceipt) return null
    const found = options.getReceipt ? budgetReceiptSchema.parse(await options.getReceipt(current.sessionId, current.key)) : null
    if (found && !disposed && currentTarget() === current.sessionId) {
      replace({ ...state.reader.getSnapshot(), status: 'ready', budget: found.budget, draftLimit: String(found.budget.limit), receipt: found, error: null }); pending = null
    }
    return found
  }
  function setDraftLimit(value: string) { if (!disposed) replace({ ...state.reader.getSnapshot(), draftLimit: value, error: null }) }
  function dispose() { disposed = true; generation += 1; unsubscribeTarget(); state.dispose() }
  return Object.freeze({ state: state.reader, setDraftLimit, refresh, save, reconcile, dispose })
}
