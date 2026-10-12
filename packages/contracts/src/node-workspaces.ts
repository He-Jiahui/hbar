import { z } from 'zod'
import { nodeIdSchema, nodeRootIdSchema } from './node-address'

/** nodePath is derived from the node's verified root capabilities, never supplied as an arbitrary A-side path. */
export const nodeWorkspaceCreateSchema = z.strictObject({
  nodeId: nodeIdSchema,
  rootId: nodeRootIdSchema,
  name: z.string().trim().min(1).max(160).optional(),
})
export type NodeWorkspaceCreate = z.infer<typeof nodeWorkspaceCreateSchema>
export const nodeSessionListSchema = z.strictObject({
  nodeId: nodeIdSchema,
  after: z.string().min(1).max(160).optional(),
  limit: z.number().int().min(1).max(100).default(50),
})
export type NodeSessionList = z.input<typeof nodeSessionListSchema>
