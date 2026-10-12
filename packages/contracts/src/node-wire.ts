import { z } from 'zod'
import { nodeConnectSchema, nodeChallengeResponseSchema, nodeAuthenticateSchema, nodeJoinedSchema } from './node'

const id = z.string().min(1).max(160)
const method = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z][a-zA-Z0-9_.-]*$/)
export const nodeRpcFrameSchema = z.union([
  z.strictObject({ jsonrpc: z.literal('2.0'), id, method, params: z.json() }),
  z.strictObject({ jsonrpc: z.literal('2.0'), id, result: z.json() }),
  z.strictObject({
    jsonrpc: z.literal('2.0'),
    id,
    error: z.strictObject({
      code: z.number().int(),
      message: z.string().max(1_600),
      data: z.strictObject({ code: z.string().max(128) }),
    }),
  }),
  z.strictObject({ jsonrpc: z.literal('2.0'), method, params: z.json() }),
])
export const nodeHandshakeFrameSchema = z.discriminatedUnion('type', [
  nodeConnectSchema.extend({ type: z.literal('hello') }),
  nodeChallengeResponseSchema.extend({ type: z.literal('challenge') }),
  nodeAuthenticateSchema.extend({ type: z.literal('authenticate') }),
  nodeJoinedSchema.extend({ type: z.literal('joined') }),
  z.strictObject({ type: z.literal('error'), code: z.string().max(128), message: z.string().max(1_600) }),
])
export type NodeRpcFrame = z.infer<typeof nodeRpcFrameSchema>
export type NodeHandshakeFrame = z.infer<typeof nodeHandshakeFrameSchema>
export const NODE_CLOSE_CODES = Object.freeze({
  authentication: 4001,
  protocol: 4002,
  heartbeat: 4003,
  evaluator: 4004,
  revoked: 4005,
  replaced: 4006,
})
