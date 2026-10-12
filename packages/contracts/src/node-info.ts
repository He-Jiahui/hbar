import { z } from 'zod'
import { nodeIdSchema } from './node-address'
import { NODE_PROTOCOL_VERSION, nodeFingerprintSchema } from './node'

/** Public discovery identifies B without exposing shared paths, devices, or credentials. */
export const nodeInfoSchema = z.strictObject({
  role: z.literal('workspace'),
  protocol: z.literal(NODE_PROTOCOL_VERSION),
  nodeId: nodeIdSchema,
  fingerprint: nodeFingerprintSchema,
  rpcPath: z.literal('/rpc'),
  consolePath: z.literal('/node-console'),
})

export type NodeInfo = z.output<typeof nodeInfoSchema>
