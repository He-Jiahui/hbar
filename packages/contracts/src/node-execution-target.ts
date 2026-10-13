import { z } from 'zod'
import { nodeIdSchema, nodeRootIdSchema } from './node-address'
import { nodeBackendSchema } from './node-backend'

const executionFloorSummarySchema = z.strictObject({
  process: z.boolean(),
  network: z.boolean(),
  terminal: z.boolean(),
  osConfinement: z.enum(['required', 'preferred', 'off']),
  backend: z.enum(['auto', 'bwrap', 'container', 'seatbelt', 'windows-restricted', 'windows-elevated']).optional(),
})

/** A target is captured by A at admission and describes observed B capability, never an execution claim. */
export const nodeExecutionTargetSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('local') }),
  z.strictObject({
    kind: z.literal('node'),
    nodeId: nodeIdSchema,
    nodeName: z.string().trim().min(1).max(160),
    rootId: nodeRootIdSchema,
    nodePath: z.string().min(1).max(4_000),
    rootAccess: z.enum(['read', 'write']),
    capabilitySummary: z.strictObject({
      backends: z.array(nodeBackendSchema).max(8),
      /** The active B backend used by its enforcement capabilities; absent only in older saved observations. */
      selectedBackend: nodeBackendSchema.optional(),
      filesystem: z.enum(['enforced', 'none']),
      network: z.enum(['enforced', 'env-only', 'none']),
      floor: executionFloorSummarySchema,
      observedAt: z.number().int().nonnegative(),
    }),
  }),
])

export type NodeExecutionTarget = z.infer<typeof nodeExecutionTargetSchema>
export type RemoteNodeExecutionTarget = Extract<NodeExecutionTarget, { kind: 'node' }>
