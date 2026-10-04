import type { WorkflowWorkspaceEntryState } from '@hbar/app-runtime'
import type { AgentRecord } from '@hbar/contracts/commands/agents'

export function projectActivityWorkflow(
  entry: Readonly<WorkflowWorkspaceEntryState> | undefined,
  sessionId: string,
  live: readonly AgentRecord[],
) {
  const workflow =
    entry?.sessionId === sessionId && entry.snapshot.workflow?.sessionId === sessionId ? entry.snapshot.workflow : null
  const seen = new Set<string>()
  const rows = [...(workflow?.delegations ?? [])]
    .sort((a, b) => b.updatedAt - a.updatedAt || a.delegationId.localeCompare(b.delegationId))
    .flatMap((delegation) => {
      if (delegation.agentId && seen.has(delegation.agentId)) return []
      if (delegation.agentId) seen.add(delegation.agentId)
      const stored = delegation.agentId ? entry?.agents[delegation.agentId] : undefined
      const current = live.find((agent) => agent.agentId === delegation.agentId && agent.parentSessionId === sessionId)
      const candidate = current && (!stored || current.updatedAt >= stored.updatedAt) ? current : stored
      const agent =
        candidate?.parentSessionId === sessionId &&
        candidate.agentId === delegation.agentId &&
        candidate.sessionId !== sessionId
          ? candidate
          : undefined
      return [{ delegation, agent }]
    })
    .sort(
      (a, b) =>
        a.delegation.createdAt - b.delegation.createdAt ||
        a.delegation.delegationId.localeCompare(b.delegation.delegationId),
    )
  const focused = rows.filter((row) => row.delegation.itemId === workflow?.focus?.focusId)
  const other = rows.filter((row) => row.delegation.itemId !== workflow?.focus?.focusId)
  const settled = (items: typeof rows) =>
    items.filter((row) => ['patch_ready', 'applied', 'conflict', 'cancelled', 'failed'].includes(row.delegation.status))
      .length
  return {
    workflow,
    focused,
    other,
    settled,
    representedAgentIds: new Set(rows.flatMap((row) => (row.agent ? [row.agent.agentId] : []))),
  }
}
