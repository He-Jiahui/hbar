import { z } from 'zod'
import { idSchema } from '../index'

/** Preview text is measured in Unicode code points; astral characters use two UTF-16 code units. */
export const ACTIVE_OPERATION_INTENT_PREVIEW_MAX_CODE_POINTS = 160

const activeOperationIntentPreviewSchema = z
  .string()
  .max(ACTIVE_OPERATION_INTENT_PREVIEW_MAX_CODE_POINTS * 2)
  .refine((value) => Array.from(value).length <= ACTIVE_OPERATION_INTENT_PREVIEW_MAX_CODE_POINTS)
  .nullable()

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
  /** Optional for older Hosts; new Hosts send only a short input prefix, never full prompt text. */
  intentPreview: activeOperationIntentPreviewSchema.optional(),
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
