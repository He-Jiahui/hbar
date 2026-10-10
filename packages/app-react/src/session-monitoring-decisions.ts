import {
  sessionDecisionAction,
  type InteractionState,
  type SessionDecision,
  type SessionDecisionProjection,
} from '@hbar/app-runtime'

/** An uncertain receipt still needs attention even if an older saved decision looks settled. */
export function settledSessionDecision(decision: SessionDecision, actions: InteractionState): boolean {
  const action = sessionDecisionAction(decision, actions)
  if (action && ['unknown', 'submitting', 'failed'].includes(action.status)) return false
  return decision.kind === 'approval'
    ? decision.approval.status !== 'pending'
    : !decision.pending && decision.fact !== null
}

export function monitoringDecisions(
  projection: SessionDecisionProjection,
  actions: InteractionState,
): readonly SessionDecision[] {
  const candidates = [
    ...projection.settledHistory,
    ...[...projection.byMessage.values()].flatMap((rows) => [...rows.values()].flat()),
  ]
  const ids = new Set<string>()
  return candidates.filter((decision) => {
    const key = JSON.stringify([decision.sessionId, decision.kind, decision.id])
    if (!settledSessionDecision(decision, actions) || ids.has(key)) return false
    ids.add(key)
    return true
  })
}
