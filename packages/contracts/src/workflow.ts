import { z } from 'zod'
import { planStateSchema } from './plan'

export const WORKFLOW_SCHEMA_VERSION = 2
export const MAX_WORKFLOW_ITEMS = 100
export const MAX_WORKFLOW_ACCEPTANCE_CHECKS = 32
export const MAX_WORKFLOW_SCOPE_ENTRIES = 128
export const MAX_WORKFLOW_EVIDENCE = 1_000
export const MAX_WORKFLOW_DELEGATIONS = 128
export const MAX_AGENT_PATCH_FILES = 512
export const MAX_WORKFLOW_TARGET_SESSIONS = 16
export const MAX_WORKFLOW_TARGETS_PER_ITEM = 8
export const MAX_WORKFLOW_TARGET_DISPATCHES = 256

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const idSchema = z.string().min(1).max(160)
const workflowTextSchema = z.string().trim().min(1).max(4_000)

function requireUniqueIds<T extends Record<K, string>, K extends string>(
  values: T[],
  key: K,
  context: z.RefinementCtx,
): void {
  const indexes = new Map<string, number>()
  values.forEach((value, index) => {
    const previous = indexes.get(value[key])
    if (previous === undefined) {
      indexes.set(value[key], index)
      return
    }
    context.addIssue({
      code: 'custom',
      message: `${key} must be unique; it duplicates index ${previous}`,
      path: [index, key],
    })
  })
}

export const workflowPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(4_000)
  .refine((value) => {
    const normalized = value.replaceAll('\\', '/')
    return (
      !normalized.startsWith('/') &&
      !/^[a-zA-Z]:\//.test(normalized) &&
      !normalized.split('/').includes('..') &&
      !normalized.includes('*')
    )
  }, 'Workflow paths must be workspace-relative directory prefixes without parent traversal or globs')
  .describe(
    'Workspace-relative file or directory prefix, e.g. "proof.txt" or "src". No absolute paths, parent traversal (..), or globs.',
  )

export const workflowToolNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z][a-zA-Z0-9_.-]*$/)

export const workflowScopeSchema = z.strictObject({
  readPaths: z.array(workflowPathSchema).max(MAX_WORKFLOW_SCOPE_ENTRIES).default([]),
  writePaths: z.array(workflowPathSchema).max(MAX_WORKFLOW_SCOPE_ENTRIES).default([]),
  tools: z.array(workflowToolNameSchema).max(MAX_WORKFLOW_SCOPE_ENTRIES).default([]),
})
export type WorkflowScope = z.output<typeof workflowScopeSchema>

const toolVerifierSchema = z.strictObject({
  kind: z.literal('tool'),
  toolName: workflowToolNameSchema,
  expectedArguments: z.record(z.string(), z.unknown()).optional(),
  result: z
    .discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('success') }),
      z.strictObject({ kind: z.literal('textContains'), value: z.string().min(1).max(4_000) }),
      z.strictObject({
        kind: z.literal('jsonPathEquals'),
        path: z.array(z.union([z.string().max(256), z.number().int().nonnegative()])).max(32),
        value: z.unknown(),
      }),
      z.strictObject({
        kind: z.literal('booleanTrue'),
        path: z
          .array(z.union([z.string().max(256), z.number().int().nonnegative()]))
          .max(32)
          .default([]),
      }),
    ])
    .default({ kind: 'success' }),
})
const workspaceVerifierSchema = z.strictObject({
  kind: z.literal('workspace'),
  path: workflowPathSchema,
  expectation: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('exists') }),
    z.strictObject({ kind: z.literal('sha256'), value: sha256Schema }),
    z.strictObject({ kind: z.literal('textContains'), value: z.string().min(1).max(4_000) }),
  ]),
})
const browserVerifierSchema = z.strictObject({
  kind: z.literal('browser'),
  assertion: workflowTextSchema,
})
const userVerifierSchema = z.strictObject({ kind: z.literal('user') })

export const workflowAcceptanceVerifierSchema = z.discriminatedUnion('kind', [
  toolVerifierSchema,
  workspaceVerifierSchema,
  browserVerifierSchema,
  userVerifierSchema,
])
export type WorkflowAcceptanceVerifier = z.output<typeof workflowAcceptanceVerifierSchema>

export const workflowAcceptanceDefinitionSchema = z.strictObject({
  id: idSchema,
  description: workflowTextSchema,
  required: z.boolean().default(true),
  verifier: workflowAcceptanceVerifierSchema,
})
export type WorkflowAcceptanceDefinition = z.output<typeof workflowAcceptanceDefinitionSchema>

export const workflowCompletionPolicySchema = z.enum(['agent', 'review_agent', 'user'])
export type WorkflowCompletionPolicy = z.output<typeof workflowCompletionPolicySchema>

export const workflowAcceptanceStatusSchema = z.enum(['pending', 'passed', 'failed', 'accepted', 'rejected'])
export type WorkflowAcceptanceStatus = z.output<typeof workflowAcceptanceStatusSchema>

export const workflowAcceptanceCheckSchema = workflowAcceptanceDefinitionSchema.extend({
  status: workflowAcceptanceStatusSchema,
  evidenceId: idSchema.nullable(),
  updatedAt: z.number().int().nonnegative(),
})
export type WorkflowAcceptanceCheck = z.output<typeof workflowAcceptanceCheckSchema>

export const workflowPlanItemSchema = z.strictObject({
  id: idSchema,
  title: workflowTextSchema,
  scope: workflowScopeSchema,
  acceptanceChecks: z
    .array(workflowAcceptanceDefinitionSchema)
    .max(MAX_WORKFLOW_ACCEPTANCE_CHECKS)
    .superRefine((checks, context) => requireUniqueIds(checks, 'id', context)),
  /** Existing sessions that may execute this item; omitted remains a local, single-session item. */
  targetSessionIds: z
    .array(idSchema)
    .max(MAX_WORKFLOW_TARGETS_PER_ITEM)
    .optional()
    .superRefine((targetSessionIds, context) => {
      if (targetSessionIds && new Set(targetSessionIds).size !== targetSessionIds.length)
        context.addIssue({ code: 'custom', message: 'Target session IDs must be unique', path: [] })
    }),
})
export type WorkflowPlanItemInput = z.input<typeof workflowPlanItemSchema>
export type WorkflowPlanItem = z.output<typeof workflowPlanItemSchema>

export const workflowPlanItemsSchema = z
  .array(workflowPlanItemSchema)
  .min(1)
  .max(MAX_WORKFLOW_ITEMS)
  .superRefine((items, context) => requireUniqueIds(items, 'id', context))

export const workflowPlanSchema = z
  .strictObject({
    schemaVersion: z.literal(WORKFLOW_SCHEMA_VERSION),
    planId: idSchema,
    sessionId: idSchema,
    revision: z.number().int().positive(),
    phase: z.enum(['draft', 'active', 'archived']),
    objective: workflowTextSchema,
    items: workflowPlanItemsSchema,
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .superRefine((plan, context) => {
    const targetSessions = new Set(plan.items.flatMap((item) => item.targetSessionIds ?? []))
    if (targetSessions.size > MAX_WORKFLOW_TARGET_SESSIONS)
      context.addIssue({
        code: 'custom',
        message: `Workflow plans support at most ${MAX_WORKFLOW_TARGET_SESSIONS} target sessions`,
        path: ['items'],
      })
  })
export type WorkflowPlan = z.output<typeof workflowPlanSchema>

export const workflowTargetDispatchStatusSchema = z.enum([
  'prepared',
  'dispatching',
  'result_unknown',
  'queued',
  'running',
  'waiting_approval',
  'cancel_requested',
  'succeeded',
  'failed',
  'cancelled',
  'stale',
])
export type WorkflowTargetDispatchStatus = z.output<typeof workflowTargetDispatchStatusSchema>

export const workflowTargetDispatchSchema = z.strictObject({
  dispatchId: idSchema,
  workflowId: idSchema,
  planId: idSchema,
  planRevision: z.number().int().positive(),
  workflowRevision: z.number().int().positive(),
  itemId: idSchema,
  targetSessionId: idSchema,
  workspaceId: idSchema,
  messageText: z.string().trim().min(1).max(20_000),
  actorId: idSchema,
  idempotencyKey: z.string().min(1).max(128),
  peerIdempotencyKey: z.string().min(1).max(128),
  commandHash: sha256Schema,
  requestHash: sha256Schema,
  modelId: idSchema,
  scope: workflowScopeSchema,
  status: workflowTargetDispatchStatusSchema,
  delivery: z.enum(['new_run', 'queued']).nullable(),
  operationId: idSchema.nullable(),
  targetRunId: idSchema.nullable(),
  targetRunStartSeq: z.number().int().nonnegative().nullable(),
  terminalRunStatus: z.enum(['completed', 'failed', 'cancelled', 'interrupted']).nullable(),
  resultSummary: z.string().max(2_000).nullable(),
  resultHash: sha256Schema.nullable(),
  errorCode: z.string().max(128).nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  completedAt: z.number().int().nonnegative().nullable(),
})
export type WorkflowTargetDispatch = z.output<typeof workflowTargetDispatchSchema>

export const workflowTargetDispatchPublicSchema = workflowTargetDispatchSchema.omit({
  actorId: true,
  messageText: true,
  idempotencyKey: true,
  peerIdempotencyKey: true,
  commandHash: true,
  requestHash: true,
  modelId: true,
  targetRunStartSeq: true,
})
export type WorkflowTargetDispatchPublic = z.output<typeof workflowTargetDispatchPublicSchema>

export const workflowWorkItemStatusSchema = z.enum([
  'pending',
  'in_progress',
  'delegated',
  'verifying',
  'completed',
  'blocked',
])
export type WorkflowWorkItemStatus = z.output<typeof workflowWorkItemStatusSchema>

const workflowOwnerSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('main') }),
  z.strictObject({ kind: z.literal('agent'), agentId: idSchema }),
])

export const workflowWorkItemSchema = z.strictObject({
  id: idSchema,
  title: workflowTextSchema,
  status: workflowWorkItemStatusSchema,
  scope: workflowScopeSchema,
  owner: workflowOwnerSchema,
  acceptanceChecks: z
    .array(workflowAcceptanceCheckSchema)
    .max(MAX_WORKFLOW_ACCEPTANCE_CHECKS)
    .superRefine((checks, context) => requireUniqueIds(checks, 'id', context)),
  startedAt: z.number().int().nonnegative().nullable(),
  completedAt: z.number().int().nonnegative().nullable(),
})
export type WorkflowWorkItem = z.output<typeof workflowWorkItemSchema>

const workflowEvidenceBaseSchema = z.strictObject({
  evidenceId: idSchema,
  itemId: idSchema,
  checkId: idSchema,
  planRevision: z.number().int().positive(),
  workspaceRevision: z.string().min(1).max(256).nullable(),
  createdAt: z.number().int().nonnegative(),
})

export const workflowEvidenceSchema = z.discriminatedUnion('source', [
  workflowEvidenceBaseSchema.extend({
    source: z.literal('tool'),
    outcome: z.enum(['passed', 'failed']),
    runId: idSchema,
    callId: idSchema,
    toolName: workflowToolNameSchema,
    argumentsHash: sha256Schema,
    resultHash: sha256Schema,
  }),
  workflowEvidenceBaseSchema.extend({
    source: z.literal('user'),
    outcome: z.enum(['accepted', 'rejected']),
    actorId: idSchema,
    note: z.string().max(4_000).nullable(),
  }),
  workflowEvidenceBaseSchema.extend({
    source: z.literal('agent'),
    outcome: z.enum(['passed', 'failed']),
    agentId: idSchema,
    resultHash: sha256Schema,
  }),
  workflowEvidenceBaseSchema.extend({
    source: z.literal('reviewer'),
    outcome: z.enum(['approved', 'rejected']),
    reviewId: idSchema,
    agentId: idSchema,
    summary: workflowTextSchema,
    resultHash: sha256Schema,
  }),
])
export type WorkflowEvidence = z.output<typeof workflowEvidenceSchema>

export const workflowScopeExpansionSchema = z.strictObject({
  expansionId: idSchema,
  itemId: idSchema,
  scope: workflowScopeSchema,
  reason: workflowTextSchema,
  createdAt: z.number().int().nonnegative(),
})
export type WorkflowScopeExpansion = z.output<typeof workflowScopeExpansionSchema>

export const agentPatchFileSchema = z.strictObject({
  path: workflowPathSchema,
  operation: z.enum(['add', 'update', 'delete']),
  beforeSha256: sha256Schema.nullable(),
  afterSha256: sha256Schema.nullable(),
})
export type AgentPatchFile = z.output<typeof agentPatchFileSchema>

export const agentPatchSchema = z.strictObject({
  patchId: idSchema,
  agentId: idSchema,
  parentSessionId: idSchema,
  itemId: idSchema,
  planRevision: z.number().int().positive(),
  status: z.enum(['ready', 'applied', 'conflict', 'rejected']),
  artifactId: idSchema,
  artifactSha256: sha256Schema,
  files: z.array(agentPatchFileSchema).min(1).max(MAX_AGENT_PATCH_FILES),
  summary: z.string().max(4_000),
  createdAt: z.number().int().nonnegative(),
  appliedAt: z.number().int().nonnegative().nullable(),
})
export type AgentPatch = z.output<typeof agentPatchSchema>

export const workflowDelegationSchema = z.strictObject({
  delegationId: idSchema,
  itemId: idSchema,
  agentId: idSchema.nullable(),
  modelId: idSchema,
  tokenBudget: z.number().int().positive().max(1_000_000_000).nullable(),
  status: z.enum(['queued', 'running', 'patch_ready', 'applied', 'conflict', 'cancelled', 'failed']),
  patchId: idSchema.nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})
export type WorkflowDelegation = z.output<typeof workflowDelegationSchema>

export const workflowStatusSchema = z.enum([
  'draft',
  'active',
  'verifying',
  'waiting',
  'waiting_review',
  'waiting_user',
  'blocked',
  'needs_revision',
  'completed',
  'cancelled',
])
export type WorkflowStatus = z.output<typeof workflowStatusSchema>

export const workflowRejectionSchema = z.strictObject({
  fingerprint: sha256Schema,
  toolName: workflowToolNameSchema,
  path: workflowPathSchema.nullable(),
  reason: workflowTextSchema,
  count: z.number().int().positive(),
  updatedAt: z.number().int().nonnegative(),
})
export type WorkflowRejection = z.output<typeof workflowRejectionSchema>

export const workflowTransitionIntentSchema = z.strictObject({
  operationId: idSchema,
  planRevision: z.number().int().positive(),
  stepIndex: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_WORKFLOW_ITEMS - 1),
  stepTextHash: sha256Schema,
  itemId: idSchema,
  summary: workflowTextSchema,
  createdAt: z.number().int().nonnegative(),
})
export type WorkflowTransitionIntent = z.output<typeof workflowTransitionIntentSchema>

export const workflowReviewSchema = z.strictObject({
  reviewId: idSchema,
  planRevision: z.number().int().positive(),
  stepTextHash: sha256Schema,
  workspaceFingerprint: sha256Schema,
  resumeModelId: idSchema,
  reviewerAgentId: idSchema.nullable(),
  status: z.enum(['queued', 'running', 'approved', 'rejected', 'cancelled', 'stale']),
  summary: z.string().max(4_000).nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})
export type WorkflowReview = z.output<typeof workflowReviewSchema>

export const workflowStartCommandSchema = z.strictObject({
  actorId: idSchema,
  idempotencyKey: z.string().min(1).max(128),
  requestId: idSchema,
  inputHash: sha256Schema,
})
export type WorkflowStartCommand = z.output<typeof workflowStartCommandSchema>

export const workflowStateSchema = z.strictObject({
  schemaVersion: z.literal(WORKFLOW_SCHEMA_VERSION),
  executionModel: z.enum(['legacy', 'focus_v2']).default('legacy'),
  workflowId: idSchema,
  sessionId: idSchema,
  goalId: idSchema.nullable(),
  planId: idSchema,
  planRevision: z.number().int().positive(),
  activeStepIndex: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_WORKFLOW_ITEMS - 1)
    .nullable()
    .default(null),
  activeStepTextHash: sha256Schema.nullable().default(null),
  revision: z.number().int().positive(),
  status: workflowStatusSchema,
  /** Stable ownership generation; unlike revision, tool bookkeeping does not advance it. */
  focusRevision: z.number().int().positive().optional(),
  /** Persisted before workspace mutation, cleared only after settlement or crash recovery. */
  pendingMutations: z
    .array(z.strictObject({ callId: idSchema, runId: idSchema, toolName: idSchema }))
    .max(128)
    .optional(),
  activeItemId: idSchema.nullable(),
  explorationCount: z.number().int().nonnegative(),
  workItems: z
    .array(workflowWorkItemSchema)
    .min(1)
    .max(MAX_WORKFLOW_ITEMS)
    .superRefine((items, context) => requireUniqueIds(items, 'id', context)),
  scopeExpansions: z
    .array(workflowScopeExpansionSchema)
    .max(MAX_WORKFLOW_SCOPE_ENTRIES)
    .superRefine((entries, context) => requireUniqueIds(entries, 'expansionId', context)),
  delegations: z
    .array(workflowDelegationSchema)
    .max(MAX_WORKFLOW_DELEGATIONS)
    .superRefine((entries, context) => requireUniqueIds(entries, 'delegationId', context)),
  targetDispatches: z
    .array(workflowTargetDispatchSchema)
    .max(MAX_WORKFLOW_TARGET_DISPATCHES)
    .superRefine((entries, context) => requireUniqueIds(entries, 'dispatchId', context))
    .default([]),
  evidence: z
    .array(workflowEvidenceSchema)
    .max(MAX_WORKFLOW_EVIDENCE)
    .superRefine((entries, context) => requireUniqueIds(entries, 'evidenceId', context)),
  completionPolicy: workflowCompletionPolicySchema.default('agent'),
  rejection: workflowRejectionSchema.nullable().default(null),
  transitionIntent: workflowTransitionIntentSchema.nullable().default(null),
  review: workflowReviewSchema.nullable().default(null),
  startCommand: workflowStartCommandSchema.nullable().default(null),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})
export type WorkflowState = z.output<typeof workflowStateSchema>

export const workflowFocusSchema = z.strictObject({
  focusId: idSchema,
  planRevision: z.number().int().positive(),
  stepIndex: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_WORKFLOW_ITEMS - 1),
  stepTextHash: sha256Schema,
  title: workflowTextSchema,
  status: workflowWorkItemStatusSchema,
  scope: workflowScopeSchema,
  acceptanceChecks: z.array(workflowAcceptanceCheckSchema).max(MAX_WORKFLOW_ACCEPTANCE_CHECKS),
  completionPolicy: workflowCompletionPolicySchema,
  startedAt: z.number().int().nonnegative().nullable(),
  completedAt: z.number().int().nonnegative().nullable(),
})
export type WorkflowFocus = z.output<typeof workflowFocusSchema>

export const workflowPublicStatusSchema = z.enum([
  'active',
  'verifying',
  'waiting_review',
  'waiting_user',
  'needs_revision',
  'completed',
  'cancelled',
])
export type WorkflowPublicStatus = z.output<typeof workflowPublicStatusSchema>

export const workflowPublicStateSchema = workflowStateSchema
  .omit({
    status: true,
    activeItemId: true,
    activeStepIndex: true,
    activeStepTextHash: true,
    workItems: true,
    startCommand: true,
    planId: true,
    completionPolicy: true,
    targetDispatches: true,
  })
  .extend({ status: workflowPublicStatusSchema, focus: workflowFocusSchema.nullable() })
export type WorkflowPublicState = z.output<typeof workflowPublicStateSchema>

export const workflowSnapshotSchema = z.strictObject({
  /** Canonical stable Workflow Plan definition. `plan` below is the legacy Agent Plan projection. */
  workflowPlan: workflowPlanSchema.nullable().default(null),
  plan: planStateSchema.nullable(),
  workflow: workflowPublicStateSchema.nullable(),
  targetDispatches: z.array(workflowTargetDispatchPublicSchema).max(MAX_WORKFLOW_TARGET_DISPATCHES).default([]),
})
export type WorkflowSnapshot = z.output<typeof workflowSnapshotSchema>
