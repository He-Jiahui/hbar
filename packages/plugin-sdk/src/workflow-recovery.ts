import { z } from 'zod'
import { workflowStateSchema } from '@hbar/contracts/workflow'

export const workflowRecoveryCommitSchema = z.strictObject({
  current: workflowStateSchema,
  next: workflowStateSchema,
})
export const workflowRecoveryPageSchema = z.strictObject({
  sessionIds: z.array(z.string().min(1).max(160)).max(100),
  nextAfter: z.string().min(1).max(160).nullable(),
})
/** Host-only lifecycle port; never part of the application capability or tool catalog. */
export interface WorkflowRecoveryLifecycle {
  pendingRecoverySessions(after: string): Promise<z.infer<typeof workflowRecoveryPageSchema>>
  recoverPendingMutations(
    sessionId: string,
    commit: (input: z.infer<typeof workflowRecoveryCommitSchema>) => Promise<void>,
  ): Promise<void>
}
