import { z } from 'zod'
import { executionOwnershipSchema } from './runtime'
import { decisionKindSchema } from './commands/decisions'

export const executionWaitDecisionSchema = z.strictObject({
  kind: decisionKindSchema,
  id: z.string().min(1).max(160),
  revision: z.number().int().positive().safe(),
})
/** A transient wait binds a persisted decision to its original physical executor. */
export const executionHumanWaitSchema = z.strictObject({
  waitId: z.string().uuid(),
  execution: executionOwnershipSchema,
  callId: z.string().min(1).max(160),
  decision: executionWaitDecisionSchema,
})
export type ExecutionWaitDecision = z.output<typeof executionWaitDecisionSchema>
export type ExecutionHumanWait = z.output<typeof executionHumanWaitSchema>
