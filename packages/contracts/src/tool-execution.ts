import { z } from 'zod'

/** Transient node-process output chunk. The settled ToolResult remains the recovery source. */
export const toolOutputChunkSchema = z
  .strictObject({
    streamId: z.string().uuid(),
    seq: z.number().int().nonnegative().safe(),
    text: z.string().max(8 * 1024),
    reset: z.boolean().optional(),
    reason: z.enum(['gap', 'retention', 'limited']).optional(),
  })
  .superRefine((chunk, context) => {
    if (!chunk.reset && chunk.seq === 0)
      context.addIssue({ code: 'custom', message: 'Output data sequences start at one' })
  })
export type ToolOutputChunk = z.infer<typeof toolOutputChunkSchema>

export const toolOutputNotificationSchema = z.strictObject({
  sessionId: z.string().min(1).max(160),
  runId: z.string().min(1).max(160),
  callId: z.string().min(1).max(160),
  streamId: z.string().uuid(),
  seq: z.number().int().nonnegative().safe(),
  text: z.string().max(8 * 1024),
  reset: z.boolean().optional(),
  reason: z.enum(['gap', 'retention', 'limited']).optional(),
})
export type ToolOutputNotification = z.infer<typeof toolOutputNotificationSchema>

/** Work units reported by the executing tool, never estimated from elapsed time. */
export const toolProgressSchema = z
  .strictObject({ completed: z.number().finite().nonnegative(), total: z.number().finite().positive() })
  .refine((value) => value.completed <= value.total, { message: 'Progress exceeds total work' })
export type ToolProgress = z.infer<typeof toolProgressSchema>

/** Host-owned execution time, excluding approval wait. Elapsed time uses the Host monotonic clock. */
export const toolExecutionSchema = z
  .strictObject({
    startedAt: z.number().int().nonnegative(),
    elapsedMs: z.number().finite().nonnegative(),
    endedAt: z.number().int().nonnegative().optional(),
    progress: toolProgressSchema.optional(),
  })
  .refine((value) => value.endedAt === undefined || value.endedAt >= value.startedAt)
export type ToolExecution = z.infer<typeof toolExecutionSchema>

/** Settled includes failed/denied/cancelled children; skipped work was never dispatched. */
export const toolBatchProgressSchema = z
  .strictObject({
    total: z.number().int().min(1).max(8),
    settled: z.number().int().min(0).max(8),
    running: z.number().int().min(0).max(1),
    pending: z.number().int().min(0).max(8),
    skipped: z.number().int().min(0).max(8),
    unknown: z.number().int().min(0).max(1),
    /** Absent on older history; remaining settled outcomes are neither success nor failure. */
    outcomes: z
      .strictObject({ succeeded: z.number().int().min(0).max(8), failed: z.number().int().min(0).max(8) })
      .optional(),
  })
  .refine((value) => value.settled + value.running + value.pending + value.skipped + value.unknown === value.total)
  .refine((value) => !value.outcomes || value.outcomes.succeeded + value.outcomes.failed <= value.settled)
export type ToolBatchProgress = z.infer<typeof toolBatchProgressSchema>

export const toolExecutionEventSchema = z.strictObject({
  callId: z.string().min(1).max(160),
  name: z.string().min(1).max(160),
  execution: toolExecutionSchema,
})
export const toolBatchEventSchema = z.strictObject({
  parentCallId: z.string().min(1).max(160),
  progress: toolBatchProgressSchema,
})
