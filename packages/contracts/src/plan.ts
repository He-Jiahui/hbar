import { z } from 'zod'

export const planStepStatusSchema = z.enum(['pending', 'in_progress', 'completed'])
export type PlanStepStatus = z.infer<typeof planStepStatusSchema>
export const MAX_PLAN_STEPS = 100
export const planStepSchema = z.object({
  step: z.string().min(1).max(4_000),
  status: planStepStatusSchema,
})
export type PlanStep = z.infer<typeof planStepSchema>
export const planStateSchema = z.object({
  sessionId: z.string().min(1).max(160),
  revision: z.number().int().positive(),
  turnId: z.string().min(1).max(160).nullable(),
  explanation: z.string().max(4_000).nullable(),
  plan: z.array(planStepSchema).max(MAX_PLAN_STEPS),
  updatedAt: z.number().int().nonnegative(),
})
export type PlanState = z.infer<typeof planStateSchema>
