import type { Database } from 'bun:sqlite'
import { HbarError, type Approval } from '@hbar/contracts'
import { automaticPlanExitDecisionSchema, type AutomaticPlanExitDecision } from '@hbar/contracts/autonomy'
import type { ExecutionPrincipal } from '@hbar/contracts/execution-principal'
import { assertAutomaticDecisionPolicy } from './automatic-decision-policy'

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
  if ((automatic.source === 'recommended' && decision !== 'implement') || approval.tool !== 'exit_plan_mode')
    throw new HbarError('AUTOMATIC_PLAN_EXIT_INVALID', 'Automatic Plan exit requires its original Plan decision')
  if (!principal || principal.actorId !== actorId)
    throw new HbarError('EXECUTION_PRINCIPAL_UNAVAILABLE', 'Automatic Plan exit requires the actual source Run actor')
  assertAutomaticDecisionPolicy(db, approval.sessionId, automatic.policy, automatic.source)
  return automatic
}
