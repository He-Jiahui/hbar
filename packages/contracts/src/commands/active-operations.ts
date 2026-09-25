import { z } from 'zod'
import { idSchema } from '../index'

/** A cursor is valid only while the session event revision is unchanged. */
export const activeOperationsCursorSchema = z.strictObject({
  afterOperationId: idSchema,
  sessionSeq: z.number().int().nonnegative(),
})
export const activeOperationsInputSchema = z.strictObject({
  sessionId: idSchema,
  cursor: activeOperationsCursorSchema.optional(),
  limit: z.number().int().min(1).max(100).default(40),
})
export const activeOperationSchema = z.strictObject({
  operationId: idSchema,
  status: z.enum(['queued', 'running', 'waiting_approval', 'cancelRequested']),
  createdAt: z.number().int().nonnegative(),
  startedAt: z.number().int().nonnegative().nullable(),
})
export const activeOperationsPageSchema = z.strictObject({
  sessionId: idSchema,
  sessionSeq: z.number().int().nonnegative(),
  totalActive: z.number().int().nonnegative(),
  items: z.array(activeOperationSchema).max(100),
  nextCursor: activeOperationsCursorSchema.nullable(),
})
export type ActiveOperationsInput = z.input<typeof activeOperationsInputSchema>
export type ActiveOperationsPage = z.output<typeof activeOperationsPageSchema>
