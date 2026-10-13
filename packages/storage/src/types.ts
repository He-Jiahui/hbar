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
  SessionSummary,
  UserInput,
  Workspace,
  SettingScope,
  WorkspaceListInput,
  WorkspaceActivityListInput,
  SessionActivityListInput,
  SessionListInput,
  WorkspacePage,
  WorkspaceActivityPage,
  SessionActivityPage,
  SessionPage,
} from '@hbar/contracts'
import type {
  ActiveOperationsInput,
  ActiveOperationsPage,
  QueuedRunEditable,
  QueuedRunEditableInput,
  QueuedRunEditTextInput,
  QueuedRunEditTextReceipt,
  QueuedRunGuideInput,
  QueuedRunGuideReceipt,
  RunSteeringReadInput,
  RunSteeringReadResult,
  QueuedRunRemoveInput,
  QueuedRunRemoveReceipt,
  RunCommandRecord,
} from '@hbar/contracts/commands/run'
import type { QueuedUserRunsInput, QueuedUserRunsPage } from '@hbar/contracts/commands/run'
import type { UsageReadInput, UsageReadPage } from '@hbar/usage'
import type { ExecutionOwnership, RuntimeOwner, RecoveryChain } from '@hbar/contracts/runtime'
import type { RuntimeRecoveryScope, RuntimeRecoveryRecord } from './runtime-state'
import type { GoalHistoryInput, GoalHistoryPage } from '@hbar/contracts/commands/goal-history'
import type { ContextHistoryInput, ContextHistoryPage, ContextCompactionRecord } from '@hbar/contracts/context-history'
import type { NotificationStorage } from './notifications'
import type { createChatDatabaseProjection } from './chat-database-projection'
import type { createChatDatabaseArtifactStorage } from './chat-database-artifacts'
import type { createChatDatabaseResourceLedger } from './chat-database-resource-ledger'
import type { createChatDatabaseJournal } from './chat-database-journal'
import type { DiagnosticEvent } from '@hbar/contracts'
import type { createChatDatabaseAutomaticPlan } from './chat-database-automatic-plan'
import type { createChatDatabaseTaskStorage } from './chat-database-tasks'
import type { createChatDatabaseDeletionStorage } from './chat-database-deletion'
import type {
  SessionBranchExecutionRoot,
  SessionBranchTargetIntent,
  SessionBranchTargetIdentity,
  SessionBranchTargetRecord,
} from './session-branch-target'
import type { SessionBranchTargetOperation } from '@hbar/contracts/commands/session-branch-target'
import type { createWorkspaceFolderStorage, WorkspaceFolderStorageMutation } from './workspace-folders'
import type { createPromptTemplateStorage } from './prompt-templates'
import type { createScheduleStorage } from './schedules'
import type { createSandboxProfileStorage } from './sandbox-profiles'
import type { RunBoardInput, RunBoardPage } from '@hbar/contracts/commands/run-board'
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
import type {
  NodeExecutionIntentIdentity,
  NodeExecutionIntentPage,
  NodeExecutionIntentPageInput,
  NodeExecutionIntentSettlementInput,
  NodeExecutionIntentSettlementReceipt,
} from './node-execution-intents'
import type { NodeRunWorktreeAdmission, NodeRunWorktreeBindInput, NodeRunWorktreeBinding } from './node-run-worktrees'
import type {
  SessionActivityGlobalListInput,
  SessionActivityGlobalPage,
  WorkspaceSidebarListInput,
  WorkspaceSidebarPage,
  SessionSidebarPage,
  SessionExecutionGetInput,
  SessionExecutionSnapshot,
  SessionAgentChildrenInput,
  SessionAgentChildrenPage,
  SessionAgentAncestors,
} from '@hbar/contracts/sidebar-directory'
import type {
  SessionLaunchTarget,
  SessionLaunchSelection,
  SessionLaunchTargetResolution,
  SessionLaunchTargetSetInput,
  SessionLaunchTargetSetReceipt,
  SessionLaunchTargetPreparationStartInput,
  SessionLaunchTargetPreparationStartReceipt,
  SessionLaunchTargetPreparationOperationInput,
  SessionLaunchTargetPreparationSnapshot,
} from '@hbar/contracts/commands/session-launch-target'

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

export interface SessionLaunchTargetMutationInput extends SessionLaunchTargetSetInput {
  actorId: string
  idempotencyKey: string
}

export interface SessionLaunchTargetReceiptLookup {
  actorId: string
  idempotencyKey: string
  sessionId: string
}

export interface SessionLaunchTargetPreparationInput {
  sessionId: string
  expectedRevision: number
  selection: SessionLaunchSelection
  targetPath: string
  branch: string | null
  requestedHead: string | null
}

export interface SessionLaunchTargetPreparationUpdate {
  sessionId: string
  revision: number
  targetPath: string
  state: Exclude<SessionLaunchTargetResolution['status'], 'idle'>
  resolvedHead?: string | null
  errorCode?: string
  errorMessage?: string
}

interface SessionLaunchTargetBindingFields {
  sessionId: string
  expectedRevision: number
  selection: SessionLaunchSelection
  targetPath: string
  branch: string | null
  head: string | null
}

/** Internal Host-only binding; the absolute path is never part of a public command result. */
export interface SessionLaunchTargetBindingInput extends SessionLaunchTargetBindingFields {
  /** Require the exact prepared resolution in the same transaction that accepts a Run. */
  requirePreparedTarget?: true
}

export interface SessionLaunchTargetResolutionRecord extends SessionLaunchTargetPreparationInput {
  state: Exclude<SessionLaunchTargetResolution['status'], 'idle' | 'ready'> | 'ready'
  resolvedHead: string | null
  errorCode: string | null
  errorMessage: string | null
  updatedAt: number
}

export interface SessionLaunchTargetBinding extends SessionLaunchTargetBindingFields {
  boundRunId: string
  boundAt: number
}

export interface SessionLaunchTargetRuntimeSnapshot {
  target: SessionLaunchTarget
  resolution: SessionLaunchTargetResolutionRecord | null
  binding: SessionLaunchTargetBinding | null
  branchTarget?: SessionBranchExecutionRoot | null
  branchTargetPending?: boolean
}

export interface SessionLaunchTargetPreparationStartMutationInput extends SessionLaunchTargetPreparationStartInput {
  actorId: string
  idempotencyKey: string
}

export type SessionLaunchTargetPreparationOperationRecord = SessionLaunchTargetPreparationSnapshot & {
  selection: SessionLaunchSelection
  cancellationRequested: boolean
}

export interface SessionLaunchTargetPreparationOperationTransitionInput extends SessionLaunchTargetPreparationOperationInput {
  expectedOperationVersion: number
  status: SessionLaunchTargetPreparationSnapshot['status']
  error: { code: string; message: string } | null
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

export interface GuideQueuedRunMutationInput {
  actorId: string
  idempotencyKey: string
  request: QueuedRunGuideInput
}

export interface GuideQueuedRunResult {
  receipt: QueuedRunGuideReceipt
  event: SessionEvent
  message: Message
}

export interface StoredSettings {
  version: 1
  revision: string
  values: Record<string, unknown>
}

export interface StorageMethods {
  chatDatabaseMaintenanceBegin(operationId: string): void
  chatDatabaseMaintenanceEnd(operationId: string): void
  chatDatabaseUsageBackfill: ReturnType<typeof createChatDatabaseProjection>['backfill']
  chatDatabaseUsage: ReturnType<typeof createChatDatabaseProjection>['usage']
  chatDatabaseArtifactPage: ReturnType<typeof createChatDatabaseProjection>['artifactPage']
  chatDatabaseLogPage: ReturnType<typeof createChatDatabaseProjection>['logPage']
  chatDatabaseDraftSync: ReturnType<typeof createChatDatabaseArtifactStorage>['sync']
  chatDatabaseDraftList: ReturnType<typeof createChatDatabaseArtifactStorage>['list']
  chatDatabaseInventoryBegin: ReturnType<typeof createChatDatabaseArtifactStorage>['begin']
  chatDatabaseInventoryFinish: ReturnType<typeof createChatDatabaseArtifactStorage>['finish']
  chatDatabaseInventoryRead: ReturnType<typeof createChatDatabaseArtifactStorage>['inventory']
  chatDatabaseDraftBackfill: ReturnType<typeof createChatDatabaseArtifactStorage>['backfill']
  chatDatabaseArtifactReserve: ReturnType<typeof createChatDatabaseArtifactStorage>['reserve']
  chatDatabaseArtifactRenewUpload: ReturnType<typeof createChatDatabaseArtifactStorage>['renewUpload']
  chatDatabaseArtifactEndUpload: ReturnType<typeof createChatDatabaseArtifactStorage>['endUpload']
  chatDatabaseArtifactFinishUpload: ReturnType<typeof createChatDatabaseArtifactStorage>['finishUpload']
  chatDatabaseArtifactReleaseUpload: ReturnType<typeof createChatDatabaseArtifactStorage>['releaseUpload']
  chatDatabaseArtifactSeedLegacy: ReturnType<typeof createChatDatabaseArtifactStorage>['seedLegacy']
  chatDatabaseLegacySettingsRefs: ReturnType<typeof createChatDatabaseArtifactStorage>['legacySettings']
  chatDatabaseLegacySettingsComplete: ReturnType<typeof createChatDatabaseArtifactStorage>['markLegacySettingsComplete']
  chatDatabaseReferenceHealth: ReturnType<typeof createChatDatabaseArtifactStorage>['referenceHealth']
  chatDatabaseArtifactClaim: ReturnType<typeof createChatDatabaseArtifactStorage>['claim']
  chatDatabaseArtifactEligibility: ReturnType<typeof createChatDatabaseArtifactStorage>['eligibility']
  chatDatabaseArtifactHasCause: ReturnType<typeof createChatDatabaseArtifactStorage>['hasCause']
  chatDatabaseResourceRemove: ReturnType<typeof createChatDatabaseResourceLedger>['remove']
  chatDatabaseResourceReceipt: ReturnType<typeof createChatDatabaseResourceLedger>['receipt']
  chatDatabaseArtifactReleaseClaim: ReturnType<typeof createChatDatabaseArtifactStorage>['releaseClaim']
  chatDatabaseArtifactFinishReclaim: ReturnType<typeof createChatDatabaseArtifactStorage>['finishReclaim']
  chatDatabaseArtifactReclaimReceipt: ReturnType<typeof createChatDatabaseArtifactStorage>['reclaimReceipt']
  chatDatabaseOperationAccept: ReturnType<typeof createChatDatabaseJournal>['accept']
  chatDatabaseOperationRead: ReturnType<typeof createChatDatabaseJournal>['read']
  chatDatabaseOperationUpdate: ReturnType<typeof createChatDatabaseJournal>['update']
  chatDatabaseOperationCancel: ReturnType<typeof createChatDatabaseJournal>['cancel']
  chatDatabaseOperationReconcile: ReturnType<typeof createChatDatabaseJournal>['reconcile']
  chatDatabaseOperationReceipt: ReturnType<typeof createChatDatabaseJournal>['receipt']
  chatDatabasePreviewAppend: ReturnType<typeof createChatDatabaseJournal>['appendItems']
  chatDatabasePreviewPage: ReturnType<typeof createChatDatabaseJournal>['previewPage']
  chatDatabaseCandidates: ReturnType<typeof createChatDatabaseJournal>['candidates']
  chatDatabaseRetainedChild: ReturnType<typeof createChatDatabaseJournal>['retainedChild']
  chatDatabaseHistory: ReturnType<typeof createChatDatabaseJournal>['history']
  chatDatabasePending: ReturnType<typeof createChatDatabaseJournal>['pending']
  chatDatabasePreviewReset: ReturnType<typeof createChatDatabaseJournal>['resetPreview']
  chatDatabaseAutomaticPlanStep: ReturnType<typeof createChatDatabaseAutomaticPlan>['step']
  chatDatabaseAutomaticPlanRead: ReturnType<typeof createChatDatabaseAutomaticPlan>['read']
  chatDatabaseAutomaticPlanPage: ReturnType<typeof createChatDatabaseAutomaticPlan>['page']
  chatDatabaseTaskScopes: ReturnType<typeof createChatDatabaseTaskStorage>['scopes']
  chatDatabaseTaskRead: ReturnType<typeof createChatDatabaseTaskStorage>['get']
  chatDatabaseTaskSave: ReturnType<typeof createChatDatabaseTaskStorage>['save']
  chatDatabaseDeleteSession: ReturnType<typeof createChatDatabaseDeletionStorage>['remove']
  notificationPage: NotificationStorage['page']
  notificationBySourceEvent: NotificationStorage['bySourceEvent']
  insertNotification: NotificationStorage['insert']
  markNotificationRead: NotificationStorage['markRead']
  markAllNotificationsRead: NotificationStorage['markAllRead']
  notificationPreferences: NotificationStorage['preferences']
  setNotificationPreferences: NotificationStorage['setPreferences']
  notificationReceipt: NotificationStorage['receipt']
  promptTemplatePage: ReturnType<typeof createPromptTemplateStorage>['list']
  promptTemplate: ReturnType<typeof createPromptTemplateStorage>['get']
  savePromptTemplate: ReturnType<typeof createPromptTemplateStorage>['save']
  deletePromptTemplate: ReturnType<typeof createPromptTemplateStorage>['delete']
  promptTemplateReceipt: ReturnType<typeof createPromptTemplateStorage>['receipt']
  sandboxProfiles: ReturnType<typeof createSandboxProfileStorage>['list']
  sandboxProfile: ReturnType<typeof createSandboxProfileStorage>['get']
  saveSandboxProfile: ReturnType<typeof createSandboxProfileStorage>['save']
  deleteSandboxProfile: ReturnType<typeof createSandboxProfileStorage>['delete']
  sandboxProfileReceipt: ReturnType<typeof createSandboxProfileStorage>['receipt']
  putSandboxSnapshot: ReturnType<typeof createSandboxProfileStorage>['putSnapshot']
  sandboxSnapshot: ReturnType<typeof createSandboxProfileStorage>['snapshot']
  schedulePage: ReturnType<typeof createScheduleStorage>['list']
  schedule: ReturnType<typeof createScheduleStorage>['get']
  createSchedule: ReturnType<typeof createScheduleStorage>['create']
  updateSchedule: ReturnType<typeof createScheduleStorage>['update']
  deleteSchedule: ReturnType<typeof createScheduleStorage>['delete']
  scheduleReceipt: ReturnType<typeof createScheduleStorage>['receipt']
  scheduleOccurrences: ReturnType<typeof createScheduleStorage>['occurrences']
  claimScheduleOccurrence: ReturnType<typeof createScheduleStorage>['claim']
  transitionScheduleOccurrence: ReturnType<typeof createScheduleStorage>['transition']
  enabledSchedules: ReturnType<typeof createScheduleStorage>['enabledSchedules']
  activeScheduleOccurrences: ReturnType<typeof createScheduleStorage>['activeScheduleOccurrences']
  scheduleRuntime: ReturnType<typeof createScheduleStorage>['scheduleRuntime']
  recordScheduleCandidate: ReturnType<typeof createScheduleStorage>['recordCandidate']
  runBoard(input: RunBoardInput): RunBoardPage
  ready(): { version: number }
  searchIndexStatus(): { complete: boolean }
  searchIndexStep(): { complete: boolean }
  recentSessions(input: SessionRecentInput): SessionRecentPage
  searchSessions(input: SessionSearchInput): SessionSearchPage
  createWorkspace(path: string, name: string): Workspace
  createNodeWorkspace(input: import('@hbar/contracts/node-workspaces').NodeWorkspaceCreate): Workspace
  nodeSessionsPage(input: import('@hbar/contracts/node-workspaces').NodeSessionList): SessionPage
  workspaceFolders: ReturnType<typeof createWorkspaceFolderStorage>['read']
  workspaceFolderReceipt: ReturnType<typeof createWorkspaceFolderStorage>['receipt']
  applyWorkspaceFolders(
    input: WorkspaceFolderStorageMutation,
  ): ReturnType<ReturnType<typeof createWorkspaceFolderStorage>['apply']>
  workspaces(): Workspace[]
  workspacePage(input: WorkspaceListInput): WorkspacePage
  workspaceSidebarPage(input: WorkspaceSidebarListInput): WorkspaceSidebarPage
  globalSessionActivityPage(input: SessionActivityGlobalListInput): SessionActivityGlobalPage
  sessionExecutionSnapshot(input: SessionExecutionGetInput): SessionExecutionSnapshot
  workspaceActivityPage(input: WorkspaceActivityListInput): WorkspaceActivityPage
  sessionActivityPage(input: SessionActivityListInput): SessionActivityPage
  sidebarSessionActivityPage(input: SessionActivityListInput): SessionSidebarPage
  sessionAgentChildren(input: SessionAgentChildrenInput): SessionAgentChildrenPage
  sessionAgentAncestors(sessionId: string): SessionAgentAncestors
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
  moveSession(id: string, workspaceId: string): { session: Session; event: SessionEvent }
  sessionSummary(id: string): SessionSummary
  sessionSummaries(ids: string[]): SessionSummary[]
  sessionLaunchTarget(sessionId: string): SessionLaunchTarget
  sessionLaunchTargetRuntime(sessionId: string): SessionLaunchTargetRuntimeSnapshot
  sessionBranchTargetOperation(input: SessionBranchTargetIdentity): SessionBranchTargetRecord | null
  pendingSessionBranchTargetOperation(
    sessionId: string,
    actorId?: string,
  ): {
    operationId: string
    owned: boolean
    idempotencyKey?: string
    request?: import('@hbar/contracts/commands/session-branch-target').SessionBranchTargetSelectInput
  } | null
  beginSessionBranchTarget(input: SessionBranchTargetIntent): SessionBranchTargetRecord
  observeSessionBranchTargetRun(input: {
    sessionId: string
    runId: string
    expectedRevision: number
    targetPath: string
    branch: string
  }): boolean
  finishSessionBranchTarget(
    input: SessionBranchTargetIdentity,
    result: { status: 'ready' | 'failed' | 'unknown'; error?: { code: string; message: string } },
  ): SessionBranchTargetOperation
  sessionLaunchTargetBindingForPath(targetPath: string): SessionLaunchTargetBinding | null
  activeSharedCheckoutPaths(excludeSessionId?: string): string[]
  setSessionLaunchTarget(input: SessionLaunchTargetMutationInput): SessionLaunchTargetSetReceipt
  sessionLaunchTargetReceipt(input: SessionLaunchTargetReceiptLookup): SessionLaunchTargetSetReceipt | null
  startSessionLaunchTargetPreparation(
    input: SessionLaunchTargetPreparationStartMutationInput,
  ): SessionLaunchTargetPreparationStartReceipt
  sessionLaunchTargetPreparation(
    input: SessionLaunchTargetPreparationOperationInput,
  ): SessionLaunchTargetPreparationSnapshot
  sessionLaunchTargetPreparationRecord(
    input: SessionLaunchTargetPreparationOperationInput,
  ): SessionLaunchTargetPreparationOperationRecord
  pendingSessionLaunchTargetPreparations(): SessionLaunchTargetPreparationOperationRecord[]
  requestSessionLaunchTargetPreparationCancellation(
    input: SessionLaunchTargetPreparationOperationInput,
  ): SessionLaunchTargetPreparationSnapshot
  transitionSessionLaunchTargetPreparation(
    input: SessionLaunchTargetPreparationOperationTransitionInput,
  ): SessionLaunchTargetPreparationSnapshot
  beginSessionLaunchTargetPreparation(input: SessionLaunchTargetPreparationInput): SessionLaunchTargetResolutionRecord
  updateSessionLaunchTargetPreparation(input: SessionLaunchTargetPreparationUpdate): SessionLaunchTargetResolutionRecord
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
  contextHistory(input: ContextHistoryInput): ContextHistoryPage
  sessionObservability(input: import('@hbar/contracts/session-observability').SessionObservabilityInput): import('@hbar/contracts/session-observability').SessionObservabilityReport
  compactionStart(
    input: Pick<ContextCompactionRecord, 'id' | 'sessionId' | 'runId' | 'modelId' | 'contextWindow' | 'beforeTokens'> & {
      trigger: NonNullable<ContextCompactionRecord['trigger']>
    },
  ): SessionEvent
  compactionFinish(
    record: ContextCompactionRecord,
    completion: Pick<
      ContextCompactionRecord,
      'status' | 'durationMs' | 'afterTokens' | 'summaryTokens' | 'retainedMessages' | 'chunks' | 'errorCode'
    >,
  ): SessionEvent | null
  activeOperations(input: ActiveOperationsInput): ActiveOperationsPage
  queuedUserRuns(input: QueuedUserRunsInput): QueuedUserRunsPage
  queuedRunEditable(input: QueuedRunEditableInput): QueuedRunEditable
  editQueuedRunText(input: { actorId: string; idempotencyKey: string; request: QueuedRunEditTextInput }): {
    receipt: QueuedRunEditTextReceipt
    event: SessionEvent
  }
  queuedRunEditTextReceipt(actorId: string, idempotencyKey: string, sessionId: string): QueuedRunEditTextReceipt | null
  openRunSteering(sessionId: string, runId: string): void
  closeRunSteering(sessionId: string, runId: string): void
  readRunSteering(input: RunSteeringReadInput): RunSteeringReadResult
  guideQueuedRun(input: GuideQueuedRunMutationInput): GuideQueuedRunResult
  queuedRunGuideReceipt(actorId: string, idempotencyKey: string, sessionId: string): QueuedRunGuideReceipt | null
  removeQueuedRun(input: { actorId: string; idempotencyKey: string; request: QueuedRunRemoveInput }): {
    receipt: QueuedRunRemoveReceipt
    event: SessionEvent
  }
  queuedRunRemoveReceipt(actorId: string, idempotencyKey: string, sessionId: string): QueuedRunRemoveReceipt | null
  context(sessionId: string): { messages: Message[]; summary: string | null; throughSeq: number }
  compact(
    sessionId: string,
    throughSeq: number,
    summary: string,
    modelId: string,
    telemetry?: {
      record: ContextCompactionRecord
      durationMs: number
      afterTokens: number
      summaryTokens: number
      retainedMessages: number
      chunks: number
    },
  ): SessionEvent
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
    launchTarget?: SessionLaunchTargetBindingInput,
  ): Run & { queuedEvent?: SessionEvent | undefined }
  runByRequest(sessionId: string, requestId: string): { run: Run; command: RunCommandRecord | null } | null
  runByRequestInWorkspace(workspaceId: string, requestId: string): { run: Run; command: RunCommandRecord | null } | null
  claim(sessionId: string): Run | null
  nextQueuedRun(sessionId: string): Run | null
  run(id: string): Run
  setRun(id: string, status: RunStatus, error?: string, failure?: RunFailure): SessionEvent
  runFileChanges(sessionId: string, runId: string, after?: string, limit?: number): import('@hbar/contracts/run-file-changes').RunFileChangesPage
  runFileChangeDiff(sessionId: string, runId: string, path: string, offset: number): import('@hbar/contracts/run-file-changes').RunFileChangeDiff
  runFileChangeVersions(sessionId: string, runId: string): import('./run-file-changes').RunFileChangeVersion[]
  undoRunFileChanges(sessionId: string, runId: string): SessionEvent
  reorderQueued(sessionId: string, runIds: string[]): SessionEvent[]
  requestCancel(id: string): { run: Run; event: SessionEvent | null }
  cancelRequested(id: string): boolean
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
  toolStart(
    sessionId: string,
    runId: string,
    callId: string,
    name: string,
    args: unknown,
    presentation?: import('@hbar/contracts').ToolCallPresentation,
    nodeExecution?: Omit<NodeExecutionIntentIdentity, 'sessionId' | 'runId' | 'callId' | 'name' | 'args'>,
  ): SessionEvent
  pendingNodeExecutionIntents(input: NodeExecutionIntentPageInput): NodeExecutionIntentPage
  nodeExecutionIntentSettle(input: NodeExecutionIntentSettlementInput): NodeExecutionIntentSettlementReceipt
  nodeRunWorktreeBind(input: NodeRunWorktreeBindInput): NodeRunWorktreeBinding
  nodeRunWorktree(runId: string): NodeRunWorktreeBinding | null
  nodeRunWorktreeAdmission(runId: string): NodeRunWorktreeAdmission | null
  toolEnd(sessionId: string, runId: string, callId: string, failed?: boolean): SessionEvent | null
  recover(scope?: RuntimeRecoveryScope): number
  runtimeExecutionClaim(draft: ExecutionOwnership): ExecutionOwnership | null
  runtimeExecutionRelease(lease: ExecutionOwnership): void
  runtimeExecutionRevoke(owner: RuntimeOwner, runIds: readonly string[]): string[]
  runtimeExecutionRead(runId: string): { lease: ExecutionOwnership; state: string } | null
  runtimeActiveRuns(after?: string, limit?: number): Run[]
  runtimeUnreleasedExecutions(after?: string, limit?: number): ExecutionOwnership[]
  runtimeRecoveryPlan(predecessorRunId: string): RuntimeRecoveryRecord
  runtimeRecoveryQueue(predecessorRunId: string, recoveryId: string): RuntimeRecoveryRecord
  runtimeRecoveryRead(predecessorRunId: string): RuntimeRecoveryRecord | null
  runtimeRecoveryCancel(runId: string): { run: Run; events: SessionEvent[] }
  runtimeRecoveryChain(chainId: string): RecoveryChain | null
  runtimeRecoveryHold(
    predecessorRunId: string,
    recoveryId: string,
    reasonCode: string | null,
    manual?: import('./runtime-state').RuntimeManualRecovery,
  ): RuntimeRecoveryRecord
  runtimeRecoveryReconcile(predecessorRunId: string, recoveryId: string): void
  runtimeRecoveryAppend(predecessorRunId: string, recoveryId: string, type: string, data: unknown): SessionEvent
  recoveryInputMessage(runId: string): Message | null
  saveProvider(provider: ProviderConfig): void
  providers(): ProviderConfig[]
  deleteProvider(id: string): void
  putArtifact(artifact: ArtifactRef): void
  artifact(id: string): ArtifactRef
  putDevice(device: Device, tokenHash: string): void
  deviceByHash(hash: string): Device | null
  devices(): Device[]
  revokeDevice(id: string): void
  nodeIdentityEnsure(identity: import('@hbar/contracts/node-registry').NodeRegistryInput<'identity.ensure'>): import('@hbar/contracts/node-registry').NodeRegistryOutput<'identity.ensure'>
  nodes(): import('@hbar/contracts/node-registry').RegisteredNode[]
  node(nodeId: string): import('@hbar/contracts/node-registry').RegisteredNode | null
  nodeRegister(node: import('@hbar/contracts/node-registry').NodeRegistryInput<'node.register'>): import('@hbar/contracts/node-registry').RegisteredNode
  nodeTouch(nodeId: string, time: number, capabilities: import('@hbar/contracts/node').NodeCapabilities): import('@hbar/contracts/node-registry').RegisteredNode | null
  nodeRevoke(nodeId: string, time: number): import('@hbar/contracts/node-registry').RegisteredNode | null
  setPlugin(id: string, enabled: boolean, config: Record<string, unknown>, path?: string, projectId?: string): void
  setPlugins(
    plugins: {
      id: string
      enabled: boolean
      config: Record<string, unknown>
      path?: string | undefined
      projectId?: string | undefined
    }[],
  ): void
  removePlugin(id: string, projectId?: string): void
  plugins(): {
    id: string
    enabled: boolean
    config: Record<string, unknown>
    path: string | null
    projectId?: string | undefined
  }[]
  stats(): Record<string, number>
  getSetting(key: string): string | null
  setSetting(key: string, value: string): void
  getSettings(scope: SettingScope, targetId?: string): StoredSettings
  setSettings(
    scope: SettingScope,
    targetId: string | undefined,
    values: Record<string, unknown>,
    expectedRevision?: string,
  ): StoredSettings
  deleteSetting(
    scope: SettingScope,
    targetId: string | undefined,
    key: string,
    expectedRevision?: string,
  ): StoredSettings
  settingsLayers(ids: string[]): StoredSettingsLayer[]
  settingsReceipt(
    actorId: string,
    idempotencyKey: string,
  ): { payloadHash: string; receipt: SettingsCommitReceipt } | null
  commitSettings(input: SettingsCommitInput): SettingsCommitReceipt
  close(): void
}
export type StorageCall = {
  [K in keyof StorageMethods]: {
    id: number
    method: K
    args: Parameters<StorageMethods[K]>
    authority?: ExecutionOwnership
  }
}[keyof StorageMethods]
export type StorageReply =
  { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string; code: string }

/** Out-of-band worker telemetry. It never carries SQL, arguments or error text. */
export type StorageDiagnosticMessage = { type: 'diagnostic'; event: DiagnosticEvent; operationId?: number }
export type StorageWorkerMessage = StorageReply | StorageDiagnosticMessage
