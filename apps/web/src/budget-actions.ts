import { createBudgetDraftModel } from './budget-draft-model'
import { clearBudget, setBudget, useSessionCapabilities } from './session-capabilities'
import { useConnection, useWorkbench } from './stores'
import { translate } from './locale'
function connection() {
  const value = useConnection.getState().client
  if (!value) throw new Error(translate(useWorkbench.getState().locale, 'hostDisconnected'))
  return value
}
export const budgetDraftModel = createBudgetDraftModel({
  identity: () => useConnection.getState().client,
  snapshot: (id) => useSessionCapabilities.getState().sessions[id]?.budget ?? null,
  save: (id, limit) => setBudget(connection(), id, limit),
  async clear(id) {
    await clearBudget(connection(), id)
  },
})
