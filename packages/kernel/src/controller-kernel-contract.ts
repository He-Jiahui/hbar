/** Public structural contract. It must never derive from the executable Kernel class. */
import type * as C from '@hbar/contracts'
import type { SessionContextUsage } from '@hbar/contracts/commands/models'
import type { AutonomyRetryAdmission } from '@hbar/contracts/autonomy-retry'
import type { AutomaticPlanExitDecision, AutomaticToolApprovalDecision } from '@hbar/contracts/autonomy'
import type { StorageLocationApply } from '@hbar/contracts/commands/storage-locations'
import type { ChatDatabaseSkipReason } from '@hbar/contracts/commands/chat-database'
import type {
  RunCommandRecord,
  QueuedRunEditTextInput,
  QueuedRunRemoveInput,
  QueuedRunGuideInput,
  QueuedRunGuideReceipt,
} from '@hbar/contracts/commands/run'
import type {
  PathLayout,
  StoragePort,
  StorageFatalEvent,
  RuntimeManualRecovery,
  SessionBranchTargetIdentity,
  SessionLaunchTargetMutationInput,
  SessionLaunchTargetPreparationStartMutationInput,
  ChatDatabaseDeleteInput,
  ChatDatabaseDeleteResult,
  ChatDatabaseResourceResult,
  getStorageLocations,
  applyStorageLocations,
} from '@hbar/storage'
import type {
  SessionLaunchTargetPreparationOperationInput,
  SessionLaunchTargetPreparationSnapshot,
  SessionLaunchTargetPreparationStartReceipt,
} from '@hbar/contracts/commands/session-launch-target'
import type { SessionBranchTargetSelectInput } from '@hbar/contracts/commands/session-branch-target'
import type { SandboxProfileService } from './sandbox-service'
import type { WorkspaceSandboxService } from './workspace-sandbox'
import type { SessionLaunchTargetService } from './session-launch-target-service'
import type { SessionBranchTargetService } from './session-branch-target-service'
import type { createDirectoryQueries } from './directory-queries'
import type { createSchemaCallbackRegistry } from '@hbar/schema-core'
import type { PluginManager } from './plugins'
import type { NodeWorkspaceInspectionPort } from './node-workspace-inspection'
import type { ArtifactUploadOptions } from './artifact-upload'
import type { ChatDatabaseResourceRequest } from './chat-database-resources'
import type { searchSettings } from './settings'

export interface ControllerKernelContract {
  readonly options: {
    layout: PathLayout
    demo?: boolean | undefined
    noLocalExec?: boolean | undefined
    nodeWorkspaceInspection?: Pick<NodeWorkspaceInspectionPort, 'verifyWorkspaceFolders'> | undefined
  }
  readonly storage: StoragePort
  readonly plugins: PluginManager
  readonly sandboxProfiles: SandboxProfileService
  readonly workspaceSandboxes: WorkspaceSandboxService
  readonly sessionLaunchTargets: SessionLaunchTargetService
  readonly sessionBranchTargets: SessionBranchTargetService
  readonly directoryQueries: ReturnType<typeof createDirectoryQueries>
  readonly schemaCallbacks: ReturnType<typeof createSchemaCallbackRegistry>
  readonly instanceId: string
  recovered: number
  providerProfiles(): Promise<Array<{ provider: C.ProviderConfig; hasKey: boolean }>>
  models(options?: { includeHidden?: boolean }): Promise<C.ModelInfo[]>
  permissionMode(): C.ApprovalMode
  setPermissionMode(mode: C.ApprovalMode): Promise<{ mode: C.ApprovalMode }>
  saveProvider(
    config: C.ProviderInput,
    apiKey?: string,
  ): Promise<Omit<C.ModelInfo, 'primary'> & { canExecute: boolean }>
  deleteProvider(id: string): Promise<void>
  submit(
    sessionId: string,
    requestId: string,
    input: C.UserInput,
    modelId: string,
    command?: RunCommandRecord,
    signal?: AbortSignal,
    expectedLaunchTargetRevision?: number,
    autonomyRetry?: AutonomyRetryAdmission,
  ): Promise<C.Run>
  cancel(runId: string, persisted?: boolean): Promise<void>
  compact(sessionId: string, modelId: string, signal?: AbortSignal): Promise<{ summary: string }>
  editQueuedRunText(
    request: QueuedRunEditTextInput,
    actorId: string,
    idempotencyKey: string,
  ): Promise<import('@hbar/contracts/commands/run').QueuedRunEditTextReceipt>
  removeQueuedRun(
    request: QueuedRunRemoveInput,
    actorId: string,
    idempotencyKey: string,
  ): Promise<import('@hbar/contracts/commands/run').QueuedRunRemoveReceipt>
  guideQueuedRun(input: {
    actorId: string
    idempotencyKey: string
    request: QueuedRunGuideInput
  }): Promise<QueuedRunGuideReceipt>
  undoFileChanges(sessionId: string, runId: string, signal: AbortSignal): Promise<void>
  continueInterrupted(predecessorRunId: string, manual: RuntimeManualRecovery): Promise<C.Run>
  resolvePlanExit(input: {
    sessionId: string
    approvalId: string
    runId: string
    callId: string
    decision: 'implement' | 'continue'
    feedback?: string
    actorId: string
    automatic?: AutomaticPlanExitDecision
  }): Promise<C.Approval>
  resolveApproval(id: string, decision: C.Approval['status'], automatic?: AutomaticToolApprovalDecision): Promise<void>
  resolveUserInput(requestId: string, rawAnswers: Record<string, { answers: string[] }>): Promise<boolean>
  pendingUserInput(requestId: string): C.UserInputRequest | null
  snapshot(id: string, before?: number, limit?: number): Promise<C.SessionSnapshot>
  getContextUsage(sessionId: string, selectedModelId: string | null): Promise<SessionContextUsage>
  changed(kind: string): void
  createWorkspace(path: string): Promise<C.Workspace>
  createNodeWorkspace(input: import('@hbar/contracts/node-workspaces').NodeWorkspaceCreate): Promise<C.Workspace>
  updateSession(id: string, update: { title?: string; archived?: boolean; expectedTitle?: string }): Promise<C.Session>
  moveSession(id: string, workspaceId: string): Promise<C.Session>
  sessionSummaries(ids: string[]): Promise<C.SessionSummary[]>
  getSessionLaunchTarget: SessionLaunchTargetService['get']
  setSessionLaunchTarget(input: SessionLaunchTargetMutationInput): ReturnType<SessionLaunchTargetService['set']>
  prepareSessionLaunchTarget: SessionLaunchTargetService['prepare']
  reconcileSessionLaunchTarget(
    sessionId: string,
    revision: number,
    signal?: AbortSignal,
  ): Promise<Awaited<ReturnType<SessionLaunchTargetService['reconcile']>>>
  cancelSessionLaunchTarget(
    sessionId: string,
    revision: number,
  ): Promise<Awaited<ReturnType<SessionLaunchTargetService['cancel']>>>
  startSessionLaunchTargetPreparation(
    input: SessionLaunchTargetPreparationStartMutationInput,
  ): Promise<SessionLaunchTargetPreparationStartReceipt>
  readSessionLaunchTargetPreparation(
    input: SessionLaunchTargetPreparationOperationInput,
  ): Promise<SessionLaunchTargetPreparationSnapshot>
  cancelSessionLaunchTargetPreparation(
    input: SessionLaunchTargetPreparationOperationInput,
  ): Promise<SessionLaunchTargetPreparationSnapshot>
  reconcileSessionLaunchTargetPreparation(
    input: SessionLaunchTargetPreparationOperationInput,
  ): Promise<SessionLaunchTargetPreparationSnapshot>
  selectSessionBranchTarget(
    input: SessionBranchTargetSelectInput,
    identity: Omit<SessionBranchTargetIdentity, 'sessionId'>,
    signal: AbortSignal,
  ): Promise<Awaited<ReturnType<SessionBranchTargetService['select']>>>
  reconcileSessionBranchTarget(
    input: SessionBranchTargetIdentity,
    signal: AbortSignal,
  ): Promise<Awaited<ReturnType<SessionBranchTargetService['reconcile']>>>
  sessionSandboxProfileId(sessionId: string): Promise<string>
  bootstrap(host: C.HostInfo): Promise<C.Bootstrap>
  automationGet(sessionId: string): Promise<C.AutomationState>
  automationSet(sessionId: string, unattended?: boolean, goalEnabled?: boolean): Promise<C.AutomationState>
  settingsCatalog(): Promise<C.SettingsCatalog>
  settingsSnapshot(scope: C.SettingScope, targetId?: string): Promise<C.SettingsSnapshot>
  setSetting(
    scope: C.SettingScope,
    targetId: string | undefined,
    id: string,
    value: unknown,
    expectedRevision?: string,
  ): Promise<C.SettingsSnapshot>
  resetSetting(
    scope: C.SettingScope,
    targetId: string | undefined,
    id: string,
    expectedRevision?: string,
  ): Promise<C.SettingsSnapshot>
  searchSettings(query: string): Promise<ReturnType<typeof searchSettings>>
  assertIdle(): void
  chatDatabaseIsIdle(): boolean
  maintainChatDatabase<Value>(action: () => Promise<Value>): Promise<Value>
  chatDatabaseSessionProtection(sessionId: string): ChatDatabaseSkipReason | null
  removeChatDatabaseSession(input: ChatDatabaseDeleteInput): Promise<ChatDatabaseDeleteResult>
  removeChatDatabaseResource(input: ChatDatabaseResourceRequest): Promise<ChatDatabaseResourceResult>
  notifyChatDatabaseDeleted(sessionIds: string[], revision: number): void
  storageHealth(): { readonly ready: boolean; readonly failure?: StorageFatalEvent }
  reorderQueued(sessionId: string, runIds: string[]): Promise<void>
  upload(name: string, mime: string, bytes: Uint8Array, options?: ArtifactUploadOptions): Promise<C.ArtifactRef>
  subscribe(listener: (event: C.WireNotification) => unknown): () => void
  paths(): Promise<{
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
  }>
  skills(): Promise<Array<{ id: string; path: string }>>
  validatePaths(dataRoot: string, cacheRoot: string): Promise<{ dataRoot: string; cacheRoot: string; valid: true }>
  storageLocations(): ReturnType<typeof getStorageLocations>
  applyStorageLocations(input: StorageLocationApply): Promise<Awaited<ReturnType<typeof applyStorageLocations>>>
  setPaths(dataRoot: string, cacheRoot: string): Promise<Awaited<ReturnType<ControllerKernelContract['paths']>>>
  changePlugin(
    id: string,
    enabled: boolean,
    config?: Record<string, unknown>,
    projectId?: string,
  ): Promise<C.PluginInfo[]>
  changePluginTree(id: string, projectId?: string): Promise<C.PluginInfo[]>
  installPlugin(path: string, projectId?: string): Promise<C.PluginInfo[]>
}
