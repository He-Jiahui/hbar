import { z } from 'zod'
import { registeredNodeSchema } from './node-registry'

export const nodeListInputSchema = z.strictObject({
  after: registeredNodeSchema.shape.nodeId.optional(),
  limit: z.number().int().min(1).max(100).default(20),
})
export const nodeListedSchema = registeredNodeSchema.extend({ online: z.boolean() })
export const nodeListPageSchema = z.strictObject({
  items: z.array(nodeListedSchema).max(100),
  nextCursor: registeredNodeSchema.shape.nodeId.nullable(),
})
export type NodeListInput = z.input<typeof nodeListInputSchema>
export type NodeListPage = z.infer<typeof nodeListPageSchema>
