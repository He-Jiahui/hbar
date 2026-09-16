import { afterEach, expect, spyOn, test } from 'bun:test'
import { HbarClient } from '../packages/client/src/index'
import type { PlanState } from '@hbar/contracts'
import { resetSessionCapabilities, updatePlan, useSessionCapabilities } from '../apps/web/src/session-capabilities'

afterEach(resetSessionCapabilities)
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
