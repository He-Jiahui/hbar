import { afterEach, expect, spyOn, test } from 'bun:test'
import { HbarClient } from '../packages/client/src/index'
import type { PlanState, RpcResults, ThreadGoal } from '@hbar/contracts'
import {
  resetSessionCapabilities,
  updatePlan,
  setGoal,
  applySessionCapabilityEvent,
  useSessionCapabilities,
} from '../apps/web/src/session-capabilities'

afterEach(resetSessionCapabilities)
test('an older Goal response cannot replace a newer goal notification', async () => {
  const connection = new HbarClient('http://localhost:1', 'test')
  let finish!: (value: RpcResults['goal.set']) => void
  const old: ThreadGoal = {
    threadId: 's',
    goalId: 'g',
    objective: 'Old',
    status: 'active',
    tokenBudget: null,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    createdAt: 1,
    updatedAt: 2,
  }
  const mock = spyOn(connection, 'call').mockReturnValueOnce(
    new Promise<RpcResults['goal.set']>((resolve) => {
      finish = resolve
    }),
  )
  try {
    const pending = setGoal(connection, 's', { objective: 'Old' })
    const latest = { ...old, objective: 'Newer notification', updatedAt: 3 }
    applySessionCapabilityEvent({ method: 'goal.updated', params: { sessionId: 's', runId: null, goal: latest } })
    finish({ goal: old, remainingTokens: null })
    await pending
    expect(useSessionCapabilities.getState().sessions.s?.goal).toEqual(latest)
  } finally {
    mock.mockRestore()
  }
})
test('resetting a host invalidates old capability mutations even when session IDs and sequence numbers repeat', async () => {
  const connection = new HbarClient('http://localhost:1', 'test')
  let finish!: (value: PlanState) => void
  const old: PlanState = {
    sessionId: 'same-id',
    turnId: null,
    explanation: null,
    plan: [{ step: 'Old connection', status: 'pending' }],
    updatedAt: 10,
  }
  const latest: PlanState = { ...old, plan: [{ step: 'New connection', status: 'pending' }], updatedAt: 1 }
  spyOn(connection, 'call')
    .mockReturnValueOnce(
      new Promise<PlanState>((resolve) => {
        finish = resolve
      }),
    )
    .mockResolvedValueOnce(latest)
  const pending = updatePlan(connection, 'same-id', old.plan, null)
  resetSessionCapabilities()
  await updatePlan(connection, 'same-id', latest.plan, null)
  finish(old)
  await pending
  expect(useSessionCapabilities.getState().sessions['same-id']?.plan).toEqual(latest)
})
