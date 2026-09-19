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
import type { ModelConfiguration } from '@hbar/contracts/commands/models'
import type { UsageQueryResult } from '@hbar/contracts/commands/usage'
import type { AgentRecord } from '@hbar/contracts/commands/agents'
import type { PluginInfo, SkillDescriptor } from '@hbar/contracts/commands/extensions'
import type { MetricsQueryResult } from '@hbar/contracts/commands/metrics'
import type { GitStatsReport } from '@hbar/contracts'
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
} from '@hbar/contracts/commands/status-workspace'
import type { ProviderEditorDescription, ProviderProfile } from '@hbar/contracts/commands/configuration'
import type { CompiledKeyedList, KeyedListState } from '@hbar/schema-core'

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

export interface RuntimeOptions {
  readonly instanceId: string
  readonly hostId: string
  readonly directory: CommandExecutor
  readonly workspaces?: CommandExecutor
  readonly timeline?: SessionTimelinePort
  readonly run?: RunCommandPort
  readonly attachments?: CommandExecutor
  readonly interactions?: CommandExecutor
  readonly models?: CommandExecutor
  readonly usage?: CommandExecutor
  readonly budget?: BudgetCommandPort
  readonly settings?: CommandExecutor
  readonly configuration?: CommandExecutor
  readonly files?: CommandExecutor
  readonly agents?: CommandExecutor
  readonly goals?: CommandExecutor
  readonly extensions?: CommandExecutor
  readonly metrics?: CommandExecutor
  readonly git?: CommandExecutor
  readonly commandCatalog?: CommandCatalogPort
  readonly commandText?: CommandTextPort
  readonly schemaContent?: SchemaCallbackPort
  readonly resourcePicker?: ResourcePickerPort
  readonly surfaces?: SurfaceCapabilityPort
  readonly platform?: PlatformPort
  readonly persistence?: ClientPersistencePort
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

export interface GoalPlanGoalDraftState {
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

export interface ExtensionWorkspaceActionState {
  readonly status: 'submitting' | 'succeeded' | 'failed' | 'unknown'
  readonly error: string | null
}

export interface ExtensionWorkspaceEntryState {
  readonly instanceId: string
  readonly status: 'loading' | 'ready' | 'error'
  readonly plugins: readonly Readonly<PluginInfo>[]
  readonly skills: readonly Readonly<SkillDescriptor>[]
  readonly actions: Readonly<Record<string, Readonly<ExtensionWorkspaceActionState>>>
  readonly error: string | null
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

export interface FileWorkspaceEntryState {
  readonly instanceId: string
  readonly workspaceId: string
  readonly path: string
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
  readonly original: Readonly<ProviderProfile['provider']> | null
  readonly hasKey: boolean
  readonly sensitiveDirty: boolean
  readonly secretRevision: number
  readonly secretResetRevision: number
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

export interface SessionDraftState {
  readonly sessionId: string
  readonly text: string
  readonly attachments: readonly Readonly<PromptAttachment>[]
  readonly uploading: number
  readonly uploadError: string | null
  readonly revision: number
  readonly status: 'idle' | 'submitting' | 'unknown' | 'failed'
  readonly error: string | null
  readonly lastOperationId: string | null
}
export type SessionAttachmentUpload = AttachmentUploadInput
export type DraftsState = Readonly<Record<string, SessionDraftState>>

export interface InteractionActionState {
  readonly id: string
  readonly kind: 'approval' | 'questionnaire'
  readonly sessionId: string
  readonly targetId: string
  readonly status: 'submitting' | 'unknown' | 'failed' | 'succeeded'
  readonly error: string | null
}
export type InteractionState = Readonly<Record<string, InteractionActionState>>

export interface QuestionnaireDraftState {
  readonly sessionId: string
  readonly requestId: string
  readonly revision: number
  readonly answers: Readonly<Record<string, { readonly kind: 'option' | 'custom'; readonly value: string }>>
}
export type QuestionnaireDraftsState = Readonly<Record<string, QuestionnaireDraftState>>

export interface RunActionState {
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
export type SessionTimelineUpdate =
  | { readonly kind: 'event'; readonly event: SessionEvent }
  | { readonly kind: 'stream'; readonly stream: StreamDelta }
  | { readonly kind: 'reset' }

export interface SessionTimelinePort {
  snapshot(sessionId: string, before?: number, limit?: number): Promise<SessionSnapshot>
  watch(
    sessionId: string,
    cursor: number,
    onUpdate: (update: SessionTimelineUpdate) => void,
  ): Promise<() => void | Promise<void>>
}

export interface SessionTimelineState {
  readonly sessionId: string | null
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly messages: readonly Readonly<Message>[]
  readonly runs: readonly Readonly<Run>[]
  readonly approvals: readonly Readonly<Approval>[]
  readonly userInputs: readonly Readonly<UserInputRequest>[]
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
