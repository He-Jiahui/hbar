import { z } from 'zod'
import type { Run, UserInput } from './index'

export const AUTONOMY_TRANSIENT_RETRY_LIMIT = 2
const id = z.string().min(1).max(160)
export const autonomyRetryPlanSchema = z.strictObject({
  version: z.literal(1),
  kind: z.literal('transient'),
  sessionId: id,
  rootRunId: id,
  predecessorRunId: id,
  requestId: z.string().regex(/^autonomy:retry:[a-f0-9]{64}$/),
  transientRetries: z.number().int().min(1).max(AUTONOMY_TRANSIENT_RETRY_LIMIT),
  repairRetries: z.literal(0),
  wakeAt: z.number().int().nonnegative().safe(),
})
export const autonomyRetryAdmissionSchema = z.strictObject({
  plan: autonomyRetryPlanSchema,
  settingsRevision: z.number().int().nonnegative().safe(),
})
export type AutonomyRetryPlan = z.output<typeof autonomyRetryPlanSchema>
export type AutonomyRetryAdmission = z.output<typeof autonomyRetryAdmissionSchema>

/** A continuation reads the existing transcript; the user task is retained for failures before its first message. */
export function autonomyRetryInput(run: Run): UserInput {
  return {
    ...run.input,
    source: 'system',
    text: `Continue the original task after a temporary provider failure (${run.failure?.code ?? 'PROVIDER_TRANSIENT'}). Review the existing conversation and tool results first. Resume unfinished work and verify uncertain effects before acting. Preserve the user's permissions and constraints. Finish normally when the task is complete.\n\nOriginal task:\n${run.input.text}`,
  }
}
