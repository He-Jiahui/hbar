import { z } from 'zod'

export const WORKFLOW_SCHEMA_VERSION = 1
export const MAX_WORKFLOW_ITEMS = 100
export const MAX_WORKFLOW_ACCEPTANCE_CHECKS = 32
export const MAX_WORKFLOW_SCOPE_ENTRIES = 128
export const MAX_WORKFLOW_EVIDENCE = 1_000
export const MAX_WORKFLOW_DELEGATIONS = 128
export const MAX_AGENT_PATCH_FILES = 512

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const idSchema = z.string().min(1).max(160)
const workflowTextSchema = z.string().trim().min(1).max(4_000)

export const workflowPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(4_000)
  .refine((value) => {
    const normalized = value.replaceAll('\\', '/')
    return !normalized.startsWith('/') && !/^[a-zA-Z]:\//.test(normalized) && !normalized.split('/').includes('..')
  }, 'Workflow paths must be workspace-relative and cannot traverse parent directories')

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
  acceptanceChecks: z.array(workflowAcceptanceDefinitionSchema).max(MAX_WORKFLOW_ACCEPTANCE_CHECKS),
})
export type WorkflowPlanItemInput = z.input<typeof workflowPlanItemSchema>
export type WorkflowPlanItem = z.output<typeof workflowPlanItemSchema>

export const workflowPlanSchema = z.strictObject({
  schemaVersion: z.literal(WORKFLOW_SCHEMA_VERSION),
  planId: idSchema,
  sessionId: idSchema,
  revision: z.number().int().positive(),
  phase: z.enum(['draft', 'active', 'archived']),
  objective: workflowTextSchema,
  items: z.array(workflowPlanItemSchema).min(1).max(MAX_WORKFLOW_ITEMS),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})
export type WorkflowPlan = z.output<typeof workflowPlanSchema>

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
  acceptanceChecks: z.array(workflowAcceptanceCheckSchema).max(MAX_WORKFLOW_ACCEPTANCE_CHECKS),
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

export const workflowStatusSchema = z.enum(['draft', 'active', 'waiting', 'blocked', 'completed'])
export type WorkflowStatus = z.output<typeof workflowStatusSchema>

export const workflowStartCommandSchema = z.strictObject({
  actorId: idSchema,
  idempotencyKey: z.string().min(1).max(128),
  requestId: idSchema,
  inputHash: sha256Schema,
})
export type WorkflowStartCommand = z.output<typeof workflowStartCommandSchema>

export const workflowStateSchema = z.strictObject({
  schemaVersion: z.literal(WORKFLOW_SCHEMA_VERSION),
  workflowId: idSchema,
  sessionId: idSchema,
  goalId: idSchema.nullable(),
  planId: idSchema,
  planRevision: z.number().int().positive(),
  revision: z.number().int().positive(),
  status: workflowStatusSchema,
  activeItemId: idSchema.nullable(),
  explorationCount: z.number().int().nonnegative(),
  workItems: z.array(workflowWorkItemSchema).min(1).max(MAX_WORKFLOW_ITEMS),
  scopeExpansions: z.array(workflowScopeExpansionSchema).max(MAX_WORKFLOW_SCOPE_ENTRIES),
  delegations: z.array(workflowDelegationSchema).max(MAX_WORKFLOW_DELEGATIONS),
  evidence: z.array(workflowEvidenceSchema).max(MAX_WORKFLOW_EVIDENCE),
  startCommand: workflowStartCommandSchema.nullable().default(null),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})
export type WorkflowState = z.output<typeof workflowStateSchema>

export const workflowSnapshotSchema = z.strictObject({
  plan: workflowPlanSchema.nullable(),
  workflow: workflowStateSchema.nullable(),
})
export type WorkflowSnapshot = z.output<typeof workflowSnapshotSchema>
