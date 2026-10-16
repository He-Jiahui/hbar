import { Context, Service } from 'cordis'
import { HbarError, sessionEventPageInputSchema, sessionEventPageSchema } from '@hbar/contracts'
export type { DecisionContext, DecisionService } from './decision'
export { appendModelContext, prependModelInstructions } from './model-context'
export { SKILL_TOOL_NAMES } from './skills'
export { RunControlSignal, type GoalReplacementStop } from './run-control'
import type { GoalReplacementStop } from './run-control'
import type { ToolTimeoutPolicy } from './tool-timeout'
import type { OsConfinementOptions } from './execution-options'
import type { ToolPathArgument } from '@hbar/contracts/tool-arguments'
import type { GitRunContext, GitRunOperation, GitRunResult } from '@hbar/contracts/commands/git'
import type { NodeCallAuthority, nodeWorkspaceMethods } from '@hbar/contracts/node'
export { osConfinementOptionsSchema, type OsConfinementOptions } from './execution-options'
import type { z } from 'zod'
import type { ToolPresentationDeclaration } from '@hbar/contracts'
export type { ToolPresentationDeclaration } from '@hbar/contracts'
import type {
  Approval,
  ContentBlock,
  DiagnosticEvent,
  FileEntry,
  Message,
  ProviderConfig,
  Run,
  Session,
  SessionEvent,
  SessionEventPage,
  SessionEventPageInput,
  SessionSnapshot,
  TerminalContribution,
  ThreadGoal,
  PlanState,
  RunMode,
  ThinkingLevel,
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
  ToolWindowContribution,
  ToolProgress,
  ToolExecution,
  ToolOutcome,
  Usage,
  Workspace,
  SettingsContributionInput,
  TaskNotificationKind,
  WorkflowPlanItemInput,
  WorkflowFocusPlanItemInput,
  WorkflowCompletionPolicy,
  WorkflowScope,
  WorkflowSnapshot,
  WorkflowStartCommand,
  WorkflowTargetDispatch,
} from '@hbar/contracts'
import type { PeerMessageReceipt } from '@hbar/contracts/commands/run'
import type { BudgetReceipt, SetBudgetInput } from '@hbar/contracts/commands/budget'
import type {
  AgentCreateInput,
  AgentPage,
  AgentRecord,
  AgentSessionConfiguration,
  AgentDispatchConfiguration,
  AgentPolicySnapshot,
  AgentPolicySetInput,
} from '@hbar/contracts/commands/agents'
import type {
  ParsedWorkspaceFindInput,
  ParsedWorkspaceSearchInput,
  WorkspaceFindResult,
  WorkspaceReadResult,
  WorkspaceSearchResult,
} from '@hbar/contracts/workspace-query'

export { Context }
export { DEFAULT_TOOL_TIMEOUT_MS, resolveToolTimeoutMs, describeToolTimeout } from './tool-timeout'
export type { ToolTimeoutPolicy } from './tool-timeout'
export type Disposer = () => void | Promise<void>
export interface ManagedResourceRegistry {
  retain(resource: { kind: 'browser' | 'computer' | 'terminal'; id: string; sessionId: string }): Promise<Disposer>
}
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
  /** Optional measured facts, validated and persisted by the Host with the tool result. */
  activity?: import('@hbar/contracts/tool-activity').ToolActivity | undefined
  /** Exact versions written by this call, for a durable per-Run review and guarded undo. */
  fileChanges?: readonly import('@hbar/contracts/run-file-changes').ToolFileChange[] | undefined
  /** Host-owned failure metadata. The execution gateway overwrites any plugin-provided value. */
  hostFailure?: { code: string; executionStarted: boolean } | undefined
  /** Host-owned normal termination. Plugins cannot manufacture this at the execution gateway. */
  hostControl?: GoalReplacementStop | undefined
  /** Host-owned measured execution metadata; plugin values are replaced at the gateway. */
  execution?: ToolExecution | undefined
  /** Host-owned settlement; plugin values are replaced at the execution gateway. */
  outcome?: ToolOutcome | undefined
}
export interface ToolContext {
  session: Session
  workspace: Workspace
  run: Run
  signal: AbortSignal
  callId: string
  /** Host-owned execution deadline in milliseconds; aborting it does not cancel the parent Run. */
  timeoutMs?: number
  /** Host-owned parent identity; nested results stay out of the model's tool-call protocol. */
  parentCallId?: string
  /** One bounded, sequential batch through this Run's selected tools and normal execution gates. No recursion. */
  executeSequence?: (calls: readonly ToolSequenceCall[]) => Promise<readonly ToolSequenceResult[]>
  /** Report actual completed/total work. Host validates, coalesces, and closes this port on settlement. */
  reportProgress?: (progress: ToolProgress) => Promise<void>
  /** Report bounded transient process output; the final ToolResult remains the recovery source. */
  reportOutput?: (chunk: import('@hbar/contracts').ToolOutputChunk) => Promise<void>
  /** Host-owned variables for processes this call starts, from the Run's sandbox profile. */
  environment?: Readonly<Record<string, string>>
  /** Host-owned OS isolation requirement; unsupported execution backends must refuse it. */
  osConfinement?: OsConfinementOptions
  /** Host-owned identities, pinned sandbox and completed admission for workspace routing. */
  nodeAuthority?: NodeCallAuthority
}
/** Host-owned workspace identity and cancellation scope for resolving execution-owner paths. */
export interface WorkspaceExecutionScope {
  readonly workspace: Pick<Workspace, 'path' | 'location'>
  /** Absent only before the Host completes tool admission; execution effects require it. */
  readonly authority?: NodeCallAuthority
  readonly signal: AbortSignal
  /** Active-call sink for bounded remote process output; settled ToolResult is authoritative after recovery. */
  readonly reportOutput?: ((chunk: import('@hbar/contracts').ToolOutputChunk) => Promise<void>) | undefined
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
      arguments: readonly ToolPathArgument[]
    }
  | { kind: 'workspace' }
export interface ToolDefinition extends ToolTimeoutPolicy {
  name: string
  description: string
  inputSchema: z.ZodType
  /** Plain model-facing parameter description for an isolated driver; execution still validates inputSchema in its owner. */
  inputJsonSchema?: Readonly<Record<string, unknown>>
  /** Isolated tools validate in their owner before and after Hook transformation, before approval or durable intent. */
  validate?(args: unknown): Promise<Record<string, unknown>>
  /** Declared managed owner; admission retains capacity until this process confirms physical completion. */
  runtimeOwner?: string
  effect: 'read' | 'write' | 'process' | 'network'
  /** Declares a workspace operation whose implementation launches a process (for example Git). */
  requiresProcess?: boolean | undefined
  /** Requested-input display only; the Host captures this declaration, never localized text or execution proof. */
  presentation?: ToolPresentationDeclaration
  /** A dedicated user decision is required even when the Run permits ordinary tool calls. */
  humanApproval?: 'required'
  /** Explicit workspace access used by Workflow. Omission means no workspace path access. */
  workspaceAccess?: ToolWorkspaceAccess
  /**
   * Argument holding the command line a process tool runs. Sandbox command rules apply to it;
   * a process tool without one is always outside a sandbox profile.
   */
  commandArgument?: string
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
export interface ExecOptions {
  /** Process execution deadline in milliseconds. Defaults to 120 seconds. */
  readonly timeoutMs?: number | undefined
  /** Applied over the inherited environment; the Host never passes PATH or PATHEXT. */
  readonly environment?: Readonly<Record<string, string>> | undefined
  /**
   * When present, the command is launched inside an OS-level sandbox instead of the
   * current user's process context. An unavailable backend refuses execution.
   */
  readonly osConfinement?: OsConfinementOptions | undefined
  /** Forward the Host's admitted call unchanged when execution is routed to a workspace node. */
  readonly nodeAuthority?: NodeCallAuthority | undefined
  /** Receives bounded process output from a remote execution owner. */
  readonly onOutput?: ((text: string, reset?: boolean) => Promise<void> | void) | undefined
}
export interface ExecutionProvider {
  /** Resolve paths using their execution owner before sandbox admission. This performs no tool effect. */
  canonicalize?(
    workspace: string,
    paths: readonly string[],
    signal: AbortSignal,
  ): Promise<z.output<(typeof nodeWorkspaceMethods)['fs.canonicalize']['output']>>
  list(workspace: string, path: string): Promise<FileEntry[]>
  read(workspace: string, path: string): Promise<string>
  readBytes(workspace: string, path: string): Promise<Uint8Array>
  write(
    workspace: string,
    path: string,
    text: string,
    options?: { expectedRevision?: string },
  ): Promise<{ before: string; after: string; path: string; revision: string; created?: boolean }>
  /** Restore a bounded set of exact text versions after verifying every current version. */
  restoreFiles?(
    workspace: string,
    changes: readonly import('@hbar/contracts/run-file-changes').ToolFileChange[],
    signal: AbortSignal,
  ): Promise<void>
  exec(workspace: string, command: string, signal: AbortSignal, options?: ExecOptions): Promise<ToolResult>
  workspaceQuery?: WorkspaceQueryProvider
  dispose?(): void | Promise<void>
}
export interface WorkspaceQueryProvider {
  search(workspace: string, input: ParsedWorkspaceSearchInput, signal: AbortSignal): Promise<WorkspaceSearchResult>
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
    /** Actual execution root, including an isolated worktree or mounted workspace. */
    workspacePath?: string | undefined
    /** Captured Run tools after all selection hooks; context cannot advertise excluded capabilities. */
    selectedToolNames?: readonly string[] | undefined
    /** Context inspection decorates a read-only projection without admitting a model execution. */
    purpose?: 'execution' | 'context-inspection'
    runId?: string | undefined
    mode?: RunMode | undefined
    /** Pinned Run effort, including internal compaction requests. Omission uses the model default. */
    thinking?: ThinkingLevel | undefined
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
  /** Bounded observational model lifecycle metadata. Callback failures are ignored by the Host. */
  onModelDiagnostic?(event: ModelDiagnosticEvent): void
  /** Optional physical lifecycle: settle only after the original response body/I/O actually ends. */
  modelActivity?: {
    begin(): Promise<string>
    settle(requestId: string): Promise<void>
  }
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
  stepEnded(stepId: string): Promise<{ stop: 'goal_complete' | 'goal_replaced' } | void>
  /** Optional live steering source. Return the next unconsumed canonical,
   * already committed user messages for this exact Run, in sequence order,
   * at most 20 per read. The source owns its delivery cursor; do not rescan
   * compacted history as fresh steering. beforeRequest must include
   * them in authoritative history. Steering-capable drivers must not commit
   * user messages: the Host owns both the initial input and queue guidance.
   * Cancellation/Goal termination remain authoritative; this does not grant tool
   * permission, change the model, or admit queued operations by itself. */
  getSteeringMessages?(target: {
    readonly sessionId: string
    readonly runId: string
    readonly signal: AbortSignal
    /** Final natural-stop probe only. The source must atomically close this
     * Run's admission gate if no pending message remains, so a later Guide
     * cannot be accepted after the driver's last poll. Nonempty keeps it open. */
    readonly closeWhenEmpty?: true
  }): Promise<readonly Message[]>
  /** Seal live admission before leaving the loop on an explicit terminal
   * path (Goal, cancellation, provider/source failure). This does not replay
   * already accepted messages or start a replacement Run. */
  closeSteeringAdmission?(): Promise<void>
}
export interface DecisionCompletionRequest {
  readonly request: ModelRequest
  /** A per-call budget, separate from the self-normalizing provider configuration. */
  readonly maxOutputTokens: number
}
export interface HarnessDriver {
  /** Explicit opt-in; a Host must not admit live steering to a legacy driver
   * merely because DriverInput has an optional source callback. */
  readonly supportsCanonicalSteering?: boolean
  /** Also opts into closeWhenEmpty at the last natural-stop probe. Live queue
   * admission requires both capabilities; legacy polling alone is not safe. */
  readonly supportsSteeringAdmissionClosure?: boolean
  run(input: DriverInput): Promise<void>
  summarize(
    request: ModelRequest,
    apiKey: string | null,
    signal: AbortSignal,
    onDiagnostic?: (event: ModelDiagnosticEvent) => void,
  ): Promise<{ text: string; usage: Usage }>
  /** Toolless, bounded decision completion under the current Run's pinned model and ownership.
   * Older drivers can omit it; callers must then retain the human input request. */
  completeDecision?(
    completion: DecisionCompletionRequest,
    apiKey: string | null,
    signal: AbortSignal,
    onDiagnostic?: (event: ModelDiagnosticEvent) => void,
  ): Promise<{ text: string; usage: Usage }>
}

export interface ModelDiagnosticEvent {
  readonly phase: 'started' | 'response' | 'transport_failure' | 'settled' | 'failed' | 'cancelled'
  readonly purpose: 'model' | 'compaction' | 'decision'
  readonly providerId: string
  readonly modelSelectionId: string
  readonly modelRequestId?: string | undefined
  readonly attemptId?: string | undefined
  readonly upstreamRequestIdSha256?: string | undefined
  readonly httpStatus?: number | undefined
  readonly transportKind?: 'abort' | 'timeout' | 'connection' | 'unknown' | undefined
  readonly transportCode?:
    | 'ECONNREFUSED'
    | 'ConnectionRefused'
    | 'ECONNRESET'
    | 'ETIMEDOUT'
    | 'EAI_AGAIN'
    | 'ENOTFOUND'
    | 'ENETUNREACH'
    | 'EHOSTUNREACH'
    | 'EPIPE'
    | 'UND_ERR_CONNECT_TIMEOUT'
    | undefined
  readonly model: string
  readonly protocol: string
  readonly stopReason?: 'stop' | 'toolUse' | 'length' | 'aborted' | 'error' | undefined
  readonly errorCode?: string | undefined
  readonly failureKind?: DiagnosticEvent['failureKind'] | undefined
  readonly failurePhase?: DiagnosticEvent['failurePhase'] | undefined
  readonly streamSubtype?: DiagnosticEvent['streamSubtype'] | undefined
  readonly streamEventCount?: number | undefined
  readonly streamTextChars?: number | undefined
  readonly streamThinkingChars?: number | undefined
  readonly streamFirstEventMs?: number | undefined
  readonly streamLastEventMs?: number | undefined
  readonly streamErrorClass?: DiagnosticEvent['streamErrorClass'] | undefined
  readonly durationMs?: number | undefined
}
export interface SessionService {
  /** Host-owned layered settings bridge; plugins never reach into SettingsService or Storage internals. */
  agentConfiguration?: {
    read(sessionId: string, parentRunId?: string): Promise<AgentSessionConfiguration>
    initialize(sessionId: string, configuration: AgentDispatchConfiguration, actorId: string): Promise<void>
    policy(sessionId: string): Promise<AgentPolicySnapshot>
    setPolicy(
      input: AgentPolicySetInput,
      context: { actorId: string; idempotencyKey: string },
    ): Promise<AgentPolicySnapshot>
  }
  get(id: string): Promise<Session>
  list(workspaceId?: string): Promise<Session[]>
  children(parentId: string, after?: string, limit?: number): Promise<Session[]>
  events(id: string, after?: number, limit?: number): Promise<SessionEvent[]>
  readEventPage(input: SessionEventPageInput): Promise<SessionEventPage>
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
export interface SessionEventPageReadOptions {
  sessionId: string
  afterSeq?: number
  throughSeq?: number
  types: readonly string[]
  runIds?: readonly string[]
  headerOnlyTypes?: readonly string[]
  limit?: number
  maxReplyBytes?: number
  /** Maximum cumulative UTF-8 reply bytes yielded by one read. Defaults to 64 MiB. */
  maxTotalBytes?: number
}
/** Read a stable, bounded sequence of selected event pages and reject broken adapters/cursors. */
export async function* readSessionEventPages(
  sessions: Pick<SessionService, 'readEventPage'>,
  options: SessionEventPageReadOptions,
): AsyncGenerator<SessionEventPage> {
  let afterSeq = options.afterSeq ?? 0
  let throughSeq = options.throughSeq
  let totalEventCount: number | undefined
  let priorRemainingEventCount: number | undefined
  let previousPageItemCount: number | undefined
  let expectedMatchingEventCount: number | undefined
  let totalReplyBytes = 0
  const maxTotalBytes = options.maxTotalBytes ?? 64 * 1024 * 1024
  if (!Number.isSafeInteger(maxTotalBytes) || maxTotalBytes < 1 || maxTotalBytes > 256 * 1024 * 1024)
    throw new HbarError(
      'EVENT_PAGE_TOTAL_LIMIT',
      'Session event cumulative byte limit must be a safe integer up to 256 MiB',
    )
  while (true) {
    const request = sessionEventPageInputSchema.safeParse({
      sessionId: options.sessionId,
      afterSeq,
      ...(throughSeq === undefined ? {} : { throughSeq }),
      types: [...options.types],
      ...(options.runIds ? { runIds: [...options.runIds] } : {}),
      headerOnlyTypes: [...(options.headerOnlyTypes ?? [])],
      limit: options.limit ?? 500,
      maxReplyBytes: options.maxReplyBytes ?? 1_048_576,
    })
    if (!request.success) throw new HbarError('EVENT_PAGE_INVALID', 'Session event page request is invalid')
    const response = await sessions.readEventPage(request.data)
    if (!response || typeof response !== 'object')
      throw new HbarError('EVENT_PAGE_INVALID', 'Session event page adapter returned a non-object page')
    if (
      response.sessionId !== options.sessionId ||
      response.afterSeq !== afterSeq ||
      (response.hasMore && response.nextAfterSeq <= afterSeq)
    )
      throw new HbarError('EVENT_PAGE_CURSOR', 'Session event page adapter returned an invalid cursor')
    const parsedPage = sessionEventPageSchema.safeParse(response)
    if (!parsedPage.success)
      throw new HbarError('EVENT_PAGE_INVALID', 'Session event page adapter returned an invalid page')
    const page = parsedPage.data
    if (page.items.length > request.data.limit)
      throw new HbarError('EVENT_PAGE_LIMIT', 'Session event page adapter exceeded the requested item count')
    if (page.sessionId !== options.sessionId || page.afterSeq !== afterSeq)
      throw new HbarError('EVENT_PAGE_CURSOR', 'Session event page adapter returned a mismatched cursor')
    const pageBytes = new TextEncoder().encode(JSON.stringify(page)).byteLength
    if (pageBytes > request.data.maxReplyBytes)
      throw new HbarError(
        'EVENT_PAGE_REPLY_TOO_LARGE',
        'Session event page adapter exceeded the requested reply byte limit',
      )
    if (totalReplyBytes + pageBytes > maxTotalBytes)
      throw new HbarError('EVENT_PAGE_TOTAL_TOO_LARGE', 'Session event history exceeded the cumulative read byte limit')
    totalReplyBytes += pageBytes
    if (throughSeq === undefined) throughSeq = page.throughSeq
    else if (throughSeq !== page.throughSeq)
      throw new HbarError('EVENT_PAGE_HORIZON', 'Session event page horizon changed while reading')
    if (totalEventCount === undefined) totalEventCount = page.totalEventCount
    else if (totalEventCount !== page.totalEventCount)
      throw new HbarError('EVENT_PAGE_COUNT', 'Session event page total changed at a fixed horizon')
    if (
      page.totalEventCount < page.remainingEventCount ||
      page.matchingEventCount > page.remainingEventCount ||
      page.remainingEventCount < page.items.length ||
      page.matchingEventCount < page.items.length ||
      (priorRemainingEventCount !== undefined &&
        previousPageItemCount !== undefined &&
        page.remainingEventCount > priorRemainingEventCount - previousPageItemCount) ||
      (expectedMatchingEventCount !== undefined && page.matchingEventCount !== expectedMatchingEventCount)
    )
      throw new HbarError('EVENT_PAGE_COUNT', 'Session event page event counts are inconsistent')
    let lastItemSeq = afterSeq
    for (const item of page.items) {
      const event = item.event
      if (
        event.sessionId !== options.sessionId ||
        event.seq <= lastItemSeq ||
        event.seq > page.throughSeq ||
        !options.types.includes(event.type) ||
        (options.runIds && !options.runIds.includes(event.runId ?? '')) ||
        Boolean(options.headerOnlyTypes?.includes(event.type)) !== (item.kind === 'header')
      )
        throw new HbarError('EVENT_PAGE_ITEM', 'Session event page contains an invalid selected event')
      lastItemSeq = event.seq
    }
    if (
      (page.hasMore && (page.nextAfterSeq <= afterSeq || page.nextAfterSeq !== lastItemSeq)) ||
      (!page.hasMore && page.nextAfterSeq !== page.throughSeq) ||
      page.hasMore !== page.matchingEventCount > page.items.length
    )
      throw new HbarError('EVENT_PAGE_CURSOR', 'Session event page cursor did not advance')
    yield page
    if (!page.hasMore) return
    priorRemainingEventCount = page.remainingEventCount
    previousPageItemCount = page.items.length
    expectedMatchingEventCount = page.matchingEventCount - page.items.length
    afterSeq = page.nextAfterSeq
  }
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
  /** Read the canonical Session journal without accounting, continuation or external effects. */
  refreshSession?(sessionId: string): Promise<void>
  reconcileRun?(run: Run): Promise<void>
  recoveryReason?(run: Run): Promise<string | null>
  /** Restore active execution once the Host's providers and lifecycle gates are ready. */
  resumeOnStartup(): Promise<void>
  snapshot(sessionId: string): Promise<{ value: GoalToolResponse; seq: number }>
  get(sessionId: string): Promise<GoalToolResponse>
  create(
    sessionId: string,
    objective: string,
    tokenBudget?: number | null,
    runId?: string,
    startedAt?: number,
  ): Promise<GoalToolResponse>
  set(sessionId: string, input: GoalSetInput): Promise<GoalToolResponse>
  update(sessionId: string, status: 'complete' | 'blocked', runId?: string, reason?: string): Promise<GoalToolResponse>
  clear(sessionId: string, expectedGoalId?: string): Promise<{ cleared: boolean }>
  requestContinuation(
    sessionId: string,
    input: { goalId: string; trigger: string; modelId: string; text?: string },
  ): Promise<void>
}
export interface PlanService {
  refreshSession?(sessionId: string): Promise<void>
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
    item: WorkflowFocusPlanItemInput,
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
  prepareTargetDispatch(
    sessionId: string,
    planId: string,
    planRevision: number,
    itemIds: string[],
    modelId: string,
    command: WorkflowStartCommand,
  ): Promise<{ dispatches: WorkflowTargetDispatch[]; createdDispatchIds: string[] }>
  prepareTargetReconciliation(
    sessionId: string,
    planId: string,
    planRevision: number,
    dispatchIds: string[],
    actorId: string,
  ): Promise<{ dispatches: WorkflowTargetDispatch[]; retryDispatchIds: string[] }>
  recordTargetDispatchReceipt(
    sessionId: string,
    dispatchId: string,
    receipt: PeerMessageReceipt,
    runStartSeq: number,
  ): Promise<WorkflowSnapshot>
  recordTargetDispatchStale(sessionId: string, dispatchId: string, reason: string): Promise<WorkflowSnapshot>
  recordTargetDispatchFailure(
    sessionId: string,
    dispatchId: string,
    errorCode: string,
    outcome: 'known_failure' | 'unknown',
  ): Promise<WorkflowSnapshot>
  recordTargetRunStatus(
    sessionId: string,
    dispatchId: string,
    status: 'queued' | 'running' | 'waiting_approval' | 'cancel_requested' | 'succeeded' | 'failed' | 'cancelled',
    runStatus?: 'completed' | 'failed' | 'cancelled' | 'interrupted',
    error?: string | null,
  ): Promise<WorkflowSnapshot>
  prepareTargetCancellation(
    sessionId: string,
    planId: string,
    planRevision: number,
    dispatchId: string,
    actorId: string,
  ): Promise<WorkflowTargetDispatch>
  recordTargetCancellation(
    sessionId: string,
    dispatchId: string,
    status: 'cancel_requested' | 'succeeded' | 'cancelled' | 'failed',
    errorCode?: string,
    terminalRunStatus?: 'completed' | 'failed' | 'cancelled' | 'interrupted',
  ): Promise<WorkflowSnapshot>
}
export interface ModeService {
  get(sessionId: string): Promise<{ mode: RunMode }>
  set(sessionId: string, mode: RunMode): Promise<{ mode: RunMode }>
  effectiveMode(run: Run): RunMode | Promise<RunMode>
  /** Serialize the approved Run transition with ordinary session mode writes. */
  commitExit<T extends { modeEvent: SessionEvent | null }>(sessionId: string, commit: () => Promise<T>): Promise<T>
}
export interface BudgetService {
  /** Settle already recorded usage without ending the current Run or inventing a model step. */
  accountPendingUsage?(sessionId: string, runId: string): Promise<void>
  refreshSession?(sessionId: string): Promise<void>
  reconcileRun?(run: Run): Promise<void>
  get(sessionId: string): Promise<SessionBudget | null>
  set(sessionId: string, limit: number): Promise<SessionBudget>
  setCommand(
    input: SetBudgetInput,
    context: { actorId: string; idempotencyKey: string; requestId: string },
  ): Promise<BudgetReceipt>
  getCommandReceipt(sessionId: string, actorId: string, idempotencyKey: string): Promise<BudgetReceipt | null>
  clear(sessionId: string): Promise<{ cleared: boolean }>
  assertCanStart(sessionId: string, source?: import('@hbar/contracts').RunSource): Promise<void>
}
export interface AgentService {
  policy(parentSessionId: string): Promise<AgentPolicySnapshot>
  setPolicy(
    input: AgentPolicySetInput,
    context: { actorId: string; idempotencyKey: string },
  ): Promise<AgentPolicySnapshot>
  create(
    input: AgentCreateInput,
    context: { actorId: string; idempotencyKey: string; requestId: string; parentRunId?: string },
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
  /** Restrict the diff to the execution cwd, use literal pathspecs, and disable external rename/textconv output. */
  scope?: 'execution-root' | undefined
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
export interface GitPathOptions {
  paths: string[]
}
export type GitBranchOperation =
  | { operation?: 'list' | undefined }
  | { operation: 'create' | 'switch' | 'delete'; name: string; force?: boolean | undefined }
export type GitWorktreeOperation =
  | { operation?: 'list' | undefined }
  | {
      operation: 'add'
      path: string
      branch?: string | undefined
      createBranch?: boolean | undefined
      startPoint?: string | undefined
    }
  | { operation: 'remove'; path: string; force?: boolean | undefined }

export type GitLaunchBranchHead =
  | { kind: 'branch'; ref: string; name: string; oid: string }
  | { kind: 'detached'; oid: string }
  | { kind: 'unborn'; ref: string; name: string }
  | { kind: 'symbolic'; ref: string; oid: string | null }

export interface GitLaunchBranchReference {
  readonly name: string
  readonly ref: string
  readonly oid: string
  readonly current: boolean
  readonly worktree: 'current' | 'elsewhere' | 'available' | 'unknown'
}

/** A bounded local-ref view for pre-session launch selection; it never contains filesystem paths. */
export interface GitLaunchBranchSnapshot {
  readonly repository:
    | { kind: 'not-repository' }
    | {
        kind: 'repository'
        /** Whether the registered workspace itself is the Git root or a subdirectory. */
        workspaceScope: 'repository-root' | 'repository-subdirectory'
        head: GitLaunchBranchHead
      }
  readonly branches: readonly GitLaunchBranchReference[]
  readonly incomplete: boolean
}

export interface GitLaunchBranchCreateInput {
  readonly name: string
  readonly baseRef: string
  readonly expectedBaseOid: string
}

export interface GitLaunchBranchCreateResult {
  readonly ref: string
  readonly oid: string
}

export interface GitService {
  /** Captured source context pins cwd and automatic commit attribution for a command invocation. */
  forRun?(operation: GitRunOperation, context: GitRunContext, signal?: AbortSignal): Promise<GitRunResult>
  info(cwd?: string, signal?: AbortSignal): Promise<GitInfo>
  status(cwd?: string, signal?: AbortSignal): Promise<GitStatus>
  diff(cwd?: string, options?: GitDiffOptions, signal?: AbortSignal): Promise<GitDiff>
  log(cwd?: string, limit?: number, signal?: AbortSignal): Promise<GitCommitInfo[]>
  stats(cwd: string | undefined, options: GitStatsOptions, signal?: AbortSignal): Promise<GitStatsReport>
  commit(cwd: string | undefined, options: GitCommitOptions, signal?: AbortSignal): Promise<GitCommitInfo>
  stage(cwd: string | undefined, paths: string[], signal?: AbortSignal): Promise<GitPathOptions>
  unstage(cwd: string | undefined, paths: string[], signal?: AbortSignal): Promise<GitPathOptions>
  branch(
    cwd: string | undefined,
    operation?: GitBranchOperation,
    signal?: AbortSignal,
  ): Promise<GitBranchInfo[] | GitBranchInfo>
  /** Creates only a local branch ref from a captured local base ref/OID; does not switch HEAD. */
  createLaunchBranch?(
    cwd: string | undefined,
    input: GitLaunchBranchCreateInput,
    signal?: AbortSignal,
  ): Promise<GitLaunchBranchCreateResult>
  worktree(
    cwd: string | undefined,
    operation?: GitWorktreeOperation,
    signal?: AbortSignal,
  ): Promise<GitWorktreeInfo[] | GitWorktreeInfo>
  launchBranchSnapshot(cwd?: string, signal?: AbortSignal): Promise<GitLaunchBranchSnapshot>
  diffToRemote(
    cwd?: string,
    signal?: AbortSignal,
    paths?: string[],
  ): Promise<{ sha: string; diff: string; truncated: boolean } | null>
}
export interface BrowserUseService {
  status(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<{ available: boolean; contexts: BrowserPage[]; history: string[] }>
  navigate(
    sessionId: string,
    url: string,
    contextId?: string,
    pageId?: string,
    signal?: AbortSignal,
  ): Promise<BrowserPage>
  go(
    sessionId: string,
    action: 'back' | 'forward' | 'reload',
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
  status(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<{ available: boolean; platform: string; appId: string | null }>
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
  /** Layered settings override the legacy plugin threshold when explicitly saved. */
  shouldCompact(request: ModelRequest, thresholdRatio?: number): boolean
  readonly thresholdRatio?: number
  retainMessages: number
}
export interface HookEvents {
  'context.build': ModelRequest
  'model.request': ModelRequest
  'tool.before': { name: string; args: Record<string, unknown>; context: ToolContext; tool: ToolDefinition }
  /** Validated final arguments, before policy/approval/intent. Failure denies admission; returned changes are ignored. */
  'tool.admitting': { name: string; args: Record<string, unknown>; context: ToolContext; tool: ToolDefinition }
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
  'step.end': { sessionId: string; runId: string; stepId: string; stop?: 'goal_complete' | 'goal_replaced' }
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
  'session.continuationFailed': { sessionId: string; requestId: string; unknown: boolean; code?: string }
  /** Published after the session budget fact has been committed. */
  'budget.committed': { sessionId: string; budget: SessionBudget | null }
  /** Goal or other lifecycle owners may veto budget-only continuation without a reverse service dependency. */
  'budget.beforeContinue': { sessionId: string; runId: string; allowed: boolean }
  /** A completed Plan with explicit automation enabled delegates Goal execution to its lifecycle owner. */
  'plan.implementationRequested': { sessionId: string; run: Run; objective: string; unattended: boolean }
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
    /** Omitted checks new acceptance; recovery/accepted check controls without granting authority. */
    purpose?: 'recovery' | 'accepted'
    /** Disabled keeps the intent waiting; it must not clear the Goal or its remaining budgets. */
    reason?: 'workflow_wait' | 'repair' | 'disabled'
    recoveryKey?: string
  }
  'goal.replaced': { sessionId: string; previous: ThreadGoal; goal: ThreadGoal; supersededRunIds?: readonly string[] }
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
  /** Managed owners hydrate projections; reconciliation belongs to the stable recovery coordinator. */
  restoreMode?: 'projection' | undefined
  tools: ToolRegistry
  hooks: HookRegistry
  sessions: SessionService
  userInput: UserInputService
  notify(event: import('@hbar/contracts').WireNotification): void
  taskNotification?(
    kind: TaskNotificationKind,
    sessionId: string,
    runId: string | null,
    title: string,
    message: string,
  ): Promise<void>
  changed(kind: string): void
  automationSet?(
    sessionId: string,
    unattended?: boolean,
    goalEnabled?: boolean,
  ): Promise<import('@hbar/contracts').AutomationState>
  panels: { register(panel: Omit<ToolWindowContribution, 'owner'>): Disposer }
  /** Optional stable lifecycle port. Executable/native handles remain in this plugin process. */
  resources?: ManagedResourceRegistry
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
        panels: ToolWindowContribution[]
        renderers: Record<string, unknown>[]
        settings?: SettingsContributionInput | undefined
        theme?:
          | {
              id: string
              title: string
              description?: string | undefined
              preview?: string | undefined
              priority?: number | undefined
              tokenOverrides: Record<string, unknown>
              surfaceEffects?: Record<string, unknown> | undefined
              motion?: Record<string, unknown> | undefined
              backgroundAssets?: string[] | undefined
            }
          | undefined
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
