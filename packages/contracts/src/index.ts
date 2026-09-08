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
export const inputSchema = z.object({
  text: z.string().max(200_000),
  images: z.array(artifactSchema).max(12).default([]),
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
export interface SessionEvent {
  eventId: string
  sessionId: string
  seq: number
  runId: string | null
  stepId: string | null
  type: string
  data: unknown
  time: number
  version: 1
}
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
}
export interface SessionSnapshot {
  session: Session
  messages: Message[]
  runs: Run[]
  approvals: Approval[]
  usage: Usage
  cursor: number
  hasOlder: boolean
  streams: LiveStream[]
}
export const providerSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  name: z.string().min(1).max(100),
  protocol: z.enum(['openai-completions', 'openai-responses', 'anthropic-messages', 'mock']),
  baseUrl: z.string().url(),
  model: z.string().min(1).max(160),
  contextWindow: z.number().int().min(1024).max(10_000_000).default(128_000),
  maxOutput: z.number().int().min(64).max(1_000_000).default(8192),
  imageInput: z.boolean().default(false),
  reasoning: z.boolean().default(false),
  inputPrice: z.number().nonnegative().default(0),
  outputPrice: z.number().nonnegative().default(0),
})
export type ProviderConfig = z.infer<typeof providerSchema>
export interface ModelInfo extends ProviderConfig {
  hasKey: boolean
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
  name: string
  version: string
  required: boolean
  status: PluginStatus
  provides: string[]
  requires: string[]
  description: string
  config: Record<string, unknown>
  error?: string
  clientEntry?: string
}
export interface UIContribution {
  id: string
  title: string
  placement: 'left' | 'right' | 'bottom' | 'editor'
  kind: 'json' | 'markdown'
  content: string
  owner: string
}
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
  | { method: 'stream.update'; params: LiveStream }
  | { method: 'host.changed'; params: { kind: string } }
  | { method: 'auth.revoked'; params: { reason: string } }

export const rpcSchemas = {
  'system.hello': z.object({ protocol: z.literal(PROTOCOL_VERSION), token: z.string().max(512).optional() }),
  'system.bootstrap': z.object({}),
  'system.diagnose': z.object({}),
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
  'context.compact': z.object({ sessionId: idSchema, modelId: idSchema }),
  'provider.save': z.object({ provider: providerSchema, apiKey: z.string().max(8192).optional() }),
  'provider.delete': z.object({ id: idSchema }),
  'plugin.set': z.object({ id: idSchema, enabled: z.boolean(), config: z.record(z.string(), z.unknown()).optional() }),
  'plugin.install': z.object({ path: z.string().min(1).max(4000) }),
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
  'context.compact': { summary: string }
  'provider.save': ModelInfo
  'provider.delete': null
  'plugin.set': PluginInfo[]
  'plugin.install': PluginInfo[]
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
  ) {
    super(message)
    this.name = 'HbarError'
  }
}
