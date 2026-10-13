import { z } from 'zod'
export { HbarError } from './errors'
import { runRecoverySchema, runtimeWatchInputSchema } from './runtime'
import { toolActivitySchema } from './tool-activity'
import { toolFileChangesSchema, runFileChangesSummarySchema } from './run-file-changes'
import { modelContextTiersSchema, maximumContextWindow } from './model-context-tiers'
import type { ModelContextTier } from './model-context-tiers'
export { modelContextTierSchema, modelContextTiersSchema, maximumContextWindow } from './model-context-tiers'
export type { ModelContextTier } from './model-context-tiers'
export {
  diagnosticEventSchema,
  DIAGNOSTIC_SCHEMA_VERSION,
  diagnosticEvent,
  type DiagnosticEvent,
  type DiagnosticSink,
} from './diagnostics.ts'
export {
  diagnosticCorrelationSchema,
  type DiagnosticCorrelation,
  type DiagnosticScopePort,
  type ReadonlyDiagnosticCorrelation,
} from './diagnostic-context.ts'
export { collectArtifactReferenceIds, collectArtifactReferences } from './artifact-references'
import { settingScopeSchema } from './settings.ts'
import type {
  SettingDescriptor,
  SettingScope,
  SettingsCatalog,
  SettingsContribution,
  SettingsSnapshot,
} from './settings.ts'

export * from './settings.ts'
export * from './theme.ts'
export * from './tool-windows.ts'
import type { ToolWindowContribution } from './tool-windows.ts'
import type { ThemeContribution } from './theme.ts'
import { sandboxSnapshotRefSchema } from './sandbox'
import { toolOutcomeSchema } from './tool-outcome'
import { toolExecutionSchema, toolBatchProgressSchema } from './tool-execution'
export * from './tool-execution'
export { toolOutcomeSchema, type ToolOutcome } from './tool-outcome'
import { toolCallPresentationSchema } from './tool-presentation'
export {
  toolPresentationFieldSchema,
  toolPresentationDeclarationSchema,
  toolCallPresentationSchema,
  type ToolPresentationDeclaration,
  type ToolCallPresentation,
} from './tool-presentation'

export { LEGACY_WRITE_RPC_METHODS, type LegacyWriteRpcMethod } from './legacy-rpc'
import { invocationSchema } from '@hbar/commands/protocol'
import {
  workspaceListInputSchema,
  workspaceGetInputSchema,
  sessionListInputSchema,
  sessionGetInputSchema,
} from './state/directory'
import type { Workspace, WorkspacePage, SessionPage } from './state/directory'
import { MAX_PLAN_STEPS, planStepSchema } from './plan'
import type { PlanState } from './plan'
export * from './state/directory'
export * from './node-address'
export { deviceSchema, deviceAccessSchema, deviceRoleSchema, type Device, type DeviceRole, type DeviceAccess } from './device'
export {
  assertLocalExecutionAllowed,
  createLocalExecutionPolicy,
  LOCAL_EXECUTION_DISABLED,
  LOCAL_EXECUTION_ENABLED,
  type LocalExecutionPolicy,
} from './local-execution-policy'
import type { Device, DeviceAccess } from './device'
export * from './plan'
export type { GoalHistorySnapshot, GoalHistoryFact, GoalHistoryInput, GoalHistoryPage } from './commands/goal-history'

export const PROTOCOL_VERSION = 1
export const APP_VERSION = '0.1.0'
export const PAIRING_CODE_LENGTH = 8
export const DEVICE_NAME_MAX_LENGTH = 100
export const MAX_GOAL_OBJECTIVE_LENGTH = 4_000
export const idSchema = z.string().min(1).max(160)
export const artifactSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  name: z.string().max(240),
  mime: z.string().max(120),
  size: z.number().int().nonnegative(),
})
export type ArtifactRef = z.infer<typeof artifactSchema>
export const MAX_TOOL_RESULT_IMAGES = 12
export const contentBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('thinking'), text: z.string() }),
  z.object({ type: z.literal('image'), artifact: artifactSchema }),
  z.object({ type: z.literal('file'), artifact: artifactSchema }),
  z.object({
    type: z.literal('tool_call'),
    callId: idSchema,
    name: z.string(),
    args: z.record(z.string(), z.unknown()),
    presentation: toolCallPresentationSchema.optional(),
  }),
  z
    .object({
      type: z.literal('tool_result'),
      callId: idSchema,
      name: z.string(),
      text: z.string(),
      isError: z.boolean(),
      details: z.unknown().optional(),
      activity: toolActivitySchema.optional(),
      fileChanges: toolFileChangesSchema.optional(),
      outcome: toolOutcomeSchema.optional(),
      execution: toolExecutionSchema.optional(),
      batch: toolBatchProgressSchema.optional(),
      /** Validated, durable image outputs; inline provider bytes never belong in the transcript. */
      images: z.array(artifactSchema).max(MAX_TOOL_RESULT_IMAGES).optional(),
    })
    .refine(
      (result) =>
        !result.outcome ||
        (result.outcome.kind === 'succeeded' || result.outcome.reason === 'goal_replaced') === !result.isError,
      { message: 'Tool outcome must agree with the result error flag' },
    ),
])
export type ContentBlock = z.infer<typeof contentBlockSchema>
export const thinkingLevelSchema = z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
export type ThinkingLevel = z.infer<typeof thinkingLevelSchema>
export const DEFAULT_THINKING_LEVELS: readonly ThinkingLevel[] = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]
export const approvalModeSchema = z.enum(['deny', 'allow', 'ask', 'sandbox'])
export type ApprovalMode = z.infer<typeof approvalModeSchema>
export const permissionModeSchema = approvalModeSchema
export type PermissionMode = ApprovalMode
export const runModeSchema = z.enum(['default', 'plan'])
export type RunMode = z.infer<typeof runModeSchema>
export const runSourceSchema = z.enum(['user', 'goal', 'system'])
export type RunSource = z.infer<typeof runSourceSchema>
export const goalStatusSchema = z.enum(['active', 'paused', 'blocked', 'usage_limited', 'budget_limited', 'complete'])
export type GoalStatus = z.infer<typeof goalStatusSchema>
/** Explicit user controls, excluding Host-derived allowance and blocker states. */
export const goalControlStatusSchema = z.enum(['active', 'paused', 'complete'])
export const executionBudgetSchema = z.object({
  goalRemainingTokens: z.number().int().nonnegative().nullable(),
  sessionRemainingTokens: z.number().int().nonnegative().nullable(),
  effectiveRemainingTokens: z.number().int().nonnegative().nullable(),
  limitingSource: z.enum(['goal', 'session', 'both']).nullable(),
})
export type ExecutionBudget = z.infer<typeof executionBudgetSchema>
export const goalContinuationSchema = z.object({
  intentId: idSchema,
  phase: z.enum(['pending', 'queued', 'running', 'waiting', 'stopped']),
  reason: z.enum([
    'goal_active',
    'model_unavailable',
    'workflow_wait',
    'plan_mode',
    'budget_exhausted',
    'paused',
    'complete',
    'blocked',
    'usage_limited',
    'no_tool_calls',
    'no_progress',
    'continuation_limit',
    'disabled',
    'interrupted',
    'result_unknown',
    'stale_goal',
    'user_turn',
    'run_failed',
    'repair',
    'repair_exhausted',
    'retry_wait',
    'retry_exhausted',
  ]),
  trigger: z.string().min(1).max(200),
  retryAt: z.number().int().nonnegative().optional(),
  updatedAt: z.number().int().nonnegative(),
})
export type GoalContinuation = z.infer<typeof goalContinuationSchema>
export const threadGoalSchema = z.object({
  threadId: idSchema,
  /** Internal identity used to reject stale external mutations. */
  goalId: idSchema.optional(),
  objective: z.string().min(1).max(MAX_GOAL_OBJECTIVE_LENGTH),
  status: goalStatusSchema,
  tokenBudget: z.number().int().positive().nullable(),
  tokensUsed: z.number().int().nonnegative(),
  timeUsedSeconds: z.number().int().nonnegative(),
  /** Runtime sample; extrapolate only while a bound Run is executing. Never persisted as accounting. */
  timing: z
    .object({
      observedAt: z.number().int().nonnegative(),
      elapsedMilliseconds: z.number().int().nonnegative(),
      running: z.boolean(),
    })
    .optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  executionBudget: executionBudgetSchema.optional(),
  continuation: goalContinuationSchema.optional(),
  blockerAudit: z
    .object({
      reason: z.string().min(1).max(2000),
      consecutiveTurns: z.number().int().nonnegative(),
      requiredTurns: z.literal(3),
    })
    .optional(),
})
export type ThreadGoal = z.infer<typeof threadGoalSchema>
const userInputIdSchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/)
export const userInputOptionSchema = z.object({
  label: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500),
  recommended: z.boolean().optional(),
})
export type UserInputOption = z.infer<typeof userInputOptionSchema>
export const userInputQuestionSchema = z.object({
  id: userInputIdSchema,
  header: z.string().trim().min(1).max(12),
  question: z.string().trim().min(1).max(4_000),
  // The wire protocol also supports free-text-only questions. The model
  // control-tool schema below is stricter and requires suggested choices.
  options: z.array(userInputOptionSchema).max(3).optional(),
  isOther: z.boolean().default(false),
  isSecret: z.boolean().default(false),
})
export type UserInputQuestion = z.infer<typeof userInputQuestionSchema>
/** Shape accepted by the synchronous model control tool. */
export const userInputToolQuestionSchema = userInputQuestionSchema.extend({
  options: z.array(userInputOptionSchema).min(2).max(3),
})
export type UserInputToolQuestion = z.infer<typeof userInputToolQuestionSchema>
export const userInputRequestSchema = z.object({
  requestId: idSchema,
  sessionId: idSchema,
  runId: idSchema,
  callId: idSchema,
  turnId: idSchema.optional(),
  questions: z.array(userInputQuestionSchema).min(1).max(3),
  isBlocking: z.boolean().default(true),
  /** @deprecated `isBlocking` determines whether the client waits. */
  autoResolutionMs: z.number().int().nonnegative().max(86_400_000).optional(),
})
export type UserInputRequest = z.infer<typeof userInputRequestSchema>
export const userInputAnswerSchema = z.object({ answers: z.array(z.string().max(4_000)).max(10) })
export type UserInputAnswer = z.infer<typeof userInputAnswerSchema>
export const userInputResponseSchema = z.object({
  answers: z.record(userInputIdSchema, userInputAnswerSchema),
})
export type UserInputResponse = z.infer<typeof userInputResponseSchema>
/** Internal transport envelope; Codex responses themselves contain answers only. */
export const userInputResolutionSchema = userInputResponseSchema.extend({ requestId: idSchema })
export type UserInputResolution = z.infer<typeof userInputResolutionSchema>
export const budgetPhaseSchema = z.enum(['active', 'exhausted', 'completed', 'stopped'])
export type BudgetPhase = z.infer<typeof budgetPhaseSchema>
export const sessionBudgetSchema = z.object({
  sessionId: idSchema,
  budgetId: idSchema,
  limit: z.number().int().positive(),
  phase: budgetPhaseSchema,
  usedTokens: z.number().int().nonnegative(),
  remainingTokens: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})
export type SessionBudget = z.infer<typeof sessionBudgetSchema>

export const automationStateSchema = z.object({
  sessionId: idSchema,
  unattended: z.boolean(),
  // Default keeps automation.changed events written before Goal+Plan support
  // replayable while exposing a normalized boolean to current clients.
  goalEnabled: z.boolean().default(false),
})
export type AutomationState = z.infer<typeof automationStateSchema>

export const taskNotificationKindSchema = z.enum(['completed', 'user_input', 'retry_failed'])
export type TaskNotificationKind = z.infer<typeof taskNotificationKindSchema>
export const taskNotificationSchema = z.object({
  notificationId: idSchema,
  kind: taskNotificationKindSchema,
  sessionId: idSchema,
  runId: idSchema.nullable().optional(),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(2_000),
})
export type TaskNotification = z.infer<typeof taskNotificationSchema>

// Git metadata and operation results are intentionally bounded so a dirty
// repository cannot turn a notification or RPC response into an unbounded log.
export const gitStatusEntrySchema = z.object({
  index: z.string().length(1),
  worktree: z.string().length(1),
  path: z.string().min(1).max(4_000),
  originalPath: z.string().min(1).max(4_000).optional(),
})
export type GitStatusEntry = z.infer<typeof gitStatusEntrySchema>
export const gitStatusSchema = z.object({
  cwd: z.string().min(1).max(4_000),
  root: z.string().min(1).max(4_000).nullable(),
  branch: z.string().min(1).max(1_000).nullable(),
  head: z
    .string()
    .regex(/^[0-9a-f]{7,64}$/i)
    .nullable(),
  upstream: z.string().min(1).max(1_000).nullable(),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  dirty: z.boolean(),
  entries: z.array(gitStatusEntrySchema).max(5_000),
  originUrl: z.string().max(4_000).nullable(),
})
export type GitStatus = z.infer<typeof gitStatusSchema>
export const gitDiffSchema = z.object({
  cwd: z.string().min(1).max(4_000),
  diff: z.string().max(512_000),
  cached: z.boolean(),
  truncated: z.boolean(),
})
export type GitDiff = z.infer<typeof gitDiffSchema>
export const gitCommitSourceSchema = z.enum(['auto', 'manual', 'external'])
export type GitCommitSource = z.infer<typeof gitCommitSourceSchema>
export const gitCommitProvenanceSchema = z.object({
  source: gitCommitSourceSchema,
  recordedAt: z.number().int().nonnegative().nullable(),
  sessionId: z.string().min(1).max(128).nullable(),
  runId: z.string().min(1).max(128).nullable(),
  operationId: z.string().min(1).max(128).nullable(),
})
export type GitCommitProvenance = z.infer<typeof gitCommitProvenanceSchema>
export const gitCommitInfoSchema = z.object({
  sha: z.string().regex(/^[0-9a-f]{7,64}$/i),
  shortSha: z.string().regex(/^[0-9a-f]{7,64}$/i),
  author: z.string().max(1_000),
  authoredAt: z.string().max(100),
  committedAt: z.string().max(100).optional(),
  subject: z.string().max(4_000),
  provenance: gitCommitProvenanceSchema,
})
export type GitCommitInfo = z.infer<typeof gitCommitInfoSchema>
export const gitStatsCountSchema = z.object({
  commits: z.number().int().nonnegative(),
  autoCommits: z.number().int().nonnegative(),
  manualCommits: z.number().int().nonnegative(),
  externalCommits: z.number().int().nonnegative(),
  filesChanged: z.number().int().nonnegative(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  renames: z.number().int().nonnegative(),
  binaryFiles: z.number().int().nonnegative(),
})
export type GitStatsCount = z.infer<typeof gitStatsCountSchema>
export const gitStatsBucketSchema = gitStatsCountSchema.extend({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
})
export type GitStatsBucket = z.infer<typeof gitStatsBucketSchema>
export const gitStatsReportSchema = z.object({
  accountingVersion: z.literal('git-stats-v1'),
  repoId: z.string().min(1).max(4_000),
  head: z
    .string()
    .regex(/^[0-9a-f]{40}$/i)
    .nullable(),
  observedAt: z.number().int().nonnegative(),
  from: z.number().int().nonnegative(),
  to: z.number().int().positive(),
  bucketMs: z.number().int().positive(),
  sources: z.array(gitCommitSourceSchema).min(1).max(3),
  timeBasis: z.literal('committer'),
  timezone: z.literal('UTC'),
  historyPolicy: z.literal('first-parent'),
  renamePolicy: z.literal('separate'),
  binaryLineChanges: z.object({
    value: z.literal(0).nullable(),
    availability: z.enum(['available', 'unavailable']),
    reason: z.literal('BINARY_CONTENT').nullable(),
  }),
  totals: gitStatsCountSchema,
  points: z.array(gitStatsBucketSchema).max(1_000),
  scannedCommits: z.number().int().nonnegative(),
  indexMode: z.enum(['empty', 'full', 'incremental', 'hit', 'reindexed']),
  indexComplete: z.boolean(),
  gap: z.boolean(),
})
export type GitStatsReport = z.infer<typeof gitStatsReportSchema>
export const gitBranchInfoSchema = z.object({
  name: z.string().min(1).max(1_000),
  current: z.boolean(),
  remote: z.string().max(1_000).nullable(),
  upstream: z.string().max(1_000).nullable(),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
})
export type GitBranchInfo = z.infer<typeof gitBranchInfoSchema>
export const gitWorktreeInfoSchema = z.object({
  path: z.string().min(1).max(4_000),
  head: z
    .string()
    .regex(/^[0-9a-f]{7,64}$/i)
    .nullable(),
  branch: z.string().max(1_000).nullable(),
  bare: z.boolean(),
  locked: z.boolean(),
  prunable: z.boolean(),
})
export type GitWorktreeInfo = z.infer<typeof gitWorktreeInfoSchema>
export const gitInfoSchema = z.object({
  sha: z
    .string()
    .regex(/^[0-9a-f]{7,64}$/i)
    .nullable(),
  branch: z.string().max(1_000).nullable(),
  originUrl: z.string().max(4_000).nullable(),
})
export type GitInfo = z.infer<typeof gitInfoSchema>

export const accessRequirementSchema = z.enum(['allow', 'ask', 'deny'])
export type AccessRequirement = z.infer<typeof accessRequirementSchema>
export const browserUseAccessApprovalLifetimeSchema = z.enum(['turn', 'thread'])
export type BrowserUseAccessApprovalLifetime = z.infer<typeof browserUseAccessApprovalLifetimeSchema>
export const browserUseOriginPolicySchema = z.object({
  access: accessRequirementSchema.optional(),
  downloads: accessRequirementSchema.optional(),
  uploads: accessRequirementSchema.optional(),
  full_cdp_access: accessRequirementSchema.optional(),
  auto_review: accessRequirementSchema.optional(),
  persistent_approval: z.boolean().optional(),
  access_approval_lifetime: browserUseAccessApprovalLifetimeSchema.optional(),
})
export type BrowserUseOriginPolicy = z.infer<typeof browserUseOriginPolicySchema>
export const browserUseConfigSchema = z.object({
  allow_webmcp: z.boolean().default(false),
  allow_history_access: z.boolean().default(false),
  disable_auto_review: z.boolean().default(false),
  allow_global_persistent_approval: z.boolean().default(false),
  default_origin_policy: browserUseOriginPolicySchema.default({ access: 'ask' }),
  origins: z.record(z.string(), browserUseOriginPolicySchema).default({}),
})
export type BrowserUseConfig = z.infer<typeof browserUseConfigSchema>
export const browserPageSchema = z.object({
  contextId: idSchema,
  pageId: idSchema,
  url: z.string().max(4_000),
  title: z.string().max(1_000),
})
export type BrowserPage = z.infer<typeof browserPageSchema>
export const browserSnapshotSchema = z.object({
  page: browserPageSchema,
  text: z.string().max(256_000),
  truncated: z.boolean(),
})
export type BrowserSnapshot = z.infer<typeof browserSnapshotSchema>
export const browserScreenshotSchema = z.object({
  page: browserPageSchema,
  mime: z.string().max(120),
  data: z.string().max(2_000_000),
  truncated: z.boolean(),
})
export type BrowserScreenshot = z.infer<typeof browserScreenshotSchema>

export const computerUseMacosConfigSchema = z.object({
  bundle_ids: z.record(z.string(), accessRequirementSchema).default({}),
})
export type ComputerUseMacosConfig = z.infer<typeof computerUseMacosConfigSchema>
export const computerUseWindowsExeSchema = z.object({
  publisher_name: z.string().min(1).max(1_000),
  product_name: z.string().min(1).max(1_000),
  binary_name: z.string().min(1).max(1_000).optional(),
  access: accessRequirementSchema,
})
export type ComputerUseWindowsExe = z.infer<typeof computerUseWindowsExeSchema>
export const computerUseWindowsConfigSchema = z.object({
  aumids: z.record(z.string(), accessRequirementSchema).default({}),
  exes: z.array(computerUseWindowsExeSchema).max(100).default([]),
})
export type ComputerUseWindowsConfig = z.infer<typeof computerUseWindowsConfigSchema>
export const computerUseConfigSchema = z.object({
  allow_locked_computer_use: z.boolean().default(false),
  allow_persistent_approval: z.boolean().default(false),
  default_app_access: accessRequirementSchema.default('ask'),
  macos: computerUseMacosConfigSchema.default({ bundle_ids: {} }),
  windows: computerUseWindowsConfigSchema.default({ aumids: {}, exes: [] }),
})
export type ComputerUseConfig = z.infer<typeof computerUseConfigSchema>
export const computerScreenSchema = z.object({
  width: z.number().int().positive().max(10_000),
  height: z.number().int().positive().max(10_000),
  mime: z.string().max(120),
  data: z.string().max(2_000_000),
})
export type ComputerScreen = z.infer<typeof computerScreenSchema>
export const computerActionSchema = z.object({
  action: z.string().min(1).max(80),
  accepted: z.boolean(),
  screen: computerScreenSchema.optional(),
  message: z.string().max(4_000).optional(),
})
export type ComputerAction = z.infer<typeof computerActionSchema>
export const inputSchema = z.object({
  text: z.string().max(200_000),
  images: z.array(artifactSchema).max(12).default([]),
  // Kept optional for wire compatibility with runs persisted before file
  // attachments were introduced. Kernel normalization supplies an empty list.
  files: z.array(artifactSchema).max(12).optional(),
  thinking: thinkingLevelSchema.optional(),
  /** Captured at admission; missing legacy values mean standard context. */
  maxMode: z.boolean().optional(),
  approval: approvalModeSchema.optional(),
  /** Host-owned policy at admission; later changes must reach executors retained by an older generation. */
  permissionAtAdmission: approvalModeSchema.optional(),
  /** Host-created rules for `approval: 'sandbox'`; the Host strips it for other modes. */
  sandbox: sandboxSnapshotRefSchema.optional(),
  mode: runModeSchema.optional(),
  source: runSourceSchema.optional(),
  /** Host-authored delivery provenance; the public run.submit command strips this field. */
  peerMessage: z
    .strictObject({
      senderSessionId: idSchema,
      targetSessionId: idSchema,
      workspaceId: idSchema,
      idempotencyKey: z.string().min(1).max(128),
      queuedBehindActive: z.boolean(),
    })
    .optional(),
  continuation: z.object({ goalId: idSchema, intentId: idSchema }).optional(),
})
export type UserInput = z.infer<typeof inputSchema>
export const usageSchema = z.object({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  cacheRead: z.number().nonnegative(),
  cacheWrite: z.number().nonnegative(),
  cost: z.number().nonnegative(),
})
export type Usage = z.infer<typeof usageSchema>
export const emptyUsage = (): Usage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 })
export interface FileEntry {
  name: string
  path: string
  directory: boolean
}
export interface Session {
  id: string
  workspaceId: string
  title: string
  archived: boolean
  parentId: string | null
  createdAt: number
  updatedAt: number
  seq: number
}
export const sessionActivitySchema = z.enum([
  'idle',
  'queued',
  'thinking',
  'tool',
  'reading',
  'output',
  'goal',
  'plan',
  'waiting_approval',
  'completed',
  'failed',
  'cancelled',
])
export type SessionActivity = z.infer<typeof sessionActivitySchema>
export const sessionSummarySchema = z.object({
  sessionId: idSchema,
  workspaceId: idSchema,
  activity: sessionActivitySchema,
  activeRunId: idSchema.nullable(),
  lastResponseAt: z.number().int().nonnegative().nullable(),
  updatedAt: z.number().int().nonnegative(),
  seq: z.number().int().nonnegative(),
})
export type SessionSummary = z.infer<typeof sessionSummarySchema>
export const runStatusSchema = z.enum([
  'queued',
  'running',
  'waiting_approval',
  'guided',
  'completed',
  'cancelled',
  'failed',
  'interrupted',
])
export type RunStatus = z.infer<typeof runStatusSchema>
/** Stable code for the driver's bounded execution slice. */
export const RUN_STEP_LIMIT_CODE = 'RUN_STEP_LIMIT' as const
export const runFailureSchema = z.object({
  code: z.string().min(1).max(160),
  category: z.enum([
    'budget',
    'usage_limit',
    'cancelled',
    'timeout',
    'interrupted',
    'result_unknown',
    'transient',
    'execution',
  ]),
  retryable: z.boolean(),
  budgetSource: z.enum(['goal', 'session', 'both']).optional(),
})
export type RunFailure = z.infer<typeof runFailureSchema>
export const runSchema = z.object({
  id: idSchema,
  sessionId: idSchema,
  requestId: idSchema,
  input: inputSchema,
  modelId: idSchema,
  status: runStatusSchema,
  createdAt: z.number().int().nonnegative(),
  startedAt: z.number().int().nonnegative().nullable(),
  endedAt: z.number().int().nonnegative().nullable(),
  error: z.string().nullable(),
  failure: runFailureSchema.optional(),
  recovery: runRecoverySchema.optional(),
  fileChanges: runFileChangesSummarySchema.optional(),
})
export type Run = z.infer<typeof runSchema>
export interface Message {
  id: string
  sessionId: string
  runId: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: ContentBlock[]
  seq: number
  createdAt: number
  providerData?: unknown
}
export const sessionEventSchema = z.object({
  eventId: idSchema,
  sessionId: idSchema,
  seq: z.number().int().positive(),
  runId: idSchema.nullable(),
  stepId: idSchema.nullable(),
  type: z.string().min(1).max(160),
  data: z.unknown(),
  time: z.number().int().nonnegative(),
  version: z.literal(1),
})
export type SessionEvent = z.infer<typeof sessionEventSchema>
const sessionEventPageSequenceSchema = z.number().int().nonnegative()
const sessionEventPageTypeSchema = z.string().min(1).max(160)
export const sessionEventPageInputSchema = z
  .strictObject({
    sessionId: idSchema,
    afterSeq: sessionEventPageSequenceSchema,
    throughSeq: sessionEventPageSequenceSchema.optional(),
    types: z.array(sessionEventPageTypeSchema).min(1).max(32),
    runIds: z.array(idSchema).min(1).max(64).optional(),
    headerOnlyTypes: z.array(sessionEventPageTypeSchema).max(32).default([]),
    limit: z.number().int().min(1).max(1_000),
    maxReplyBytes: z
      .number()
      .int()
      .min(1_024)
      .max(8 * 1_024 * 1_024),
  })
  .superRefine((input, context) => {
    if (input.throughSeq !== undefined && input.throughSeq < input.afterSeq)
      context.addIssue({ code: 'custom', path: ['throughSeq'], message: 'Page horizon precedes its cursor' })
    if (new Set(input.types).size !== input.types.length)
      context.addIssue({ code: 'custom', path: ['types'], message: 'Event types must be unique' })
    if (new Set(input.headerOnlyTypes).size !== input.headerOnlyTypes.length)
      context.addIssue({ code: 'custom', path: ['headerOnlyTypes'], message: 'Header-only types must be unique' })
    if (input.headerOnlyTypes.some((type) => !input.types.includes(type)))
      context.addIssue({
        code: 'custom',
        path: ['headerOnlyTypes'],
        message: 'Header-only types must be selected types',
      })
    if (input.runIds && new Set(input.runIds).size !== input.runIds.length)
      context.addIssue({ code: 'custom', path: ['runIds'], message: 'Run ids must be unique' })
  })
export type SessionEventPageInput = z.input<typeof sessionEventPageInputSchema>
export type SessionEventPageRequest = z.output<typeof sessionEventPageInputSchema>
export const sessionEventHeaderSchema = sessionEventSchema.omit({ data: true })
export const sessionEventPageItemSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('event'), event: sessionEventSchema }),
  z.strictObject({ kind: z.literal('header'), event: sessionEventHeaderSchema }),
])
export type SessionEventPageItem = z.infer<typeof sessionEventPageItemSchema>
export const sessionEventPageSchema = z
  .strictObject({
    sessionId: idSchema,
    afterSeq: sessionEventPageSequenceSchema,
    /** Stable maximum event sequence captured by the first page. */
    throughSeq: sessionEventPageSequenceSchema,
    /** All event rows at or below throughSeq, before type/run filtering. */
    totalEventCount: sessionEventPageSequenceSchema,
    /** All event rows after this page cursor and at or below throughSeq. */
    remainingEventCount: sessionEventPageSequenceSchema,
    /** Selected type/run rows after this page cursor and at or below throughSeq. */
    matchingEventCount: sessionEventPageSequenceSchema,
    items: z.array(sessionEventPageItemSchema).max(1_000),
    nextAfterSeq: sessionEventPageSequenceSchema,
    hasMore: z.boolean(),
  })
  .superRefine((page, context) => {
    if (page.afterSeq > page.throughSeq || page.nextAfterSeq < page.afterSeq || page.nextAfterSeq > page.throughSeq)
      context.addIssue({ code: 'custom', message: 'Page cursor and horizon are inconsistent' })
    const seqs = new Set<number>()
    const eventIds = new Set<string>()
    let previousSeq = page.afterSeq
    for (const item of page.items) {
      const event = item.event
      if (
        event.sessionId !== page.sessionId ||
        event.seq <= previousSeq ||
        event.seq > page.throughSeq ||
        seqs.has(event.seq) ||
        eventIds.has(event.eventId)
      )
        context.addIssue({ code: 'custom', message: 'Page events must be unique, ordered, and session-bound' })
      seqs.add(event.seq)
      eventIds.add(event.eventId)
      previousSeq = event.seq
    }
    const lastSeq = page.items.at(-1)?.event.seq
    if (
      (page.items.length === 0 && page.hasMore) ||
      (page.hasMore && (lastSeq === undefined || page.nextAfterSeq !== lastSeq)) ||
      (!page.hasMore && page.nextAfterSeq !== page.throughSeq) ||
      page.totalEventCount < page.remainingEventCount ||
      page.matchingEventCount > page.remainingEventCount ||
      page.remainingEventCount < page.items.length ||
      page.matchingEventCount < page.items.length ||
      page.hasMore !== page.matchingEventCount > page.items.length
    )
      context.addIssue({ code: 'custom', message: 'Page continuation does not match its items' })
  })
export type SessionEventPage = z.infer<typeof sessionEventPageSchema>
export interface Approval {
  id: string
  sessionId: string
  runId: string
  callId: string
  tool: string
  args: Record<string, unknown>
  status: 'pending' | 'allowed' | 'denied' | 'cancelled'
  createdAt: number
  /** Present only after a Plan-exit decision; never part of the model-supplied tool input. */
  feedback?: string
  decidedBy?: string
  /** Captured remote execution target and capability observation shown for this approval. */
  executionTarget?: import('./node-execution-target').NodeExecutionTarget
}
export interface LiveStream {
  id: string
  sessionId: string
  runId: string
  text: string
  thinking: string
  offset: number
  version: number
}
export interface StreamDelta {
  id: string
  sessionId: string
  runId: string
  operation: 'append' | 'reset'
  text: string
  thinking: string
  textOffset: number
  thinkingOffset: number
  version: number
}
export interface SessionSnapshot {
  session: Session
  messages: Message[]
  runs: Run[]
  approvals: Approval[]
  userInputs: UserInputRequest[]
  usage: Usage
  cursor: number
  hasOlder: boolean
  streams: LiveStream[]
  /** Bounded latest execution facts for reconnect; completed timing also lives in tool results. */
  toolEvents?: SessionEvent[]
  toolObservedAt?: number
  /** Durable, paged compaction/window telemetry, independent of the loaded message page. */
  contextHistory?: import('./context-history').ContextHistoryPage
  /** Completed compaction facts scoped to the loaded message page, at most 1,000. */
  contextCompactions?: import('./context-history').ContextCompactionMarker[]
}
const providerModelInputSchema = z.object({
  id: z.string().min(1).max(160),
  name: z.string().min(1).max(160).optional(),
  description: z.string().trim().max(160).optional(),
  visible: z.boolean().optional(),
  contextWindow: z.number().int().min(1024).max(10_000_000).optional(),
  maxOutput: z.number().int().min(64).max(10_000_000).optional(),
  imageInput: z.boolean().optional(),
  /** Explicit opt-in for this model at the provider's OpenAI Images API route. */
  imageGeneration: z.boolean().optional(),
  reasoning: z.boolean().optional(),
  inputPrice: z.number().nonnegative().optional(),
  outputPrice: z.number().nonnegative().optional(),
  cacheReadPrice: z.number().nonnegative().optional(),
  cacheWritePrice: z.number().nonnegative().optional(),
  contextTiers: modelContextTiersSchema.optional(),
  maxModePricingMultiplier: z.number().finite().min(1).max(100).optional(),
  thinkingLevels: z.array(thinkingLevelSchema).min(1).max(7).optional(),
  supportedThinkingLevels: z.array(thinkingLevelSchema).min(1).max(7).optional(),
  defaultThinkingLevel: thinkingLevelSchema.optional(),
  defaultReasoningEffort: thinkingLevelSchema.optional(),
  supportedReasoningEfforts: z.array(thinkingLevelSchema).min(1).max(7).optional(),
})

export interface ProviderModelConfig {
  id: string
  name: string
  description?: string
  visible: boolean
  contextWindow: number
  maxOutput: number
  imageInput: boolean
  imageGeneration: boolean
  reasoning: boolean
  inputPrice: number
  outputPrice: number
  cacheReadPrice?: number
  cacheWritePrice?: number
  contextTiers?: ModelContextTier[]
  maxModePricingMultiplier?: number
  thinkingLevels: ThinkingLevel[]
  supportedThinkingLevels: ThinkingLevel[]
  defaultThinkingLevel: ThinkingLevel
  defaultReasoningEffort: ThinkingLevel
  supportedReasoningEfforts: ThinkingLevel[]
}

export interface ProviderConfig {
  id: string
  name: string
  visible: boolean
  protocol: 'openai-completions' | 'openai-responses' | 'anthropic-messages' | 'mock'
  baseUrl: string
  /** The model used when a legacy model-only selection names this provider. */
  model: string
  models: ProviderModelConfig[]
  contextWindow: number
  maxOutput: number
  imageInput: boolean
  imageGeneration: boolean
  reasoning: boolean
  inputPrice: number
  outputPrice: number
  cacheReadPrice?: number
  cacheWritePrice?: number
  contextTiers?: ModelContextTier[]
  maxModePricingMultiplier?: number
  /** Run-owned effective mode; provider configuration never accepts this field. */
  contextMode?: 'standard' | 'max'
  thinkingLevels: ThinkingLevel[]
  supportedThinkingLevels: ThinkingLevel[]
  defaultThinkingLevel: ThinkingLevel
  defaultReasoningEffort: ThinkingLevel
  supportedReasoningEfforts: ThinkingLevel[]
}

export const providerInputSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
    name: z.string().min(1).max(100),
    visible: z.boolean().optional(),
    protocol: z.enum(['openai-completions', 'openai-responses', 'anthropic-messages', 'mock']),
    baseUrl: z.string().url(),
    model: z.string().min(1).max(160).optional(),
    models: z.array(providerModelInputSchema).max(256).optional(),
    contextWindow: z.number().int().min(1024).max(10_000_000).optional(),
    maxOutput: z.number().int().min(64).max(10_000_000).optional(),
    imageInput: z.boolean().optional(),
    imageGeneration: z.boolean().optional(),
    reasoning: z.boolean().optional(),
    inputPrice: z.number().nonnegative().optional(),
    outputPrice: z.number().nonnegative().optional(),
    cacheReadPrice: z.number().nonnegative().optional(),
    cacheWritePrice: z.number().nonnegative().optional(),
    contextTiers: modelContextTiersSchema.optional(),
    maxModePricingMultiplier: z.number().finite().min(1).max(100).optional(),
    thinkingLevels: z.array(thinkingLevelSchema).min(1).max(7).optional(),
    supportedThinkingLevels: z.array(thinkingLevelSchema).min(1).max(7).optional(),
    defaultThinkingLevel: thinkingLevelSchema.optional(),
    defaultReasoningEffort: thinkingLevelSchema.optional(),
    supportedReasoningEfforts: z.array(thinkingLevelSchema).min(1).max(7).optional(),
  })
  .superRefine((value, context) => {
    for (const [index, model] of (value.models ?? [value]).entries()) {
      const standard = model.contextWindow ?? value.contextWindow ?? 128_000
      const tiers = model.contextTiers
      if (tiers?.length && tiers[0]!.contextWindow <= standard)
        context.addIssue({
          code: 'custom',
          path: value.models ? ['models', index, 'contextTiers'] : ['contextTiers'],
          message: 'Expanded context tiers must exceed the standard context window',
        })
    }
    if (!value.model && !value.models?.length)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['models'],
        message: 'A provider needs at least one model',
      })
    if (value.models) {
      const seen = new Set<string>()
      for (const [index, model] of value.models.entries()) {
        if (seen.has(model.id))
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['models', index, 'id'],
            message: 'Model ids must be unique within a provider',
          })
        seen.add(model.id)
      }
    }
  })

function uniqueThinkingLevels(levels: readonly ThinkingLevel[]): ThinkingLevel[] {
  return [...new Set(levels)]
}

function contextPricingFields(value: {
  cacheReadPrice?: number | undefined
  cacheWritePrice?: number | undefined
  contextTiers?: ModelContextTier[] | undefined
  maxModePricingMultiplier?: number | undefined
}) {
  return {
    ...(value.cacheReadPrice === undefined ? {} : { cacheReadPrice: value.cacheReadPrice }),
    ...(value.cacheWritePrice === undefined ? {} : { cacheWritePrice: value.cacheWritePrice }),
    ...(value.contextTiers === undefined ? {} : { contextTiers: value.contextTiers }),
    ...(value.maxModePricingMultiplier === undefined
      ? {}
      : { maxModePricingMultiplier: value.maxModePricingMultiplier }),
  }
}

function normalizeProviderModel(
  value: z.input<typeof providerModelInputSchema>,
  fallback: {
    contextWindow: number
    maxOutput: number
    imageInput: boolean
    imageGeneration: boolean
    reasoning: boolean
    inputPrice: number
    outputPrice: number
    thinkingLevels: readonly ThinkingLevel[]
    defaultThinkingLevel: ThinkingLevel
  },
): ProviderModelConfig {
  const declaredLevels = value.thinkingLevels ?? value.supportedThinkingLevels ?? value.supportedReasoningEfforts
  const levels = uniqueThinkingLevels(declaredLevels ?? fallback.thinkingLevels)
  const normalizedLevels: ThinkingLevel[] = levels.length > 0 ? levels : ['off']
  const requestedDefault = value.defaultThinkingLevel ?? value.defaultReasoningEffort ?? fallback.defaultThinkingLevel
  const defaultThinkingLevel = normalizedLevels.includes(requestedDefault) ? requestedDefault : normalizedLevels[0]!
  const reasoning =
    value.reasoning ?? (declaredLevels ? normalizedLevels.some((level) => level !== 'off') : fallback.reasoning)
  return {
    id: value.id,
    name: value.name ?? value.id,
    ...(value.description ? { description: value.description } : {}),
    visible: value.visible ?? true,
    contextWindow: value.contextWindow ?? fallback.contextWindow,
    maxOutput: value.maxOutput ?? fallback.maxOutput,
    imageInput: value.imageInput ?? fallback.imageInput,
    imageGeneration: value.imageGeneration ?? fallback.imageGeneration,
    reasoning,
    inputPrice: value.inputPrice ?? fallback.inputPrice,
    outputPrice: value.outputPrice ?? fallback.outputPrice,
    ...contextPricingFields(value),
    thinkingLevels: normalizedLevels,
    supportedThinkingLevels: normalizedLevels,
    defaultThinkingLevel,
    defaultReasoningEffort: defaultThinkingLevel,
    supportedReasoningEfforts: normalizedLevels,
  }
}

export const providerSchema = providerInputSchema.transform((value): ProviderConfig => {
  const providerThinkingLevels = uniqueThinkingLevels(
    value.thinkingLevels ??
      value.supportedThinkingLevels ??
      value.supportedReasoningEfforts ??
      (value.reasoning ? DEFAULT_THINKING_LEVELS : ['off']),
  )
  const fallback = {
    contextWindow: value.contextWindow ?? 128_000,
    maxOutput: value.maxOutput ?? 8192,
    imageInput: value.imageInput ?? false,
    imageGeneration: value.imageGeneration ?? false,
    reasoning: value.reasoning ?? providerThinkingLevels.some((level) => level !== 'off'),
    inputPrice: value.inputPrice ?? 0,
    outputPrice: value.outputPrice ?? 0,
    thinkingLevels: providerThinkingLevels,
    defaultThinkingLevel:
      value.defaultThinkingLevel ??
      value.defaultReasoningEffort ??
      (providerThinkingLevels.includes('medium') ? 'medium' : (providerThinkingLevels[0] ?? 'off')),
  }
  const rawModels = value.models?.length
    ? value.models
    : [
        {
          id: value.model!,
          contextWindow: value.contextWindow,
          maxOutput: value.maxOutput,
          imageInput: value.imageInput,
          imageGeneration: value.imageGeneration,
          reasoning: value.reasoning,
          inputPrice: value.inputPrice,
          outputPrice: value.outputPrice,
          cacheReadPrice: value.cacheReadPrice,
          cacheWritePrice: value.cacheWritePrice,
          contextTiers: value.contextTiers,
          maxModePricingMultiplier: value.maxModePricingMultiplier,
          thinkingLevels: value.thinkingLevels,
          supportedThinkingLevels: value.supportedThinkingLevels,
          defaultThinkingLevel: value.defaultThinkingLevel,
          defaultReasoningEffort: value.defaultReasoningEffort,
          supportedReasoningEfforts: value.supportedReasoningEfforts,
        },
      ]
  const models = rawModels.map((model) => normalizeProviderModel(model, fallback))
  const selected = models.find((model) => model.id === value.model) ?? models[0]!
  return {
    id: value.id,
    name: value.name,
    visible: value.visible ?? true,
    protocol: value.protocol,
    baseUrl: value.baseUrl,
    model: selected.id,
    models,
    contextWindow: selected.contextWindow,
    maxOutput: selected.maxOutput,
    imageInput: selected.imageInput,
    imageGeneration: selected.imageGeneration,
    reasoning: selected.reasoning,
    inputPrice: selected.inputPrice,
    outputPrice: selected.outputPrice,
    ...contextPricingFields(selected),
    thinkingLevels: [...selected.thinkingLevels],
    supportedThinkingLevels: [...selected.supportedThinkingLevels],
    defaultThinkingLevel: selected.defaultThinkingLevel,
    defaultReasoningEffort: selected.defaultReasoningEffort,
    supportedReasoningEfforts: [...selected.supportedReasoningEfforts],
  }
})

export type ProviderInput = z.input<typeof providerSchema>

/** Selection ids remain the provider id for one-model legacy providers. */
export function modelSelectionId(providerId: string, modelId: string, modelCount: number): string {
  return modelCount === 1 ? providerId : `${providerId}/${modelId}`
}

export function providerModelSelectionId(provider: ProviderConfig, modelId: string): string {
  return modelSelectionId(provider.id, modelId, provider.models.length)
}

/**
 * Resolves the only legacy alias that is safe after a provider gains models.
 * A one-model provider historically persisted its provider id as the selection;
 * once it has multiple models that id must continue to mean its configured
 * primary model. Unknown or explicit model selections are left untouched.
 */
export function canonicalProviderModelSelectionId(provider: ProviderConfig, selectionId: string): string {
  if (selectionId !== provider.id || provider.models.length <= 1) return selectionId
  const primary = provider.models.find((model) => model.id === provider.model)
  return primary ? providerModelSelectionId(provider, primary.id) : selectionId
}

export function resolveProviderModel(provider: ProviderConfig, selectionId: string): ProviderConfig {
  let modelId = provider.model
  if (selectionId !== provider.id) {
    const prefix = `${provider.id}/`
    if (selectionId.startsWith(prefix)) modelId = selectionId.slice(prefix.length)
    else if (provider.models.some((model) => model.id === selectionId)) modelId = selectionId
  }
  const selected = provider.models.find((model) => model.id === modelId) ?? provider.models[0]!
  const {
    cacheReadPrice: _cacheRead,
    cacheWritePrice: _cacheWrite,
    contextTiers: _tiers,
    maxModePricingMultiplier: _multiplier,
    contextMode: _mode,
    ...base
  } = provider
  return {
    ...base,
    ...contextPricingFields(selected),
    model: selected.id,
    contextWindow: selected.contextWindow,
    maxOutput: selected.maxOutput,
    imageInput: selected.imageInput,
    imageGeneration: selected.imageGeneration,
    reasoning: selected.reasoning,
    inputPrice: selected.inputPrice,
    outputPrice: selected.outputPrice,
    thinkingLevels: [...selected.thinkingLevels],
    supportedThinkingLevels: [...selected.supportedThinkingLevels],
    defaultThinkingLevel: selected.defaultThinkingLevel,
    defaultReasoningEffort: selected.defaultReasoningEffort,
    supportedReasoningEfforts: [...selected.supportedReasoningEfforts],
  }
}

export function resolveModelContextMode(model: ProviderConfig, maxMode: boolean): ProviderConfig {
  return {
    ...model,
    contextWindow: maxMode ? maximumContextWindow(model) : model.contextWindow,
    contextMode: maxMode && maximumContextWindow(model) > model.contextWindow ? 'max' : 'standard',
  }
}

export function normalizeThinkingLevel(
  model: Pick<ProviderConfig, 'thinkingLevels' | 'defaultThinkingLevel'>,
  requested: ThinkingLevel | undefined,
  planMode = false,
): ThinkingLevel {
  const levels: ThinkingLevel[] = model.thinkingLevels.length > 0 ? model.thinkingLevels : ['off']
  const wanted = requested ?? (planMode ? 'medium' : model.defaultThinkingLevel)
  return levels.includes(wanted)
    ? wanted
    : model.defaultThinkingLevel && levels.includes(model.defaultThinkingLevel)
      ? model.defaultThinkingLevel
      : levels[0]!
}

export interface ModelInfo extends ProviderConfig {
  hasKey: boolean
  canExecute?: boolean
  primary?: boolean
  providerId: string
  providerName: string
  providerVisible: boolean
  modelId: string
  modelName: string
  description?: string
  modelVisible: boolean
}
export type PluginStatus = 'active' | 'disabled' | 'failed'
export interface PluginInfo {
  id: string
  packageName?: string | undefined
  name: string
  version: string
  required: boolean
  status: PluginStatus
  provides: string[]
  requires: string[]
  description: string
  config: Record<string, unknown>
  /** JSON Schema generated from the plugin's typed config schema for the settings UI. */
  configSchema?: Record<string, unknown> | undefined
  installScope?: 'global' | 'project' | undefined
  runtimeScope?: 'host' | 'workspace' | 'session' | 'run' | 'client' | undefined
  dependencies?: Record<string, string> | undefined
  peerDependencies?: Record<string, string> | undefined
  optionalDependencies?: Record<string, string> | undefined
  activationEvents?: string[] | undefined
  contributes?:
    | {
        commands: TerminalContribution[]
        panels: ToolWindowContribution[]
        renderers: Record<string, unknown>[]
        settings?: SettingsContribution | undefined
        theme?: ThemeContribution | undefined
      }
    | undefined
  terminalCommands?: TerminalContribution[] | undefined
  path?: string | undefined
  projectId?: string | undefined
  error?: string | undefined
  clientEntry?: string | undefined
}
export type UIContribution = ToolWindowContribution & { owner: string }
export const terminalCommandGroupSchema = z.enum(['session', 'run', 'model', 'extensions', 'system'])
export type TerminalCommandGroup = z.infer<typeof terminalCommandGroupSchema>
export const terminalCommandSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9._-]{0,127}$/),
  title: z.string().min(1).max(120),
  description: z.string().max(500),
  usage: z.string().min(1).max(300),
  aliases: z
    .array(z.string().regex(/^[a-z][a-z0-9._-]{0,127}$/))
    .max(20)
    .optional(),
  group: terminalCommandGroupSchema,
  scope: z.enum(['global', 'workspace', 'session']).optional(),
  permissions: z.array(z.string().min(1).max(100)).max(50).optional(),
  headless: z.boolean().optional(),
  mutates: z.boolean().optional(),
  completion: z.array(z.string().max(300)).max(100).optional(),
})
export type TerminalCommand = z.infer<typeof terminalCommandSchema>
export const terminalContributionSchema = terminalCommandSchema.extend({ owner: idSchema.optional() })
export type TerminalContribution = z.infer<typeof terminalContributionSchema>
export const terminalCommandResultSchema = z.object({
  status: z.enum(['ok', 'error']),
  markdown: z.string().optional(),
  data: z.unknown().optional(),
})
export type TerminalCommandResult = z.infer<typeof terminalCommandResultSchema>
export const terminalKeybindingSchema = z.object({
  key: z.string().min(1).max(100),
  command: z.string().min(1).max(160),
  when: z.string().max(300).optional(),
})
export type TerminalKeybinding = z.infer<typeof terminalKeybindingSchema>
export const terminalEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('status'), message: z.string() }),
  z.object({ type: z.literal('markdown'), markdown: z.string(), append: z.boolean().optional() }),
  z.object({
    type: z.literal('approval'),
    prompt: z.object({ id: idSchema, tool: z.string(), summary: z.string(), args: z.record(z.string(), z.unknown()) }),
  }),
  z.object({ type: z.literal('error'), message: z.string() }),
  z.object({ type: z.literal('session.changed'), sessionId: idSchema }),
])
export type TerminalEvent = z.infer<typeof terminalEventSchema>
export const terminalSnapshotSchema = z.object({
  workspaceId: idSchema.nullable(),
  sessionId: idSchema.nullable(),
  sessions: z.array(z.object({ id: idSchema, title: z.string(), running: z.boolean() })),
  input: z.string(),
  runId: idSchema.nullable(),
  modelId: idSchema.nullable(),
  thinking: thinkingLevelSchema,
  cwd: z.string(),
  notifications: z.array(terminalEventSchema),
})
export type TerminalSnapshot = z.infer<typeof terminalSnapshotSchema>
export const terminalOpenSchema = z.object({
  workspaceId: idSchema,
  /** Reused by a terminal opener when B-local confirmation asks for a retry. */
  operationId: idSchema.optional(),
  /** Remote terminals are bound to the exact owning session; local legacy terminals may omit it. */
  sessionId: idSchema.optional(),
  cols: z.number().int().min(20).max(400).default(120),
  rows: z.number().int().min(4).max(200).default(32),
})
export const terminalInputSchema = z.object({ terminalId: idSchema, data: z.string().max(64_000) })
export const terminalResizeSchema = z.object({
  terminalId: idSchema,
  cols: z.number().int().min(20).max(400),
  rows: z.number().int().min(4).max(200),
})
export const terminalCloseSchema = z.object({ terminalId: idSchema })
export const terminalListSchema = z.object({})
export type TerminalOpen = z.input<typeof terminalOpenSchema>
export type TerminalInput = z.input<typeof terminalInputSchema>
export type TerminalResize = z.input<typeof terminalResizeSchema>
export type TerminalClose = z.input<typeof terminalCloseSchema>
export interface TerminalInfo {
  id: string
  workspaceId: string
  cwd: string
  shell: string
  cols: number
  rows: number
  startedAt: string
}
export interface HostInfo {
  version: string
  protocol: number
  instanceId: string
  /** Stable identity for one persisted Host settings root; absent on older Hosts. */
  dataRootId?: string
  platform: string
  addresses: string[]
  activeRuns: number
  demo: boolean
  /** Access of this authenticated connection; older Hosts may omit the projection. */
  deviceAccess?: DeviceAccess
}
export interface Bootstrap {
  host: HostInfo
  workspaces: Workspace[]
  sessions: Session[]
  models: ModelInfo[]
  plugins: PluginInfo[]
  panels: UIContribution[]
}
export type WireNotification =
  | { method: 'chatDatabase.deleted'; params: import('./commands/chat-database-maintenance').ChatDatabaseDeletedEvent }
  | { method: 'notifications.created'; params: import('./commands/notifications').NotificationFreshEvent }
  | { method: 'session.event'; params: SessionEvent }
  | { method: 'session.summary'; params: SessionSummary }
  | { method: 'stream.update'; params: StreamDelta }
  | { method: 'tool.output'; params: import('./tool-execution').ToolOutputNotification }
  | { method: 'metrics.sample'; params: import('./metrics').PerformanceSample }
  | { method: 'host.changed'; params: { kind: string } }
  | { method: 'goal.updated'; params: { sessionId: string; runId: string | null; goal: ThreadGoal; seq?: number | undefined } }
  | { method: 'goal.cleared'; params: { sessionId: string; seq?: number | undefined } }
  | { method: 'plan.updated'; params: PlanState & { seq?: number | undefined } }
  | { method: 'plan.cleared'; params: { sessionId: string; seq?: number | undefined } }
  | {
      method: 'workflow.updated'
      params: { sessionId: string; snapshot: import('./workflow').WorkflowSnapshot }
    }
  | { method: 'mode.changed'; params: { sessionId: string; mode: RunMode } }
  | { method: 'budget.updated'; params: { sessionId: string; runId: string | null; budget: SessionBudget } }
  | { method: 'budget.cleared'; params: { sessionId: string } }
  | { method: 'automation.changed'; params: AutomationState }
  | { method: 'task.notification'; params: TaskNotification }
  | {
      method: 'settings.changed'
      params: { scope: SettingScope; targetId?: string | undefined; revision: string; ids: string[] }
    }
  | { method: 'git.changed'; params: { cwd: string } }
  | { method: 'browser.changed'; params: { sessionId: string; contextId: string } }
  | { method: 'computer.changed'; params: { sessionId: string } }
  | { method: 'user_input.requested'; params: UserInputRequest }
  | {
      method: 'user_input.resolved'
      params: { requestId: string; sessionId: string; cancelled: boolean; response?: UserInputResponse | undefined }
    }
  | { method: 'auth.revoked'; params: { reason: string } }
  | {
      method: 'terminal.output'
      params: { terminalId: string; data: string; seq?: number | undefined; reset?: boolean | undefined }
    }
  | { method: 'terminal.exit'; params: { terminalId: string; code: number | null; signal: string | null } }
  | {
      method: 'surface.invoke'
      params: {
        relayId: string
        invocationId: string
        commandId: string
        input: unknown
        generation: number
      }
    }

export const rpcSchemas = {
  'system.runtime.watch': runtimeWatchInputSchema,
  'system.runtime.unwatch': z.strictObject({}),
  'command.execute': invocationSchema,
  'command.catalog': z.strictObject({
    category: z.string().min(1).max(128).optional(),
    after: z.string().max(128).optional(),
    limit: z.number().int().min(1).max(200).default(100),
  }),
  'command.describe': z.strictObject({ commandId: z.string().min(1).max(128) }),
  'command.getReceipt': z.strictObject({
    commandId: z.enum([
      'session.setBudget',
      'run.submit',
      'run.retry',
      'queuedRun.editText',
      'queuedRun.remove',
      'queuedRun.guide',
    ]),
    sessionId: idSchema,
    idempotencyKey: z.string().min(1).max(128),
  }),
  'operation.watch': z.strictObject({
    operationId: idSchema,
    cursor: z.number().int().nonnegative().default(0),
  }),
  'operation.unwatch': z.strictObject({ operationId: idSchema }),
  'metrics.watch': z.strictObject({ cursor: z.number().int().nonnegative().default(0) }),
  'metrics.unwatch': z.strictObject({}),
  'surface.register': z.strictObject({
    clientId: idSchema,
    generation: z.number().int().positive(),
    commands: z.array(z.string().min(1).max(128)).max(64),
  }),
  'surface.unregister': z.strictObject({ clientId: idSchema, generation: z.number().int().positive() }),
  'surface.list': z.strictObject({}),
  'surface.invoke': z.strictObject({
    clientId: idSchema,
    invocationId: z.string().min(1).max(128),
    commandId: z.string().min(1).max(128),
    input: z.unknown(),
    timeoutMs: z.number().int().min(100).max(30_000).default(5_000),
  }),
  'surface.resolve': z.discriminatedUnion('ok', [
    z.strictObject({
      clientId: idSchema,
      generation: z.number().int().positive(),
      relayId: idSchema,
      ok: z.literal(true),
      result: z.unknown(),
    }),
    z.strictObject({
      clientId: idSchema,
      generation: z.number().int().positive(),
      relayId: idSchema,
      ok: z.literal(false),
      error: z.strictObject({ code: z.string().min(1).max(128), message: z.string().max(2000) }),
    }),
  ]),
  'schema.content.query': z.strictObject({
    queryId: idSchema,
    callbackId: z.string().min(1).max(128),
    request: z.strictObject({
      schemaId: z.string().min(1).max(128),
      schemaVersion: z.number().int().positive(),
      scope: z.strictObject({ kind: z.string().min(1).max(64), id: idSchema.optional() }),
      formId: idSchema,
      formRevision: z.number().int().nonnegative(),
      path: z.string().min(1).max(12_000),
      callbackVersion: z.number().int().positive(),
      valueType: z.enum(['string', 'number', 'boolean']),
      dependencies: z.record(z.string().min(1).max(12_000), z.unknown()),
      dependencyFingerprint: z.string().min(1).max(128),
      search: z.string().max(500).optional(),
      cursor: z.string().max(500).optional(),
    }),
  }),
  'schema.content.cancel': z.strictObject({ queryId: idSchema }),
  'workspace.list': workspaceListInputSchema,
  'workspace.get': workspaceGetInputSchema,
  'session.list': sessionListInputSchema,
  'session.get': sessionGetInputSchema,
  'system.hello': z.object({ protocol: z.literal(PROTOCOL_VERSION), token: z.string().max(512).optional() }),
  'system.bootstrap': z.object({}),
  'system.diagnose': z.object({}),
  'system.skills.list': z.object({}),
  'system.paths.get': z.object({}),
  'system.paths.validate': z.object({ dataRoot: z.string().min(1).max(4000), cacheRoot: z.string().min(1).max(4000) }),
  'system.paths.set': z.object({ dataRoot: z.string().min(1).max(4000), cacheRoot: z.string().min(1).max(4000) }),
  'system.restart': z.object({}),
  'permission.get': z.object({}),
  'permission.set': z.object({ mode: permissionModeSchema }),
  'settings.catalog': z.object({}),
  'settings.snapshot': z.object({ scope: settingScopeSchema, targetId: idSchema.optional() }),
  'settings.set': z.object({
    scope: settingScopeSchema,
    targetId: idSchema.optional(),
    id: idSchema,
    value: z.unknown(),
    expectedRevision: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  }),
  'settings.reset': z.object({
    scope: settingScopeSchema,
    targetId: idSchema.optional(),
    id: idSchema,
    expectedRevision: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  }),
  'settings.search': z.object({ query: z.string().trim().max(200) }),
  'automation.get': z.object({ sessionId: idSchema }),
  'automation.set': z.object({ sessionId: idSchema, unattended: z.boolean().optional(), goalEnabled: z.boolean().optional() }),
  'goal.get': z.object({ sessionId: idSchema }),
  'goal.create': z.object({
    sessionId: idSchema,
    objective: z.string().trim().min(1).max(MAX_GOAL_OBJECTIVE_LENGTH),
    tokenBudget: z.number().int().positive().optional(),
  }),
  'goal.update': z.object({ sessionId: idSchema, status: z.enum(['complete', 'blocked']) }),
  'goal.set': z.object({
    sessionId: idSchema,
    objective: z.string().trim().min(1).max(MAX_GOAL_OBJECTIVE_LENGTH).nullable().optional(),
    status: goalStatusSchema.nullable().optional(),
    tokenBudget: z.number().int().positive().nullable().optional(),
    expectedGoalId: idSchema.optional(),
    maxTokenBudget: z.number().int().positive().optional(),
  }),
  'goal.clear': z.object({ sessionId: idSchema }),
  'plan.get': z.object({ sessionId: idSchema }),
  'plan.update': z.object({
    sessionId: idSchema,
    turnId: idSchema.nullable().optional(),
    explanation: z.string().max(4_000).nullable().optional(),
    plan: z.array(planStepSchema).max(MAX_PLAN_STEPS),
  }),
  'plan.clear': z.object({ sessionId: idSchema }),
  'mode.get': z.object({ sessionId: idSchema }),
  'mode.set': z.object({ sessionId: idSchema, mode: runModeSchema }),
  'budget.get': z.object({ sessionId: idSchema }),
  'budget.set': z.object({ sessionId: idSchema, limit: z.number().int().positive() }),
  'budget.clear': z.object({ sessionId: idSchema }),
  'git.info': z.object({ cwd: z.string().min(1).max(4_000).optional() }),
  'git.status': z.object({ cwd: z.string().min(1).max(4_000).optional() }),
  'git.diff': z.object({
    cwd: z.string().min(1).max(4_000).optional(),
    cached: z.boolean().default(false),
    paths: z.array(z.string().min(1).max(4_000)).max(100).default([]),
  }),
  'git.log': z.object({
    cwd: z.string().min(1).max(4_000).optional(),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  'git.commit': z.object({
    cwd: z.string().min(1).max(4_000).optional(),
    message: z.string().trim().min(1).max(4_000),
    paths: z.array(z.string().min(1).max(4_000)).max(100).default([]),
    stage: z.boolean().default(false),
    sessionId: idSchema.optional(),
    runId: idSchema.optional(),
  }),
  'git.stage': z.object({
    cwd: z.string().min(1).max(4_000).optional(),
    paths: z.array(z.string().min(1).max(4_000)).min(1).max(100),
  }),
  'git.unstage': z.object({
    cwd: z.string().min(1).max(4_000).optional(),
    paths: z.array(z.string().min(1).max(4_000)).min(1).max(100),
  }),
  'git.branch': z.object({
    cwd: z.string().min(1).max(4_000).optional(),
    operation: z.enum(['list', 'create', 'switch', 'delete']).default('list'),
    name: z.string().trim().min(1).max(1_000).optional(),
    force: z.boolean().default(false),
  }),
  'git.worktree': z.object({
    cwd: z.string().min(1).max(4_000).optional(),
    operation: z.enum(['list', 'add', 'remove']).default('list'),
    path: z.string().min(1).max(4_000).optional(),
    branch: z.string().trim().min(1).max(1_000).optional(),
    createBranch: z.boolean().default(false),
    force: z.boolean().default(false),
  }),
  'git.diff_to_remote': z.object({
    cwd: z.string().min(1).max(4_000).optional(),
    paths: z.array(z.string().min(1).max(4_000)).max(100).default([]),
  }),
  'browser.status': z.object({ sessionId: idSchema }),
  'browser.navigate': z.object({
    sessionId: idSchema,
    url: z.string().url().max(4_000),
    contextId: idSchema.optional(),
    pageId: idSchema.optional(),
  }),
  'browser.go': z.object({
    sessionId: idSchema,
    action: z.enum(['back', 'forward', 'reload']),
    contextId: idSchema.optional(),
    pageId: idSchema.optional(),
  }),
  'browser.snapshot': z.object({ sessionId: idSchema, contextId: idSchema.optional(), pageId: idSchema.optional() }),
  'browser.click': z.object({
    sessionId: idSchema,
    selector: z.string().min(1).max(4_000),
    contextId: idSchema.optional(),
    pageId: idSchema.optional(),
  }),
  'browser.type': z.object({
    sessionId: idSchema,
    selector: z.string().min(1).max(4_000),
    text: z.string().max(16_000),
    contextId: idSchema.optional(),
    pageId: idSchema.optional(),
  }),
  'browser.press': z.object({
    sessionId: idSchema,
    key: z.string().min(1).max(100),
    selector: z.string().max(4_000).optional(),
    contextId: idSchema.optional(),
    pageId: idSchema.optional(),
  }),
  'browser.screenshot': z.object({
    sessionId: idSchema,
    fullPage: z.boolean().default(false),
    contextId: idSchema.optional(),
    pageId: idSchema.optional(),
  }),
  'browser.evaluate': z.object({
    sessionId: idSchema,
    expression: z.string().min(1).max(16_000),
    contextId: idSchema.optional(),
    pageId: idSchema.optional(),
  }),
  'browser.close': z.object({ sessionId: idSchema, contextId: idSchema.optional(), pageId: idSchema.optional() }),
  'browser.history': z.object({ sessionId: idSchema, contextId: idSchema.optional() }),
  'computer.status': z.object({ sessionId: idSchema }),
  'computer.screenshot': z.object({ sessionId: idSchema, appId: z.string().max(1_000).optional() }),
  'computer.click': z.object({
    sessionId: idSchema,
    x: z.number().int().min(0).max(10_000),
    y: z.number().int().min(0).max(10_000),
    appId: z.string().max(1_000).optional(),
  }),
  'computer.double_click': z.object({
    sessionId: idSchema,
    x: z.number().int().min(0).max(10_000),
    y: z.number().int().min(0).max(10_000),
    appId: z.string().max(1_000).optional(),
  }),
  'computer.type': z.object({
    sessionId: idSchema,
    text: z.string().max(16_000),
    appId: z.string().max(1_000).optional(),
  }),
  'computer.key': z.object({
    sessionId: idSchema,
    key: z.string().min(1).max(100),
    appId: z.string().max(1_000).optional(),
  }),
  'computer.scroll': z.object({
    sessionId: idSchema,
    deltaX: z.number().int().min(-10_000).max(10_000).default(0),
    deltaY: z.number().int().min(-10_000).max(10_000),
    appId: z.string().max(1_000).optional(),
  }),
  'computer.move': z.object({
    sessionId: idSchema,
    x: z.number().int().min(0).max(10_000),
    y: z.number().int().min(0).max(10_000),
    appId: z.string().max(1_000).optional(),
  }),
  'computer.wait': z.object({
    sessionId: idSchema,
    milliseconds: z.number().int().min(0).max(60_000),
    appId: z.string().max(1_000).optional(),
  }),
  'computer.launch': z.object({ sessionId: idSchema, appId: z.string().min(1).max(1_000) }),
  'workspace.create': z.object({ path: z.string().min(1).max(4000), name: z.string().trim().min(1).max(160).optional() }),
  'session.create': z.object({ workspaceId: idSchema, title: z.string().max(160).optional() }),
  'session.move': z.object({ sessionId: idSchema, workspaceId: idSchema }),
  'session.summaries': z.object({ sessionIds: z.array(idSchema).max(200) }),
  'session.snapshot': z.object({
    sessionId: idSchema,
    before: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(200).default(60),
  }),
  'session.follow': z.object({ sessionId: idSchema, cursor: z.number().int().nonnegative().default(0) }),
  'session.unfollow': z.object({ sessionId: idSchema }),
  'session.rename': z.object({ sessionId: idSchema, title: z.string().min(1).max(160) }),
  'session.archive': z.object({ sessionId: idSchema, archived: z.boolean() }),
  'session.fork': z.object({ sessionId: idSchema, atSeq: z.number().int().positive().optional() }),
  'session.export': z.object({ sessionId: idSchema }),
  'run.start': z.object({ sessionId: idSchema, requestId: idSchema, input: inputSchema, modelId: idSchema }),
  'run.cancel': z.object({ runId: idSchema }),
  'run.reorder': z.object({ sessionId: idSchema, runIds: z.array(idSchema).max(40) }),
  'terminal.open': terminalOpenSchema,
  'terminal.input': terminalInputSchema,
  'terminal.resize': terminalResizeSchema,
  'terminal.close': terminalCloseSchema,
  'terminal.list': terminalListSchema,
  'approval.resolve': z.object({ approvalId: idSchema, decision: z.enum(['allowed', 'denied']) }),
  'user_input.resolve': z.object({
    requestId: idSchema,
    answers: z.record(userInputIdSchema, userInputAnswerSchema),
  }),
  'context.compact': z.object({ sessionId: idSchema, modelId: idSchema }),
  'provider.save': z.object({ provider: providerSchema, apiKey: z.string().max(8192).optional() }),
  'provider.delete': z.object({ id: idSchema }),
  'plugin.set': z.object({ id: idSchema, enabled: z.boolean(), config: z.record(z.string(), z.unknown()).optional(), projectId: idSchema.optional() }),
  'plugin.install': z.object({ path: z.string().min(1).max(4000), projectId: idSchema.optional() }),
  'plugin.scan': z.object({}),
  'plugin.remove': z.object({ id: idSchema, projectId: idSchema.optional() }),
  'plugin.enable': z.object({ id: idSchema, projectId: idSchema.optional() }),
  'plugin.disable': z.object({ id: idSchema, projectId: idSchema.optional() }),
  'plugin.disableTree': z.object({ id: idSchema, projectId: idSchema.optional() }),
  'plugin.resolve': z.object({ id: idSchema.optional() }),
  'plugin.graph': z.object({ projectId: idSchema.optional() }),
  'plugin.lock': z.object({ projectId: idSchema.optional() }),
  'plugin.doctor': z.object({}),
  'device.list': z.object({}),
  'device.revoke': z.object({ id: idSchema }),
  'pairing.create': z.object({}),
  'file.read': z.object({ workspaceId: idSchema, path: z.string().min(1).max(4000) }),
  'file.write': z.object({
    workspaceId: idSchema,
    path: z.string().min(1).max(4000),
    text: z.string().max(2 * 1024 * 1024),
    expectedRevision: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  }),
  'file.list': z.object({ workspaceId: idSchema, path: z.string().max(4000).default('.') }),
} satisfies Record<string, z.ZodType>
export type RpcMethod = keyof typeof rpcSchemas
export type RpcParams<M extends RpcMethod> = z.input<(typeof rpcSchemas)[M]>
export interface RpcResults {
  'system.runtime.watch': import('./runtime').RuntimeWatchResult
  'system.runtime.unwatch': null
  'command.execute': unknown
  'command.catalog': {
    revision: number
    items: import('@hbar/commands/protocol').CommandDescriptor[]
    nextCursor?: string
  }
  'command.describe': import('@hbar/commands/protocol').CommandDescriptor
  'command.getReceipt':
    | import('./commands/budget').BudgetReceipt
    | import('./commands/run').RunAccepted
    | import('./commands/run').QueuedRunEditTextReceipt
    | import('./commands/run').QueuedRunRemoveReceipt
    | import('./commands/run').QueuedRunGuideReceipt
    | null
  'operation.watch': import('./commands/run').OperationWatchResult
  'operation.unwatch': null
  'metrics.watch': import('./commands/metrics').MetricsWatchResult
  'metrics.unwatch': null
  'surface.register': { clientId: string; generation: number; commands: string[] }
  'surface.unregister': null
  'surface.list': { items: { clientId: string; generation: number; commands: string[] }[] }
  'surface.invoke': unknown
  'surface.resolve': null
  'schema.content.query': import('@hbar/schema-core').OptionContentReport
  'schema.content.cancel': { cancelled: boolean }
  'workspace.list': WorkspacePage
  'workspace.get': Workspace | null
  'session.list': SessionPage
  'session.get': Session | null
  'system.hello': HostInfo
  'system.bootstrap': Bootstrap
  'system.diagnose': Record<string, unknown>
  'system.skills.list': Array<{ id: string; path: string }>
  'system.paths.get': {
    dataRoot: string
    cacheRoot: string
    database: string
    sessions: string
    skills: string
    plugins: string
    diagnostics: string
    settings: string
    artifacts: string
    pointerFile: string
    cacheBytes: number
    restartRequired: boolean
  }
  'system.paths.validate': { dataRoot: string; cacheRoot: string; valid: true }
  'system.paths.set': RpcResults['system.paths.get'] & {
    restartRequired: true
    restartMessage: string
  }
  'system.restart': { accepted: boolean; restartRequired: boolean }
  'permission.get': { mode: PermissionMode }
  'permission.set': { mode: PermissionMode }
  'settings.catalog': SettingsCatalog
  'settings.snapshot': SettingsSnapshot
  'settings.set': SettingsSnapshot
  'settings.reset': SettingsSnapshot
  'settings.search': Array<SettingDescriptor & { path: string; source?: SettingScope | 'default' | undefined }>
  'automation.get': AutomationState
  'automation.set': AutomationState
  'goal.get': { goal: ThreadGoal | null; remainingTokens: number | null }
  'goal.create': { goal: ThreadGoal; remainingTokens: number | null }
  'goal.update': { goal: ThreadGoal; remainingTokens: number | null; completionBudgetReport?: string }
  'goal.set': { goal: ThreadGoal; remainingTokens: number | null }
  'goal.clear': { cleared: boolean }
  'plan.get': PlanState | null
  'plan.update': PlanState
  'plan.clear': { cleared: boolean }
  'mode.get': { mode: RunMode }
  'mode.set': { mode: RunMode }
  'budget.get': SessionBudget | null
  'budget.set': SessionBudget
  'budget.clear': { cleared: boolean }
  'git.info': GitInfo
  'git.status': GitStatus
  'git.diff': GitDiff
  'git.log': GitCommitInfo[]
  'git.commit': GitCommitInfo
  'git.stage': { paths: string[] }
  'git.unstage': { paths: string[] }
  'git.branch': GitBranchInfo[] | GitBranchInfo
  'git.worktree': GitWorktreeInfo[] | GitWorktreeInfo
  'git.diff_to_remote': { sha: string; diff: string; truncated: boolean } | null
  'browser.status': { available: boolean; contexts: BrowserPage[]; history: string[] }
  'browser.navigate': BrowserPage
  'browser.go': BrowserPage
  'browser.snapshot': BrowserSnapshot
  'browser.click': BrowserPage
  'browser.type': BrowserPage
  'browser.press': BrowserPage
  'browser.screenshot': BrowserScreenshot
  'browser.evaluate': { value: unknown }
  'browser.close': { closed: boolean }
  'browser.history': string[]
  'computer.status': { available: boolean; platform: string; appId: string | null }
  'computer.screenshot': ComputerScreen
  'computer.click': ComputerAction
  'computer.double_click': ComputerAction
  'computer.type': ComputerAction
  'computer.key': ComputerAction
  'computer.scroll': ComputerAction
  'computer.move': ComputerAction
  'computer.wait': ComputerAction
  'computer.launch': ComputerAction
  'workspace.create': Workspace
  'session.create': Session
  'session.move': Session
  'session.summaries': SessionSummary[]
  'session.snapshot': SessionSnapshot
  'session.follow': { events: SessionEvent[]; cursor: number; streams: LiveStream[]; reset: boolean }
  'session.unfollow': null
  'session.rename': Session
  'session.archive': Session
  'session.fork': Session
  'session.export': SessionEvent[]
  'run.start': Run
  'run.cancel': null
  'run.reorder': null
  'terminal.open': TerminalInfo
  'terminal.input': null
  'terminal.resize': null
  'terminal.close': null
  'terminal.list': TerminalInfo[]
  'approval.resolve': null
  'user_input.resolve': { accepted: boolean }
  'context.compact': { summary: string }
  'provider.save': ModelInfo
  'provider.delete': null
  'plugin.set': PluginInfo[]
  'plugin.install': PluginInfo[]
  'plugin.scan': PluginInfo[]
  'plugin.remove': PluginInfo[]
  'plugin.enable': PluginInfo[]
  'plugin.disable': PluginInfo[]
  'plugin.disableTree': PluginInfo[]
  'plugin.resolve': { order: string[]; enabled: string[] }
  'plugin.graph': {
    nodes: { id: string; version: string; enabled: boolean; projectId?: string | undefined }[]
    edges: { from: string; to: string; kind: string; range: string }[]
  }
  'plugin.lock': { version: 1; plugins: Record<string, unknown> }
  'plugin.doctor': { ok: boolean; errors: string[]; order?: string[] }
  'device.list': Device[]
  'device.revoke': null
  'pairing.create': { code: string; expiresAt: number }
  'file.read': { text: string; path: string; revision: string }
  'file.write': { text: string; path: string; revision: string }
  'file.list': FileEntry[]
}
export const rpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.string().max(100),
  params: z.unknown().default({}),
})
export * from './workflow'

export * from './node-operation'
export * from './node-confirmations'