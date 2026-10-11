import { z } from 'zod'

const count = z.number().int().nonnegative()
/** Measurements supplied by an executing tool, validated by the Host before durable settlement. */
export const toolActivitySchema = z.strictObject({
  files: z
    .array(
      z.strictObject({
        path: z.string().min(1).max(4_000),
        operation: z.enum(['read', 'write', 'edit']),
        linesRead: count.nullable(),
        patches: count.nullable(),
        addedLines: count.nullable(),
        removedLines: count.nullable(),
      }),
    )
    .max(16)
    .optional(),
  skill: z
    .strictObject({
      id: z.string().min(1).max(4_000),
      name: z.string().min(1).max(160),
      resource: z.string().min(1).max(4_000),
      revision: z.string().min(1).max(512),
      instruction: z.boolean(),
      /** True only once all instruction pages of this revision have actually been read. */
      completed: z.boolean(),
      offset: count,
      characters: count,
      totalCharacters: count.optional(),
    })
    .optional(),
})
export type ToolActivity = z.infer<typeof toolActivitySchema>
