import { CommandError, type CommandExecutor } from '@hbar/commands'
import {
  budgetCommands,
  budgetReceiptSchema,
  setBudgetInputSchema,
  type BudgetReceipt,
  type SetBudgetInput,
} from '@hbar/contracts/commands/budget'
import { sessionBudgetSchema, type SessionBudget } from '@hbar/contracts'
import { createState, type StateReader } from './state'

export interface UsageBudgetTarget {
  readonly sessionId: string
}
export interface UsageBudgetState {
  readonly targetSessionId: string | null
  readonly status: 'idle' | 'loading' | 'ready' | 'submitting' | 'unknown' | 'error'
  readonly budget: SessionBudget | null
  readonly draftLimit: string
  readonly error: string | null
  readonly receipt: BudgetReceipt | null
  readonly pendingSessionId: string | null
  readonly pendingStatus: 'submitting' | 'unknown' | null
}
export interface UsageBudgetRuntime {
  readonly state: StateReader<UsageBudgetState>
  readonly setDraftLimit: (value: string) => void
  readonly refresh: () => Promise<void>
  readonly save: () => Promise<void>
  readonly reconcile: () => Promise<BudgetReceipt | null>
  readonly dispose: () => void
}
export interface UsageBudgetOptions {
  readonly commands: CommandExecutor
  readonly target: StateReader<UsageBudgetTarget | null>
  readonly getReceipt?: (sessionId: string, idempotencyKey: string) => Promise<unknown | null>
  readonly onError?: (error: unknown) => void
  readonly timeoutMs?: number
}
interface PendingBudget {
  readonly sessionId: string
  readonly key: string
  readonly input: SetBudgetInput
  status: 'submitting' | 'unknown'
}
function code(error: unknown): string {
  return error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'EXECUTION_FAILED'
}
/** An owned editor; uncertain writes retain the original target and are never replayed. */
export function createUsageBudget(options: UsageBudgetOptions): UsageBudgetRuntime {
  const report = options.onError ?? (() => undefined)
  const state = createState<UsageBudgetState>(
    {
      targetSessionId: options.target.getSnapshot()?.sessionId ?? null,
      status: 'idle',
      budget: null,
      draftLimit: '',
      error: null,
      receipt: null,
      pendingSessionId: null,
      pendingStatus: null,
    },
    report,
  )
  let disposed = false
  let generation = 0
  let pending: PendingBudget | null = null
  let reading: AbortController | null = null
  let reconciling: Promise<BudgetReceipt | null> | null = null
  const controllers = new Set<AbortController>()
  const timeoutMs = options.timeoutMs ?? 15_000
  function ensureAlive(): void {
    if (disposed) throw new CommandError('DISPOSED', 'Budget editor is disposed')
  }
  const target = () => options.target.getSnapshot()?.sessionId ?? null
  function replace(patch: Partial<UsageBudgetState>): void {
    if (!disposed)
      state.replace({
        ...state.reader.getSnapshot(),
        ...patch,
        pendingSessionId: pending?.sessionId ?? null,
        pendingStatus: pending?.status ?? null,
      })
  }
  async function bounded<Value>(
    operation: (signal: AbortSignal) => Promise<Value>,
    controller: AbortController,
  ): Promise<Value> {
    controllers.add(controller)
    const timer = setTimeout(() => controller.abort(new CommandError('TIMEOUT', 'Budget request timed out')), timeoutMs)
    let removeAbort: () => void = () => undefined
    try {
      const interrupted = new Promise<never>((_resolve, reject) => {
        const onAbort = () => reject(controller.signal.reason)
        controller.signal.addEventListener('abort', onAbort, { once: true })
        removeAbort = () => controller.signal.removeEventListener('abort', onAbort)
        if (controller.signal.aborted) onAbort()
      })
      return await Promise.race([operation(controller.signal), interrupted])
    } finally {
      clearTimeout(timer)
      removeAbort()
      controllers.delete(controller)
    }
  }
  function verifyReceipt(raw: unknown, captured: PendingBudget): BudgetReceipt {
    const parsed = budgetReceiptSchema.safeParse(raw)
    if (
      !parsed.success ||
      parsed.data.idempotencyKey !== captured.key ||
      parsed.data.budget.sessionId !== captured.sessionId ||
      parsed.data.budget.limit !== captured.input.tokens ||
      parsed.data.revision !== parsed.data.budget.revision
    )
      throw new CommandError('INVALID_OUTPUT', 'Budget receipt does not match the original update')
    return parsed.data
  }
  async function refresh(): Promise<void> {
    ensureAlive()
    const sessionId = target()
    const token = ++generation
    reading?.abort(new CommandError('QUERY_SUPERSEDED', 'Budget target changed'))
    reading = null
    const changed = state.reader.getSnapshot().targetSessionId !== sessionId
    replace({
      targetSessionId: sessionId,
      status: sessionId ? 'loading' : 'idle',
      ...(changed ? { budget: null, draftLimit: '', receipt: null } : {}),
      error: null,
    })
    if (!sessionId) return
    const controller = new AbortController()
    reading = controller
    try {
      const input = budgetCommands['session.getBudget'].input.parse({ sessionId })
      const raw = await bounded(
        (signal) => options.commands.execute('session.getBudget', input, { signal }),
        controller,
      )
      const parsed = sessionBudgetSchema.nullable().safeParse(raw)
      if (!parsed.success || (parsed.data && parsed.data.sessionId !== sessionId))
        throw new CommandError('INVALID_OUTPUT', 'Budget response does not match the requested session')
      if (disposed || generation !== token || target() !== sessionId) return
      replace({
        status: pending?.sessionId === sessionId ? pending.status : 'ready',
        budget: parsed.data,
        draftLimit: parsed.data ? String(parsed.data.limit) : '',
        error: null,
      })
    } catch (error) {
      if (disposed || generation !== token || target() !== sessionId) return
      replace({ status: 'error', error: code(error) })
      report(error)
    } finally {
      if (reading === controller) reading = null
    }
  }
  async function save(): Promise<void> {
    ensureAlive()
    if (pending) throw new CommandError('BUSY', 'An original budget update is still pending')
    const sessionId = target()
    const snapshot = state.reader.getSnapshot()
    if (!sessionId || snapshot.targetSessionId !== sessionId || snapshot.status === 'loading')
      throw new CommandError('INVALID_INPUT', 'The selected session budget must be loaded first')
    const parsed = setBudgetInputSchema.safeParse({
      sessionId,
      tokens: /^\d+$/.test(snapshot.draftLimit) ? Number(snapshot.draftLimit) : Number.NaN,
      expectedRevision: snapshot.budget?.revision ?? null,
    })
    if (!parsed.success) {
      replace({ error: 'INVALID_INPUT' })
      throw new CommandError('INVALID_INPUT', 'Token budget must be a positive whole number')
    }
    const captured: PendingBudget = {
      sessionId,
      key: `usage-budget:${crypto.randomUUID()}`,
      input: parsed.data,
      status: 'submitting',
    }
    pending = captured
    replace({ status: 'submitting', error: null })
    try {
      const raw = await bounded(
        (signal) =>
          options.commands.execute('session.setBudget', captured.input, { signal, idempotencyKey: captured.key }),
        new AbortController(),
      )
      const receipt = verifyReceipt(raw, captured)
      if (disposed || pending !== captured) return
      pending = null
      replace(
        target() === sessionId
          ? { status: 'ready', budget: receipt.budget, draftLimit: String(receipt.budget.limit), receipt, error: null }
          : {},
      )
    } catch (error) {
      if (disposed || pending !== captured) return
      if (['RESULT_UNKNOWN', 'TIMEOUT', 'TIMED_OUT', 'DISCONNECTED', 'INVALID_OUTPUT'].includes(code(error))) {
        captured.status = 'unknown'
        replace({ ...(target() === sessionId ? { status: 'unknown' as const } : {}), error: code(error) })
        return
      }
      pending = null
      replace(target() === sessionId ? { status: 'error', error: code(error) } : {})
      report(error)
    }
  }
  async function reconcile(): Promise<BudgetReceipt | null> {
    ensureAlive()
    if (reconciling) return reconciling
    const captured = pending
    if (!captured || captured.status !== 'unknown') return null
    if (!options.getReceipt) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Budget receipt queries are unavailable')
    const getReceipt = options.getReceipt
    const operation = (async () => {
      try {
        const raw = await bounded(() => getReceipt(captured.sessionId, captured.key), new AbortController())
        if (raw === null) return null
        const receipt = verifyReceipt(raw, captured)
        if (disposed || pending !== captured) return receipt
        pending = null
        replace(
          target() === captured.sessionId
            ? {
                status: 'ready',
                budget: receipt.budget,
                draftLimit: String(receipt.budget.limit),
                receipt,
                error: null,
              }
            : { error: null },
        )
        return receipt
      } catch (error) {
        if (!disposed && pending === captured) replace({ error: code(error) })
        throw error
      }
    })()
    reconciling = operation
    try {
      return await operation
    } finally {
      if (reconciling === operation) reconciling = null
    }
  }
  const unsubscribeTarget = options.target.subscribe(() => {
    void refresh().catch(report)
  })
  return Object.freeze({
    state: state.reader,
    refresh,
    save,
    reconcile,
    setDraftLimit(value: string) {
      if (!disposed) replace({ draftLimit: value, error: null })
    },
    dispose() {
      if (disposed) return
      disposed = true
      generation++
      unsubscribeTarget()
      for (const controller of controllers) controller.abort(new CommandError('DISPOSED', 'Budget editor is disposed'))
      controllers.clear()
      state.dispose()
    },
  })
}
