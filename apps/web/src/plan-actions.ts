import { useConnection, useWorkbench } from './stores'
import { translate } from './locale'
import { clearPlan, setMode, updatePlan, useSessionCapabilities } from './session-capabilities'
import { createPlanDraftModel } from './plan-draft-model'

export const planDraftModel = createPlanDraftModel({
  identity: () => useConnection.getState().client,
  snapshot: (id) => useSessionCapabilities.getState().sessions[id]?.plan ?? null,
  async save(id, steps, explanation) {
    const connection = useConnection.getState().client
    if (!connection) throw new Error(translate(useWorkbench.getState().locale, 'hostDisconnected'))
    return updatePlan(connection, id, steps, explanation)
  },
  async clear(id) {
    const connection = useConnection.getState().client
    if (!connection) throw new Error(translate(useWorkbench.getState().locale, 'hostDisconnected'))
    await clearPlan(connection, id)
  },
})
export function changePlanMode(sessionId: string, mode: 'default' | 'plan') {
  const connection = useConnection.getState().client
  if (connection)
    void setMode(connection, sessionId, mode).catch(() => {
      /* Capability ViewModel keeps the local failure. */
    })
}
