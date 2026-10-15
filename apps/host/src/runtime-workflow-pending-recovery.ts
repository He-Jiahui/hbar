import { HbarError } from '@hbar/contracts'
import type { Run } from '@hbar/contracts'
import type { ExecutionOwnership } from '@hbar/contracts/runtime'
import type { WorkflowState } from '@hbar/contracts/workflow'

type PendingMutation = NonNullable<WorkflowState['pendingMutations']>[number]
export interface WorkflowPendingRecoveryPort {
  readonly readRun: (runId: string) => Promise<Pick<Run, 'id' | 'sessionId' | 'status' | 'failure'>>
  readonly readOwnership: (runId: string) => Promise<{ lease: ExecutionOwnership; state: string } | null>
  /** Stable Host must throw if the Session is executing, claiming, blocked, or owner identity changed. */
  readonly assertQuiescentAuthority: (sessionId: string) => void
}
export interface WorkflowPendingRecoveryPlan {
  readonly workflowId: string
  readonly sessionId: string
  readonly expectedRevision: number
  readonly mutations: readonly PendingMutation[]
  readonly releasedOwnership: readonly ExecutionOwnership[]
  readonly priorRunFailures: readonly (Run['failure'] | null)[]
  readonly diagnosis: 'INTERRUPTED_TOOL_OUTCOME_REQUIRES_REVERIFICATION'
}

/** Read-only planner. Its output is evidence, never a bearer token authorizing a later write. */
export async function planWorkflowPendingRecovery(
  workflow: Pick<WorkflowState, 'workflowId' | 'sessionId' | 'revision' | 'status' | 'pendingMutations'>,
  port: WorkflowPendingRecoveryPort,
): Promise<WorkflowPendingRecoveryPlan | null> {
  const pending = workflow.pendingMutations ?? []
  if (!pending.length) return null
  if (['completed', 'cancelled'].includes(workflow.status))
    throw new HbarError('WORKFLOW_RECOVERY_CONFLICT', 'Terminal Workflow requires explicit reconciliation')
  port.assertQuiescentAuthority(workflow.sessionId)
  const releasedOwnership: ExecutionOwnership[] = []
  const priorRunFailures: Array<Run['failure'] | null> = []
  for (const mutation of pending) {
    const run = await port.readRun(mutation.runId)
    if (run.id !== mutation.runId || run.sessionId !== workflow.sessionId)
      throw new HbarError('WORKFLOW_RECOVERY_IDENTITY', 'Pending mutation does not match its durable Run')
    if (!['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status))
      throw new HbarError('WORKFLOW_RECOVERY_ACTIVE', 'Pending mutation Run has not settled')
    const ownership = await port.readOwnership(mutation.runId)
    if (
      !ownership ||
      ownership.state !== 'released' ||
      ownership.lease.runId !== run.id ||
      ownership.lease.sessionId !== workflow.sessionId
    )
      throw new HbarError('WORKFLOW_RECOVERY_OWNED', 'Pending mutation physical ownership has not been released')
    port.assertQuiescentAuthority(workflow.sessionId)
    releasedOwnership.push(structuredClone(ownership.lease))
    priorRunFailures.push(run.failure ? structuredClone(run.failure) : null)
  }
  return {
    workflowId: workflow.workflowId,
    sessionId: workflow.sessionId,
    expectedRevision: workflow.revision,
    mutations: pending.map((mutation) => ({ ...mutation })),
    releasedOwnership,
    priorRunFailures,
    diagnosis: 'INTERRUPTED_TOOL_OUTCOME_REQUIRES_REVERIFICATION',
  }
}
