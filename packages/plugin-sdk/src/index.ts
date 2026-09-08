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
  ThreadGoal,
  PlanState,
  RunMode,
  GoalStatus,
  PlanStep,
  UserInput,
  UIContribution,
  Usage,
  Workspace,
} from '@hbar/contracts'

export { Context }
export type Disposer = () => void | Promise<void>
export type ScopeKind = 'host' | 'workspace' | 'session' | 'run' | 'client'
export type ToolResultContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
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
  write(workspace: string, path: string, text: string): Promise<{ before: string; after: string; path: string }>
  exec(workspace: string, command: string, signal: AbortSignal): Promise<ToolResult>
}
export interface PolicyProvider {
  decide(tool: ToolDefinition, args: Record<string, unknown>, context: ToolContext): Promise<'allow' | 'ask' | 'deny'>
}
export interface ModelRequest {
  system: string
  messages: Message[]
  model: ProviderConfig
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
  create(sessionId: string, objective: string, tokenBudget?: number): Promise<GoalToolResponse>
  set(sessionId: string, input: GoalSetInput): Promise<GoalToolResponse>
  update(sessionId: string, status: 'complete' | 'blocked', runId?: string): Promise<GoalToolResponse>
  clear(sessionId: string): Promise<{ cleared: boolean }>
}
export interface PlanService {
  get(sessionId: string): Promise<PlanState | null>
  update(
    sessionId: string,
    plan: PlanStep[],
    explanation?: string | null,
    turnId?: string | null,
  ): Promise<PlanState>
  clear(sessionId: string): Promise<{ cleared: boolean }>
}
export interface ModeService {
  get(sessionId: string): Promise<{ mode: RunMode }>
  set(sessionId: string, mode: RunMode): Promise<{ mode: RunMode }>
}
export interface CompactionProvider {
  shouldCompact(request: ModelRequest): boolean
  retainMessages: number
}
export interface HookEvents {
  'context.build': ModelRequest
  'model.request': ModelRequest
  'tool.before': { name: string; args: Record<string, unknown>; context: ToolContext }
  'tool.after': { name: string; result: ToolResult; context: ToolContext }
  'step.end': { sessionId: string; runId: string; stepId: string }
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
  notify(event: import('@hbar/contracts').WireNotification): void
  changed(kind: string): void
  panels: { register(panel: Omit<UIContribution, 'owner'>): Disposer }
  service<T>(name: string): T
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
