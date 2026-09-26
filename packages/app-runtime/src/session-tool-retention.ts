import type { AgentWorkspaceState, FileWorkspaceState, GoalPlanWorkspaceState, WorkflowWorkspaceState } from './types'

const pending = (status: string | undefined) => status === 'submitting' || status === 'unknown'

/** Public read models only; ownership eviction never guesses from private module caches. */
export function isSessionToolProtected(
  instanceId: string,
  states: {
    readonly files: FileWorkspaceState
    readonly agents: AgentWorkspaceState
    readonly goals: GoalPlanWorkspaceState
    readonly workflow: WorkflowWorkspaceState
  },
): boolean {
  const file = states.files.entries[instanceId]
  const document = file?.document
  if (
    file?.status === 'loading' ||
    file?.changes.status === 'loading' ||
    file?.diff?.status === 'loading' ||
    file?.tree.search.status === 'loading' ||
    Object.values(file?.tree.nodes ?? {}).some((node) => node.status === 'loading') ||
    (document && (document.draft !== document.baseline || document.status === 'loading' || pending(document.status)))
  )
    return true
  const agent = states.agents.entries[instanceId]
  if (
    agent &&
    (agent.status === 'loading' ||
      agent.draft.revision > 0 ||
      pending(agent.creation.status) ||
      Object.values(agent.actions).some((action) => pending(action.status)))
  )
    return true
  const goal = states.goals.entries[instanceId]
  if (
    goal &&
    (goal.status === 'loading' ||
      goal.goalDirty ||
      goal.planDirty ||
      pending(goal.goalAction.status) ||
      pending(goal.planAction.status))
  )
    return true
  const workflow = states.workflow.entries[instanceId]
  return Boolean(
    workflow &&
    (workflow.status === 'loading' || Object.values(workflow.actions).some((action) => pending(action.status))),
  )
}
