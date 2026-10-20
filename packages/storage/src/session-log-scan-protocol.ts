import { z } from 'zod'
export const metadataRowSchema = z.object({
  eventId: z.string().min(1).max(160),
  sessionId: z.string().min(1).max(160),
  seq: z.number().int().positive(),
  relativePath: z.string().min(1),
  offset: z.number().int().nonnegative(),
  length: z.number().int().positive(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
})
export type MetadataRow = z.infer<typeof metadataRowSchema>
export const taskSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('file'), path: z.string().min(1) }),
  z.object({ type: z.literal('close') }),
])
export const replySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('batch'),
    path: z.string(),
    sequence: z.number().int().positive(),
    rows: z.array(metadataRowSchema).min(1).max(128),
  }),
  z.object({
    type: z.literal('done'),
    path: z.string(),
    files: z.array(z.object({ path: z.string(), size: z.number().int().nonnegative() })).length(1),
    truncated: z
      .array(
        z.object({
          path: z.string(),
          relativePath: z.string(),
          offset: z.number().int().nonnegative(),
          originalSize: z.number().int().nonnegative(),
        }),
      )
      .max(1),
  }),
  z.object({ type: z.literal('error'), code: z.string().min(1).max(160), message: z.string().max(8000) }),
])
