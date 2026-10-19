import { z } from 'zod'

/** Periodic inspection slot, not the earliest durable policy/job due time. */
export const chatDatabaseInspectionCheckpointSchema = z.strictObject({
  version: z.literal(1),
  cursor: z.string().max(4_096).nullable(),
  nextCheckAt: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
})
export type ChatDatabaseInspectionCheckpoint = z.infer<typeof chatDatabaseInspectionCheckpointSchema>
