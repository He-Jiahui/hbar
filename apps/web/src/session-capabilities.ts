import { create } from 'zustand'
import type { ClientTransport } from '@hbar/client'
import type {
  GoalStatus,
  PlanState,
  PlanStep,
  RunMode,
  SessionBudget,
  ThreadGoal,
  WireNotification,
} from '@hbar/contracts'

export type SessionCapabilityTab = 'goal' | 'plan' | 'budget'

export interface SessionCapabilityState {
  mode: RunMode
  goal: ThreadGoal | null
  plan: PlanState | null
  budget: SessionBudget | null
  loading: boolean
  saving: boolean
  error: string
}

interface SessionCapabilityStore {
  sessions: Record<string, SessionCapabilityState>
  setSession(sessionId: string, patch: Partial<SessionCapabilityState>): void
  clear(): void
}

const EMPTY_STATE: SessionCapabilityState = {
  mode: 'default',
  goal: null,
  plan: null,
  budget: null,
  loading: false,
  saving: false,
  error: '',
}

export const useSessionCapabilities = create<SessionCapabilityStore>((set) => ({
  sessions: {},
  setSession: (sessionId, patch) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: { ...(state.sessions[sessionId] ?? EMPTY_STATE), ...patch },
      },
    })),
  clear: () => set({ sessions: {} }),
}))

const operationSequences = new Map<string, number>()

function nextSequence(sessionId: string) {
  const sequence = (operationSequences.get(sessionId) ?? 0) + 1
  operationSequences.set(sessionId, sequence)
  return sequence
}

function isCurrent(sessionId: string, sequence: number, isConnected: () => boolean) {
  return operationSequences.get(sessionId) === sequence && isConnected()
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export async function loadSessionCapabilities(
  sessionId: string,
  transport: ClientTransport,
  isConnected: () => boolean = () => true,
) {
  const sequence = nextSequence(sessionId)
  useSessionCapabilities.getState().setSession(sessionId, { loading: true, error: '' })
  try {
    const [goalResult, plan, mode, budget] = await Promise.all([
      transport.call('goal.get', { sessionId }),
      transport.call('plan.get', { sessionId }),
      transport.call('mode.get', { sessionId }),
      transport.call('budget.get', { sessionId }),
    ])
    if (!isCurrent(sessionId, sequence, isConnected)) return
    const current = useSessionCapabilities.getState().sessions[sessionId]
    const currentGoal = current?.goal
    const currentPlan = current?.plan
    const currentBudget = current?.budget
    useSessionCapabilities.getState().setSession(sessionId, {
      goal: currentGoal && goalResult.goal && currentGoal.updatedAt > goalResult.goal.updatedAt ? currentGoal : goalResult.goal,
      plan: currentPlan && plan && currentPlan.updatedAt > plan.updatedAt ? currentPlan : plan,
      mode: mode.mode,
      budget: currentBudget && budget && currentBudget.revision > budget.revision ? currentBudget : budget,
      loading: false,
      error: '',
    })
  } catch (error) {
    if (isCurrent(sessionId, sequence, isConnected))
      useSessionCapabilities.getState().setSession(sessionId, { loading: false, error: messageOf(error) })
  }
}

async function mutation<T>(sessionId: string, operation: () => Promise<T>, apply: (value: T) => void) {
  const sequence = nextSequence(sessionId)
  useSessionCapabilities.getState().setSession(sessionId, { saving: true, error: '' })
  try {
    const result = await operation()
    if (operationSequences.get(sessionId) === sequence) {
      apply(result)
      useSessionCapabilities.getState().setSession(sessionId, { saving: false, error: '' })
    }
    return result
  } catch (error) {
    if (operationSequences.get(sessionId) === sequence)
      useSessionCapabilities.getState().setSession(sessionId, { saving: false, error: messageOf(error) })
    throw error
  }
}

export function createGoal(
  transport: ClientTransport,
  sessionId: string,
  objective: string,
  tokenBudget?: number,
) {
  return mutation(
    sessionId,
    () => transport.call('goal.create', { sessionId, objective, ...(tokenBudget === undefined ? {} : { tokenBudget }) }),
    (result) => useSessionCapabilities.getState().setSession(sessionId, { goal: result.goal }),
  )
}

export function setGoal(
  transport: ClientTransport,
  sessionId: string,
  input: {
    objective?: string | null
    status?: GoalStatus
    tokenBudget?: number | null
    expectedGoalId?: string
  },
) {
  return mutation(sessionId, () => transport.call('goal.set', { sessionId, ...input }), (result) =>
    useSessionCapabilities.getState().setSession(sessionId, { goal: result.goal }),
  )
}

export function clearGoal(transport: ClientTransport, sessionId: string) {
  return mutation(sessionId, () => transport.call('goal.clear', { sessionId }), () =>
    useSessionCapabilities.getState().setSession(sessionId, { goal: null }),
  )
}

export function setMode(transport: ClientTransport, sessionId: string, mode: RunMode) {
  return mutation(sessionId, () => transport.call('mode.set', { sessionId, mode }), (result) =>
    useSessionCapabilities.getState().setSession(sessionId, { mode: result.mode }),
  )
}

export function updatePlan(
  transport: ClientTransport,
  sessionId: string,
  plan: PlanStep[],
  explanation: string | null,
) {
  return mutation(sessionId, () => transport.call('plan.update', { sessionId, plan, explanation }), (result) =>
    useSessionCapabilities.getState().setSession(sessionId, { plan: result }),
  )
}

export function clearPlan(transport: ClientTransport, sessionId: string) {
  return mutation(sessionId, () => transport.call('plan.clear', { sessionId }), () =>
    useSessionCapabilities.getState().setSession(sessionId, { plan: null }),
  )
}

export function setBudget(transport: ClientTransport, sessionId: string, limit: number) {
  return mutation(sessionId, () => transport.call('budget.set', { sessionId, limit }), (result) =>
    useSessionCapabilities.getState().setSession(sessionId, { budget: result }),
  )
}

export function clearBudget(transport: ClientTransport, sessionId: string) {
  return mutation(sessionId, () => transport.call('budget.clear', { sessionId }), () =>
    useSessionCapabilities.getState().setSession(sessionId, { budget: null }),
  )
}

export function applySessionCapabilityEvent(event: WireNotification) {
  if (event.method === 'goal.updated') {
    const current = useSessionCapabilities.getState().sessions[event.params.sessionId]?.goal
    if (!current || event.params.goal.updatedAt >= current.updatedAt)
      useSessionCapabilities.getState().setSession(event.params.sessionId, { goal: event.params.goal, saving: false, error: '' })
  } else if (event.method === 'goal.cleared') {
    useSessionCapabilities.getState().setSession(event.params.sessionId, { goal: null, saving: false, error: '' })
  } else if (event.method === 'plan.updated') {
    const current = useSessionCapabilities.getState().sessions[event.params.sessionId]?.plan
    if (!current || event.params.updatedAt >= current.updatedAt)
      useSessionCapabilities.getState().setSession(event.params.sessionId, { plan: event.params, saving: false, error: '' })
  } else if (event.method === 'mode.changed') {
    useSessionCapabilities.getState().setSession(event.params.sessionId, { mode: event.params.mode, saving: false, error: '' })
  } else if (event.method === 'budget.updated') {
    const current = useSessionCapabilities.getState().sessions[event.params.sessionId]?.budget
    if (!current || event.params.budget.revision >= current.revision)
      useSessionCapabilities.getState().setSession(event.params.sessionId, { budget: event.params.budget, saving: false, error: '' })
  } else if (event.method === 'budget.cleared') {
    useSessionCapabilities.getState().setSession(event.params.sessionId, { budget: null, saving: false, error: '' })
  }
}

export function resetSessionCapabilities() {
  operationSequences.clear()
  useSessionCapabilities.getState().clear()
}

export function emptySessionCapabilities() {
  return EMPTY_STATE
}
