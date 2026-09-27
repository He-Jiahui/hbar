import { Context, Service } from 'cordis'
export type { DecisionContext, DecisionService } from './decision'
export { appendModelContext, prependModelInstructions } from './model-context'
import type { z } from 'zod'
import type { ToolPresentationDeclaration } from '@hbar/contracts'
export type { ToolPresentationDeclaration } from '@hbar/contracts'
import type {
  Approval,
  ContentBlock,
  FileEntry,
  Message,
  ProviderConfig,
  Run,
  Session,
  SessionEvent,
  SessionSnapshot,
  TerminalContribution,
  ThreadGoal,
  PlanState,
  RunMode,
  GoalStatus,
  PlanStep,
  SessionBudget,
  GitStatus,
  GitStatsReport,
  GitDiff,
  GitInfo,
  GitCommitInfo,
  GitBranchInfo,
  GitWorktreeInfo,
  BrowserPage,
  BrowserSnapshot,
  BrowserScreenshot,
  ComputerScreen,
  ComputerAction,
  UserInputRequest,
  UserInputResponse,
  UserInput,
  UIContribution,
  Usage,
  Workspace,
  WorkflowPlanItemInput,
  WorkflowCompletionPolicy,
  WorkflowScope,
  WorkflowSnapshot,
  WorkflowStartCommand,
} from '@hbar/contracts'
import type { BudgetReceipt, SetBudgetInput } from '@hbar/contracts/commands/budget'
import type { AgentCreateInput, AgentPage, AgentRecord } from '@hbar/contracts/commands/agents'
import type {
  ParsedWorkspaceFindInput,
  ParsedWorkspaceSearchInput,
  WorkspaceFindResult,
  WorkspaceReadResult,
  WorkspaceSearchResult,
} from '@hbar/contracts/workspace-query'

export { Context }
export type Disposer = () => void | Promise<void>
export type ScopeKind = 'host' | 'workspace' | 'session' | 'run' | 'client'
export type ToolResultContent = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
export interface ScopeDescriptor {
  kind: ScopeKind
  id: string
  workspaceId?: string
  sessionId?: string
  runId?: string
  clientId?: string
}
export interface ToolResult {
  text: string
  content?: ToolResultContent[]
  isError?: boolean
  details?: unknown
  /** Host-owned failure metadata. The execution gateway overwrites any plugin-provided value. */
  hostFailure?: { code: string; executionStarted: boolean } | undefined
}
export interface ToolContext {
  session: Session
  workspace: Workspace
  run: Run
  signal: AbortSignal
  callId: string
  /** Host-owned parent identity; nested results stay out of the model's tool-call protocol. */
  parentCallId?: string
  /** One bounded, sequential batch through this Run's selected tools and normal execution gates. No recursion. */
  executeSequence?: (calls: readonly ToolSequenceCall[]) => Promise<readonly ToolSequenceResult[]>
}
export interface ToolSequenceCall {
  name: string
  arguments: Record<string, unknown>
  continueOnScopeDenied?: boolean | undefined
}
export const TOOL_SEQUENCE_RESULT_CHARACTERS = 8_000
export interface ToolSequenceResult {
  callId: string
  name: string
  text: string
  isError: boolean
  truncated: boolean
  continuedScopeDenial?: boolean
}
export type ToolWorkspaceAccess =
  | { kind: 'none' }
  | {
      kind: 'paths'
      arguments: readonly { field: string; access: 'read' | 'write' }[]
    }
  | { kind: 'workspace' }
export interface ToolDefinition {
  name: string
  description: string
  inputSchema: z.ZodType
  effect: 'read' | 'write' | 'process' | 'network'
  /** Requested-input display only; the Host captures this declaration, never localized text or execution proof. */
  presentation?: ToolPresentationDeclaration
  /** A dedicated user decision is required even when the Run permits ordinary tool calls. */
  humanApproval?: 'required'
  /** Explicit workspace access used by Workflow. Omission means no workspace path access. */
  workspaceAccess?: ToolWorkspaceAccess
  execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult>
}
export interface ToolRegistry {
  register(tool: ToolDefinition): Disposer
  list(): ToolDefinition[]
  get(name: string): ToolDefinition | undefined
}
export interface ModelRegistry {
  list(): Promise<ProviderConfig[]>
  get(id: string): Promise<ProviderConfig>
  secret(id: string): Promise<string | null>
}
export interface ExecutionProvider {
  list(workspace: string, path: string): Promise<FileEntry[]>
  read(workspace: string, path: string): Promise<string>
  readBytes(workspace: string, path: string): Promise<Uint8Array>
  write(workspace: string, path: string, text: string): Promise<{ before: string; after: string; path: string }>
  exec(workspace: string, command: string, signal: AbortSignal): Promise<ToolResult>
  workspaceQuery?: WorkspaceQueryProvider
  dispose?(): void | Promise<void>
}
export interface WorkspaceQueryProvider {
  search(
    workspace: string,
    input: ParsedWorkspaceSearchInput,
    signal: AbortSignal,
  ): Promise<WorkspaceSearchResult>
  find(workspace: string, input: ParsedWorkspaceFindInput, signal: AbortSignal): Promise<WorkspaceFindResult>
  readRange(
    workspace: string,
    path: string,
    startLine: number,
    lineCount: number,
    signal: AbortSignal,
  ): Promise<WorkspaceReadResult>
  invalidate(workspace: string, path: string): Promise<void>
  dispose(): void
}
export interface PolicyProvider {
  decide(tool: ToolDefinition, args: Record<string, unknown>, context: ToolContext): Promise<'allow' | 'ask' | 'deny'>
}
export interface ModelRequest {
  system: string
  /** UTF-16 boundary of fresh Host context in system. Drivers may move this suffix after history at the same authority. */
  systemContextOffset?: number
  messages: Message[]
  model: ProviderConfig
  /** Per-request advertised subset of the Run tool registry; omission preserves legacy drivers. Not an authorization grant. */
  toolNames?: readonly string[]
  context?: {
    sessionId: string
    runId?: string | undefined
    mode?: RunMode | undefined
    source?: import('@hbar/contracts').RunSource | undefined
  }
}
export interface DriverInput {
  session: Session
  workspace: Workspace
  run: Run
  request: ModelRequest
  tools: ToolDefinition[]
  apiKey: string | null
  signal: AbortSignal
  resolveKey(modelId: string): Promise<string | null>
  readImage(id: string): Promise<{ mime: string; data: string }>
  readFile(id: string): Promise<{
    name: string
    mime: string
    size: number
    text: string | null
    truncated: boolean
  }>
  /** Ordinary driver events only; canonical message.committed is reserved for commit(). */
  emit(type: string, data: unknown, stepId?: string): Promise<SessionEvent>
  commit(role: Message['role'], content: ContentBlock[], messageId?: string, providerData?: unknown): Promise<Message>
  stream(id: string, text: string, thinking: string): void
  execute(name: string, args: Record<string, unknown>, callId: string): Promise<ToolResult>
  beforeRequest(request: ModelRequest, stepId: string): Promise<ModelRequest>
  stepEnded(stepId: string): Promise<{ stop: 'goal_complete' } | void>
}
export interface HarnessDriver {
  run(input: DriverInput): Promise<void>
  summarize(request: ModelRequest, apiKey: string | null, signal: AbortSignal): Promise<{ text: string; usage: Usage }>
}
export interface SessionService {
  get(id: string): Promise<Session>
  list(workspaceId?: string): Promise<Session[]>
  children(parentId: string, after?: string, limit?: number): Promise<Session[]>
  events(id: string, after?: number, limit?: number): Promise<SessionEvent[]>
  create(workspaceId: string, title?: string, parentId?: string): Promise<Session>
  submit(sessionId: string, requestId: string, input: UserInput, modelId: string): Promise<Run>
  /** Wake the Host idle dispatcher; this does not enqueue a model turn. */
  wake(sessionId: string): void
  cancel(runId: string): Promise<void>
  snapshot(sessionId: string): Promise<SessionSnapshot>
  workspace(workspaceId: string): Promise<Workspace>
  createWorkspace(path: string): Promise<Workspace>
  append(sessionId: string, type: string, data: unknown, runId?: string, stepId?: string): Promise<SessionEvent>
}
export interface GoalSetInput {
  objective?: string | null | undefined
  status?: GoalStatus | null | undefined
  tokenBudget?: number | null | undefined
  expectedGoalId?: string | undefined
  maxTokenBudget?: number | undefined
}
export interface GoalToolResponse {
  goal: ThreadGoal | null
  remainingTokens: number | null
  completionBudgetReport?: string
}
export interface GoalService {
  snapshot(sessionId: string): Promise<{ value: GoalToolResponse; seq: number }>
  get(sessionId: string): Promise<GoalToolResponse>
  create(sessionId: string, objective: string, tokenBudget?: number, runId?: string, startedAt?: number): Promise<GoalToolResponse>
  set(sessionId: string, input: GoalSetInput): Promise<GoalToolResponse>
  update(sessionId: string, status: 'complete' | 'blocked', runId?: string, reason?: string): Promise<GoalToolResponse>
  clear(sessionId: string, expectedGoalId?: string): Promise<{ cleared: boolean }>
  requestContinuation(
    sessionId: string,
    input: { goalId: string; trigger: string; modelId: string; text?: string },
  ): Promise<void>
}
export interface PlanService {
  snapshot(sessionId: string): Promise<{ value: PlanState | null; seq: number }>
  get(sessionId: string): Promise<PlanState | null>
  /** Hold the observed plan revision stable while committing a dependent fact. */
  withRevision(sessionId: string, revision: number | null, commit: () => Promise<void>): Promise<void>
  update(
    sessionId: string,
    plan: PlanStep[],
    explanation?: string | null,
    turnId?: string | null,
    expectedRevision?: number,
  ): Promise<PlanState>
  clear(sessionId: string, expectedRevision?: number): Promise<{ cleared: boolean }>
}
export interface WorkflowService {
  get(sessionId: string): Promise<WorkflowSnapshot>
  focus(
    sessionId: string,
    stepIndex: number,
    item: WorkflowPlanItemInput,
    completionPolicy: WorkflowCompletionPolicy,
    expectedPlanRevision: number,
  ): Promise<WorkflowSnapshot>
  savePlan(
    sessionId: string,
    objective: string,
    items: WorkflowPlanItemInput[],
    expectedRevision?: number | null,
  ): Promise<WorkflowSnapshot>
  start(
    sessionId: string,
    objective: string,
    items: WorkflowPlanItemInput[],
    tokenBudget?: number,
    run?: Run,
    command?: WorkflowStartCommand,
  ): Promise<WorkflowSnapshot>
  activate(sessionId: string, planRevision: number, tokenBudget?: number, run?: Run): Promise<WorkflowSnapshot>
  expandScope(
    sessionId: string,
    itemId: string,
    scope: WorkflowScope,
    reason: string,
    expectedRevision: number | { focusRevision: number; planRevision: number },
  ): Promise<WorkflowSnapshot>
  checkpoint(
    sessionId: string,
    itemId: string,
    outcome: 'progress' | 'revise' | 'complete' | 'blocked',
    summary: string,
    nextItemId: string | null | undefined,
    expectedRevision: number | { focusRevision: number; planRevision: number },
    evidenceIds?: string[],
    reviewModelId?: string,
  ): Promise<WorkflowSnapshot>
  delegate(
    sessionId: string,
    itemIds: string[],
    modelId: string,
    tokenBudget: number | undefined,
    expectedRevision: number,
  ): Promise<WorkflowSnapshot>
  acceptCheck(
    sessionId: string,
    itemId: string,
    checkId: string,
    decision: 'accepted' | 'rejected',
    note: string | null | undefined,
    expectedRevision: number,
    actorId: string,
  ): Promise<WorkflowSnapshot>
  complete(sessionId: string, expectedRevision: number, runId?: string): Promise<WorkflowSnapshot>
}
export interface ModeService {
  get(sessionId: string): Promise<{ mode: RunMode }>
  set(sessionId: string, mode: RunMode): Promise<{ mode: RunMode }>
  effectiveMode(run: Run): RunMode
  /** Serialize the approved Run transition with ordinary session mode writes. */
  commitExit<T extends { modeEvent: SessionEvent | null }>(sessionId: string, commit: () => Promise<T>): Promise<T>
}
export interface BudgetService {
  get(sessionId: string): Promise<SessionBudget | null>
  set(sessionId: string, limit: number): Promise<SessionBudget>
  setCommand(
    input: SetBudgetInput,
    context: { actorId: string; idempotencyKey: string; requestId: string },
  ): Promise<BudgetReceipt>
  getCommandReceipt(sessionId: string, actorId: string, idempotencyKey: string): Promise<BudgetReceipt | null>
  clear(sessionId: string): Promise<{ cleared: boolean }>
}
export interface AgentService {
  create(
    input: AgentCreateInput,
    context: { actorId: string; idempotencyKey: string; requestId: string },
  ): Promise<AgentRecord>
  list(parentSessionId: string, after?: string, limit?: number): Promise<AgentPage>
  cancel(parentSessionId: string, agentId: string): Promise<AgentRecord>
  result(parentSessionId: string, agentId: string): Promise<AgentRecord>
  applyPatch(
    parentSessionId: string,
    agentId: string,
    planRevision: number,
    context: { actorId: string; idempotencyKey: string; requestId: string },
  ): Promise<AgentRecord>
}
export interface GitDiffOptions {
  cached?: boolean | undefined
  paths?: string[] | undefined
}
export interface GitCommitOptions {
  message: string
  paths?: string[] | undefined
  stage?: boolean | undefined
  provenance: {
    source: 'auto' | 'manual'
    sessionId?: string | undefined
    runId?: string | undefined
    operationId?: string | undefined
  }
}
export interface GitStatsOptions {
  from?: number | undefined
  to?: number | undefined
  bucketMs: number
  maxBuckets: number
  sources: ('auto' | 'manual' | 'external')[]
}
export type GitBranchOperation =
  | { operation?: 'list' | undefined }
  | { operation: 'create' | 'switch' | 'delete'; name: string; force?: boolean | undefined }
export type GitWorktreeOperation =
  | { operation?: 'list' | undefined }
  | { operation: 'add'; path: string; branch?: string | undefined; createBranch?: boolean | undefined }
  | { operation: 'remove'; path: string; force?: boolean | undefined }
export interface GitService {
  info(cwd?: string, signal?: AbortSignal): Promise<GitInfo>
  status(cwd?: string, signal?: AbortSignal): Promise<GitStatus>
  diff(cwd?: string, options?: GitDiffOptions, signal?: AbortSignal): Promise<GitDiff>
  log(cwd?: string, limit?: number, signal?: AbortSignal): Promise<GitCommitInfo[]>
  stats(cwd: string | undefined, options: GitStatsOptions, signal?: AbortSignal): Promise<GitStatsReport>
  commit(cwd: string | undefined, options: GitCommitOptions, signal?: AbortSignal): Promise<GitCommitInfo>
  branch(
    cwd: string | undefined,
    operation?: GitBranchOperation,
    signal?: AbortSignal,
  ): Promise<GitBranchInfo[] | GitBranchInfo>
  worktree(
    cwd: string | undefined,
    operation?: GitWorktreeOperation,
    signal?: AbortSignal,
  ): Promise<GitWorktreeInfo[] | GitWorktreeInfo>
  diffToRemote(cwd?: string, signal?: AbortSignal): Promise<{ sha: string; diff: string; truncated: boolean } | null>
}
export interface BrowserUseService {
  status(sessionId: string, signal?: AbortSignal): Promise<{ available: boolean; contexts: BrowserPage[]; history: string[] }>
  navigate(
    sessionId: string,
    url: string,
    contextId?: string,
    pageId?: string,
    signal?: AbortSignal,
  ): Promise<BrowserPage>
  snapshot(sessionId: string, contextId?: string, pageId?: string, signal?: AbortSignal): Promise<BrowserSnapshot>
  click(
    sessionId: string,
    selector: string,
    contextId?: string,
    pageId?: string,
    signal?: AbortSignal,
  ): Promise<BrowserPage>
  type(
    sessionId: string,
    selector: string,
    text: string,
    contextId?: string,
    pageId?: string,
    signal?: AbortSignal,
  ): Promise<BrowserPage>
  press(
    sessionId: string,
    key: string,
    selector?: string,
    contextId?: string,
    pageId?: string,
    signal?: AbortSignal,
  ): Promise<BrowserPage>
  screenshot(
    sessionId: string,
    fullPage?: boolean,
    contextId?: string,
    pageId?: string,
    signal?: AbortSignal,
  ): Promise<BrowserScreenshot>
  evaluate(
    sessionId: string,
    expression: string,
    contextId?: string,
    pageId?: string,
    signal?: AbortSignal,
  ): Promise<{ value: unknown }>
  close(sessionId: string, contextId?: string, pageId?: string, signal?: AbortSignal): Promise<{ closed: boolean }>
  history(sessionId: string, contextId?: string, signal?: AbortSignal): Promise<string[]>
}
export interface ComputerUseService {
  status(sessionId: string, signal?: AbortSignal): Promise<{ available: boolean; platform: string; appId: string | null }>
  screenshot(sessionId: string, appId?: string, signal?: AbortSignal): Promise<ComputerScreen>
  click(sessionId: string, x: number, y: number, appId?: string, signal?: AbortSignal): Promise<ComputerAction>
  doubleClick(sessionId: string, x: number, y: number, appId?: string, signal?: AbortSignal): Promise<ComputerAction>
  type(sessionId: string, text: string, appId?: string, signal?: AbortSignal): Promise<ComputerAction>
  key(sessionId: string, key: string, appId?: string, signal?: AbortSignal): Promise<ComputerAction>
  scroll(
    sessionId: string,
    deltaX: number,
    deltaY: number,
    appId?: string,
    signal?: AbortSignal,
  ): Promise<ComputerAction>
  move(sessionId: string, x: number, y: number, appId?: string, signal?: AbortSignal): Promise<ComputerAction>
  wait(sessionId: string, milliseconds: number, appId?: string, signal?: AbortSignal): Promise<ComputerAction>
  launch(sessionId: string, appId: string, signal?: AbortSignal): Promise<ComputerAction>
}
export interface CompactionProvider {
  shouldCompact(request: ModelRequest): boolean
  retainMessages: number
}
export interface HookEvents {
  'context.build': ModelRequest
  'model.request': ModelRequest
  'tool.before': { name: string; args: Record<string, unknown>; context: ToolContext; tool: ToolDefinition }
  /** After approval and durable intent, before execution. Failure prevents execution; returned arguments are ignored. */
  'tool.executing': { name: string; args: Record<string, unknown>; context: ToolContext; tool: ToolDefinition }
  'tool.after': { name: string; result: ToolResult; context: ToolContext }
  'tool.settled': {
    name: string
    args: Record<string, unknown>
    result: ToolResult
    context: ToolContext
    tool: ToolDefinition
  }
  'step.end': { sessionId: string; runId: string; stepId: string; stop?: 'goal_complete' }
  'tools.select': { sessionId: string; runId: string; tools: ToolDefinition[] }
  /** Recomputed per request. Only omit Run tools; bounded instructions may describe access via an existing tool. */
  'tools.advertise': { sessionId: string; runId: string; tools: ToolDefinition[]; instructions?: string }
  'run.start': { sessionId: string; runId: string; run: Run }
  'run.modeChanged': { sessionId: string; runId: string; run: Run; mode: RunMode }
  'run.end': { sessionId: string; runId: string; status: Run['status']; run: Run }
  'run.cancelRequested': { sessionId: string; runId: string; run: Run }
  'session.idle': {
    sessionId: string
    wakeAt?: number
    submission?: { requestId: string; input: UserInput; modelId: string }
  }
  'session.continuationFailed': { sessionId: string; requestId: string; unknown: boolean }
  /** Published after the session budget fact has been committed. */
  'budget.committed': { sessionId: string; budget: SessionBudget | null }
  'goal.beforeComplete': {
    sessionId: string
    runId?: string | undefined
    goal: ThreadGoal
    /** Validators may wrap this commit to keep their facts stable through persistence. */
    commit: () => Promise<void>
  }
  'goal.beforeContinue': {
    sessionId: string
    runId: string
    goal: ThreadGoal
    allowed: boolean
    reason?: 'workflow_wait' | 'repair'
    recoveryKey?: string
  }
  'goal.replaced': { sessionId: string; previous: ThreadGoal; goal: ThreadGoal }
  'goal.cleared': { sessionId: string; previous: ThreadGoal }
  'agent.patch': {
    parentSessionId: string
    agentId: string
    patch: import('@hbar/contracts').AgentPatch | null
    status: 'ready' | 'applied' | 'conflict' | 'rejected'
  }
  'agent.settled': {
    parentSessionId: string
    agentId: string
    status: import('@hbar/contracts/commands/agents').AgentRecord['status']
  }
}
export interface HookRegistry {
  on<K extends keyof HookEvents>(
    event: K,
    listener: (value: HookEvents[K]) => void | HookEvents[K] | Promise<void | HookEvents[K]>,
  ): Disposer
  dispatch<K extends keyof HookEvents>(event: K, value: HookEvents[K]): Promise<HookEvents[K]>
}
export interface HbarAPI {
  scope: ScopeDescriptor
  tools: ToolRegistry
  hooks: HookRegistry
  sessions: SessionService
  userInput: UserInputService
  notify(event: import('@hbar/contracts').WireNotification): void
  changed(kind: string): void
  panels: { register(panel: Omit<UIContribution, 'owner'>): Disposer }
  service<T>(name: string): T
}
export interface UserInputService {
  request(request: UserInputRequest, signal: AbortSignal): Promise<UserInputResponse>
}
declare module 'cordis' {
  interface Context {
    hbar: HbarService
  }
}
export class HbarService extends Service {
  constructor(
    ctx: Context,
    public api: HbarAPI,
  ) {
    super(ctx, 'hbar')
  }
}
class CapabilityService<T> extends Service {
  constructor(
    ctx: Context,
    name: string,
    public value: T,
  ) {
    super(ctx, name)
  }
}
export function provide<T>(ctx: Context, name: string, value: T): void {
  new CapabilityService(ctx, name, value)
}
export function service<T>(ctx: Context, name: string): T {
  const slot = (ctx as unknown as Record<string, CapabilityService<T> | undefined>)[name]
  if (!slot) throw new Error(`Service unavailable: ${name}`)
  return slot.value
}
export interface PluginManifest {
  id: string
  /** npm-compatible package identity. Defaults to id for built-in plugins. */
  packageName?: string | undefined
  name: string
  version: string
  apiVersion: string
  description: string
  scope: ScopeKind
  /** Installation layer is independent from Cordis runtime scope. */
  installScope?: 'global' | 'project' | undefined
  required?: boolean | undefined
  restartRequired?: boolean | undefined
  provides?: Record<string, string> | undefined
  requires?: Record<string, string> | undefined
  optional?: Record<string, string> | undefined
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
  permissions: string[]
  clientEntry?: string | undefined
}
export interface HbarPlugin {
  manifest: PluginManifest
  configSchema?: z.ZodType<Record<string, unknown>>
  apply(ctx: Context, config: Record<string, unknown>): void | Promise<void>
}
export function definePlugin(plugin: HbarPlugin): HbarPlugin {
  return plugin
}
export interface ApprovalService {
  request(approval: Approval, signal: AbortSignal): Promise<boolean>
}
