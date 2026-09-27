import { z } from 'zod'
import { idSchema } from '../index'

export const queuedUserRunsCursorSchema = z.strictObject({
  afterOperationId: idSchema,
  sessionSeq: z.number().int().nonnegative(),
  totalQueued: z.number().int().nonnegative(),
})
export const queuedUserRunsInputSchema = z.strictObject({
  sessionId: idSchema,
  cursor: queuedUserRunsCursorSchema.optional(),
  limit: z.number().int().min(1).max(20).default(10),
})
export const queuedUserRunSchema = z.strictObject({
  operationId: idSchema,
  createdAt: z.number().int().nonnegative(),
  textPreview: z.string().max(240),
  truncated: z.boolean(),
  attachmentCount: z.number().int().nonnegative(),
})
export const queuedUserRunsPageSchema = z.strictObject({
  sessionId: idSchema,
  sessionSeq: z.number().int().nonnegative(),
  totalQueued: z.number().int().nonnegative(),
  items: z.array(queuedUserRunSchema).max(20),
  nextCursor: queuedUserRunsCursorSchema.nullable(),
})
export type QueuedUserRunsInput = z.input<typeof queuedUserRunsInputSchema>
export type QueuedUserRunsPage = z.output<typeof queuedUserRunsPageSchema>
