import { z } from 'zod'
import { nodeIdSchema } from './node-address'
import { nodePublicKeySchema, nodeCapabilitiesSchema, nodeFingerprintSchema } from './node'

/** Private owner state only. Never included in either network method table. */
export const nodeIdentitySchema = z.strictObject({
  publicKey: nodePublicKeySchema,
  privateKey: z
    .string()
    .min(60)
    .max(256)
    .regex(/^[A-Za-z0-9_-]+$/),
})
export const registeredNodeSchema = z.strictObject({
  nodeId: nodeIdSchema,
  publicKey: nodePublicKeySchema,
  name: z.string().trim().min(1).max(160),
  createdAt: z.number().int().nonnegative(),
  lastSeenAt: z.number().int().nonnegative().nullable(),
  revokedAt: z.number().int().nonnegative().nullable(),
  capabilities: nodeCapabilitiesSchema.nullable(),
})
export const nodeInviteSchema = z.strictObject({
  code: z.string().regex(/^\d{8}$/),
  name: registeredNodeSchema.shape.name,
  expiresAt: z.number().int().nonnegative(),
  fingerprint: nodeFingerprintSchema,
})
const empty = z.strictObject({})
const node = z.strictObject({ nodeId: nodeIdSchema })
export const nodeRegistryStateMethods = {
  'identity.ensure': { input: nodeIdentitySchema, output: nodeIdentitySchema },
  'node.list': { input: empty, output: z.array(registeredNodeSchema).max(1_000) },
  'node.get': { input: node, output: registeredNodeSchema.nullable() },
  'node.register': {
    input: registeredNodeSchema.omit({ lastSeenAt: true, revokedAt: true, capabilities: true }),
    output: registeredNodeSchema,
  },
  'node.touch': {
    input: node.extend({ time: z.number().int().nonnegative(), capabilities: nodeCapabilitiesSchema }),
    output: registeredNodeSchema,
  },
  'node.revoke': {
    input: node.extend({ time: z.number().int().nonnegative() }),
    output: registeredNodeSchema,
  },
} as const
export type RegisteredNode = z.infer<typeof registeredNodeSchema>
export type NodeRegistryMethod = keyof typeof nodeRegistryStateMethods
export type NodeRegistryInput<Method extends NodeRegistryMethod> = z.input<
  (typeof nodeRegistryStateMethods)[Method]['input']
>
export type NodeRegistryOutput<Method extends NodeRegistryMethod> = z.output<
  (typeof nodeRegistryStateMethods)[Method]['output']
>
export interface NodeRegistryStatePort {
  call<Method extends NodeRegistryMethod>(
    method: Method,
    input: NodeRegistryInput<Method>,
  ): Promise<NodeRegistryOutput<Method>>
}
