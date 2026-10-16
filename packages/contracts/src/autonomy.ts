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
