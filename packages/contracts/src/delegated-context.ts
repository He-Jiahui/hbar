import { z } from 'zod'
import { goalStatusSchema } from './index'
import { planStepStatusSchema } from './plan'

const id = z.string().min(1).max(160)
const count = z.number().int().nonnegative().safe()
export const DELEGATED_CONTEXT_MAX_BYTES = 32_768
export const CONTEXT_SUMMARY_EXCERPT_CHARACTERS = 2_000
export const contextSummaryExcerptSchema = z.strictObject({
  sessionId: id,
  eventSeq: count.positive(),
  throughSeq: count,
  text: z.string().max(CONTEXT_SUMMARY_EXCERPT_CHARACTERS * 2),
  truncated: z.boolean(),
})
export type ContextSummaryExcerpt = z.output<typeof contextSummaryExcerptSchema>
const excerpt = z.strictObject({ text: z.string().max(2_000), truncated: z.boolean() })
export const delegatedSourceContextSchema = z
  .strictObject({
    version: z.literal(1),
    sessionId: id,
    runId: id,
    capturedAt: count,
    sessionTitle: z.string().max(200),
    task: excerpt,
    goal: z.strictObject({ goalId: id.optional(), status: goalStatusSchema, objective: excerpt }).optional(),
    plan: z
      .strictObject({
        revision: count.positive(),
        turnId: id.nullable(),
        explanation: excerpt.nullable(),
        totalSteps: count.max(100),
        steps: z
          .array(
            z.strictObject({
              index: count.max(99),
              text: z.string().max(240),
              truncated: z.boolean(),
              status: planStepStatusSchema,
            }),
          )
          .max(8),
      })
      .optional(),
    summary: contextSummaryExcerptSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.summary && value.summary.sessionId !== value.sessionId)
      context.addIssue({ code: 'custom', message: 'The summary must belong to the original source Session' })
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > DELEGATED_CONTEXT_MAX_BYTES)
      context.addIssue({ code: 'custom', message: 'The delegated source context exceeds its byte capacity' })
  })
export type DelegatedSourceContext = z.output<typeof delegatedSourceContextSchema>
