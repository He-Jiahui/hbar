import { planWorkflowPendingRecovery } from './runtime-workflow-pending-recovery'
import { workflowStateSchema } from '@hbar/contracts/workflow'
import { HbarError } from '@hbar/contracts'
import type { StoragePort } from '@hbar/storage'
import { workflowRecoveryCommitSchema } from '@hbar/plugin-sdk/workflow-recovery'

/** Executed only inside the Stable Host startup admission gate; never accepts caller authority booleans. */
export async function commitRuntimeWorkflowRecovery(options: {
  readonly storage: StoragePort
  readonly sessionId: string
  readonly input: unknown
  readonly assertAuthority: (sessionId: string) => void
}): Promise<void> {
  const { current, next } = workflowRecoveryCommitSchema.parse(options.input)
  if (current.sessionId !== options.sessionId || next.sessionId !== options.sessionId)
    throw new HbarError('WORKFLOW_RECOVERY_IDENTITY', 'Lifecycle recovery changed its bound Session')
  const pending = current.pendingMutations ?? []
  if (!pending.length || ['completed', 'cancelled'].includes(current.status))
    throw new HbarError('WORKFLOW_RECOVERY_CONFLICT', 'Workflow has no recoverable pending mutations')
  const expected = {
    ...current,
    status: 'needs_revision',
    pendingMutations: [],
    revision: current.revision + 1,
    updatedAt: next.updatedAt,
  }
  // Schemas normalize key order before exact comparison; no other Plan/focus/evidence changes are authorized.
  const normalized = workflowRecoveryCommitSchema.parse({ current, next: expected }).next
  if (JSON.stringify(normalized) !== JSON.stringify(next) || next.updatedAt < current.updatedAt)
    throw new HbarError('WORKFLOW_RECOVERY_CONFLICT', 'Recovery changed facts outside its lifecycle transition')
  options.assertAuthority(current.sessionId)
  let afterSeq = 0
  let throughSeq: number | undefined
  let durable: typeof current | null = null
  for (let page = 0; page < 100; page++) {
    const events = await options.storage.call('readEventPage', {
      sessionId: current.sessionId,
      afterSeq,
      ...(throughSeq === undefined ? {} : { throughSeq }),
      types: ['workflow.started', 'workflow.updated', 'workflow.migrated.v2', 'workflow.focus.set'],
      limit: 1_000,
      maxReplyBytes: 1_048_576,
    })
    throughSeq ??= events.throughSeq
    for (const item of events.items) {
      if (item.kind !== 'event') continue
      const data = item.event.data
      if (data && typeof data === 'object' && 'workflow' in data) durable = workflowStateSchema.parse(data.workflow)
    }
    if (!events.hasMore) break
    if (events.nextAfterSeq <= afterSeq || page === 99)
      throw new HbarError('WORKFLOW_RECOVERY_CAPACITY', 'Workflow recovery history exceeded its bounded scan')
    afterSeq = events.nextAfterSeq
  }
  if (JSON.stringify(durable) === JSON.stringify(next)) return
  if (JSON.stringify(durable) !== JSON.stringify(current))
    throw new HbarError('WORKFLOW_RECOVERY_CONFLICT', 'Durable Workflow revision changed before recovery')
  const plan = await planWorkflowPendingRecovery(current, {
    readRun: (runId) => options.storage.call('run', runId),
    readOwnership: (runId) => options.storage.call('runtimeExecutionRead', runId),
    assertQuiescentAuthority: options.assertAuthority,
  })
  if (!plan) throw new HbarError('WORKFLOW_RECOVERY_CONFLICT', 'Pending recovery disappeared')
  const receipts = plan.mutations.map((mutation, index) => ({
    ...mutation,
    lease: plan.releasedOwnership[index],
    priorRunFailure: plan.priorRunFailures[index],
  }))
  options.assertAuthority(current.sessionId)
  await options.storage.call('append', current.sessionId, 'workflow.updated', {
    workflow: next,
    diagnosis: 'INTERRUPTED_TOOL_OUTCOME_REQUIRES_REVERIFICATION',
    interruptedMutations: receipts,
  })
}
