import { z } from 'zod'
import { nodeRootIdSchema } from './node-address'
import { nodeCallAuthoritySchema } from './node-authority'
import { nodeOperationIdSchema } from './node-operation'
import { sessionLaunchSelectionSchema } from './session-launch-selection'

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
const confirmationIdentityFields = {
  operationId,
  rootId: nodeRootIdSchema,
  rootPath: z.string().min(1).max(4_000),
  floorRevision: z.number().int().nonnegative().safe(),
  argumentsDigest: z.string().regex(/^[a-f0-9]{64}$/),
  tool: z.string().min(1).max(80),
  summary: z.string().max(4_000),
}
const runConfirmationIdentitySchema = z
  .strictObject({
    ...confirmationIdentityFields,
    source: z.literal('run'),
    sessionId: z.string().min(1).max(160),
    runId: z.string().min(1).max(160),
    callId: z.string().min(1).max(160),
    ownerDeviceId: z.null(),
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
    admissionDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .refine((identity) => identity.operationId === `${identity.runId}:${identity.callId}`, {
    message: 'Run confirmation operation id must match its Run and call',
  })
const manualConfirmationIdentitySchema = z
  .strictObject({
    ...confirmationIdentityFields,
    source: z.enum(['manual', 'manual-query']),
    sessionId: z.string().min(1).max(160).nullable(),
    runId: z.null(),
    callId: z.null(),
    ownerDeviceId: z.string().min(1).max(160),
    workspaceId: z.string().min(1).max(160).nullable().optional(),
    nodeId: z.string().min(1).max(160).optional(),
    admissionDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .refine(
    (identity) =>
      identity.source !== 'manual-query' ||
      (identity.sessionId !== undefined && identity.workspaceId !== undefined && identity.nodeId !== undefined),
    { message: 'Manual Git query confirmation requires workspace, session and node identity' },
  )

export const nodeLaunchTargetConfirmationIdentitySchema = z
  .strictObject({
    ...confirmationIdentityFields,
    source: z.literal('launch-target'),
    sessionId: z.string().min(1).max(160),
    runId: z.string().min(1).max(160),
    callId: z.null(),
    ownerDeviceId: z.null(),
    workspaceId: z.string().min(1).max(160),
    nodeId: z.string().min(1).max(160),
    targetRevision: z.number().int().nonnegative().safe(),
    selection: sessionLaunchSelectionSchema,
    acceptedTargetDigest: z.string().regex(/^[a-f0-9]{64}$/),
    workspaceFolderRevision: z.number().int().nonnegative().safe(),
    workspaceFolderDigest: z.string().regex(/^[a-f0-9]{64}$/),
    worktreeId: z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .optional(),
    tool: z.enum(['worktree.create', 'worktree.get', 'worktree.remove']),
  })
  .superRefine((identity, context) => {
    const operationSuffix = {
      'worktree.create': 'worktree-create',
      'worktree.get': 'worktree-get',
      'worktree.remove': 'worktree-remove',
    }[identity.tool]
    if (identity.operationId !== `${identity.runId}:${operationSuffix}`)
      context.addIssue({
        code: 'custom',
        path: ['operationId'],
        message: 'Launch-target operation id must match its Run and operation',
      })
    if (identity.tool === 'worktree.remove' && !identity.worktreeId)
      context.addIssue({
        code: 'custom',
        path: ['worktreeId'],
        message: 'Worktree removal confirmation requires its exact worktree ID',
      })
  })
export type NodeLaunchTargetConfirmationIdentity = z.output<typeof nodeLaunchTargetConfirmationIdentitySchema>
export const nodeLocalConfirmationIdentitySchema = z.union([
  runConfirmationIdentitySchema,
  manualConfirmationIdentitySchema,
  nodeLaunchTargetConfirmationIdentitySchema,
])
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
export const nodeLocalConfirmationLaunchTargetLookupSchema = z.strictObject({
  kind: z.literal('launch-target'),
  identity: nodeLaunchTargetConfirmationIdentitySchema,
})
export const nodeLocalConfirmationManualQueryLookupSchema = z.strictObject({
  kind: z.literal('manual-query'),
  operationId,
  deviceId: z.string().min(1).max(160),
  workspaceId: z.string().min(1).max(160),
  sessionId: z.string().min(1).max(160).nullable(),
  nodeId: z.string().min(1).max(160),
  rootId: nodeRootIdSchema,
  expectedRoot: z.string().min(1).max(4_000),
  method: z.enum([
    'git.query.info',
    'git.query.status',
    'git.query.diff',
    'git.query.log',
    'git.query.branchList',
    'git.query.stats',
    'git.query.diffToRemote',
    'git.query.launchBranchSnapshot',
  ]),
  argumentsDigest: z.string().regex(/^[a-f0-9]{64}$/),
})
export const nodeLocalConfirmationLookupSchema = z.union([
  nodeLocalConfirmationRunLookupSchema,
  nodeLocalConfirmationManualQueryLookupSchema,
  nodeLocalConfirmationLaunchTargetLookupSchema,
])
export type NodeLocalConfirmationLookup = z.infer<typeof nodeLocalConfirmationLookupSchema>
export type NodeManualGitQueryConfirmation = z.infer<typeof nodeLocalConfirmationManualQueryLookupSchema>
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
  readonly source?: 'manual' | 'manual-query'
  readonly workspaceId?: string
  readonly nodeId?: string
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
