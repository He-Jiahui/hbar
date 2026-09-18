import type {
  Approval,
  ArtifactRef,
  ContentBlock,
  Device,
  Message,
  ProviderConfig,
  Run,
  RunStatus,
  Session,
  SessionEvent,
  SessionSnapshot,
  UserInput,
  Workspace,
  WorkspaceListInput,
  SessionListInput,
  WorkspacePage,
  SessionPage,
} from '@hbar/contracts'
import type { RunCommandRecord } from '@hbar/contracts/commands/run'
import type { UsageReadInput, UsageReadPage } from '@hbar/usage'

export interface StoredSettingsLayer {
  id: string
  kind: string
  targetId: string | null
  schemaVersion: number
  revision: number
  values: Record<string, unknown>
}
export interface SettingsCommitReceipt {
  commitId: string
  layerId: string
  revision: number
  schemaVersion: number
  values: Record<string, unknown>
  resolution: unknown
}
export interface SettingsCommitInput {
  actorId: string
  idempotencyKey: string
  payloadHash: string
  layer: Omit<StoredSettingsLayer, 'revision'>
  expectedRevisions: Record<string, number>
  receipt: Omit<SettingsCommitReceipt, 'revision' | 'values'>
}

export interface CreateSessionCommandInput {
  actorId: string
  idempotencyKey: string
  workspaceId: string
  title?: string | undefined
}

export interface ForkSessionCommandInput {
  actorId: string
  idempotencyKey: string
  sessionId: string
  atSeq?: number | undefined
}

export interface StorageMethods {
  ready(): { version: number }
  createWorkspace(path: string, name: string): Workspace
  workspaces(): Workspace[]
  workspacePage(input: WorkspaceListInput): WorkspacePage
  sessionPage(input: SessionListInput): SessionPage
  findWorkspace(id: string): Workspace | null
  findSession(id: string): Session | null
  workspace(id: string): Workspace
  createSession(workspaceId: string, title?: string, parentId?: string): Session
  createSessionCommand(input: CreateSessionCommandInput): Session
  sessions(): Session[]
  childSessions(parentId: string, after?: string, limit?: number): Session[]
  session(id: string): Session
  updateSession(id: string, update: { title?: string; archived?: boolean }): { session: Session; event: SessionEvent }
  append(sessionId: string, type: string, data: unknown, runId?: string, stepId?: string): SessionEvent
  events(sessionId: string, after: number, limit?: number): SessionEvent[]
  usageEvents(input: UsageReadInput): UsageReadPage
  commit(
    sessionId: string,
    runId: string,
    role: Message['role'],
    content: ContentBlock[],
    messageId?: string,
    providerData?: unknown,
  ): { message: Message; event: SessionEvent }
  snapshot(sessionId: string, before?: number, limit?: number): SessionSnapshot
  context(sessionId: string): { messages: Message[]; summary: string | null; throughSeq: number }
  compact(sessionId: string, throughSeq: number, summary: string, modelId: string): SessionEvent
  fork(sessionId: string, atSeq?: number): Session
  forkSessionCommand(input: ForkSessionCommandInput): Session
  enqueue(
    sessionId: string,
    requestId: string,
    input: UserInput,
    modelId: string,
    command?: RunCommandRecord,
  ): Run & { queuedEvent?: SessionEvent | undefined }
  runByRequest(sessionId: string, requestId: string): { run: Run; command: RunCommandRecord | null } | null
  claim(sessionId: string): Run | null
  run(id: string): Run
  requestCancel(id: string): { run: Run; event: SessionEvent | null }
  cancelRequested(id: string): boolean
  setRun(id: string, status: RunStatus, error?: string): SessionEvent
  queuedSessions(): string[]
  createApproval(approval: Approval): SessionEvent
  resolveApproval(id: string, status: Approval['status']): { approval: Approval; event: SessionEvent } | null
  approval(id: string): Approval
  toolStart(sessionId: string, runId: string, callId: string, name: string, args: unknown): SessionEvent
  toolEnd(sessionId: string, runId: string, callId: string): void
  recover(): number
  saveProvider(provider: ProviderConfig): void
  providers(): ProviderConfig[]
  deleteProvider(id: string): void
  putArtifact(artifact: ArtifactRef): void
  artifact(id: string): ArtifactRef
  putDevice(device: Device, tokenHash: string): void
  deviceByHash(hash: string): Device | null
  devices(): Device[]
  revokeDevice(id: string): void
  setPlugin(id: string, enabled: boolean, config: Record<string, unknown>, path?: string): void
  setPlugins(
    plugins: { id: string; enabled: boolean; config: Record<string, unknown>; path?: string | undefined }[],
  ): void
  removePlugin(id: string): void
  plugins(): { id: string; enabled: boolean; config: Record<string, unknown>; path: string | null }[]
  stats(): Record<string, number>
  getSetting(key: string): string | null
  setSetting(key: string, value: string): void
  settingsLayers(ids: string[]): StoredSettingsLayer[]
  settingsReceipt(
    actorId: string,
    idempotencyKey: string,
  ): { payloadHash: string; receipt: SettingsCommitReceipt } | null
  commitSettings(input: SettingsCommitInput): SettingsCommitReceipt
  close(): void
}
export type StorageCall = {
  [K in keyof StorageMethods]: { id: number; method: K; args: Parameters<StorageMethods[K]> }
}[keyof StorageMethods]
export type StorageReply =
  { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string; code: string }
