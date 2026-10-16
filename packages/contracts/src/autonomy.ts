import { z } from 'zod'

const id = z.string().min(1).max(160)

export const AUTONOMY_DECISION_MODE_SETTING = 'backend.decisionMode'
export const AUTONOMY_DECISION_TARGET_SETTING = 'backend.decisionTargetSessionId'
/** Internal one-time migration marker, committed with the session policy. */
export const AUTONOMY_LEGACY_MIGRATED_SETTING = 'backend.legacyDecisionMigrated'
export const AUTONOMY_DECISION_MODES = ['wait_user', 'recommended', 'delegate'] as const
export const autonomyDecisionModeSchema = z.enum(AUTONOMY_DECISION_MODES)
export type AutonomyDecisionMode = z.infer<typeof autonomyDecisionModeSchema>
export const autonomyDecisionPolicySchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('wait_user') }),
  z.strictObject({ mode: z.literal('recommended') }),
  z.strictObject({ mode: z.literal('delegate'), targetSessionId: id }),
])
export type AutonomyDecisionPolicy = z.infer<typeof autonomyDecisionPolicySchema>
export const autonomyPolicySourceSchema = z.enum(['default', 'global', 'session', 'legacy'])
export const autonomyPolicyResolutionSchema = z.strictObject({
  sessionId: id,
  policy: autonomyDecisionPolicySchema,
  source: autonomyPolicySourceSchema,
  revisions: z.record(z.string().min(1).max(256), z.number().int().nonnegative().safe()),
})
export type AutonomyPolicyResolution = z.infer<typeof autonomyPolicyResolutionSchema>

/** Original Run identity and approval arguments remain in the same durable Plan-exit record. */
export const delegatedDecisionReceiptSchema = z.strictObject({
  delegationId: id,
  targetSessionId: id,
  targetRunId: id,
  replyRevision: z.number().int().positive().safe(),
})
export type DelegatedDecisionReceipt = z.output<typeof delegatedDecisionReceiptSchema>
const automaticDecisionFields = {
  version: z.literal(1),
  source: z.enum(['recommended', 'delegate']),
  policy: autonomyPolicyResolutionSchema,
  delegation: delegatedDecisionReceiptSchema.optional(),
}
function validateDecisionReceipt(
  value: { source: 'recommended' | 'delegate'; delegation?: DelegatedDecisionReceipt | undefined },
  context: z.RefinementCtx,
) {
  if ((value.source === 'delegate') !== (value.delegation !== undefined))
    context.addIssue({ code: 'custom', message: 'Only a delegated decision must carry its original target receipt' })
}
export const automaticPlanExitDecisionSchema = z
  .strictObject(automaticDecisionFields)
  .superRefine(validateDecisionReceipt)
export type AutomaticPlanExitDecision = z.infer<typeof automaticPlanExitDecisionSchema>

/** Captured from the final trusted tool admission, never from model arguments. */
export const automaticToolApprovalAdmissionSchema = z.strictObject({
  mode: z.literal('ask'),
  decision: z.literal('ask'),
  humanApproval: z.literal(false),
})
export type AutomaticToolApprovalAdmission = z.infer<typeof automaticToolApprovalAdmissionSchema>
/** Captured before publishing the original approval; absent on historical requests. */
export const approvalAutomationContextSchema = z.strictObject({
  policy: autonomyPolicyResolutionSchema,
  admission: automaticToolApprovalAdmissionSchema.optional(),
})
export type ApprovalAutomationContext = z.output<typeof approvalAutomationContextSchema>
export const automaticToolApprovalDecisionSchema = z
  .strictObject({
    ...automaticDecisionFields,
    admission: automaticToolApprovalAdmissionSchema,
  })
  .superRefine(validateDecisionReceipt)
export type AutomaticToolApprovalDecision = z.infer<typeof automaticToolApprovalDecisionSchema>
