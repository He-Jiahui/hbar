import { z } from 'zod'
import { nodeLinkStatusSchema } from './node-link-state'
import {
  nodeCapabilitiesSchema,
  nodeFloorSchema,
  nodeAuditEntrySchema,
  nodeReceiptSchema,
  nodeFingerprintSchema,
} from './node'

const empty = z.strictObject({})
const done = z.strictObject({ accepted: z.literal(true) })
/** B-local operator methods. Never registered on the A-B connection. */
export const nodeConsoleMethods = {
  'node.status': {
    input: empty,
    output: z.strictObject({
      capabilities: nodeCapabilitiesSchema,
      fingerprint: nodeFingerprintSchema,
      paused: z.boolean(),
      running: z.array(z.string().max(330)).max(64),
      linked: z.boolean(),
      connection: nodeLinkStatusSchema,
    }),
  },
  'node.policy.get': { input: empty, output: nodeFloorSchema },
  'node.policy.set': { input: nodeFloorSchema, output: nodeFloorSchema },
  'node.pause': { input: z.strictObject({ paused: z.boolean() }), output: done },
  'node.kill': {
    input: z
      .strictObject({ operationId: z.string().min(1).max(330).optional(), all: z.boolean().default(false) })
      .refine((value) => value.all || !!value.operationId),
    output: z.array(nodeReceiptSchema).max(64),
  },
  'node.audit': {
    input: z.strictObject({
      after: z.number().int().nonnegative().default(0),
      limit: z.number().int().min(1).max(500).default(100),
    }),
    output: z.array(nodeAuditEntrySchema).max(500),
  },
  'node.unlink': { input: empty, output: done },
} as const
export type NodeConsoleMethod = keyof typeof nodeConsoleMethods
const names: [NodeConsoleMethod, ...NodeConsoleMethod[]] = [
  'node.status',
  'node.policy.get',
  'node.policy.set',
  'node.pause',
  'node.kill',
  'node.audit',
  'node.unlink',
]
export const nodeConsoleRequestSchema = z.strictObject({ method: z.enum(names), input: z.json() })
export const nodeConsoleConnectionSchema = z.strictObject({
  url: z.string().url(),
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  pid: z.number().int().positive(),
})
