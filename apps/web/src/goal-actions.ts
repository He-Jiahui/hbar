import { createGoalDraftModel } from './goal-draft-model'
import { client, useConnection } from './stores'
import { clearGoal, createGoal, setGoal, useSessionCapabilities } from './session-capabilities'

export const goalDraftModel = createGoalDraftModel({
  identity: () => useConnection.getState().client,
  snapshot: (id) => useSessionCapabilities.getState().sessions[id]?.goal ?? null,
  async save(id, goal, objective, budget) {
    if (goal)
      await setGoal(client(), id, {
        objective,
        tokenBudget: budget ?? null,
        ...(goal.goalId ? { expectedGoalId: goal.goalId } : {}),
      })
    else await createGoal(client(), id, objective, budget)
  },
  async setPaused(id, goal, paused) {
    await setGoal(client(), id, {
      status: paused ? 'paused' : 'active',
      ...(goal.goalId ? { expectedGoalId: goal.goalId } : {}),
    })
  },
  async clear(id) {
    await clearGoal(client(), id)
  },
})
