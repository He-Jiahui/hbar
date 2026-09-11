import { Context, Service } from 'cordis'
import type { z } from 'zod'
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
} from '@hbar/contracts'

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
}
export interface ToolContext {
  session: Session
  workspace: Workspace
  run: Run
  signal: AbortSignal
  callId: string
}
export interface ToolDefinition {
  name: string
  description: string
  inputSchema: z.ZodType
  effect: 'read' | 'write' | 'process' | 'network'
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
  write(
    workspace: string,
    path: string,
    text: string,
    options?: { expectedRevision?: string },
  ): Promise<{ before: string; after: string; path: string; revision: string }>
  exec(workspace: string, command: string, signal: AbortSignal): Promise<ToolResult>
}
export interface PolicyProvider {
  decide(tool: ToolDefinition, args: Record<string, unknown>, context: ToolContext): Promise<'allow' | 'ask' | 'deny'>
}
export interface ModelRequest {
  system: string
  messages: Message[]
  model: ProviderConfig
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
  emit(type: string, data: unknown, stepId?: string): Promise<SessionEvent>
  commit(role: Message['role'], content: ContentBlock[], messageId?: string, providerData?: unknown): Promise<Message>
  stream(id: string, text: string, thinking: string): void
  execute(name: string, args: Record<string, unknown>, callId: string): Promise<ToolResult>
  beforeRequest(request: ModelRequest, stepId: string): Promise<ModelRequest>
  stepEnded(stepId: string): Promise<void>
}
export interface HarnessDriver {
  run(input: DriverInput): Promise<void>
  summarize(request: ModelRequest, apiKey: string | null, signal: AbortSignal): Promise<{ text: string; usage: Usage }>
}
export interface SessionService {
  get(id: string): Promise<Session>
  list(workspaceId?: string): Promise<Session[]>
  events(id: string, after?: number, limit?: number): Promise<SessionEvent[]>
  create(workspaceId: string, title?: string): Promise<Session>
  submit(sessionId: string, requestId: string, input: UserInput, modelId: string): Promise<Run>
  cancel(runId: string): Promise<void>
  snapshot(sessionId: string): Promise<SessionSnapshot>
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
  get(sessionId: string): Promise<GoalToolResponse>
  create(sessionId: string, objective: string, tokenBudget?: number, runId?: string, startedAt?: number): Promise<GoalToolResponse>
  set(sessionId: string, input: GoalSetInput): Promise<GoalToolResponse>
  update(sessionId: string, status: 'complete' | 'blocked', runId?: string): Promise<GoalToolResponse>
  clear(sessionId: string): Promise<{ cleared: boolean }>
}
export interface PlanService {
  get(sessionId: string): Promise<PlanState | null>
  update(sessionId: string, plan: PlanStep[], explanation?: string | null, turnId?: string | null): Promise<PlanState>
  clear(sessionId: string): Promise<{ cleared: boolean }>
}
export interface ModeService {
  get(sessionId: string): Promise<{ mode: RunMode }>
  set(sessionId: string, mode: RunMode): Promise<{ mode: RunMode }>
}
export interface BudgetService {
  get(sessionId: string): Promise<SessionBudget | null>
  set(sessionId: string, limit: number): Promise<SessionBudget>
  clear(sessionId: string): Promise<{ cleared: boolean }>
}
export interface GitDiffOptions {
  cached?: boolean | undefined
  paths?: string[] | undefined
}
export interface GitCommitOptions {
  message: string
  paths?: string[] | undefined
  stage?: boolean | undefined
}
export interface GitPathOptions {
  paths: string[]
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
  commit(cwd: string | undefined, options: GitCommitOptions, signal?: AbortSignal): Promise<GitCommitInfo>
  stage(cwd: string | undefined, paths: string[], signal?: AbortSignal): Promise<GitPathOptions>
  unstage(cwd: string | undefined, paths: string[], signal?: AbortSignal): Promise<GitPathOptions>
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
  'tool.after': { name: string; result: ToolResult; context: ToolContext }
  'step.end': { sessionId: string; runId: string; stepId: string }
  'run.start': { sessionId: string; runId: string; run: Run }
  'run.end': { sessionId: string; runId: string; status: Run['status']; run: Run }
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
