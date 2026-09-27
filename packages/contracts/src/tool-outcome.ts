import { z } from 'zod'

/** Host-owned tool settlement; executionStarted means a durable intent was recorded,
 * not that an effect completed or was rolled back. Absent on legacy history. */
export const toolOutcomeSchema = z.strictObject({
  kind: z.enum(['succeeded', 'failed', 'denied', 'cancelled', 'interrupted', 'unknown']),
  executionStarted: z.boolean(),
})

export type ToolOutcome = z.output<typeof toolOutcomeSchema>
