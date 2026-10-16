import { z } from 'zod'
import { userInputRequestSchema } from './index'
import { approvalAutomationContextSchema } from './autonomy'
import { nodeExecutionTargetSchema } from './node-execution-target'

const id = z.string().min(1).max(160)
/** Original pending approval and trusted admission, never a model-created approval request. */
export const delegatedApprovalSubjectSchema = z.strictObject({
  kind: z.enum(['approval', 'plan_exit']),
  approval: z.strictObject({
    id,
    sessionId: id,
    runId: id,
    callId: id,
    tool: id,
    args: z.record(z.string(), z.unknown()),
    createdAt: z.number().int().nonnegative().safe(),
    executionTarget: nodeExecutionTargetSchema.optional(),
  }),
  context: approvalAutomationContextSchema,
})
export type DelegatedApprovalSubject = z.output<typeof delegatedApprovalSubjectSchema>

/** A choice envelope for the target only. It does not create a source questionnaire. */
export function delegatedApprovalRequest(subject: DelegatedApprovalSubject) {
  const plan = subject.kind === 'plan_exit'
  return userInputRequestSchema.parse({
    requestId: subject.approval.id,
    sessionId: subject.approval.sessionId,
    runId: subject.approval.runId,
    callId: subject.approval.callId,
    isBlocking: true,
    questions: [
      {
        id: 'decision',
        header: plan ? 'Plan exit' : 'Approval',
        question: plan
          ? 'Choose whether the source Run should implement its submitted plan or continue planning. Review the original plan in the approval envelope. This grants no authority beyond the source permission policy.'
          : 'Choose whether the source Run may execute the exact pending tool call in the approval envelope. This grants no authority beyond the source permission policy.',
        purpose: 'decision',
        isOther: false,
        isSecret: false,
        options: plan
          ? [
              { label: 'implement', description: 'Implement the submitted plan' },
              { label: 'continue', description: 'Continue planning' },
            ]
          : [
              { label: 'allowed', description: 'Allow this exact call within the current source permission' },
              { label: 'denied', description: 'Deny this exact call' },
            ],
      },
    ],
  })
}
