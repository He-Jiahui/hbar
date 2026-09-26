import type {
  CommandDescriptor,
  CommandExecutor,
  CommandParameterDraftValue,
  CommandParameterForm,
  CommandParameterIssue,
  ExecuteOptions,
} from '@hbar/commands'
import type { Session, Workspace } from '@hbar/contracts/directory'
import type { BudgetReceipt, SetBudgetInput } from '@hbar/contracts/commands/budget'
import type { PromptAttachment } from '@hbar/contracts/commands/draft'
import type { AttachmentUploadInput } from '@hbar/contracts/commands/files'
import type { RunAccepted } from '@hbar/contracts/commands/run'
import type { GoalPlanChange, GoalPlanSnapshot } from '@hbar/contracts/commands/goals'
import type { ModelConfiguration, ModelDescriptor } from '@hbar/contracts/commands/models'
import type { UsageQueryResult } from '@hbar/contracts/commands/usage'
import type { AgentRecord } from '@hbar/contracts/commands/agents'
import type { PluginInfo, SkillDescriptor } from '@hbar/contracts/commands/extensions'
import type { MetricsQueryResult } from '@hbar/contracts/commands/metrics'
import type { GitCommitInfo, GitCommitSource, GitStatsReport, GitStatus } from '@hbar/contracts'
import type {
  Approval,
  GoalStatus,
  LiveStream,
  Message,
  PlanState,
  PlanStepStatus,
  Run,
  SessionBudget,
  SessionEvent,
  SessionSnapshot,
  StreamDelta,
  ThreadGoal,
  Usage,
  UserInputRequest,
} from '@hbar/contracts'
import type {
  CompiledForm,
  FormState,
  OptionContentReport,
  ResourcePickerPort,
  SchemaCallbackPort,
} from '@hbar/schema-core'
import type { SettingsDescription, SettingsReceipt, SettingsSnapshot } from '@hbar/contracts/commands/settings'
import type {
  PerformanceTarget,
  PerformanceWindow,
  StatusExportFormat,
  StatusUsageAggregation,
  StatusUsageScope,
  StatusUsageWindow,
  StatusGitWindow,
} from '@hbar/contracts/commands/status-workspace'
import type {
  ProviderEditorDescription,
  ProviderPresetModel,
  ProviderPresetSummary,
  ProviderProfile,
} from '@hbar/contracts/commands/configuration'
import type { ThinkingLevel } from '@hbar/contracts'
import type { CompiledKeyedList, KeyedListState } from '@hbar/schema-core'
import type { PlanProposalRequestText } from './plan-proposal-actions'

export interface BudgetCommandPort {
  execute(id: 'session.getBudget', input: { sessionId: string }): Promise<SessionBudget | null>
  execute(
    id: 'session.setBudget',
    input: SetBudgetInput,
    options: { idempotencyKey: string; requestId?: string },
  ): Promise<BudgetReceipt>
  getReceipt(sessionId: string, idempotencyKey: string): Promise<BudgetReceipt | null>
}

export interface BudgetFormState {
  readonly commandId: 'session.setBudget'
  readonly formId: string
  readonly sessionId: string
  readonly form: FormState
  readonly receipt: BudgetReceipt | null
  readonly pendingKey: string | null
}
export type BudgetFormsState = Readonly<Record<string, BudgetFormState>>

/** Only a client-owned global Settings surface can cross initial Host identity discovery. */
export interface GlobalSettingsStartup {
  readonly instanceId: string
  readonly section?: string | undefined
  readonly sidebarOpen: boolean
}

export interface RuntimeOptions {
  readonly instanceId: string
  readonly hostId: string
  readonly directory: CommandExecutor
  readonly workspaces?: CommandExecutor
  readonly timeline?: SessionTimelinePort
  readonly run?: RunCommandPort
  readonly planProposal?: { readonly requestText: PlanProposalRequestText }
  readonly attachments?: CommandExecutor
  readonly interactions?: CommandExecutor
  readonly interactionRecovery?: InteractionRecoveryPort
  readonly models?: CommandExecutor
  readonly usage?: CommandExecutor
  readonly budget?: BudgetCommandPort
  readonly settings?: CommandExecutor
  readonly initialGlobalSettings?: GlobalSettingsStartup | undefined
  /** Host-owned global Settings entry preference; scoped settings keep their own explicit targets. */
  readonly settingsLanding?: {
    readonly globalGroupId: string
    readonly isKnownGlobalGroup?: (groupId: string) => boolean
    readonly readLastGlobalGroup?: () => string | null
    readonly saveLastGlobalGroup?: (groupId: string) => void
  }
  readonly configuration?: CommandExecutor
  /** Durable Host mode.get/set for this session, separate from per-send approval choices. */
  readonly planMode?: CommandExecutor
  /** Exact Host mode.changed notifications invalidate the active session's confirmed mode projection. */
  readonly planModeEvents?: {
    subscribe(listener: (sessionId: string) => void): () => void
    onConnection?(listener: (connected: boolean) => void): () => void
  }
  readonly files?: CommandExecutor
  readonly agents?: CommandExecutor
  readonly goals?: GoalPlanWorkspacePort
  /** Explicit read-only canonical Goal history capability, separate from editable current Goal. */
  readonly goalHistory?: CommandExecutor
  readonly workflows?: WorkflowWorkspacePort
  readonly extensions?: CommandExecutor
  readonly system?: CommandExecutor
  readonly metrics?: CommandExecutor
  readonly git?: CommandExecutor
  readonly commandCatalog?: CommandCatalogPort
  readonly commandText?: CommandTextPort
  readonly schemaContent?: SchemaCallbackPort
  readonly resourcePicker?: ResourcePickerPort
  readonly surfaces?: SurfaceCapabilityPort
  readonly platform?: PlatformPort
  readonly persistence?: ClientPersistencePort
  readonly layoutDescription?: ClientLayoutDescriptionPort
  readonly exporter?: ClientExportPort
  readonly defaultLayout?: Readonly<Record<string, ClientJsonValue>>
  readonly onSubscriberError?: (error: unknown) => void
}

export type ClientJsonValue = null | boolean | number | string | readonly ClientJsonValue[] | ClientJsonObject
export interface ClientJsonObject {
  readonly [key: string]: ClientJsonValue
}

export interface ClientPersistencePort {
  read(key: string): Promise<unknown>
  write(key: string, value: ClientJsonValue): Promise<void>
  remove(key: string): Promise<void>
}

export interface ClientLayoutDescriptionPort {
  normalize(description: ClientJsonObject): ClientJsonObject
}

export interface ClientLayoutState {
  readonly status: 'loading' | 'ready'
  readonly revision: number
  readonly source: 'default' | 'saved' | 'current'
  readonly persisted: boolean
  readonly description: ClientJsonObject
  readonly restoreError: string | null
}

export interface ClientPreferencesState {
  readonly status: 'loading' | 'ready'
  readonly revision: number
  readonly persisted: boolean
  readonly values: ClientJsonObject
  readonly restoreError: string | null
}

export interface ClientExportPort {
  save(
    file: { readonly name: string; readonly mime: string; readonly content: string },
    signal: AbortSignal,
  ): Promise<void>
}

export interface AgentWorkspaceDraftState {
  readonly objective: string
  readonly modelId: string
  readonly title: string
  readonly tokenBudget: string
  readonly thinkingLevel: string
  readonly approval: 'deny' | 'ask' | 'allow'
  readonly revision: number
  readonly issues: Readonly<Record<string, string>>
}

export interface AgentWorkspaceActionState {
  readonly status: 'submitting' | 'succeeded' | 'failed' | 'unknown'
  readonly error: string | null
}

export interface AgentWorkspaceEntryState {
  readonly instanceId: string
  readonly parentSessionId: string
  readonly view: 'list' | 'create' | 'detail'
  readonly selectedAgentId: string | null
  readonly status: 'loading' | 'ready' | 'error'
  readonly items: readonly Readonly<AgentRecord>[]
  readonly nextCursor: string | null
  readonly draft: Readonly<AgentWorkspaceDraftState>
  readonly creation: {
    readonly status: 'idle' | 'submitting' | 'succeeded' | 'failed' | 'unknown'
    readonly error: string | null
  }
  readonly actions: Readonly<Record<string, Readonly<AgentWorkspaceActionState>>>
  readonly error: string | null
}

export interface AgentWorkspaceState {
  readonly entries: Readonly<Record<string, Readonly<AgentWorkspaceEntryState>>>
}

export interface GoalPlanActionState {
  readonly status: 'idle' | 'submitting' | 'succeeded' | 'failed' | 'unknown'
  readonly error: string | null
}

export interface GoalPlanWorkspacePort extends CommandExecutor {
  snapshot?(sessionId: string, options?: ExecuteOptions): Promise<GoalPlanSnapshot>
  watch?(sessionId: string, listener: (change: GoalPlanChange | { kind: 'reset' }) => void): () => void
}

export interface GoalPlanGoalDraftState {
  readonly baseline: {
    readonly exists: boolean
    readonly goalId: string | null
    readonly objective: string
    readonly status: GoalStatus
    readonly tokenBudget: string
  }
  readonly objective: string
  readonly status: GoalStatus
  readonly tokenBudget: string
  readonly revision: number
  readonly issues: Readonly<Record<string, string>>
}

export interface GoalPlanStepDraftState {
  readonly id: string
  readonly step: string
  readonly status: PlanStepStatus
}

export interface GoalPlanPlanDraftState {
  readonly explanation: string
  readonly newStep: string
  readonly steps: readonly Readonly<GoalPlanStepDraftState>[]
  readonly revision: number
  readonly issues: Readonly<Record<string, string>>
}

export interface GoalPlanWorkspaceEntryState {
  readonly instanceId: string
  readonly sessionId: string
  readonly view: 'overview' | 'goal' | 'plan'
  readonly status: 'loading' | 'ready' | 'error'
  readonly goal: Readonly<ThreadGoal> | null
  readonly remainingTokens: number | null
  readonly completionBudgetReport: string | null
  readonly goalDraft: Readonly<GoalPlanGoalDraftState>
  readonly goalDirty: boolean
  readonly goalAction: Readonly<GoalPlanActionState>
  readonly plan: Readonly<PlanState> | null
  readonly planDraft: Readonly<GoalPlanPlanDraftState>
  readonly planDirty: boolean
  readonly planAction: Readonly<GoalPlanActionState>
  readonly error: string | null
}

export interface GoalPlanWorkspaceState {
  readonly entries: Readonly<Record<string, Readonly<GoalPlanWorkspaceEntryState>>>
}

export interface WorkflowWorkspacePort extends CommandExecutor {
  watch?(sessionId: string, listener: (snapshot: import('@hbar/contracts').WorkflowSnapshot) => void): () => void
}

export interface WorkflowWorkspaceActionState {
  readonly status: 'idle' | 'submitting' | 'succeeded' | 'failed' | 'unknown'
  readonly error: string | null
}

export interface WorkflowWorkspaceEntryState {
  readonly instanceId: string
  readonly sessionId: string
  readonly status: 'loading' | 'ready' | 'error'
  readonly snapshot: Readonly<import('@hbar/contracts').WorkflowSnapshot>
  readonly agents: Readonly<Record<string, Readonly<AgentRecord>>>
  readonly visibleEvidence: number
  readonly actions: Readonly<Record<string, Readonly<WorkflowWorkspaceActionState>>>
  readonly error: string | null
}

export interface WorkflowWorkspaceState {
  readonly entries: Readonly<Record<string, Readonly<WorkflowWorkspaceEntryState>>>
}

export interface ExtensionWorkspaceActionState {
  readonly status: 'submitting' | 'succeeded' | 'failed' | 'unknown'
  readonly error: string | null
}

export interface ExtensionWorkspaceDetailState {
  readonly pluginId: string
  readonly status: 'loading' | 'ready' | 'error' | 'missing'
  readonly plugin: Readonly<PluginInfo> | null
  readonly error: string | null
}

export interface ExtensionWorkspaceEntryState {
  readonly instanceId: string
  readonly status: 'loading' | 'ready' | 'error'
  readonly plugins: readonly Readonly<PluginInfo>[]
  readonly skills: readonly Readonly<SkillDescriptor>[]
  readonly actions: Readonly<Record<string, Readonly<ExtensionWorkspaceActionState>>>
  readonly error: string | null
  readonly query: string
  readonly pluginPage: number
  readonly skillPage: number
  readonly selectedPluginId: string | null
  readonly detail: Readonly<ExtensionWorkspaceDetailState> | null
}

export interface ExtensionWorkspaceState {
  readonly entries: Readonly<Record<string, Readonly<ExtensionWorkspaceEntryState>>>
}

export interface StatusWorkspaceEntryState {
  readonly instanceId: string
  readonly section: 'dashboard' | 'usage' | 'git'
  readonly status: 'loading' | 'ready' | 'error'
  readonly performance: Readonly<MetricsQueryResult> | null
  readonly performanceQuery: {
    readonly window: PerformanceWindow
    readonly target: PerformanceTarget
  }
  readonly usage: Readonly<UsageQueryResult> | null
  readonly usageQuery: {
    readonly scope: StatusUsageScope
    readonly includeDescendants: boolean
    readonly window: StatusUsageWindow
    readonly aggregation: StatusUsageAggregation
    readonly providerId: string | null
    readonly modelId: string | null
  }
  readonly usageExport: {
    readonly status: 'idle' | 'exporting' | 'succeeded' | 'failed'
    readonly format: StatusExportFormat | null
    readonly fileName: string | null
    readonly rowCount: number
    readonly incomplete: boolean
    readonly error: string | null
  }
  readonly git: Readonly<GitStatsReport> | null
  readonly gitStatus: Readonly<GitStatus> | null
  readonly gitCommits: readonly Readonly<GitCommitInfo>[]
  readonly gitHistoryTruncated: boolean
  readonly gitBucketStart: number | null
  readonly gitQuery: {
    readonly workspaceId: string | null
    readonly window: StatusGitWindow
    readonly sources: readonly GitCommitSource[]
  }
  readonly gitWorkspaceId: string | null
  readonly error: string | null
}

export interface StatusWorkspaceState {
  readonly entries: Readonly<Record<string, Readonly<StatusWorkspaceEntryState>>>
}

export interface FileWorkspaceDocumentState {
  readonly path: string
  readonly status: 'idle' | 'loading' | 'ready' | 'submitting' | 'succeeded' | 'failed' | 'unknown'
  readonly baseline: string
  readonly draft: string
  readonly sha256: string | null
  readonly pendingText: string | null
  readonly error: string | null
}

export interface FileWorkspaceChangesState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly cwd: string | null
  readonly root: string | null
  readonly branch: string | null
  readonly items: readonly {
    readonly path: string
    readonly originalPath?: string
    readonly directory?: boolean
    readonly index: string
    readonly worktree: string
  }[]
  readonly filter: string
  readonly page: number
  readonly limitReached: boolean
  readonly error: string | null
}

export interface FileWorkspaceDiffState {
  readonly path: string
  readonly cached: boolean
  readonly status: 'loading' | 'ready' | 'error'
  readonly text: string
  readonly truncated: boolean
  readonly error: string | null
}

export interface FileWorkspaceTreeDirectoryState {
  readonly expanded: boolean
  readonly status: 'loading' | 'ready' | 'error'
  readonly items: readonly { readonly name: string; readonly path: string; readonly directory: boolean }[]
  readonly nextCursor: string | null
  readonly error: string | null
}

export interface FileWorkspaceTreeState {
  readonly filter: string
  readonly search: {
    readonly status: 'idle' | 'loading' | 'ready' | 'error'
    readonly paths: readonly string[]
    readonly truncated: boolean
    readonly error: string | null
  }
  readonly nodes: Readonly<Record<string, Readonly<FileWorkspaceTreeDirectoryState>>>
  readonly revalidateOnOpen: boolean
  readonly error: string | null
}

export interface FileWorkspaceEntryState {
  readonly instanceId: string
  readonly workspaceId: string
  readonly path: string
  readonly view: 'browser' | 'document' | 'diff'
  readonly browserMode: 'all' | 'changed'
  readonly documentMode: 'preview' | 'edit'
  readonly changes: Readonly<FileWorkspaceChangesState>
  readonly diff: Readonly<FileWorkspaceDiffState> | null
  readonly tree: Readonly<FileWorkspaceTreeState>
  readonly rootLimitReached: boolean
  readonly status: 'loading' | 'ready' | 'error'
  readonly items: readonly { readonly name: string; readonly path: string; readonly directory: boolean }[]
  readonly nextCursor: string | null
  readonly document: Readonly<FileWorkspaceDocumentState> | null
  readonly error: string | null
}

export interface FileWorkspaceState {
  readonly entries: Readonly<Record<string, Readonly<FileWorkspaceEntryState>>>
}

export interface CommandCatalogPage {
  readonly revision: number
  readonly items: readonly CommandDescriptor[]
  readonly nextCursor?: string
}

export interface CommandCatalogPort {
  list(input: { readonly after?: string; readonly limit: number }): Promise<CommandCatalogPage>
  execute(
    descriptor: CommandDescriptor,
    input: Readonly<Record<string, unknown>>,
    options?: ExecuteOptions,
  ): Promise<unknown>
}

export interface CommandTextPort {
  resolve(key: string): string
  /** Reindex localized search without refreshing the catalog, selection or command execution. */
  subscribe?(listener: () => void): () => void
}

export interface CommandPaletteItem {
  readonly descriptor: Readonly<CommandDescriptor>
  readonly form: Readonly<CommandParameterForm>
  readonly available: boolean
  readonly unavailableReason: string | null
}

export interface CommandPaletteDraftState {
  readonly commandId: string
  readonly commandVersion: number
  /** Sensitive values never leave the command palette module. */
  readonly values: Readonly<Record<string, CommandParameterDraftValue>>
  readonly sensitiveFields: readonly string[]
  readonly issues: readonly CommandParameterIssue[]
  readonly revision: number
}

export interface CommandPaletteState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly view: 'search' | 'parameters' | 'result'
  readonly revision: number | null
  readonly query: string
  readonly categories: readonly { readonly id: string; readonly count: number }[]
  readonly items: Readonly<Record<string, Readonly<CommandPaletteItem>>>
  readonly visibleIds: readonly string[]
  readonly selectedId: string | null
  readonly selectionLost: boolean
  readonly draft: Readonly<CommandPaletteDraftState> | null
  readonly execution: {
    readonly status: 'idle' | 'submitting' | 'succeeded' | 'failed' | 'unknown'
    readonly commandId: string | null
    readonly result: string | null
    readonly error: string | null
  }
  readonly sensitiveResetRevision: number
  readonly truncated: boolean
  readonly error: string | null
}

export interface SettingsFormEntry {
  readonly formId: string
  readonly scope: SettingsSnapshot['scope']
  readonly selectedGroup: string | null
  readonly status: 'loading' | 'ready' | 'error'
  readonly description: Readonly<SettingsDescription> | null
  readonly schema: Readonly<CompiledForm> | null
  readonly form: Readonly<FormState> | null
  readonly reports: SettingsSnapshot['resolution']['reports']
  readonly content: Readonly<Record<string, Readonly<SettingsFieldContentState>>>
  readonly inheritedValues: Readonly<Record<string, unknown>>
  readonly unsets: Readonly<Record<string, number>>
  readonly revisions: Readonly<Record<string, number>>
  readonly receipt: Readonly<SettingsReceipt> | null
  readonly pendingKey: string | null
  readonly error: string | null
}

export type SettingsFieldContentState =
  | { readonly status: 'idle' | 'loading' }
  | { readonly status: 'ready'; readonly report: Extract<OptionContentReport, { readonly status: 'ready' }> }
  | {
      readonly status: 'unavailable'
      readonly report: Extract<OptionContentReport, { readonly status: 'unavailable' }>
    }
  | { readonly status: 'error'; readonly errorCode: string }

export interface SettingsWorkspaceState {
  readonly activeFormId: string | null
  readonly forms: Readonly<Record<string, Readonly<SettingsFormEntry>>>
}

export interface ProviderEditorState {
  readonly editorId: string
  readonly providerId: string | null
  readonly description: Readonly<ProviderEditorDescription>
  readonly schema: Readonly<CompiledForm>
  readonly form: Readonly<FormState>
  readonly draft: Readonly<ProviderEditorDraft>
  readonly baselineDraft: Readonly<ProviderEditorDraft>
  readonly draftDirty: readonly string[]
  readonly draftIssues: readonly ProviderEditorDraftIssue[]
  readonly selectedModelId: string | null
  readonly presets: Readonly<ProviderPresetCatalogState>
  readonly original: Readonly<ProviderProfile['provider']> | null
  readonly hasKey: boolean
  readonly sensitiveDirty: boolean
  readonly secretRevision: number
  readonly secretResetRevision: number
  readonly error: string | null
}

export interface ProviderEditorDraftModel {
  readonly id: string
  readonly name: string
  readonly visible: boolean
  readonly contextWindow: number
  readonly maxOutput: number
  readonly imageInput: boolean
  readonly reasoning: boolean
  readonly inputPrice: number
  readonly outputPrice: number
  readonly thinkingLevels: readonly ThinkingLevel[]
  readonly defaultThinkingLevel: ThinkingLevel
}

export interface ProviderEditorDraft {
  readonly id: string
  readonly name: string
  readonly visible: boolean
  readonly protocol: 'openai-completions' | 'openai-responses' | 'anthropic-messages' | 'mock'
  readonly baseUrl: string
  readonly model: string
  readonly models: readonly Readonly<ProviderEditorDraftModel>[]
}

export interface ProviderEditorDraftIssue {
  readonly path: string
  readonly code: string
}

export interface ProviderPresetCatalogState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly query: string
  readonly items: readonly Readonly<ProviderPresetSummary>[]
  readonly nextCursor: string | null
  readonly selectedPresetId: string | null
  readonly modelsQuery: string
  readonly models: readonly Readonly<ProviderPresetModel>[]
  readonly modelsNextCursor: string | null
  readonly catalogGeneratedAt: number | null
  readonly error: string | null
}

export interface ProviderSettingsState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly description: Readonly<ProviderEditorDescription> | null
  readonly listSchema: Readonly<CompiledKeyedList> | null
  readonly list: Readonly<KeyedListState> | null
  readonly profiles: Readonly<Record<string, Readonly<ProviderProfile>>>
  readonly editor: Readonly<ProviderEditorState> | null
  readonly error: string | null
}
export interface RunCommandPort extends CommandExecutor {
  getReceipt(
    sessionId: string,
    idempotencyKey: string,
    commandId?: 'run.submit' | 'run.retry',
  ): Promise<RunAccepted | null>
}

export interface SessionAttachmentTransfer {
  readonly id: string
  readonly ownerRevision: number
  readonly originalOperationId: string | null
  readonly name: string
  readonly mime: string
  readonly size: number
  readonly status: 'preparing' | 'uploading' | 'failed' | 'unknown' | 'reconciling' | 'ready'
  readonly kind: 'image' | 'file'
  readonly upload: AttachmentUploadInput | null
  readonly confirmed: PromptAttachment | null
  readonly error: string | null
}

export interface SessionDraftState {
  readonly sessionId: string
  readonly text: string
  readonly mentions: readonly Readonly<import('@hbar/contracts/commands/draft').PromptMention>[]
  readonly attachments: readonly Readonly<PromptAttachment>[]
  readonly attachmentTransfers: readonly SessionAttachmentTransfer[]
  readonly uploading: number
  readonly uploadError: string | null
  readonly revision: number
  readonly status: 'idle' | 'submitting' | 'unknown' | 'failed'
  readonly error: string | null
  readonly lastOperationId: string | null
}
export type SessionAttachmentUpload = AttachmentUploadInput
export type DraftsState = Readonly<Record<string, SessionDraftState>>

export interface InteractionRecoveryPort {
  getPlanExit?(target: {
    readonly sessionId: string
    readonly approvalId: string
    readonly runId: string
    readonly callId: string
  }): Promise<unknown>
  follow(
    sessionId: string,
    cursor: number,
  ): Promise<{
    readonly events: readonly SessionEvent[]
    readonly cursor: number
    readonly reset: boolean
  }>
}

export interface InteractionActionState {
  readonly id: string
  readonly kind: 'approval' | 'questionnaire'
  readonly sessionId: string
  readonly targetId: string
  readonly status: 'idle' | 'submitting' | 'unknown' | 'failed' | 'succeeded'
  readonly error: string | null
  readonly request?: UserInputRequest
  readonly approval?: Readonly<Approval>
  readonly startCursor?: number
  readonly reconciling?: boolean
  readonly questionnaireFact?: import('./interaction-presentations').QuestionnaireFact
  readonly submittedAnswers?: import('@hbar/contracts').UserInputResponse['answers']
  readonly submittedFeedback?: string
  readonly resolution?:
    | { readonly kind: 'approval'; readonly status: 'allowed' | 'denied' | 'cancelled' }
    | { readonly kind: 'questionnaire'; readonly status: 'answered' | 'cancelled' | 'failed' }
}
export type InteractionState = Readonly<Record<string, InteractionActionState>>

export interface QuestionnaireDraftState {
  readonly sessionId: string
  readonly requestId: string
  readonly revision: number
  readonly answers: Readonly<Record<string, { readonly kind: 'option' | 'custom'; readonly value: string }>>
  readonly request?: UserInputRequest
}
export type QuestionnaireDraftsState = Readonly<Record<string, QuestionnaireDraftState>>

export interface RunActionState {
  /** Runtime-owned records distinguish retries from cancellation; optional for older external projections. */
  readonly commandId?: 'run.retry' | 'operation.cancel'
  /** A receipt read must not be presented as a new Retry, or a new Retry as a read. */
  readonly phase?: 'request' | 'receipt'
  readonly operationId: string
  readonly status: 'submitting' | 'unknown' | 'failed' | 'succeeded'
  readonly error: string | null
}
export type RunActionsState = Readonly<Record<string, RunActionState>>

export interface SessionControlsState {
  readonly sessionId: string | null
  readonly status: 'idle' | 'loading' | 'ready' | 'partial'
  readonly model: Readonly<ModelConfiguration> | null
  readonly usage: Readonly<UsageQueryResult> | null
  readonly budget: Readonly<SessionBudget> | null
  readonly errors: {
    readonly model: string | null
    readonly usage: string | null
    readonly budget: string | null
  }
}

export interface ComposerModelState {
  readonly sessionId: string | null
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly models: readonly ModelDescriptor[]
  readonly error: string | null
  readonly action: {
    readonly status: 'idle' | 'submitting' | 'unknown' | 'failed'
    readonly error: string | null
  }
}
export type SessionTimelineUpdate =
  | { readonly kind: 'event'; readonly event: SessionEvent }
  | { readonly kind: 'stream'; readonly stream: StreamDelta }
  | { readonly kind: 'reset' }

export interface SessionTimelinePort {
  snapshot(sessionId: string, before?: number, limit?: number): Promise<SessionSnapshot>
  plan?(sessionId: string): Promise<PlanState | null>
  watch(
    sessionId: string,
    cursor: number,
    onUpdate: (update: SessionTimelineUpdate) => void,
  ): Promise<() => void | Promise<void>>
}

export interface SessionTimelineState {
  readonly sessionId: string | null
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly olderStatus: 'idle' | 'loading' | 'error' | 'limit'
  readonly olderError: string | null
  readonly messages: readonly Readonly<Message>[]
  readonly runs: readonly Readonly<Run>[]
  readonly approvals: readonly Readonly<Approval>[]
  readonly userInputs: readonly Readonly<UserInputRequest>[]
  readonly plan: Readonly<PlanState> | null
  readonly usage: Readonly<Usage>
  readonly streams: Readonly<Record<string, Readonly<LiveStream>>>
  readonly events: readonly Readonly<SessionEvent>[]
  readonly cursor: number
  readonly hasOlder: boolean
  readonly error: string | null
}
export interface SurfaceCapabilityPort {
  canRender(panelId: string): boolean
}
export interface PlatformPort {
  openWindow(window: WindowSurface): Promise<void>
  closeWindow(windowId: string): Promise<void>
}
export interface PanelSurface {
  /** Runtime-owned, immutable per-session tool target; absent on generic/project panels. */
  readonly sessionTool?: true
  readonly instanceId: string
  readonly panelId: string
  readonly workspaceId: string | null
  readonly sessionId: string | null
  readonly binding: 'followActive' | 'pinned'
  readonly params: Readonly<Record<string, unknown>>
}
export interface WindowSurface {
  readonly windowId: string
  readonly page: { readonly kind: string; readonly params: Readonly<Record<string, unknown>> }
}
export interface SurfaceState {
  readonly panels: Readonly<Record<string, PanelSurface>>
  readonly windows: Readonly<Record<string, WindowSurface>>
  readonly focusedPanelId: string | null
  readonly focusedWindowId: string | null
}
export type MainPageState =
  | { readonly kind: 'session' }
  | { readonly kind: 'settings'; readonly instanceId: string }
  | { readonly kind: 'status'; readonly instanceId: string }
export interface SessionViewContext {
  readonly workspaceId: string | null
  readonly sessionId: string | null
  readonly toolInstanceId: string | null
}
export interface PresentationState {
  readonly page: MainPageState
  readonly toolInstanceId: string | null
  readonly modalInstanceId: string | null
  readonly returnContext: SessionViewContext | null
  readonly sidebarOpen: boolean
}
export interface NavigationState {
  readonly workspaceId: string | null
  readonly sessionId: string | null
  readonly status: 'idle' | 'loading' | 'error'
  readonly error: { readonly code: string; readonly candidates: readonly string[] } | null
}
export interface DirectoryState {
  readonly workspaces: Readonly<Record<string, Readonly<Workspace>>>
  readonly sessions: Readonly<Record<string, Readonly<Session>>>
}
