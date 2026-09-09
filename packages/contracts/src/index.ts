import { z } from 'zod'

export const PROTOCOL_VERSION = 1
export const APP_VERSION = '0.1.0'
export const idSchema = z.string().min(1).max(160)
export const artifactSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  name: z.string().max(240),
  mime: z.string().max(120),
  size: z.number().int().nonnegative(),
})
export type ArtifactRef = z.infer<typeof artifactSchema>
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
  }),
  z.object({
    type: z.literal('tool_result'),
    callId: idSchema,
    name: z.string(),
    text: z.string(),
    isError: z.boolean(),
    details: z.unknown().optional(),
  }),
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
export const approvalModeSchema = z.enum(['deny', 'allow', 'ask'])
export type ApprovalMode = z.infer<typeof approvalModeSchema>
export const permissionModeSchema = approvalModeSchema
export type PermissionMode = ApprovalMode
export const runModeSchema = z.enum(['default', 'plan'])
export type RunMode = z.infer<typeof runModeSchema>
export const runSourceSchema = z.enum(['user', 'goal', 'system'])
export type RunSource = z.infer<typeof runSourceSchema>
export const goalStatusSchema = z.enum(['active', 'paused', 'blocked', 'usage_limited', 'budget_limited', 'complete'])
export type GoalStatus = z.infer<typeof goalStatusSchema>
export const threadGoalSchema = z.object({
  threadId: idSchema,
  /** Internal identity used to reject stale external mutations. */
  goalId: idSchema.optional(),
  objective: z.string().min(1).max(4_000),
  status: goalStatusSchema,
  tokenBudget: z.number().int().positive().nullable(),
  tokensUsed: z.number().int().nonnegative(),
  timeUsedSeconds: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})
export type ThreadGoal = z.infer<typeof threadGoalSchema>
export const planStepStatusSchema = z.enum(['pending', 'in_progress', 'completed'])
export type PlanStepStatus = z.infer<typeof planStepStatusSchema>
export const planStepSchema = z.object({
  step: z.string().min(1).max(4_000),
  status: planStepStatusSchema,
})
export type PlanStep = z.infer<typeof planStepSchema>
export const planStateSchema = z.object({
  sessionId: idSchema,
  turnId: idSchema.nullable(),
  explanation: z.string().max(4_000).nullable(),
  plan: z.array(planStepSchema).max(100),
  updatedAt: z.number().int().nonnegative(),
})
export type PlanState = z.infer<typeof planStateSchema>

const userInputIdSchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/)
export const userInputOptionSchema = z.object({
  label: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500),
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
export const gitCommitInfoSchema = z.object({
  sha: z.string().regex(/^[0-9a-f]{7,64}$/i),
  shortSha: z.string().regex(/^[0-9a-f]{7,64}$/i),
  author: z.string().max(1_000),
  authoredAt: z.string().max(100),
  subject: z.string().max(4_000),
})
export type GitCommitInfo = z.infer<typeof gitCommitInfoSchema>
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
  approval: approvalModeSchema.optional(),
  mode: runModeSchema.optional(),
  source: runSourceSchema.optional(),
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
export interface Workspace {
  id: string
  path: string
  name: string
  createdAt: number
}
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
export type RunStatus = 'queued' | 'running' | 'waiting_approval' | 'completed' | 'cancelled' | 'failed' | 'interrupted'
export interface Run {
  id: string
  sessionId: string
  requestId: string
  input: UserInput
  modelId: string
  status: RunStatus
  createdAt: number
  startedAt: number | null
  endedAt: number | null
  error: string | null
}
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
export interface Approval {
  id: string
  sessionId: string
  runId: string
  callId: string
  tool: string
  args: Record<string, unknown>
  status: 'pending' | 'allowed' | 'denied' | 'cancelled'
  createdAt: number
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
}
const providerModelInputSchema = z.object({
  id: z.string().min(1).max(160),
  name: z.string().min(1).max(160).optional(),
  contextWindow: z.number().int().min(1024).max(10_000_000).optional(),
  maxOutput: z.number().int().min(64).max(1_000_000).optional(),
  imageInput: z.boolean().optional(),
  reasoning: z.boolean().optional(),
  inputPrice: z.number().nonnegative().optional(),
  outputPrice: z.number().nonnegative().optional(),
  thinkingLevels: z.array(thinkingLevelSchema).min(1).max(7).optional(),
  supportedThinkingLevels: z.array(thinkingLevelSchema).min(1).max(7).optional(),
  defaultThinkingLevel: thinkingLevelSchema.optional(),
  defaultReasoningEffort: thinkingLevelSchema.optional(),
  supportedReasoningEfforts: z.array(thinkingLevelSchema).min(1).max(7).optional(),
})

export interface ProviderModelConfig {
  id: string
  name: string
  contextWindow: number
  maxOutput: number
  imageInput: boolean
  reasoning: boolean
  inputPrice: number
  outputPrice: number
  thinkingLevels: ThinkingLevel[]
  supportedThinkingLevels: ThinkingLevel[]
  defaultThinkingLevel: ThinkingLevel
  defaultReasoningEffort: ThinkingLevel
  supportedReasoningEfforts: ThinkingLevel[]
}

export interface ProviderConfig {
  id: string
  name: string
  protocol: 'openai-completions' | 'openai-responses' | 'anthropic-messages' | 'mock'
  baseUrl: string
  /** The model used when a legacy model-only selection names this provider. */
  model: string
  models: ProviderModelConfig[]
  contextWindow: number
  maxOutput: number
  imageInput: boolean
  reasoning: boolean
  inputPrice: number
  outputPrice: number
  thinkingLevels: ThinkingLevel[]
  supportedThinkingLevels: ThinkingLevel[]
  defaultThinkingLevel: ThinkingLevel
  defaultReasoningEffort: ThinkingLevel
  supportedReasoningEfforts: ThinkingLevel[]
}

const providerInputSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
    name: z.string().min(1).max(100),
    protocol: z.enum(['openai-completions', 'openai-responses', 'anthropic-messages', 'mock']),
    baseUrl: z.string().url(),
    model: z.string().min(1).max(160).optional(),
    models: z.array(providerModelInputSchema).max(256).optional(),
    contextWindow: z.number().int().min(1024).max(10_000_000).optional(),
    maxOutput: z.number().int().min(64).max(1_000_000).optional(),
    imageInput: z.boolean().optional(),
    reasoning: z.boolean().optional(),
    inputPrice: z.number().nonnegative().optional(),
    outputPrice: z.number().nonnegative().optional(),
    thinkingLevels: z.array(thinkingLevelSchema).min(1).max(7).optional(),
    supportedThinkingLevels: z.array(thinkingLevelSchema).min(1).max(7).optional(),
    defaultThinkingLevel: thinkingLevelSchema.optional(),
    defaultReasoningEffort: thinkingLevelSchema.optional(),
    supportedReasoningEfforts: z.array(thinkingLevelSchema).min(1).max(7).optional(),
  })
  .superRefine((value, context) => {
    if (!value.model && !value.models?.length)
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['models'], message: 'A provider needs at least one model' })
    if (value.models) {
      const seen = new Set<string>()
      for (const [index, model] of value.models.entries()) {
        if (seen.has(model.id))
          context.addIssue({ code: z.ZodIssueCode.custom, path: ['models', index, 'id'], message: 'Model ids must be unique within a provider' })
        seen.add(model.id)
      }
    }
  })

function uniqueThinkingLevels(levels: readonly ThinkingLevel[]): ThinkingLevel[] {
  return [...new Set(levels)]
}

function normalizeProviderModel(
  value: z.input<typeof providerModelInputSchema>,
  fallback: {
    contextWindow: number
    maxOutput: number
    imageInput: boolean
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
  const reasoning = value.reasoning ?? (declaredLevels ? normalizedLevels.some((level) => level !== 'off') : fallback.reasoning)
  return {
    id: value.id,
    name: value.name ?? value.id,
    contextWindow: value.contextWindow ?? fallback.contextWindow,
    maxOutput: value.maxOutput ?? fallback.maxOutput,
    imageInput: value.imageInput ?? fallback.imageInput,
    reasoning,
    inputPrice: value.inputPrice ?? fallback.inputPrice,
    outputPrice: value.outputPrice ?? fallback.outputPrice,
    thinkingLevels: normalizedLevels,
    supportedThinkingLevels: normalizedLevels,
    defaultThinkingLevel,
    defaultReasoningEffort: defaultThinkingLevel,
    supportedReasoningEfforts: normalizedLevels,
  }
}

export const providerSchema = providerInputSchema.transform((value): ProviderConfig => {
  const providerThinkingLevels = uniqueThinkingLevels(
    value.thinkingLevels ?? value.supportedThinkingLevels ?? value.supportedReasoningEfforts ??
      (value.reasoning ? DEFAULT_THINKING_LEVELS : ['off']),
  )
  const fallback = {
    contextWindow: value.contextWindow ?? 128_000,
    maxOutput: value.maxOutput ?? 8192,
    imageInput: value.imageInput ?? false,
    reasoning: value.reasoning ?? providerThinkingLevels.some((level) => level !== 'off'),
    inputPrice: value.inputPrice ?? 0,
    outputPrice: value.outputPrice ?? 0,
    thinkingLevels: providerThinkingLevels,
    defaultThinkingLevel: value.defaultThinkingLevel ?? value.defaultReasoningEffort ?? (providerThinkingLevels.includes('medium') ? 'medium' : providerThinkingLevels[0] ?? 'off'),
  }
  const rawModels = value.models?.length
    ? value.models
    : [{
        id: value.model!,
        contextWindow: value.contextWindow,
        maxOutput: value.maxOutput,
        imageInput: value.imageInput,
        reasoning: value.reasoning,
        inputPrice: value.inputPrice,
        outputPrice: value.outputPrice,
        thinkingLevels: value.thinkingLevels,
        supportedThinkingLevels: value.supportedThinkingLevels,
        defaultThinkingLevel: value.defaultThinkingLevel,
        defaultReasoningEffort: value.defaultReasoningEffort,
        supportedReasoningEfforts: value.supportedReasoningEfforts,
      }]
  const models = rawModels.map((model) => normalizeProviderModel(model, fallback))
  const selected = models.find((model) => model.id === value.model) ?? models[0]!
  return {
    id: value.id,
    name: value.name,
    protocol: value.protocol,
    baseUrl: value.baseUrl,
    model: selected.id,
    models,
    contextWindow: selected.contextWindow,
    maxOutput: selected.maxOutput,
    imageInput: selected.imageInput,
    reasoning: selected.reasoning,
    inputPrice: selected.inputPrice,
    outputPrice: selected.outputPrice,
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

export function resolveProviderModel(provider: ProviderConfig, selectionId: string): ProviderConfig {
  let modelId = provider.model
  if (selectionId !== provider.id) {
    const prefix = `${provider.id}/`
    if (selectionId.startsWith(prefix)) modelId = selectionId.slice(prefix.length)
    else if (provider.models.some((model) => model.id === selectionId)) modelId = selectionId
  }
  const selected = provider.models.find((model) => model.id === modelId) ?? provider.models[0]!
  return {
    ...provider,
    model: selected.id,
    contextWindow: selected.contextWindow,
    maxOutput: selected.maxOutput,
    imageInput: selected.imageInput,
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

export function normalizeThinkingLevel(
  model: Pick<ProviderConfig, 'thinkingLevels' | 'defaultThinkingLevel'>,
  requested: ThinkingLevel | undefined,
  planMode = false,
): ThinkingLevel {
  const levels: ThinkingLevel[] = model.thinkingLevels.length > 0 ? model.thinkingLevels : ['off']
  const wanted = requested ?? (planMode ? 'medium' : model.defaultThinkingLevel)
  return levels.includes(wanted) ? wanted : model.defaultThinkingLevel && levels.includes(model.defaultThinkingLevel)
    ? model.defaultThinkingLevel
    : levels[0]!
}

export interface ModelInfo extends ProviderConfig {
  hasKey: boolean
  providerId: string
  providerName: string
  modelId: string
  modelName: string
}
export interface Device {
  id: string
  name: string
  createdAt: number
  lastSeenAt: number
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
  installScope?: 'global' | 'project' | undefined
  runtimeScope?: 'host' | 'workspace' | 'session' | 'run' | 'client' | undefined
  dependencies?: Record<string, string> | undefined
  peerDependencies?: Record<string, string> | undefined
  optionalDependencies?: Record<string, string> | undefined
  activationEvents?: string[] | undefined
  contributes?:
    | {
        commands: TerminalContribution[]
        panels: Record<string, unknown>[]
        renderers: Record<string, unknown>[]
      }
    | undefined
  terminalCommands?: TerminalContribution[] | undefined
  path?: string | undefined
  projectId?: string | undefined
  error?: string | undefined
  clientEntry?: string | undefined
}
export interface UIContribution {
  id: string
  title: string
  placement: 'left' | 'right' | 'bottom' | 'editor'
  kind: 'json' | 'markdown'
  content: string
  owner: string
}
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
export interface HostInfo {
  version: string
  protocol: number
  instanceId: string
  platform: string
  addresses: string[]
  activeRuns: number
  demo: boolean
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
  | { method: 'session.event'; params: SessionEvent }
  | { method: 'stream.update'; params: StreamDelta }
  | { method: 'host.changed'; params: { kind: string } }
  | { method: 'goal.updated'; params: { sessionId: string; runId: string | null; goal: ThreadGoal } }
  | { method: 'goal.cleared'; params: { sessionId: string } }
  | { method: 'plan.updated'; params: PlanState }
  | { method: 'plan.cleared'; params: { sessionId: string } }
  | { method: 'mode.changed'; params: { sessionId: string; mode: RunMode } }
  | { method: 'budget.updated'; params: { sessionId: string; runId: string | null; budget: SessionBudget } }
  | { method: 'budget.cleared'; params: { sessionId: string } }
  | { method: 'git.changed'; params: { cwd: string } }
  | { method: 'browser.changed'; params: { sessionId: string; contextId: string } }
  | { method: 'computer.changed'; params: { sessionId: string } }
  | { method: 'user_input.requested'; params: UserInputRequest }
  | { method: 'user_input.resolved'; params: { requestId: string; sessionId: string; cancelled: boolean; response?: UserInputResponse } }
  | { method: 'auth.revoked'; params: { reason: string } }

export const rpcSchemas = {
  'system.hello': z.object({ protocol: z.literal(PROTOCOL_VERSION), token: z.string().max(512).optional() }),
  'system.bootstrap': z.object({}),
  'system.diagnose': z.object({}),
  'system.paths.get': z.object({}),
  'system.paths.validate': z.object({ dataRoot: z.string().min(1).max(4000), cacheRoot: z.string().min(1).max(4000) }),
  'system.paths.set': z.object({ dataRoot: z.string().min(1).max(4000), cacheRoot: z.string().min(1).max(4000) }),
  'system.restart': z.object({}),
  'permission.get': z.object({}),
  'permission.set': z.object({ mode: permissionModeSchema }),
  'goal.get': z.object({ sessionId: idSchema }),
  'goal.create': z.object({
    sessionId: idSchema,
    objective: z.string().trim().min(1).max(4_000),
    tokenBudget: z.number().int().positive().optional(),
  }),
  'goal.update': z.object({ sessionId: idSchema, status: z.enum(['complete', 'blocked']) }),
  'goal.set': z.object({
    sessionId: idSchema,
    objective: z.string().trim().min(1).max(4_000).nullable().optional(),
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
    plan: z.array(planStepSchema).max(100),
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
  'git.diff_to_remote': z.object({ cwd: z.string().min(1).max(4_000).optional() }),
  'browser.status': z.object({ sessionId: idSchema }),
  'browser.navigate': z.object({
    sessionId: idSchema,
    url: z.string().url().max(4_000),
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
  'workspace.create': z.object({ path: z.string().min(1).max(4000) }),
  'session.create': z.object({ workspaceId: idSchema, title: z.string().max(160).optional() }),
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
  'approval.resolve': z.object({ approvalId: idSchema, decision: z.enum(['allowed', 'denied']) }),
  'user_input.resolve': z.object({
    requestId: idSchema,
    answers: z.record(userInputIdSchema, userInputAnswerSchema),
  }),
  'context.compact': z.object({ sessionId: idSchema, modelId: idSchema }),
  'provider.save': z.object({ provider: providerSchema, apiKey: z.string().max(8192).optional() }),
  'provider.delete': z.object({ id: idSchema }),
  'plugin.set': z.object({ id: idSchema, enabled: z.boolean(), config: z.record(z.string(), z.unknown()).optional() }),
  'plugin.install': z.object({ path: z.string().min(1).max(4000), projectId: idSchema.optional() }),
  'plugin.scan': z.object({}),
  'plugin.remove': z.object({ id: idSchema }),
  'plugin.enable': z.object({ id: idSchema }),
  'plugin.disable': z.object({ id: idSchema }),
  'plugin.resolve': z.object({ id: idSchema.optional() }),
  'plugin.graph': z.object({}),
  'plugin.lock': z.object({}),
  'plugin.doctor': z.object({}),
  'device.list': z.object({}),
  'device.revoke': z.object({ id: idSchema }),
  'pairing.create': z.object({}),
  'file.read': z.object({ workspaceId: idSchema, path: z.string().min(1).max(4000) }),
  'file.list': z.object({ workspaceId: idSchema, path: z.string().max(4000).default('.') }),
} satisfies Record<string, z.ZodType>
export type RpcMethod = keyof typeof rpcSchemas
export type RpcParams<M extends RpcMethod> = z.input<(typeof rpcSchemas)[M]>
export interface RpcResults {
  'system.hello': HostInfo
  'system.bootstrap': Bootstrap
  'system.diagnose': Record<string, unknown>
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
  'system.paths.set': RpcResults['system.paths.get']
  'system.restart': { accepted: boolean; restartRequired: boolean }
  'permission.get': { mode: PermissionMode }
  'permission.set': { mode: PermissionMode }
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
  'git.branch': GitBranchInfo[] | GitBranchInfo
  'git.worktree': GitWorktreeInfo[] | GitWorktreeInfo
  'git.diff_to_remote': { sha: string; diff: string; truncated: boolean } | null
  'browser.status': { available: boolean; contexts: BrowserPage[]; history: string[] }
  'browser.navigate': BrowserPage
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
  'session.snapshot': SessionSnapshot
  'session.follow': { events: SessionEvent[]; cursor: number; streams: LiveStream[]; reset: boolean }
  'session.unfollow': null
  'session.rename': Session
  'session.archive': Session
  'session.fork': Session
  'session.export': SessionEvent[]
  'run.start': Run
  'run.cancel': null
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
  'plugin.resolve': { order: string[]; enabled: string[] }
  'plugin.graph': {
    nodes: { id: string; version: string; enabled: boolean }[]
    edges: { from: string; to: string; kind: string; range: string }[]
  }
  'plugin.lock': { version: 1; plugins: Record<string, unknown> }
  'plugin.doctor': { ok: boolean; errors: string[]; order?: string[] }
  'device.list': Device[]
  'device.revoke': null
  'pairing.create': { code: string; expiresAt: number }
  'file.read': { text: string; path: string }
  'file.list': FileEntry[]
}
export const rpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.string().max(100),
  params: z.unknown().default({}),
})
export class HbarError extends Error {
  constructor(
    public code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'HbarError'
  }
}
