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
} from '@hbar/contracts'

export interface StorageMethods {
  ready(): { version: number }
  createWorkspace(path: string, name: string): Workspace
  workspaces(): Workspace[]
  workspace(id: string): Workspace
  createSession(workspaceId: string, title?: string, parentId?: string): Session
  sessions(): Session[]
  session(id: string): Session
  updateSession(id: string, update: { title?: string; archived?: boolean }): { session: Session; event: SessionEvent }
  append(sessionId: string, type: string, data: unknown, runId?: string, stepId?: string): SessionEvent
  events(sessionId: string, after: number, limit?: number): SessionEvent[]
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
  enqueue(
    sessionId: string,
    requestId: string,
    input: UserInput,
    modelId: string,
  ): Run & { queuedEvent?: SessionEvent | undefined }
  claim(sessionId: string): Run | null
  run(id: string): Run
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
  setPlugins(plugins: { id: string; enabled: boolean; config: Record<string, unknown>; path?: string | undefined }[]): void
  removePlugin(id: string): void
  plugins(): { id: string; enabled: boolean; config: Record<string, unknown>; path: string | null }[]
  stats(): Record<string, number>
  getSetting(key: string): string | null
  setSetting(key: string, value: string): void
  close(): void
}
export type StorageCall = {
  [K in keyof StorageMethods]: { id: number; method: K; args: Parameters<StorageMethods[K]> }
}[keyof StorageMethods]
export type StorageReply =
  { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string; code: string }
