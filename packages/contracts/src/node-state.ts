import { z } from 'zod'
import {
  nodeFloorSchema,
  nodeReceiptSchema,
  nodeCallAuthoritySchema,
  nodeAuditEntrySchema,
  nodeExecResultSchema,
  NODE_LIMITS,
} from './node'

const empty = z.strictObject({})
const operationId = z
  .string()
  .min(1)
  .max(330)
  .regex(/^[A-Za-z0-9:_-]+$/)
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const timestamp = z.number().int().nonnegative().safe()
export const nodeStoredOperationSchema = z.strictObject({
  operationId,
  argumentsDigest: digest,
  kind: z.enum(['exec', 'write', 'restore']),
  authority: nodeCallAuthoritySchema,
  receipt: nodeReceiptSchema,
  versions: z
    .strictObject({
      before: z.string().max(NODE_LIMITS.fileBytes),
      after: z.string().max(NODE_LIMITS.fileBytes),
      path: z.string().max(4_000),
      revision: digest,
      created: z.boolean(),
    })
    .nullable(),
})
export const nodeStateMethods = {
  ready: { input: empty, output: z.strictObject({ version: z.literal(1) }) },
  'floor.get': { input: empty, output: nodeFloorSchema.nullable() },
  'floor.set': { input: nodeFloorSchema, output: nodeFloorSchema },
  'config.get': { input: z.strictObject({ key: z.enum(['identity', 'link', 'paused']) }), output: z.json().nullable() },
  'config.set': {
    input: z.strictObject({ key: z.enum(['identity', 'link', 'paused']), value: z.json().nullable() }),
    output: z.strictObject({ saved: z.literal(true) }),
  },
  'operation.accept': {
    input: nodeStoredOperationSchema.omit({ receipt: true, versions: true }),
    output: z.strictObject({ accepted: z.boolean(), operation: nodeStoredOperationSchema }),
  },
  'operation.get': { input: z.strictObject({ operationId }), output: nodeStoredOperationSchema.nullable() },
  'operation.start': { input: z.strictObject({ operationId }), output: nodeStoredOperationSchema },
  'operation.settle': {
    input: z.strictObject({
      operationId,
      result: nodeExecResultSchema,
      versions: nodeStoredOperationSchema.shape.versions.optional(),
    }),
    output: nodeStoredOperationSchema,
  },
  'operation.lost': {
    input: z.strictObject({ operationId, reason: z.enum(['restart', 'link-lost', 'unknown']) }),
    output: nodeStoredOperationSchema,
  },
  'operation.list': { input: empty, output: z.array(nodeStoredOperationSchema).max(64) },
  'audit.append': { input: nodeAuditEntrySchema.omit({ seq: true, time: true }), output: nodeAuditEntrySchema },
  'audit.list': {
    input: z.strictObject({ after: timestamp.default(0), limit: z.number().int().min(1).max(500).default(100) }),
    output: z.array(nodeAuditEntrySchema).max(500),
  },
  close: { input: empty, output: z.strictObject({ closed: z.literal(true) }) },
} as const
export type NodeStateMethod = keyof typeof nodeStateMethods
export type NodeStateInput<Method extends NodeStateMethod> = z.input<(typeof nodeStateMethods)[Method]['input']>
export type NodeStateOutput<Method extends NodeStateMethod> = z.output<(typeof nodeStateMethods)[Method]['output']>
export interface NodeStatePort {
  call<Method extends NodeStateMethod>(method: Method, input: NodeStateInput<Method>): Promise<NodeStateOutput<Method>>
  close(): Promise<void>
}
