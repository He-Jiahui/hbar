import { z } from 'zod'
import { nodeRootIdSchema, nodeRelativePathSchema } from './node-address'
import {
  nodeFloorSchema,
  nodeReceiptSchema,
  nodeCallAuthoritySchema,
  nodeAuditEntrySchema,
  nodeManualGitAuditEntrySchema,
  nodeRunAuditEntrySchema,
  nodeLaunchTargetAuditEntrySchema,
  nodeExecResultSchema,
  NODE_LIMITS,
  nodePublicKeySchema,
} from './node'
import { nodeOperationIdSchema } from './node-operation'
import { nodeWorktreeProvisioningAuthoritySchema } from './node-worktree-provisioning'
import { nodeLocalConfirmationStorageMethods } from './node-confirmations'

const empty = z.strictObject({})
const operationId = nodeOperationIdSchema
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const timestamp = z.number().int().nonnegative().safe()
const nodeConsoleDeviceRoleSchema = z.enum(['operator', 'observer'])
const nodeConsoleRootScopeSchema = z
  .array(nodeRootIdSchema)
  .max(64)
  .refine((roots) => new Set(roots).size === roots.length)
export const nodeConsoleDeviceSchema = z.strictObject({
  deviceId: z.string().min(1).max(160),
  name: z.string().min(1).max(160),
  publicKey: nodePublicKeySchema,
  role: nodeConsoleDeviceRoleSchema,
  roots: nodeConsoleRootScopeSchema,
  createdAt: timestamp,
  lastSeenAt: timestamp.nullable(),
  revokedAt: timestamp.nullable(),
})
export const nodeConsoleInviteSchema = z.strictObject({
  inviteId: z.string().min(1).max(160),
  codeDigest: z.string().regex(/^[a-f0-9]{64}$/),
  role: nodeConsoleDeviceRoleSchema,
  roots: nodeConsoleRootScopeSchema,
  createdAt: timestamp,
  expiresAt: timestamp,
  consumedAt: timestamp.nullable(),
  deviceId: z.string().min(1).max(160).nullable(),
})
const nodeStoredOperationFieldsSchema = z.strictObject({
  operationId,
  argumentsDigest: digest,
  kind: z.enum(['exec', 'write', 'restore', 'git', 'worktree']),
  target: z
    .strictObject({
      rootId: nodeRootIdSchema,
      path: nodeRelativePathSchema,
      nodePath: z.string().min(1).max(4_000).optional(),
    })
    .nullable()
    .default(null),
  authority: z.union([nodeCallAuthoritySchema, nodeWorktreeProvisioningAuthoritySchema]),
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
function validateStoredOperationAuthority(
  operation: { readonly kind: 'exec' | 'write' | 'restore' | 'git' | 'worktree'; readonly authority: unknown },
  context: z.RefinementCtx,
) {
  const provisioning = nodeWorktreeProvisioningAuthoritySchema.safeParse(operation.authority).success
  if (
    (operation.kind === 'worktree' && !provisioning) ||
    (provisioning && !['git', 'worktree'].includes(operation.kind))
  )
    context.addIssue({
      code: 'custom',
      path: ['authority'],
      message: 'Launch-target authority is reserved for Git worktree receipts',
    })
}
export const nodeStoredOperationSchema = nodeStoredOperationFieldsSchema.superRefine(validateStoredOperationAuthority)
const nodeStoredOperationAcceptSchema = nodeStoredOperationFieldsSchema
  .omit({ receipt: true, versions: true })
  .superRefine(validateStoredOperationAuthority)
export const nodeStateMethods = {
  ready: { input: empty, output: z.strictObject({ version: z.literal(4) }) },
  'floor.get': { input: empty, output: nodeFloorSchema.nullable() },
  'floor.set': { input: nodeFloorSchema, output: nodeFloorSchema },
  'floor.snapshot': {
    input: empty,
    output: z.strictObject({ floor: nodeFloorSchema.nullable(), revision: z.number().int().nonnegative().safe() }),
  },
  'floor.update': {
    input: z.strictObject({ floor: nodeFloorSchema, expectedRevision: z.number().int().nonnegative().safe() }),
    output: z.strictObject({ floor: nodeFloorSchema, revision: z.number().int().nonnegative().safe() }),
  },
  'config.get': { input: z.strictObject({ key: z.enum(['identity', 'link', 'paused']) }), output: z.json().nullable() },
  'config.set': {
    input: z.strictObject({ key: z.enum(['identity', 'link', 'paused']), value: z.json().nullable() }),
    output: z.strictObject({ saved: z.literal(true) }),
  },
  'operation.accept': {
    input: nodeStoredOperationAcceptSchema,
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
  'audit.append': {
    input: z.union([
      nodeRunAuditEntrySchema.omit({ seq: true, time: true }),
      nodeManualGitAuditEntrySchema.omit({ seq: true, time: true }),
      nodeLaunchTargetAuditEntrySchema.omit({ seq: true, time: true }),
    ]),
    output: nodeAuditEntrySchema,
  },
  'git-query.audit.append': {
    input: nodeManualGitAuditEntrySchema.omit({ seq: true, time: true }),
    output: nodeManualGitAuditEntrySchema,
  },
  'audit.list': {
    input: z.strictObject({ after: timestamp.default(0), limit: z.number().int().min(1).max(500).default(100) }),
    output: z.array(nodeAuditEntrySchema).max(500),
  },
  'console.devices.list': { input: empty, output: z.array(nodeConsoleDeviceSchema).max(256) },
  'console.device.get': {
    input: z.strictObject({ deviceId: z.string().min(1).max(160) }),
    output: nodeConsoleDeviceSchema.nullable(),
  },
  'console.device.revoke': {
    input: z.strictObject({ deviceId: z.string().min(1).max(160), revokedAt: timestamp }),
    output: nodeConsoleDeviceSchema.nullable(),
  },
  'console.device.touch': {
    input: z.strictObject({ deviceId: z.string().min(1).max(160), lastSeenAt: timestamp }),
    output: nodeConsoleDeviceSchema.nullable(),
  },
  'console.pairing.create': {
    input: z.strictObject({
      inviteId: z.string().min(1).max(160),
      codeDigest: nodeConsoleInviteSchema.shape.codeDigest,
      role: nodeConsoleDeviceRoleSchema,
      roots: nodeConsoleRootScopeSchema,
      createdAt: timestamp,
    }),
    output: nodeConsoleInviteSchema,
  },
  'console.pairing.consume': {
    input: z.strictObject({
      codeDigest: nodeConsoleInviteSchema.shape.codeDigest,
      deviceId: z.string().min(1).max(160),
      publicKey: nodePublicKeySchema,
      name: z.string().min(1).max(160),
      now: timestamp,
    }),
    output: nodeConsoleDeviceSchema,
  },
  'console.pairing.attempt': {
    input: z.strictObject({ sourceKey: z.string().min(1).max(128), now: timestamp }),
    output: z.strictObject({ allowed: z.boolean() }),
  },
  'local-confirmation.list': nodeLocalConfirmationStorageMethods.list,
  'local-confirmation.get': nodeLocalConfirmationStorageMethods.get,
  'local-confirmation.latest': nodeLocalConfirmationStorageMethods.latest,
  'local-confirmation.create': nodeLocalConfirmationStorageMethods.create,
  'local-confirmation.resolve': nodeLocalConfirmationStorageMethods.resolve,
  close: { input: empty, output: z.strictObject({ closed: z.literal(true) }) },
} as const
export type NodeStateMethod = keyof typeof nodeStateMethods
export type NodeStateInput<Method extends NodeStateMethod> = z.input<(typeof nodeStateMethods)[Method]['input']>
export type NodeStateOutput<Method extends NodeStateMethod> = z.output<(typeof nodeStateMethods)[Method]['output']>
export interface NodeStatePort {
  call<Method extends NodeStateMethod>(method: Method, input: NodeStateInput<Method>): Promise<NodeStateOutput<Method>>
  close(): Promise<void>
}
