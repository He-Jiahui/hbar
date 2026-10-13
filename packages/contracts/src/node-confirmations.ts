import { z } from 'zod'
import { nodeRootIdSchema } from './node-address'
import { nodeCallAuthoritySchema } from './node-authority'
import { nodeOperationIdSchema } from './node-operation'

const operationId = nodeOperationIdSchema

export const nodeLocalConfirmationIdSchema = z.string().regex(/^[a-f0-9]{32}$/)
export const nodeLocalConfirmationActionSchema = z.enum(['write', 'process', 'always'])
export const nodeLocalConfirmationStateSchema = z.enum([
  'waiting',
  'approved',
  'rejected',
  'cancelled',
  'expired',
  'consumed',
])
export const nodeLocalConfirmationIdentitySchema = z
  .strictObject({
    operationId,
    source: z.enum(['run', 'manual']),
    sessionId: z.string().min(1).max(160).nullable(),
    runId: z.string().min(1).max(160).nullable(),
    callId: z.string().min(1).max(160).nullable(),
    ownerDeviceId: z.string().min(1).max(160).nullable(),
    workspaceId: z.string().min(1).max(160).nullable().optional(),
    nodeId: z.string().min(1).max(160).optional(),
    managedWorktree: z
      .strictObject({
        worktreeId: z.string().regex(/^[a-f0-9]{32}$/),
        targetRevision: z.number().int().nonnegative().safe(),
      })
      .optional(),
    workspaceMountsDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    rootId: nodeRootIdSchema,
    rootPath: z.string().min(1).max(4_000),
    floorRevision: z.number().int().nonnegative().safe(),
    admissionDigest: z.string().regex(/^[a-f0-9]{64}$/),
    argumentsDigest: z.string().regex(/^[a-f0-9]{64}$/),
    tool: z.string().min(1).max(80),
    summary: z.string().max(4_000),
  })
  .refine(
    (identity) =>
      identity.source === 'run'
        ? identity.runId !== null &&
          identity.callId !== null &&
          identity.sessionId !== null &&
          identity.operationId === `${identity.runId}:${identity.callId}`
        : identity.runId === null && identity.callId === null && identity.ownerDeviceId !== null,
    { message: 'The confirmation source identifiers are incomplete or inconsistent' },
  )
export type NodeLocalConfirmationIdentity = z.output<typeof nodeLocalConfirmationIdentitySchema>
export const nodeLocalConfirmationSchema = z.strictObject({
  id: nodeLocalConfirmationIdSchema,
  identity: nodeLocalConfirmationIdentitySchema,
  state: nodeLocalConfirmationStateSchema,
  createdAt: z.number().int().nonnegative().safe(),
  expiresAt: z.number().int().nonnegative().safe(),
  resolvedAt: z.number().int().nonnegative().safe().nullable(),
  resolvedByDeviceId: z.string().min(1).max(160).nullable(),
})
export const nodeLocalConfirmationPageSchema = z.strictObject({
  entries: z.array(nodeLocalConfirmationSchema).max(64),
})
export const nodeLocalConfirmationResolveSchema = z.strictObject({
  confirmationId: nodeLocalConfirmationIdSchema,
  decision: z.enum(['approve', 'reject']),
})
export const nodeLocalConfirmationStatusRequestSchema = z.strictObject({
  identity: nodeLocalConfirmationIdentitySchema,
})
export const nodeLocalConfirmationStatusSchema = z.enum([
  'waiting',
  'approved',
  'rejected',
  'cancelled',
  'expired',
  'consumed',
  'absent',
])
export const nodeLocalConfirmationCancelRequestSchema = z.strictObject({
  identity: nodeLocalConfirmationIdentitySchema,
})
export const nodeLocalConfirmationCancelResultSchema = z.strictObject({
  state: z.enum(['cancelled', 'absent', 'closed']),
})
export const nodeLocalConfirmationRunLookupSchema = z.strictObject({
  operationId,
  rootId: nodeRootIdSchema,
  expectedRoot: z.string().min(1).max(4_000),
  authority: nodeCallAuthoritySchema,
  admissionDigest: z.string().regex(/^[a-f0-9]{64}$/),
  argumentsDigest: z.string().regex(/^[a-f0-9]{64}$/),
})
export type NodeLocalConfirmationRunLookup = z.infer<typeof nodeLocalConfirmationRunLookupSchema>
export type NodeManualLocalOperationConfirmation = {
  readonly operationId: string
  readonly sessionId: string | null
  readonly ownerDeviceId: string
  readonly rootId: string
  readonly rootPath: string
  readonly tool: string
  readonly effect: 'read' | 'write' | 'process'
  readonly snapshotDigest: string
  readonly argumentsDigest: string
  readonly summary: string
  readonly source?: 'manual'
}

const storedEntry = nodeLocalConfirmationSchema
export const nodeLocalConfirmationStorageMethods = {
  close: { input: z.strictObject({}), output: z.strictObject({ closed: z.literal(true) }) },
  list: {
    input: z.strictObject({ includeResolved: z.boolean() }),
    output: z.array(storedEntry).max(64),
  },
  get: {
    input: z.strictObject({ id: nodeLocalConfirmationIdSchema }),
    output: storedEntry.nullable(),
  },
  latest: {
    input: z.strictObject({ operationId }),
    output: storedEntry.nullable(),
  },
  create: {
    input: z.strictObject({ entry: storedEntry }),
    output: storedEntry,
  },
  resolve: {
    input: z.strictObject({
      id: nodeLocalConfirmationIdSchema,
      state: z.enum(['approved', 'rejected', 'cancelled', 'expired', 'consumed']),
      now: z.number().int().nonnegative().safe(),
      deviceId: z.string().min(1).max(160).nullable(),
    }),
    output: storedEntry.nullable(),
  },
} as const
export type NodeLocalConfirmationStorageMethod = keyof typeof nodeLocalConfirmationStorageMethods
export type NodeLocalConfirmationStorageInput<Method extends NodeLocalConfirmationStorageMethod> = z.input<
  (typeof nodeLocalConfirmationStorageMethods)[Method]['input']
>
export type NodeLocalConfirmationStorageOutput<Method extends NodeLocalConfirmationStorageMethod> = z.output<
  (typeof nodeLocalConfirmationStorageMethods)[Method]['output']
>

export interface NodeLocalConfirmationPort {
  list(input: { readonly includeResolved: boolean }): Promise<readonly unknown[]>
  get(input: { readonly id: string }): Promise<unknown | null>
  latest(input: { readonly operationId: string }): Promise<unknown | null>
  create(input: { readonly entry: z.input<typeof nodeLocalConfirmationSchema> }): Promise<unknown>
  resolve(input: {
    readonly id: string
    readonly state: 'approved' | 'rejected' | 'cancelled' | 'expired' | 'consumed'
    readonly now: number
    readonly deviceId: string | null
  }): Promise<unknown | null>
}
