import type { Database } from 'bun:sqlite'
import { HbarError, type Approval } from '@hbar/contracts'
import { automaticPlanExitDecisionSchema, type AutomaticPlanExitDecision } from '@hbar/contracts/autonomy'
import type { ExecutionPrincipal } from '@hbar/contracts/execution-principal'

/** Runs inside the original Plan-exit transaction, before either the approval or mode is changed. */
export function assertAutomaticPlanExit(
  db: Database,
  approval: Approval,
  decision: 'implement' | 'continue',
  actorId: string,
  principal: ExecutionPrincipal | null,
  raw: AutomaticPlanExitDecision,
): AutomaticPlanExitDecision {
  const automatic = automaticPlanExitDecisionSchema.parse(raw)
  const { policy } = automatic
  if (
    decision !== 'implement' ||
    approval.tool !== 'exit_plan_mode' ||
    policy.policy.mode !== 'recommended' ||
    policy.sessionId !== approval.sessionId ||
    policy.source === 'default'
  )
    throw new HbarError('AUTOMATIC_PLAN_EXIT_INVALID', 'Automatic Plan exit requires the original recommended policy')
  if (!principal || principal.actorId !== actorId)
    throw new HbarError('EXECUTION_PRINCIPAL_UNAVAILABLE', 'Automatic Plan exit requires the actual source Run actor')
  const revisions = Object.entries(policy.revisions)
  if (!revisions.length || revisions.length > 16)
    throw new HbarError('AUTOMATIC_PLAN_EXIT_INVALID', 'Automatic Plan exit requires its bounded settings revisions')
  for (const [id, expected] of revisions) {
    const layer = db.query<{ revision: number }, [string]>('SELECT revision FROM settings_layers WHERE id=?').get(id)
    if ((layer?.revision ?? 0) !== expected)
      throw new HbarError('DECISION_POLICY_CHANGED', 'The decision policy changed before Plan exit was committed')
  }
  return automatic
}
