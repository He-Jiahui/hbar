import { z } from 'zod'
import { nodeFingerprintSchema, nodePublicKeySchema } from './node'
import { nodeIdSchema } from './node-address'

/** B-private pinned conversation identity. No invitation or reusable network credential is persisted. */
export const nodeSavedLinkSchema = z.strictObject({
  url: z.string().url().max(4_000),
  fingerprint: nodeFingerprintSchema,
  publicKey: nodePublicKeySchema,
  nodeId: nodeIdSchema,
  name: z.string().min(1).max(160),
})
export type NodeSavedLink = z.infer<typeof nodeSavedLinkSchema>
export const nodeLinkStatusSchema = z.strictObject({
  phase: z.enum(['unlinked', 'connecting', 'online', 'retrying', 'blocked']),
  reasonCode: z.string().max(128).nullable(),
  nextAttemptAt: z.number().int().nonnegative().nullable(),
})
export type NodeLinkStatus = z.infer<typeof nodeLinkStatusSchema>
