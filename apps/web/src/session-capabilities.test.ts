import { describe, expect, test } from 'bun:test'
import type { SessionBudget, ThreadGoal, WireNotification } from '@hbar/contracts'
import {
  applySessionCapabilityEvent,
  resetSessionCapabilities,
  useSessionCapabilities,
} from './session-capabilities'

const goal: ThreadGoal = {
  threadId: 'session-1',
  goalId: 'goal-1',
  objective: '完成面板',
  status: 'active',
  tokenBudget: 1000,
  tokensUsed: 10,
  timeUsedSeconds: 1,
  createdAt: 1,
  updatedAt: 2,
}

const budget: SessionBudget = {
  sessionId: 'session-1',
  budgetId: 'budget-1',
  limit: 1000,
  phase: 'active',
  usedTokens: 10,
  remainingTokens: 990,
  revision: 2,
  createdAt: 1,
  updatedAt: 2,
}

describe('session capability projection', () => {
  test('projects notifications and ignores older entity revisions', () => {
    resetSessionCapabilities()
    const plan = {
      sessionId: 'session-1',
      turnId: null,
      explanation: '先验证',
      plan: [{ step: '检查状态', status: 'pending' as const }],
      updatedAt: 2,
    }
    const events: WireNotification[] = [
      { method: 'goal.updated', params: { sessionId: 'session-1', runId: null, goal } },
      { method: 'plan.updated', params: plan },
      { method: 'mode.changed', params: { sessionId: 'session-1', mode: 'plan' } },
      { method: 'budget.updated', params: { sessionId: 'session-1', runId: null, budget } },
    ]
    for (const event of events) applySessionCapabilityEvent(event)
    applySessionCapabilityEvent({
      method: 'goal.updated',
      params: { sessionId: 'session-1', runId: null, goal: { ...goal, objective: '旧值', updatedAt: 1 } },
    })
    applySessionCapabilityEvent({
      method: 'budget.updated',
      params: { sessionId: 'session-1', runId: null, budget: { ...budget, limit: 20, revision: 1 } },
    })
    const projected = useSessionCapabilities.getState().sessions['session-1']
    expect(projected?.goal?.objective).toBe('完成面板')
    expect(projected?.plan).toEqual(plan)
    expect(projected?.mode).toBe('plan')
    expect(projected?.budget).toEqual(budget)
  })

  test('cleared notifications remove only their capability', () => {
    resetSessionCapabilities()
    applySessionCapabilityEvent({ method: 'goal.updated', params: { sessionId: 'session-1', runId: null, goal } })
    applySessionCapabilityEvent({ method: 'budget.updated', params: { sessionId: 'session-1', runId: null, budget } })
    applySessionCapabilityEvent({ method: 'goal.cleared', params: { sessionId: 'session-1' } })
    const projected = useSessionCapabilities.getState().sessions['session-1']
    expect(projected?.goal).toBeNull()
    expect(projected?.budget).toEqual(budget)
  })
})
