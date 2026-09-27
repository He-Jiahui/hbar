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
  revision: z.number().int().nonnegative(),
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

export const queuedRunRemoveInputSchema = z.strictObject({
  sessionId: idSchema,
  operationId: idSchema,
  expectedRevision: z.number().int().nonnegative(),
})
export const queuedRunRemoveReceiptSchema = z.strictObject({
  commandId: z.literal('queuedRun.remove'),
  commandVersion: z.literal(1),
  sessionId: idSchema,
  operationId: idSchema,
  idempotencyKey: z.string().min(1).max(128),
  status: z.literal('cancelled'),
  eventId: idSchema,
  sessionSeq: z.number().int().nonnegative(),
  removedAt: z.number().int().nonnegative(),
})
export type QueuedRunRemoveInput = z.output<typeof queuedRunRemoveInputSchema>
export type QueuedRunRemoveReceipt = z.output<typeof queuedRunRemoveReceiptSchema>
