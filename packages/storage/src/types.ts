import type {
  Approval,
  ArtifactRef,
  ContentBlock,
  Device,
  Message,
  ProviderConfig,
  Run,
  RunStatus,
  RunFailure,
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
import type { ActiveOperationsInput, ActiveOperationsPage, RunCommandRecord } from '@hbar/contracts/commands/run'
import type { UsageReadInput, UsageReadPage } from '@hbar/usage'
import type { GoalHistoryInput, GoalHistoryPage } from '@hbar/contracts/commands/goal-history'
import type {
  SessionRecentInput,
  SessionRecentPage,
  SessionSearchInput,
  SessionSearchPage,
} from '@hbar/contracts/commands/session-search'
import type {
  WorkspaceOrganizationApplyInput,
  WorkspaceOrganizationReceipt,
  WorkspaceOrganizationSnapshot,
} from '@hbar/contracts/commands/workspace-organization'

import type {
  WorkspaceDisplayNamesApplyInput,
  WorkspaceDisplayNamesReceipt,
  WorkspaceDisplayNamesSnapshot,
} from '@hbar/contracts/commands/workspace-display-names'

export interface WorkspaceOrganizationMutationInput {
  actorId: string
  idempotencyKey: string
  request: WorkspaceOrganizationApplyInput
}

export interface WorkspaceDisplayNamesMutationInput {
  actorId: string
  idempotencyKey: string
  request: WorkspaceDisplayNamesApplyInput
}

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

export interface ForkFromMessageCommandInput {
  actorId: string
  idempotencyKey: string
  sessionId: string
  messageId: string
}

export interface ForkFromMessageReceiptInput extends ForkFromMessageCommandInput {}

export interface ForkableMessagesInput {
  sessionId: string
  messageIds: string[]
}
export interface ForkableMessagesResult {
  sessionId: string
  items: {
    messageId: string
    eligible: boolean
    reason: 'ready' | 'not_found' | 'invalid_target' | 'busy' | 'invalid_boundary' | 'scan_limit'
  }[]
}

export interface StorageMethods {
  ready(): { version: number }
  searchIndexStatus(): { complete: boolean }
  searchIndexStep(): { complete: boolean }
  recentSessions(input: SessionRecentInput): SessionRecentPage
  searchSessions(input: SessionSearchInput): SessionSearchPage
  createWorkspace(path: string, name: string): Workspace
  workspaces(): Workspace[]
  workspacePage(input: WorkspaceListInput): WorkspacePage
  sessionPage(input: SessionListInput): SessionPage
  findWorkspace(id: string): Workspace | null
  workspaceOrganization(): WorkspaceOrganizationSnapshot
  applyWorkspaceOrganization(input: WorkspaceOrganizationMutationInput): WorkspaceOrganizationReceipt
  workspaceOrganizationReceipt(input: WorkspaceOrganizationMutationInput): WorkspaceOrganizationReceipt | null
  workspaceDisplayNames(): WorkspaceDisplayNamesSnapshot
  applyWorkspaceDisplayNames(input: WorkspaceDisplayNamesMutationInput): WorkspaceDisplayNamesReceipt
  workspaceDisplayNamesReceipt(input: WorkspaceDisplayNamesMutationInput): WorkspaceDisplayNamesReceipt | null
  findSession(id: string): Session | null
  workspace(id: string): Workspace
  createSession(workspaceId: string, title?: string, parentId?: string): Session
  createSessionCommand(input: CreateSessionCommandInput): Session
  sessions(): Session[]
  childSessions(parentId: string, after?: string, limit?: number): Session[]
  session(id: string): Session
  updateSession(
    id: string,
    update: { title?: string; archived?: boolean; expectedTitle?: string },
  ): { session: Session; event: SessionEvent | null }
  append(sessionId: string, type: string, data: unknown, runId?: string, stepId?: string): SessionEvent
  events(sessionId: string, after: number, limit?: number): SessionEvent[]
  goalHistory(input: GoalHistoryInput): GoalHistoryPage
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
  activeOperations(input: ActiveOperationsInput): ActiveOperationsPage
  context(sessionId: string): { messages: Message[]; summary: string | null; throughSeq: number }
  compact(sessionId: string, throughSeq: number, summary: string, modelId: string): SessionEvent
  fork(sessionId: string, atSeq?: number): Session
  forkSessionCommand(input: ForkSessionCommandInput): Session
  forkFromMessageCommand(input: ForkFromMessageCommandInput): Session
  forkFromMessageReceipt(input: ForkFromMessageReceiptInput): Session | null
  forkableMessages(input: ForkableMessagesInput): ForkableMessagesResult
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
  setRun(id: string, status: RunStatus, error?: string, failure?: RunFailure): SessionEvent
  queuedSessions(): string[]
  createApproval(approval: Approval): SessionEvent
  resolveApproval(id: string, status: Approval['status']): { approval: Approval; event: SessionEvent } | null
  resolvePlanExit(
    id: string,
    sessionId: string,
    runId: string,
    callId: string,
    decision: 'implement' | 'continue',
    feedback: string | undefined,
    actorId: string,
  ): { approval: Approval; event: SessionEvent; modeEvent: SessionEvent | null }
  approval(id: string): Approval
  toolStart(sessionId: string, runId: string, callId: string, name: string, args: unknown): SessionEvent
  toolEnd(sessionId: string, runId: string, callId: string, failed?: boolean): SessionEvent | null
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
