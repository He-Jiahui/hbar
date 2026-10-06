import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Bot,
  ChartNoAxesColumnIncreasing,
  Files,
  ListChecks,
  ListTodo,
  Search,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import {
  LumenFrame,
  LumenText,
  LumenContentText,
  LumenButton,
  LumenConversation,
  LumenAiChat01,
  LumenAgentActivity03,
  LumenAgentApproval01,
  LumenIcon,
  LumenPageHeader,
  type LumenApprovalRequestLabels,
  type LumenMessageProps,
  type LumenPromptLabels,
  type LumenQuestionnaireLabels,
} from '@lumen/app-ui'
import {
  RuntimeCommandError,
  messageForkActionKey,
  planProposalActionKey,
  projectSessionDecisions,
  sessionDecisionAction,
  getGoalHistoryProjection,
  GOAL_HISTORY_MAX_FACTS,
  type PlanProposalState,
  type PromptMention,
  type SessionLaunchDraftEntry,
  type SessionDecision,
} from '@hbar/app-runtime'
import type { HbarProposedPlanLabels } from './proposed-plan'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { HbarDraftImageAttachments, HbarSessionImageLayer, type HbarSessionImagesOptions } from './session-images'
import {
  HbarMessageBlocks,
  HbarMessageActionBar,
  type HbarMessageBlocksLabels,
  type HbarMessageBlocksProps,
  type HbarMessageActionLabels,
  type HbarMessageForkAction,
} from './session-message'
import { projectSessionMessages, projectSessionTimelineSequence } from './session-message-model'
import { projectToolActivities, EMPTY_TOOL_ACTIVITIES } from './session-tool-activity-model'
import { conversationMessageExpectedText, type ConversationSelectionSubmission } from './conversation-selection-model'
import {
  HbarConversationSelection,
  useConversationSelectionKeyboardOwner,
  type HbarConversationSelectionLabels,
} from './conversation-selection'
import { HbarSessionDecision, type HbarSessionDecisionLabels } from './session-interactions'
import { HbarComposerModelPicker, type HbarComposerModelLabels } from './composer-model-picker'
import { HbarPromptComposer } from './prompt-composer'
import { useSessionReadingPosition } from './session-reading-position'
import {
  HbarComposerBackgroundAgentStop,
  HbarComposerBackgroundAgentFeedback,
  type HbarComposerBackgroundAgentLabels,
  type HbarBackgroundAgentFeedbackKind,
} from './composer-background-agents'
import { HbarComposerGoal, HbarComposerIntentControls, type HbarComposerIntentLabels } from './composer-intent-controls'
import { HbarSessionUsageControl, sessionUsagePresentation, type HbarSessionUsageLabels } from './session-usage-control'
import { HbarHistoricalPlanMessage, HbarProposedPlanMessage } from './proposed-plan-message'
import { HbarComposerPermissionPicker, type HbarComposerPermissionLabels } from './composer-permission-picker'
import { HbarSessionRunActivity, currentSessionRun, type HbarSessionRunLabels } from './session-run-activity'
import { HbarSessionLiveStatus, type HbarSessionLiveStatusLabels } from './session-live-status'
import { HbarQueuedUserRuns, type HbarQueuedUserRunsLabels } from './queued-user-runs'
import { HbarSessionToolsMenu, type HbarSessionToolsMenuLabels } from './session-tools-menu'
import { addComposerAttachments, type HbarSessionAttachmentSelection } from './composer-attachment-input'
import { HbarComposerMentionEditor, type HbarComposerMentionLabels } from './composer-mention-editor'
import { HbarComposerAddMenu, type HbarComposerAddMenuLabels } from './composer-add-menu'
import { HbarComposerAgentNotice } from './composer-agent-notice'
import { HbarAgentToolOpen, type HbarAgentToolOpenLabels } from './agent-tool-open'
import { agentToolOpenIdentity } from './agent-tool-open-model'
import {
  HbarSessionProjectContext,
  useHbarSessionProjectContext,
  type HbarSessionProjectContextLabels,
} from './session-project-context'
import {
  localAgentSlash,
  localGoalSlash,
  goalSlashReplacesCurrent,
  localSlashCanSubmit,
  localSlashCommand,
  type LocalSlashCommand,
} from './composer-slash'
import { HbarSessionEmptyHero, showSessionEmptyHero, type HbarSessionEmptyHeroLabels } from './session-empty-hero'
import type { MessageFileReferenceContext, MessageFileReferenceLabels } from './message-file-reference'
import type { HbarComposerSlashLabels } from './composer-slash-menu'
import { composerAgentSlashLabels } from './composer-agent-slash-labels'
import {
  HbarComposerAttachmentDropTarget,
  HbarComposerAttachmentTransfers,
  type HbarComposerAttachmentLabels,
} from './composer-attachments'
import { HbarComposerWorkspaceContexts, type HbarComposerWorkspaceContextLabels } from './composer-workspace-contexts'
export type { HbarSessionAttachmentSelection } from './composer-attachment-input'
import './lumen-session-workspace.css'

/** Waits for every editor write captured for the selected Session before a Plan decision is sent. */
export async function awaitComposerWrites(
  writesBySession: ReadonlyMap<string, ReadonlySet<Promise<unknown>>>,
  sessionId: string | null,
): Promise<void> {
  const writes = sessionId ? writesBySession.get(sessionId) : undefined
  if (!writes || writes.size === 0) return
  await Promise.all([...writes])
}
import {
  HbarPreSessionLaunchStatus,
  firstSendIsLocked,
  type HbarPreSessionLaunchStatusLabels,
} from './pre-session-launch-status'
import { useSessionFind } from './session-find'
import { useHbarMobileHeaderMenuSection, type HbarMobileHeaderMenuItem } from './mobile-header-menu'
import { HbarSessionStopNotice, useSessionStopAction } from './session-stop'
import { sessionStopCanCancel } from './session-stop-model'
import type { HbarSessionFindLabels } from './session-find-view'
import { HbarGoalContinuation, type HbarGoalContinuationLabels } from './goal-continuation'
import { HbarGoalLifecycleCard, type HbarGoalLifecycleLabels, type HbarGoalHistoryLabels } from './goal-lifecycle'
import { projectGoalLifecycleRows } from './goal-lifecycle-model'
import {
  HbarSessionExecutionNotice,
  sessionPreparationStatus,
  type HbarSessionExecutionLabels,
} from './session-execution-notice'

export interface HbarSessionWorkspaceLabels {
  readonly find: HbarSessionFindLabels
  readonly conversationTitle: (title: string) => string
  readonly loading: string
  readonly emptyHistory: string
  readonly emptyHero: HbarSessionEmptyHeroLabels
  readonly disconnected: string
  readonly executionAccess: HbarSessionExecutionLabels
  readonly liveStatus: HbarSessionLiveStatusLabels
  readonly refreshing: string
  readonly loadOlder: string
  readonly loadingOlder: string
  readonly retryHistory: string
  readonly retryTimeline: string
  readonly historyLimit: string
  readonly latest: string
  readonly readingPositionUnavailable: string
  readonly fileReferences: MessageFileReferenceLabels
  readonly author: Readonly<Record<'user' | 'assistant' | 'system' | 'tool', string>>
  readonly avatar: Readonly<Record<'user' | 'assistant' | 'system' | 'tool', string>>
  readonly copy: string
  readonly thinking: string
  readonly toolCall: (name: string) => string
  readonly toolResult: (name: string, failed: boolean) => string
  readonly attachment: (kind: 'image' | 'file', name: string) => string
  readonly timestamp: (value: number) => string
  readonly error: (code: string) => string
  readonly prompt: LumenPromptLabels
  readonly attachments: HbarComposerAttachmentLabels
  readonly workspaceContexts: HbarComposerWorkspaceContextLabels
  readonly conversationSelection: HbarConversationSelectionLabels
  readonly mentions: HbarComposerMentionLabels
  readonly slash: HbarComposerSlashLabels
  readonly addMenu: HbarComposerAddMenuLabels
  readonly modelPicker: HbarComposerModelLabels
  readonly intent: HbarComposerIntentLabels
  readonly permissionPicker: HbarComposerPermissionLabels
  readonly messageBlocks: HbarMessageBlocksLabels
  readonly messageActions: HbarMessageActionLabels
  readonly agentToolOpen: HbarAgentToolOpenLabels
  readonly messageFork: {
    readonly ready: string
    readonly submitting: string
    readonly retry: string
    readonly recheck: string
    readonly unknown: string
    readonly created: string
    readonly createdAfterTimestamp: (timestamp: string) => string
    readonly error: (code: string) => string
  }
  readonly runningActions: { readonly queueLabel: string; readonly queueTitle: string }
  readonly backgroundAgents: HbarComposerBackgroundAgentLabels
  readonly queuedUserRuns: HbarQueuedUserRunsLabels
  readonly decisions: HbarSessionDecisionLabels
  readonly goalContinuation: HbarGoalContinuationLabels
  readonly goalLifecycle: HbarGoalLifecycleLabels
  readonly goalHistory: HbarGoalHistoryLabels
  readonly proposedPlan: HbarProposedPlanLabels
  readonly proposedPlanReadOnly: string
  readonly proposedPlanAvailability: (value: PlanProposalState['availability']) => string | null
  readonly tools: HbarSessionToolsMenuLabels & {
    readonly label: string
    readonly files: string
    readonly activity: string
    readonly monitoring: string
    readonly agents: string
    readonly goals: string
    readonly settings: string
    readonly error: (code: string) => string
  }
  readonly runs: HbarSessionRunLabels
  readonly runDetail: (modelId: string) => string
  readonly runDuration: (startedAt: number, endedAt: number | null) => string
  readonly approval: LumenApprovalRequestLabels
  readonly approvalSummary: (tool: string) => string
  readonly questionnaire: LumenQuestionnaireLabels
  readonly usage: HbarSessionUsageLabels
}

export interface HbarSessionWorkspaceProps {
  readonly sessionTitle: string
  readonly workspaceName: string
  readonly workspacePath?: string | undefined
  readonly sessionWorkspaceId: string
  readonly labels: HbarSessionWorkspaceLabels
  readonly describeTool?: HbarMessageBlocksProps['describeTool']
  /** Undefined preserves the default Enter shortcut; null disables keyboard sending until resolved. */
  readonly sendBehavior?: 'enter' | 'modifierEnter' | null
  readonly connected: boolean
  readonly prepareAttachment?: ((file: File) => Promise<HbarSessionAttachmentSelection>) | undefined
  readonly files?: { execute(name: string, input: unknown): Promise<unknown> } | undefined
  readonly showFilesInHeader?: boolean | undefined
  readonly navigationAccessory?: ReactNode | undefined
  readonly firstSendLabels?: HbarPreSessionLaunchStatusLabels | undefined
  readonly projectContextLabels?: HbarSessionProjectContextLabels | undefined
  /** Rendered in place of readonly project context only while the Host-confirmed Session is empty. */
  readonly renderLaunchControls?: (() => ReactNode) | undefined
  readonly images?: HbarSessionImagesOptions | undefined
  readonly modelMenuPresentation?: 'native' | 'web' | undefined
}

function SessionToolButton({
  icon,
  label,
  selected,
  disabled,
  onClick,
}: {
  readonly icon: LucideIcon
  readonly label: string
  readonly selected?: boolean
  readonly disabled: boolean
  readonly onClick: () => void
}) {
  return (
    <LumenButton
      className="hbar-app-react-session-tool"
      size="s"
      variant="text"
      indicator="none"
      aria-label={label}
      title={label}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
    >
      <LumenIcon icon={icon} tier="sm" />
    </LumenButton>
  )
}

function SessionWorkspaceContent({
  sessionTitle,
  workspaceName,
  workspacePath,
  sessionWorkspaceId,
  labels,
  describeTool,
  sendBehavior,
  connected,
  prepareAttachment,
  files,
  showFilesInHeader = true,
  navigationAccessory,
  firstSendLabels,
  projectContextLabels,
  renderLaunchControls,
  images,
  modelMenuPresentation,
}: HbarSessionWorkspaceProps) {
  const runtime = useHbarRuntime()
  const stopRun = useSessionStopAction()
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const executionAccess = useHbarRuntimeState(runtime.state.sessionExecutionAccess)
  const selectedExecution = useHbarRuntimeState(runtime.state.selectedSessionExecution)
  const timeline = useHbarRuntimeState(runtime.state.timeline)
  const queuedUserRuns = useHbarRuntimeState(runtime.state.queuedUserRuns)
  const tabs = useHbarRuntimeState(runtime.state.workspaceTabs)
  const workspaceMoves = useHbarRuntimeState(runtime.state.sessionWorkspaceMove)
  const messageFork = useHbarRuntimeState(runtime.state.messageFork)
  const drafts = useHbarRuntimeState(runtime.state.drafts)
  const firstSendDrafts = useHbarRuntimeState(runtime.state.preSessionDrafts)
  const sessionLaunchDrafts = useHbarRuntimeState(runtime.state.sessionLaunchDrafts)
  const interactions = useHbarRuntimeState(runtime.state.interactions)
  const questionnaires = useHbarRuntimeState(runtime.state.questionnaires)
  const runActions = useHbarRuntimeState(runtime.state.runActions)
  const controls = useHbarRuntimeState(runtime.state.controls)
  const composerModel = useHbarRuntimeState(runtime.state.composerModel)
  const agentComposer = useHbarRuntimeState(runtime.state.agentComposer)
  const backgroundAgents = useHbarRuntimeState(runtime.state.composerBackgroundAgents)
  const composerIntent = useHbarRuntimeState(runtime.state.composerIntent)
  const goalHistory = useHbarRuntimeState(runtime.state.goalHistory)
  const composerPermission = useHbarRuntimeState(runtime.state.composerPermission)
  const composerPlanMode = useHbarRuntimeState(runtime.state.composerPlanMode)
  const planProposal = useHbarRuntimeState(runtime.state.planProposal)
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const sessionId = navigation.sessionId
  const workspaceMoveEntry = sessionId
    ? (workspaceMoves.entries[sessionId] ??
      Object.values(workspaceMoves.entries).find((entry) => entry.targetSessionId === sessionId))
    : undefined
  const workspaceMoveLocked = Boolean(
    workspaceMoveEntry &&
    workspaceMoveEntry.status !== 'succeeded' &&
    (workspaceMoveEntry.status === 'busy' ||
      workspaceMoveEntry.status === 'unknown' ||
      workspaceMoveEntry.status === 'paused' ||
      workspaceMoveEntry.targetSessionId !== null),
  )
  const firstSendDraft = Object.values(firstSendDrafts).find(
    (entry) =>
      entry.sessionId === sessionId &&
      entry.capturedWorkspaceId === sessionWorkspaceId &&
      entry.error !== 'GOAL_PREPARED' &&
      entry.phase !== 'accepted' &&
      entry.phase !== 'idle',
  )
  const firstSendLocked = firstSendIsLocked(firstSendDraft)
  const slashLabels = useMemo<HbarComposerSlashLabels>(
    () => composerAgentSlashLabels(labels.slash, agentComposer.profileCatalog),
    [agentComposer.profileCatalog, labels.slash],
  )
  useEffect(() => {
    if (!connected || !sessionId || !navigation.workspaceId) return
    void runtime.commands
      .execute('agentComposer.refresh', { sessionId, workspaceId: navigation.workspaceId })
      .catch(() => undefined)
  }, [connected, navigation.workspaceId, runtime.commands, sessionId])
  const find = useSessionFind(timeline, labels.find)
  useConversationSelectionKeyboardOwner(find.workspaceRef)
  const preparationStatus = sessionPreparationStatus(
    executionAccess,
    sessionId && navigation.workspaceId === sessionWorkspaceId ? { sessionId, workspaceId: sessionWorkspaceId } : null,
  )
  const canPrepare = preparationStatus === 'ready' && !firstSendLocked && !workspaceMoveLocked
  const draft = sessionId ? drafts[sessionId] : undefined
  const composerDraft = sessionId ? (runtime.state.drafts.getSnapshot()[sessionId] ?? draft) : draft
  const agentAction = sessionId ? agentComposer.actions[sessionId] : undefined
  const intentEntry = sessionId ? composerIntent.entries[sessionId] : undefined
  const goalHistoryEntry = sessionId ? goalHistory.sessions[sessionId] : undefined
  const goalHistoryProjection = useMemo(
    () => (goalHistoryEntry ? getGoalHistoryProjection(goalHistoryEntry) : null),
    [goalHistoryEntry],
  )
  const goalLifecycleRows = useMemo(
    () =>
      sessionId && goalHistoryProjection?.preceding
        ? projectGoalLifecycleRows({
            sessionId,
            facts: goalHistoryProjection.facts,
            preceding: goalHistoryProjection.preceding,
          })
        : [],
    [sessionId, goalHistoryProjection],
  )
  const permissionEntry = sessionId ? composerPermission.entries[sessionId] : undefined
  const planModeEntry = sessionId ? composerPlanMode.entries[sessionId] : undefined
  const intentPending = intentEntry?.submission.status === 'submitting' || intentEntry?.submission.status === 'unknown'
  const activeSessionTab = tabs.items.find((tab) => tab.id === tabs.activeId)
  const activeConversationOwner =
    navigation.status === 'idle' &&
    Boolean(sessionId) &&
    navigation.sessionId === sessionId &&
    navigation.workspaceId === sessionWorkspaceId &&
    presentation.page.kind === 'session' &&
    (tabs.activeId === null
      ? activeSessionTab === undefined
      : activeSessionTab?.kind === 'session' &&
        activeSessionTab.sessionId === sessionId &&
        activeSessionTab.workspaceId === sessionWorkspaceId)
  const conversationSelectionEnabled =
    connected &&
    activeConversationOwner &&
    timeline.sessionId === sessionId &&
    timeline.status === 'ready' &&
    !workspaceMoveLocked &&
    !firstSendLocked &&
    !intentPending &&
    draft?.status !== 'submitting' &&
    draft?.status !== 'unknown'
  const intent = intentEntry?.intent ?? 'default'
  const model = controls.sessionId === sessionId ? controls.model : null
  const configured = model?.status === 'configured' && model.modelId !== null
  const modelPending =
    composerModel.sessionId === sessionId &&
    (composerModel.action.status === 'submitting' || composerModel.action.status === 'unknown')
  const activeRuns = timeline.runs.filter((run) => ['queued', 'running', 'waiting_approval'].includes(run.status))
  const activeRun = currentSessionRun(activeRuns)
  const canCancelRun = (operationId: string) =>
    sessionStopCanCancel(
      {
        hostId: runtime.hostId,
        runtimeId: runtime.instanceId,
        connected,
        navigation,
        tabs,
        presentation,
        surfaces,
        timeline,
        actions: runActions,
      },
      operationId,
    )
  const terminalRunId =
    [...timeline.runs].reverse().find((run) => ['completed', 'failed', 'cancelled'].includes(run.status))?.id ?? null
  const projectContext = useHbarSessionProjectContext({
    sessionId,
    workspaceId: sessionWorkspaceId,
    connected,
    terminalRunId,
    enabled: Boolean(projectContextLabels),
  })
  const projectContextView = (showLaunchControls: boolean) =>
    showLaunchControls && renderLaunchControls ? (
      renderLaunchControls()
    ) : projectContextLabels && sessionId ? (
      <HbarSessionProjectContext
        workspaceName={workspaceName}
        workspacePath={workspacePath}
        sessionId={sessionId}
        workspaceId={sessionWorkspaceId}
        connected={connected}
        context={projectContext.context}
        labels={projectContextLabels}
        onRetry={projectContext.onRetry}
      />
    ) : null
  const execute = (name: string, input: unknown) =>
    (runtime.commands.execute as (command: string, value: unknown) => Promise<unknown>)(name, input)
  const invoke = (name: string, input: unknown) => void execute(name, input).catch(() => {})
  const canPrepareTarget = (targetSessionId: string, targetWorkspaceId: string) =>
    runtime.getSessionExecutionAccess({ sessionId: targetSessionId, workspaceId: targetWorkspaceId }).kind === 'ready'
  const hasOwnedEmptySessionLaunchDraft = (targetSessionId: string, targetWorkspaceId: string) => {
    const owner = runtime.state.sessionLaunchDrafts.getSnapshot().entries[targetSessionId]
    const navigationState = runtime.state.navigation.getSnapshot()
    const latestDraft = runtime.state.drafts.getSnapshot()[targetSessionId]
    const sessionTimeline = runtime.state.timeline.getSnapshot()
    const submission = runtime.state.composerIntent.getSnapshot().entries[targetSessionId]?.submission.status
    return Boolean(
      owner?.workspaceId === targetWorkspaceId &&
      navigationState.status === 'idle' &&
      navigationState.sessionId === targetSessionId &&
      navigationState.workspaceId === targetWorkspaceId &&
      latestDraft?.lastOperationId === null &&
      sessionTimeline.sessionId === targetSessionId &&
      sessionTimeline.status === 'ready' &&
      sessionTimeline.messages.length === 0 &&
      !sessionTimeline.hasOlder &&
      sessionTimeline.runs.length === 0 &&
      sessionTimeline.approvals.length === 0 &&
      sessionTimeline.userInputs.length === 0 &&
      Object.keys(sessionTimeline.streams).length === 0 &&
      !['submitting', 'unknown'].includes(submission ?? ''),
    )
  }
  const prepareSessionLaunchTarget = async (
    targetSessionId: string,
    targetWorkspaceId: string,
    expectedDraftRevision: number,
  ): Promise<number> => {
    if (!runtime.state.sessionLaunchDrafts.getSnapshot().available)
      throw new RuntimeCommandError('CAPABILITY_UNAVAILABLE', 'Session Location preparation is unavailable')
    const selected = runtime.state.navigation.getSnapshot()
    const latestDraft = runtime.state.drafts.getSnapshot()[targetSessionId]
    const sessionTimeline = runtime.state.timeline.getSnapshot()
    const intentSubmission = runtime.state.composerIntent.getSnapshot().entries[targetSessionId]?.submission.status
    if (
      selected.status !== 'idle' ||
      selected.sessionId !== targetSessionId ||
      selected.workspaceId !== targetWorkspaceId ||
      latestDraft?.revision !== expectedDraftRevision ||
      latestDraft.lastOperationId !== null ||
      sessionTimeline.sessionId !== targetSessionId ||
      sessionTimeline.status !== 'ready' ||
      sessionTimeline.messages.length > 0 ||
      sessionTimeline.hasOlder ||
      sessionTimeline.runs.length > 0 ||
      sessionTimeline.approvals.length > 0 ||
      sessionTimeline.userInputs.length > 0 ||
      Object.keys(sessionTimeline.streams).length > 0 ||
      ['submitting', 'unknown'].includes(intentSubmission ?? '')
    )
      throw new RuntimeCommandError('SESSION_LAUNCH_TARGET_LOCKED', 'This Session is no longer empty')
    const existing = runtime.state.sessionLaunchDrafts.getSnapshot().entries[targetSessionId]
    const entry: SessionLaunchDraftEntry =
      existing ??
      (await runtime.commands.execute('sessionLaunchDraft.open', {
        sessionId: targetSessionId,
        workspaceId: targetWorkspaceId,
      }))
    if (entry.workspaceId !== targetWorkspaceId || entry.sessionId !== targetSessionId)
      throw new RuntimeCommandError('STALE_TARGET', 'Launch choice belongs to another Session or Workspace')
    const prepared = await runtime.commands.execute('sessionLaunchDraft.prepare', {
      sessionId: targetSessionId,
      expectedRevision: entry.revision,
    })
    const current = runtime.state.sessionLaunchDrafts.getSnapshot().entries[targetSessionId]
    const currentNavigation = runtime.state.navigation.getSnapshot()
    const currentDraft = runtime.state.drafts.getSnapshot()[targetSessionId]
    if (
      prepared.phase !== 'ready' ||
      prepared.targetRevision === null ||
      current?.revision !== entry.revision ||
      current.phase !== 'ready' ||
      current.targetRevision !== prepared.targetRevision ||
      currentNavigation.status !== 'idle' ||
      currentNavigation.sessionId !== targetSessionId ||
      currentNavigation.workspaceId !== targetWorkspaceId ||
      currentDraft?.revision !== expectedDraftRevision
    )
      throw new RuntimeCommandError(
        prepared.error ?? current?.error ?? 'STALE_TARGET',
        'First-send launch preparation is not ready',
      )
    return prepared.targetRevision
  }
  const releaseSessionLaunchChoices = (targetSessionId: string) => {
    void runtime.commands.execute('sessionLaunchDraft.close', { sessionId: targetSessionId }).catch(() => undefined)
    void runtime.commands
      .execute('sessionLaunchBranchCreation.cancel', { draftId: targetSessionId })
      .catch(() => undefined)
  }
  const composerWrite = useRef<{ sessionId: string; promise: Promise<unknown> } | null>(null)
  const composerWrites = useRef(new Map<string, Set<Promise<unknown>>>())
  const firstSessionRunInFlight = useRef<string | null>(null)
  const composerGoalTrigger = useRef<HTMLButtonElement>(null)
  const [goalMenuSlot, setGoalMenuSlot] = useState<HTMLDivElement | null>(null)
  const [goalPreparedRequest, setGoalPreparedRequest] = useState(0)
  const [editorFocusRequest, setEditorFocusRequest] = useState(0)
  const composerWriteError = useRef<{ sessionId: string; error: unknown } | null>(null)
  const localSlashInFlight = useRef(false)
  const pendingModelSlash = useRef<{ sessionId: string; workspaceId: string; revision: number } | null>(null)
  const [modelOpenRequest, setModelOpenRequest] = useState(0)
  const [slashOpenRequest, setSlashOpenRequest] = useState(0)
  const [slashFailure, setSlashFailure] = useState<{ sessionId: string; code: string; profileId?: string } | null>(null)
  const [workspaceContextFailure, setWorkspaceContextFailure] = useState<{ sessionId: string; message: string } | null>(
    null,
  )
  const [launchTargetFailure, setLaunchTargetFailure] = useState<{ sessionId: string; code: string } | null>(null)
  const [goalConfirmation, setGoalConfirmation] = useState<{
    sessionId: string
    workspaceId: string
    revision: number
    text: string
    expectedGoalId: string
    previousObjective: string
    action: 'set' | 'clear'
    objective?: string
  } | null>(null)
  const slashIds = slashLabels.commands.map((item) => item.id)
  const sessionSlashSubmitCandidates: readonly LocalSlashCommand[] = ['model', 'settings', 'agents', 'cost', 'help']
  const submitSlashCommands = sessionSlashSubmitCandidates.filter((command) => slashIds.includes(command))
  useEffect(() => {
    pendingModelSlash.current = null
    localSlashInFlight.current = false
    setGoalConfirmation(null)
    setWorkspaceContextFailure(null)
  }, [sessionId])
  const saveComposerContent = (
    targetSessionId: string,
    text: string,
    mentions: readonly PromptMention[],
    expectedRevision: number,
  ) => {
    setSlashFailure((current) => (current?.sessionId === targetSessionId ? null : current))
    const promise = execute('draft.setContent', { sessionId: targetSessionId, text, mentions, expectedRevision })
    const writes = composerWrites.current.get(targetSessionId) ?? new Set<Promise<unknown>>()
    writes.add(promise)
    composerWrites.current.set(targetSessionId, writes)
    const token = { sessionId: targetSessionId, promise }
    composerWrite.current = token
    void promise.then(
      () => {
        writes.delete(promise)
        if (writes.size === 0) composerWrites.current.delete(targetSessionId)
        if (composerWrite.current === token) {
          composerWrite.current = null
          composerWriteError.current = null
        }
      },
      (error) => {
        writes.delete(promise)
        if (writes.size === 0) composerWrites.current.delete(targetSessionId)
        if (composerWrite.current === token) {
          composerWrite.current = null
          composerWriteError.current = { sessionId: targetSessionId, error }
        }
      },
    )
    return promise
  }
  const clearLocalSlash = async (target: { sessionId: string; workspaceId: string; revision: number }) => {
    const selected = runtime.state.navigation.getSnapshot()
    const latest = runtime.state.drafts.getSnapshot()[target.sessionId]
    if (
      selected.sessionId !== target.sessionId ||
      selected.workspaceId !== target.workspaceId ||
      latest?.revision !== target.revision ||
      !localSlashCommand(latest.text, slashIds) ||
      latest.mentions.length ||
      latest.workspaceContexts?.length ||
      latest.attachments.length ||
      latest.attachmentTransfers.length
    )
      return
    await execute('draft.setContent', {
      sessionId: target.sessionId,
      text: '',
      mentions: [],
      expectedRevision: target.revision,
    })
  }
  const runGoalSlash = async (
    target: { sessionId: string; workspaceId: string; revision: number; text: string },
    command: { action: 'set'; objective: string } | { action: 'clear' },
    expectedGoalId?: string,
  ) => {
    if (localSlashInFlight.current) return
    const selected = runtime.state.navigation.getSnapshot()
    const latest = runtime.state.drafts.getSnapshot()[target.sessionId]
    const goalFacts = runtime.state.composerIntent.getSnapshot().facts
    const replacing = goalSlashReplacesCurrent(
      command,
      goalFacts.sessionId === target.sessionId ? goalFacts.snapshot?.goal : null,
    )
    if (
      selected.sessionId !== target.sessionId ||
      selected.workspaceId !== target.workspaceId ||
      latest?.revision !== target.revision ||
      latest.text !== target.text ||
      latest.mentions.length ||
      latest.workspaceContexts?.length ||
      latest.attachments.length ||
      latest.attachmentTransfers.length ||
      (activeRun && !replacing)
    )
      return
    localSlashInFlight.current = true
    setSlashFailure(null)
    try {
      const modelState = runtime.state.controls.getSnapshot()
      const currentModel = modelState.sessionId === target.sessionId ? modelState.model : null
      if (
        command.action === 'set' &&
        !replacing &&
        (!currentModel || currentModel.status !== 'configured' || !currentModel.modelId)
      ) {
        setSlashFailure({ sessionId: target.sessionId, code: 'MODEL_NOT_CONFIGURED' })
        return
      }
      const permissionState = runtime.state.composerPermission.getSnapshot()
      const permission = permissionState.entries[target.sessionId]
      if (command.action === 'set' && permission?.locked && !replacing) {
        setSlashFailure({ sessionId: target.sessionId, code: 'SUBMISSION_PENDING' })
        return
      }
      const result = await execute('composerIntent.commandGoal', {
        sessionId: target.sessionId,
        ...command,
        ...(expectedGoalId ? { expectedGoalId } : {}),
      })
      const hostOwnsExecution =
        result && typeof result === 'object' && 'executionOwner' in result && result.executionOwner === 'host'
      if (command.action === 'set' && !hostOwnsExecution) {
        const goalId =
          result && typeof result === 'object' && 'goalId' in result && typeof result.goalId === 'string'
            ? result.goalId
            : null
        if (!goalId || !currentModel?.modelId) {
          setSlashFailure({ sessionId: target.sessionId, code: 'INVALID_OUTPUT' })
          return
        }
        let expectedLaunchTargetRevision: number | undefined
        if (
          (welcome && renderLaunchControls !== undefined) ||
          hasOwnedEmptySessionLaunchDraft(target.sessionId, target.workspaceId)
        ) {
          try {
            expectedLaunchTargetRevision = await prepareSessionLaunchTarget(
              target.sessionId,
              target.workspaceId,
              target.revision,
            )
          } catch (reason) {
            const code =
              reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
                ? reason.code
                : 'EXECUTION_FAILED'
            setSlashFailure({ sessionId: target.sessionId, code })
            return
          }
        }
        await execute('composerIntent.startGoalRun', {
          sessionId: target.sessionId,
          objective: command.objective,
          expectedGoalId: goalId,
          modelId: currentModel.modelId,
          ...(expectedLaunchTargetRevision === undefined ? {} : { expectedLaunchTargetRevision }),
          ...(currentModel.thinkingLevel ? { thinking: currentModel.thinkingLevel } : {}),
          ...(permissionState.available ? { expectedPermissionRevision: permission?.revision ?? 0 } : {}),
          expectedDraftRevision: target.revision,
          draftText: target.text,
        })
        if (expectedLaunchTargetRevision !== undefined) releaseSessionLaunchChoices(target.sessionId)
      }
      await clearLocalSlash(target)
    } catch (reason) {
      const code =
        reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
          ? reason.code
          : 'EXECUTION_FAILED'
      setSlashFailure({
        sessionId: target.sessionId,
        code: code === 'RUN_ACTIVE' ? 'GOAL_RUN_ACTIVE' : code,
      })
    } finally {
      localSlashInFlight.current = false
    }
  }
  const submitLatest = async (targetSessionId: string, targetWorkspaceId: string) => {
    if (
      Object.values(runtime.state.preSessionDrafts.getSnapshot()).some(
        (entry) =>
          entry.sessionId === targetSessionId &&
          entry.capturedWorkspaceId === targetWorkspaceId &&
          firstSendIsLocked(entry),
      )
    )
      return
    const pending = composerWrite.current
    if (pending?.sessionId === targetSessionId) {
      try {
        await pending.promise
      } catch {
        return
      }
    }
    if (composerWriteError.current?.sessionId === targetSessionId) return
    const selected = runtime.state.navigation.getSnapshot()
    const latest = runtime.state.drafts.getSnapshot()[targetSessionId]
    if (latest && /^\/agent(?:\s|$)/.test(latest.text.trim())) {
      if (!connected || selected.sessionId !== targetSessionId || selected.workspaceId !== targetWorkspaceId) return
      const command = localAgentSlash(latest.text)
      if (!command) {
        setSlashFailure({ sessionId: targetSessionId, code: 'AGENT_REQUIRED' })
        return
      }
      let catalog = runtime.state.agentComposer.getSnapshot().profileCatalog
      if (catalog.status !== 'ready') {
        if (localSlashInFlight.current) return
        localSlashInFlight.current = true
        try {
          await runtime.commands.execute('agentComposer.refresh', {
            sessionId: targetSessionId,
            workspaceId: targetWorkspaceId,
          })
          catalog = runtime.state.agentComposer.getSnapshot().profileCatalog
        } catch {
          setSlashFailure({ sessionId: targetSessionId, code: 'AGENT_CATALOG_UNAVAILABLE' })
          return
        } finally {
          localSlashInFlight.current = false
        }
        const currentTarget = runtime.state.navigation.getSnapshot()
        const currentDraft = runtime.state.drafts.getSnapshot()[targetSessionId]
        if (
          currentTarget.sessionId !== targetSessionId ||
          currentTarget.workspaceId !== targetWorkspaceId ||
          currentDraft?.revision !== latest.revision ||
          composerWrite.current?.sessionId === targetSessionId
        )
          return
      }
      if (catalog.status !== 'ready') {
        setSlashFailure({ sessionId: targetSessionId, code: 'AGENT_CATALOG_UNAVAILABLE' })
        return
      }
      if (!catalog.profiles.some((profile) => profile === command.profileId)) {
        setSlashFailure({ sessionId: targetSessionId, code: 'AGENT_PROFILE_UNAVAILABLE', profileId: command.profileId })
        return
      }
      // Completion/validation never creates a child. The ordinary parent Run below
      // owns its exact draft, attachments, model, permission and unknown receipt.
      setSlashFailure(null)
    }
    const slash = latest && localSlashCommand(latest.text, slashIds)
    if (slash) {
      const currentIntent = runtime.state.composerIntent.getSnapshot().entries[targetSessionId]
      const currentPermission = runtime.state.composerPermission.getSnapshot().entries[targetSessionId]
      const currentModelAction = runtime.state.composerModel.getSnapshot()
      const pendingGoalCommand = slash === 'goal' && latest ? localGoalSlash(latest.text) : null
      const currentGoalFacts = runtime.state.composerIntent.getSnapshot().facts
      const currentGoal = currentGoalFacts.sessionId === targetSessionId ? currentGoalFacts.snapshot?.goal : null
      const activeGoalReplacement = Boolean(activeRun && goalSlashReplacesCurrent(pendingGoalCommand, currentGoal))
      if (
        !connected ||
        selected.sessionId !== targetSessionId ||
        selected.workspaceId !== targetWorkspaceId ||
        !latest ||
        !localSlashCanSubmit({
          draftStatus: latest.status,
          modelPending:
            currentModelAction.sessionId === targetSessionId &&
            ['submitting', 'unknown'].includes(currentModelAction.action.status),
          intentPending: ['submitting', 'unknown'].includes(currentIntent?.submission.status ?? ''),
          permissionLocked: Boolean(currentPermission?.locked) && !activeGoalReplacement,
        }) ||
        localSlashInFlight.current
      )
        return
      if (latest.mentions.length || latest.attachments.length || latest.attachmentTransfers.length) {
        setSlashFailure({ sessionId: targetSessionId, code: 'ATTACHMENTS' })
        return
      }
      if (slash === 'model' && modelPending) return
      if (slash === 'model' && activeRun) {
        setSlashFailure({ sessionId: targetSessionId, code: 'RUN_ACTIVE' })
        return
      }
      if (slash === 'model' && !canPrepareTarget(targetSessionId, targetWorkspaceId)) return
      const target = { sessionId: targetSessionId, workspaceId: targetWorkspaceId, revision: latest.revision }
      if (slash === 'goal') {
        if (['submitting', 'unknown'].includes(currentIntent?.goalAction.status ?? '')) return
        const command = localGoalSlash(latest.text)
        if (!command) {
          setSlashFailure({ sessionId: targetSessionId, code: 'GOAL_REQUIRED' })
          return
        }
        if (activeRun && !activeGoalReplacement) {
          setSlashFailure({ sessionId: targetSessionId, code: 'GOAL_RUN_ACTIVE' })
          return
        }
        const facts = runtime.state.composerIntent.getSnapshot().facts
        if (facts.sessionId !== targetSessionId || facts.status !== 'ready' || !facts.snapshot) {
          setSlashFailure({ sessionId: targetSessionId, code: 'GOAL_SNAPSHOT_UNAVAILABLE' })
          return
        }
        const previous = facts.snapshot.goal
        if (previous && !previous.goalId) {
          setSlashFailure({ sessionId: targetSessionId, code: 'GOAL_SNAPSHOT_UNAVAILABLE' })
          return
        }
        if (previous && (command.action === 'clear' || previous.objective !== command.objective)) {
          setGoalConfirmation({
            ...target,
            text: latest.text,
            expectedGoalId: previous.goalId!,
            previousObjective: previous.objective,
            ...command,
          })
          setSlashFailure(null)
          return
        }
        await runGoalSlash({ ...target, text: latest.text }, command, previous?.goalId)
        return
      }
      localSlashInFlight.current = true
      setSlashFailure(null)
      try {
        if (slash === 'model') {
          pendingModelSlash.current = target
          setModelOpenRequest((value) => value + 1)
        } else if (slash === 'cost' || slash === 'agents') {
          const opened = await runtime.commands.execute('sessionTools.open', {
            panelId: slash === 'agents' ? 'agents' : 'monitoring',
            workspaceId: targetWorkspaceId,
            sessionId: targetSessionId,
            sourceTabInstanceKey: sourceTab?.instanceKey ?? null,
          })
          const presented = runtime.state.presentation.getSnapshot()
          if (presented.page.kind === 'session' && presented.toolInstanceId === opened.instanceId)
            await clearLocalSlash(target)
        } else if (slash === 'help') {
          const opened = await runtime.commands.execute('app.openPanel', { panelId: 'commands' })
          const presented = runtime.state.presentation.getSnapshot()
          if (opened.panelId === 'commands' && presented.modalInstanceId === opened.instanceId)
            await clearLocalSlash(target)
        } else {
          await execute('app.openSettings', {
            scope: 'session',
            targetId: targetSessionId,
            workspaceId: targetWorkspaceId,
            sessionId: targetSessionId,
            binding: 'pinned',
          })
          const presented = runtime.state.presentation.getSnapshot().page
          if (presented.kind === 'settings') await clearLocalSlash(target)
        }
      } catch (reason) {
        setSlashFailure({
          sessionId: targetSessionId,
          code:
            reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
              ? reason.code
              : 'EXECUTION_FAILED',
        })
      } finally {
        if (slash !== 'model') localSlashInFlight.current = false
      }
      return
    }
    const modelState = runtime.state.controls.getSnapshot()
    const currentModel = modelState.sessionId === targetSessionId ? modelState.model : null
    const intentState = runtime.state.composerIntent.getSnapshot().entries[targetSessionId]
    const planModeState = runtime.state.composerPlanMode.getSnapshot()
    const permissionState = runtime.state.composerPermission.getSnapshot()
    const permission = permissionState.entries[targetSessionId]
    const modelAction = runtime.state.composerModel.getSnapshot()
    const sessionTimeline = runtime.state.timeline.getSnapshot()
    const launchPreparationRequired =
      ((welcome && renderLaunchControls !== undefined) ||
        hasOwnedEmptySessionLaunchDraft(targetSessionId, targetWorkspaceId)) &&
      sessionTimeline.sessionId === targetSessionId &&
      sessionTimeline.status === 'ready' &&
      latest?.lastOperationId === null &&
      sessionTimeline.messages.length === 0 &&
      !sessionTimeline.hasOlder &&
      sessionTimeline.runs.length === 0 &&
      sessionTimeline.approvals.length === 0 &&
      sessionTimeline.userInputs.length === 0 &&
      Object.keys(sessionTimeline.streams).length === 0 &&
      !['submitting', 'unknown'].includes(intentState?.submission.status ?? '')
    if (
      !connected ||
      !canPrepareTarget(targetSessionId, targetWorkspaceId) ||
      selected.sessionId !== targetSessionId ||
      selected.workspaceId !== targetWorkspaceId ||
      !latest ||
      !currentModel ||
      currentModel.status !== 'configured' ||
      !currentModel.modelId ||
      sessionTimeline.sessionId !== targetSessionId ||
      ['loading', 'error'].includes(sessionTimeline.status) ||
      latest.status === 'unknown' ||
      latest.status === 'submitting' ||
      latest.attachmentTransfers.length ||
      (!latest.text.trim() && !latest.attachments.length && !latest.workspaceContexts?.length) ||
      (intentState?.intent === 'goal' && !latest.text.trim()) ||
      permission?.locked ||
      (modelAction.sessionId === targetSessionId && ['submitting', 'unknown'].includes(modelAction.action.status)) ||
      ['submitting', 'unknown'].includes(intentState?.submission.status ?? '') ||
      (planModeState.available &&
        (planModeState.entries[targetSessionId]?.status !== 'ready' || !planModeState.entries[targetSessionId]?.mode))
    )
      return
    const submitInput = {
      sessionId: targetSessionId,
      modelId: currentModel.modelId,
      expectedIntentRevision: intentState?.revision ?? 0,
      expectedDraftRevision: latest.revision,
      ...(permissionState.available ? { expectedPermissionRevision: permission?.revision ?? 0 } : {}),
      input: {
        text: latest.text,
        images: latest.attachments.filter((item) => item.kind === 'image').map((item) => item.artifact),
        files: latest.attachments.filter((item) => item.kind === 'file').map((item) => item.artifact),
        ...(currentModel.thinkingLevel ? { thinking: currentModel.thinkingLevel } : {}),
      },
    }
    if (launchPreparationRequired) {
      if (firstSessionRunInFlight.current === targetSessionId) return
      firstSessionRunInFlight.current = targetSessionId
      setLaunchTargetFailure(null)
      try {
        const expectedLaunchTargetRevision = await prepareSessionLaunchTarget(
          targetSessionId,
          targetWorkspaceId,
          latest.revision,
        )
        const currentNavigation = runtime.state.navigation.getSnapshot()
        const currentDraft = runtime.state.drafts.getSnapshot()[targetSessionId]
        const currentComposerIntent = runtime.state.composerIntent.getSnapshot().entries[targetSessionId]
        const currentComposerModel = runtime.state.controls.getSnapshot()
        const currentPermission = runtime.state.composerPermission.getSnapshot().entries[targetSessionId]
        const currentPlanMode = runtime.state.composerPlanMode.getSnapshot().entries[targetSessionId]
        if (
          currentNavigation.status !== 'idle' ||
          currentNavigation.sessionId !== targetSessionId ||
          currentNavigation.workspaceId !== targetWorkspaceId ||
          currentDraft?.revision !== latest.revision ||
          (currentComposerIntent?.revision ?? 0) !== submitInput.expectedIntentRevision ||
          currentComposerModel.sessionId !== targetSessionId ||
          currentComposerModel.model?.status !== 'configured' ||
          currentComposerModel.model.modelId !== submitInput.modelId ||
          currentComposerModel.model.thinkingLevel !== currentModel.thinkingLevel ||
          (permissionState.available &&
            (currentPermission?.locked || currentPermission?.revision !== (permission?.revision ?? 0))) ||
          (planModeState.available &&
            (currentPlanMode?.status !== 'ready' ||
              currentPlanMode.mode !== planModeState.entries[targetSessionId]?.mode))
        )
          throw new RuntimeCommandError('VERSION_CONFLICT', 'Composer choices changed during first-send preparation')
        await runtime.commands.execute('composerIntent.submit', {
          ...submitInput,
          expectedLaunchTargetRevision,
        })
        releaseSessionLaunchChoices(targetSessionId)
      } catch (reason) {
        setLaunchTargetFailure({
          sessionId: targetSessionId,
          code:
            reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
              ? reason.code
              : 'EXECUTION_FAILED',
        })
      } finally {
        if (firstSessionRunInFlight.current === targetSessionId) firstSessionRunInFlight.current = null
      }
      return
    }
    invoke('composerIntent.submit', submitInput)
  }
  const attachmentTransfers = draft?.attachmentTransfers ?? []
  const workspaceContexts = draft?.workspaceContexts ?? []
  const attachmentIntakeEnabled =
    Boolean(prepareAttachment) &&
    canPrepare &&
    !workspaceMoveLocked &&
    connected &&
    timeline.status !== 'loading' &&
    timeline.status !== 'error' &&
    draft?.status !== 'submitting' &&
    draft?.status !== 'unknown' &&
    !intentPending &&
    !attachmentTransfers.some((item) => item.status === 'unknown' || item.status === 'reconciling')
  const canAddAttachments =
    attachmentIntakeEnabled && (draft?.attachments.length ?? 0) + attachmentTransfers.length < 12
  const canOpenSlash =
    !firstSendLocked &&
    !workspaceMoveLocked &&
    Boolean(files && sessionId && navigation.workspaceId && connected) &&
    timeline.status !== 'loading' &&
    timeline.status !== 'error' &&
    draft?.status !== 'submitting' &&
    draft?.status !== 'unknown'
  const addAttachments = (files: readonly File[]) => {
    if (!sessionId || !prepareAttachment || !attachmentIntakeEnabled) return
    void addComposerAttachments(runtime, { sessionId, revision: draft?.revision ?? 0 }, files, prepareAttachment).catch(
      () => {},
    )
  }
  const removeWorkspaceContext = (contextId: string) => {
    if (!sessionId || !draft || !connected || firstSendLocked || workspaceMoveLocked || intentPending) return
    const targetSessionId = sessionId
    const expectedRevision = draft.revision
    setWorkspaceContextFailure(null)
    void execute('draft.removeWorkspaceContext', { sessionId: targetSessionId, expectedRevision, contextId }).catch(
      () => {
        if (runtime.state.navigation.getSnapshot().sessionId === targetSessionId)
          setWorkspaceContextFailure({ sessionId: targetSessionId, message: labels.workspaceContexts.removeError })
      },
    )
  }
  const workspaceContextError =
    workspaceContextFailure?.sessionId === sessionId ? workspaceContextFailure.message : undefined
  const runErrorAction = timeline.runs
    .map((run) => runActions[run.id])
    .find((action) => action?.error && (!stopRun || action.commandId !== 'operation.cancel'))
  const toolInstanceId = presentation.toolInstanceId
  const [toolFailure, setToolFailure] = useState<{
    sessionId: string
    workspaceId: string
    sourceTabInstanceKey: string | null
    code: string
  } | null>(null)
  const activeTool = toolInstanceId ? surfaces.panels[toolInstanceId] : undefined
  const isToolActive = (panelId: 'files' | 'activity' | 'monitoring' | 'agents' | 'goals') =>
    sessionId !== null &&
    activeTool?.panelId === panelId &&
    activeTool.workspaceId === navigation.workspaceId &&
    activeTool.sessionId === sessionId
  const toggleTool = (panelId: 'files' | 'activity' | 'monitoring' | 'agents' | 'goals') => {
    if (!sessionId || !navigation.workspaceId) return
    const target = {
      panelId,
      workspaceId: navigation.workspaceId,
      sessionId,
      sourceTabInstanceKey: sourceTab?.instanceKey ?? null,
    }
    setToolFailure(null)
    void runtime.commands.execute('sessionTools.toggle', target).catch((reason: unknown) => {
      const current = runtime.state.navigation.getSnapshot()
      const currentTab = runtime.state.workspaceTabs
        .getSnapshot()
        .items.find((item) => item.kind === 'session' && item.sessionId === target.sessionId)
      if (
        current.workspaceId !== target.workspaceId ||
        current.sessionId !== target.sessionId ||
        (currentTab?.instanceKey ?? null) !== target.sourceTabInstanceKey
      )
        return
      setToolFailure({
        ...target,
        code:
          reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
            ? reason.code
            : 'EXECUTION_FAILED',
      })
    })
  }

  const projectedMessages = useMemo(() => projectSessionMessages(timeline.messages), [timeline.messages])
  const toolActivities = useMemo(
    () =>
      projectToolActivities(
        {
          sessionId: timeline.sessionId,
          messages: timeline.messages,
          runs: timeline.runs,
          ...(timeline.toolEvents ? { toolEvents: timeline.toolEvents } : {}),
          ...(timeline.toolClock ? { toolClock: timeline.toolClock } : {}),
        },
        connected,
      ),
    [timeline.sessionId, timeline.messages, timeline.runs, timeline.toolEvents, timeline.toolClock, connected],
  )
  const forkCandidateIds = useMemo(
    () =>
      projectedMessages
        .filter(({ message }) => message.role === 'user' || message.role === 'assistant')
        .map(({ message }) => message.id),
    [projectedMessages],
  )
  useEffect(() => {
    if (!connected || !sessionId || timeline.sessionId !== sessionId || timeline.status !== 'ready') return
    for (let index = 0; index < forkCandidateIds.length; index += 200) {
      void runtime.commands
        .execute('messageFork.refreshEligibility', {
          sessionId,
          cursor: timeline.cursor,
          messageIds: forkCandidateIds.slice(index, index + 200),
        })
        .catch(() => {})
    }
  }, [connected, forkCandidateIds, runtime.commands, sessionId, timeline.cursor, timeline.sessionId, timeline.status])
  const sourceTab = tabs.items.find((item) => item.kind === 'session' && item.sessionId === sessionId)
  const mobileSessionToolItems: readonly HbarMobileHeaderMenuItem[] = [
    {
      id: 'find',
      order: 0,
      label: labels.find.entry,
      icon: Search,
      disabled: find.disabled,
      pressed: find.open,
      onActivate: find.activate,
    },
    ...(showFilesInHeader
      ? [
          {
            id: 'files',
            order: 1,
            label: labels.tools.files,
            icon: Files,
            disabled: !sessionId,
            pressed: isToolActive('files'),
            onActivate: () => toggleTool('files'),
          } satisfies HbarMobileHeaderMenuItem,
        ]
      : []),
    {
      id: 'activity',
      order: 2,
      label: labels.tools.activity,
      icon: ListChecks,
      disabled: !sessionId,
      pressed: isToolActive('activity'),
      onActivate: () => toggleTool('activity'),
    },
    {
      id: 'monitoring',
      order: 3,
      label: labels.tools.monitoring,
      icon: ChartNoAxesColumnIncreasing,
      disabled: !sessionId,
      pressed: isToolActive('monitoring'),
      onActivate: () => toggleTool('monitoring'),
    },
    {
      id: 'agents',
      order: 4,
      label: labels.tools.agents,
      icon: Bot,
      disabled: !sessionId,
      pressed: isToolActive('agents'),
      onActivate: () => toggleTool('agents'),
    },
    {
      id: 'goals',
      order: 5,
      label: labels.tools.goals,
      icon: ListTodo,
      disabled: !sessionId,
      pressed: isToolActive('goals'),
      onActivate: () => toggleTool('goals'),
    },
    {
      id: 'settings',
      order: 6,
      label: labels.tools.settings,
      icon: Settings,
      disabled: !sessionId,
      onActivate: () => {
        if (sessionId) invoke('app.openSettings', { scope: 'session', targetId: sessionId })
      },
    },
  ]
  useHbarMobileHeaderMenuSection(
    sessionId ? { id: 'session-tools', order: 2, label: labels.tools.label, items: mobileSessionToolItems } : null,
  )
  const backgroundTarget =
    sessionId && navigation.workspaceId && sourceTab?.kind === 'session'
      ? { sessionId, workspaceId: navigation.workspaceId, sourceTabInstanceKey: sourceTab.instanceKey }
      : null
  const reading = useSessionReadingPosition({
    runtime,
    target: backgroundTarget,
    ready: activeConversationOwner && timeline.sessionId === sessionId && timeline.status === 'ready',
    findOpen: find.open,
    messageIds: timeline.messages.map((message) => message.id),
    hasOlder: timeline.hasOlder,
    olderStatus: timeline.olderStatus,
  })
  const backgroundCandidate = sessionId ? backgroundAgents.entries[sessionId] : undefined
  const backgroundEntry =
    backgroundTarget &&
    backgroundCandidate?.workspaceId === backgroundTarget.workspaceId &&
    backgroundCandidate.sourceTabInstanceKey === backgroundTarget.sourceTabInstanceKey
      ? backgroundCandidate
      : undefined
  const backgroundCount =
    backgroundEntry?.items.filter((item) =>
      ['queued', 'running', 'waiting_approval', 'cancelRequested'].includes(item.status),
    ).length ?? 0
  const backgroundPending = backgroundEntry?.action.status === 'busy'
  const backgroundUnknown = backgroundEntry?.action.status === 'unknown'
  const backgroundDisabled =
    !connected ||
    !activeConversationOwner ||
    workspaceMoveLocked ||
    firstSendLocked ||
    timeline.sessionId !== sessionId ||
    timeline.status !== 'ready' ||
    backgroundEntry?.readStatus !== 'ready'
  const backgroundFeedback: HbarBackgroundAgentFeedbackKind | null = backgroundPending
    ? backgroundEntry?.action.phase === 'reconcile'
      ? 'checking'
      : 'submitting'
    : backgroundUnknown
      ? 'unknown'
      : backgroundEntry?.action.status === 'failed'
        ? 'failed'
        : backgroundEntry?.action.status === 'requested'
          ? 'requested'
          : backgroundEntry?.action.status === 'settled'
            ? 'settled'
            : backgroundEntry?.readStatus === 'error' || backgroundEntry?.readStatus === 'unknown'
              ? 'read-error'
              : null
  const reconcileBackground = () => {
    if (backgroundTarget && backgroundEntry?.action.id)
      invoke('composerBackgroundAgents.reconcile', { ...backgroundTarget, actionId: backgroundEntry.action.id })
  }
  const stopBackground = () => {
    if (backgroundTarget) invoke('composerBackgroundAgents.cancel', backgroundTarget)
  }
  const retryBackground = () => {
    if (backgroundTarget && backgroundEntry?.action.id)
      invoke('composerBackgroundAgents.cancel', { ...backgroundTarget, actionId: backgroundEntry.action.id })
  }
  const toolActionForMessage =
    (messageId: string): HbarMessageBlocksProps['renderToolAction'] =>
    (row) => {
      if (!sessionId || !sourceTab || sourceTab.kind !== 'session') return null
      const identity = agentToolOpenIdentity(row, sessionId)
      if (!identity || !row.call) return null
      return (
        <HbarAgentToolOpen
          key={`${sourceTab.instanceKey}:${messageId}:${row.call.callId}`}
          parentSessionId={sessionId}
          messageId={messageId}
          callId={row.call.callId}
          childSessionId={identity.sessionId}
          objective={identity.objective}
          sourceTabInstanceKey={sourceTab.instanceKey}
          connected={connected}
          labels={labels.agentToolOpen}
        />
      )
    }
  const eligibilityCurrent =
    messageFork.eligibility.sessionId === sessionId && messageFork.eligibility.cursor === timeline.cursor
  const decisionProjection = useMemo(
    () =>
      projectSessionDecisions({
        sessionId: timeline.sessionId,
        messages: timeline.messages,
        approvals: timeline.approvals,
        userInputs: timeline.userInputs,
        events: timeline.events,
        actions: interactions,
      }),
    [timeline.sessionId, timeline.messages, timeline.approvals, timeline.userInputs, timeline.events, interactions],
  )
  const renderDecision = (decision: SessionDecision) => {
    const resolvePlanExit = async (input: Parameters<typeof invoke>[1]) => {
      const decisionSessionId = typeof decision.sessionId === 'string' ? decision.sessionId : sessionId
      try {
        await awaitComposerWrites(composerWrites.current, decisionSessionId)
      } catch {
        return
      }
      await execute('planExit.resolve', input)
    }
    const body = (
      <HbarSessionDecision
        copyOwner={runtime}
        key={`${decision.kind}:${decision.id}`}
        decision={decision}
        action={sessionDecisionAction(decision, interactions)}
        answers={
          decision.kind === 'questionnaire' && decision.requestId
            ? questionnaires[decision.requestId]?.answers
            : undefined
        }
        labels={labels.decisions}
        connected={connected}
        onDecision={(input) => invoke('approval.resolve', input)}
        onPlanExit={(input) => void resolvePlanExit(input)}
        onAnswer={(input) => invoke('questionnaire.setAnswer', input)}
        onSubmit={(input) => invoke('questionnaire.answer', input)}
        onReconcile={(target) => invoke('interaction.reconcile', target)}
      />
    )
    return <LumenAgentApproval01 controlled={{ body }} />
  }
  const toolDecisionsByMessage = new Map(
    [...decisionProjection.byMessage].map(([messageId, rows]) => [
      messageId,
      new Map([...rows].map(([rowKey, decisions]) => [rowKey, decisions.map(renderDecision)])),
    ]),
  )
  const lastAssistantByRun = new Map<string, string>()
  for (const { message } of projectedMessages) {
    if (message.role === 'assistant' && message.content.some((block) => block.type === 'text' && block.text.trim()))
      lastAssistantByRun.set(message.runId, message.id)
  }
  const unfinishedRuns = new Set(activeRuns.map((run) => run.id))
  const proposal = planProposal.sessionId === sessionId ? planProposal.proposal : null
  const proposalAction = proposal ? planProposal.actions[planProposalActionKey(proposal.target)] : undefined
  const proposalBlocked = !canPrepare || intentPending || draft?.status === 'submitting' || draft?.status === 'unknown'
  const forkKey = (message: (typeof timeline.messages)[number]) =>
    messageForkActionKey({ sessionId: message.sessionId, messageId: message.id })
  const forkActionFor = (message: (typeof timeline.messages)[number]): HbarMessageForkAction | undefined => {
    const action = messageFork.actions[forkKey(message)]
    const eligible = eligibilityCurrent && messageFork.eligibility.items[message.id]?.eligible === true
    if (!sourceTab || action?.status === 'created' || (!eligible && action?.status !== 'unknown')) return undefined
    const status = action?.status ?? 'ready'
    if (!connected && status !== 'unknown') return undefined
    return {
      label:
        status === 'submitting'
          ? labels.messageFork.submitting
          : status === 'unknown'
            ? labels.messageFork.recheck
            : status === 'failed'
              ? labels.messageFork.retry
              : labels.messageFork.ready,
      status,
      error:
        status === 'unknown'
          ? labels.messageFork.unknown
          : action?.error
            ? labels.messageFork.error(action.error)
            : null,
      onFork: (target) => invoke('messageFork.submit', { ...target, sourceTabInstanceKey: sourceTab.instanceKey }),
      ...(connected
        ? { onReconcile: (target: { sessionId: string; messageId: string }) => invoke('messageFork.reconcile', target) }
        : {}),
    }
  }
  const addConversationSelection = async (input: ConversationSelectionSubmission): Promise<boolean> => {
    const currentNavigation = runtime.state.navigation.getSnapshot()
    const currentTabs = runtime.state.workspaceTabs.getSnapshot()
    const currentTab = currentTabs.items.find((tab) => tab.id === currentTabs.activeId)
    const currentPresentation = runtime.state.presentation.getSnapshot()
    const currentTimeline = runtime.state.timeline.getSnapshot()
    const currentDraft = runtime.state.drafts.getSnapshot()[input.sessionId]
    const currentIntent = runtime.state.composerIntent.getSnapshot().entries[input.sessionId]
    const currentMoves = runtime.state.sessionWorkspaceMove.getSnapshot()
    const currentMove =
      currentMoves.entries[input.sessionId] ??
      Object.values(currentMoves.entries).find((entry) => entry.targetSessionId === input.sessionId)
    const currentFirstSend = Object.values(runtime.state.preSessionDrafts.getSnapshot()).find(
      (entry) =>
        entry.sessionId === input.sessionId &&
        entry.capturedWorkspaceId === sessionWorkspaceId &&
        entry.error !== 'GOAL_PREPARED' &&
        entry.phase !== 'accepted' &&
        entry.phase !== 'idle',
    )
    const currentOwner =
      currentNavigation.status === 'idle' &&
      currentNavigation.sessionId === input.sessionId &&
      currentNavigation.workspaceId === sessionWorkspaceId &&
      currentPresentation.page.kind === 'session' &&
      (currentTabs.activeId === null
        ? currentTab === undefined
        : currentTab?.kind === 'session' &&
          currentTab.sessionId === input.sessionId &&
          currentTab.workspaceId === sessionWorkspaceId)
    const moveLocked = Boolean(
      currentMove &&
      currentMove.status !== 'succeeded' &&
      (currentMove.status === 'busy' ||
        currentMove.status === 'unknown' ||
        currentMove.status === 'paused' ||
        currentMove.targetSessionId !== null),
    )
    if (!connected) throw new RuntimeCommandError('HOST_DISCONNECTED', 'Conversation selection is unavailable')
    if (
      !currentOwner ||
      !sessionId ||
      input.sessionId !== sessionId ||
      currentTimeline.sessionId !== input.sessionId ||
      currentTimeline.status !== 'ready'
    )
      throw new RuntimeCommandError('STALE_TARGET', 'The selected conversation target is no longer active')
    if (
      moveLocked ||
      firstSendIsLocked(currentFirstSend) ||
      ['submitting', 'unknown'].includes(currentDraft?.status ?? '') ||
      ['submitting', 'unknown'].includes(currentIntent?.submission.status ?? '')
    )
      throw new RuntimeCommandError('BUSY', 'The Session draft is busy')

    await runtime.commands.execute('draft.addConversationSelection', input)
    return true
  }
  const messageRows: LumenMessageProps[] = [
    ...projectedMessages.map(({ message, blocks, results }) => {
      const fileWorkspaceId = navigation.workspaceId
      const fileReferences: MessageFileReferenceContext | undefined =
        files && message.sessionId === sessionId && fileWorkspaceId
          ? {
              owner: runtime,
              targetKey: JSON.stringify([
                navigation.workspaceId,
                message.sessionId,
                sourceTab?.instanceKey ?? null,
                message.id,
              ]),
              labels: labels.fileReferences,
              streaming: unfinishedRuns.has(message.runId),
              onOpen: async (reference) => {
                await runtime.commands.execute('messageFiles.open', {
                  workspaceId: fileWorkspaceId,
                  sessionId: message.sessionId,
                  sourceTabInstanceKey: sourceTab?.instanceKey ?? null,
                  messageId: message.id,
                  ...reference,
                })
              },
            }
          : undefined
      const body =
        proposal?.target.messageId === message.id && proposal.target.sessionId === message.sessionId ? (
          <HbarProposedPlanMessage
            toolActivity={toolActivities.get(message.runId) ?? EMPTY_TOOL_ACTIVITIES}
            fileReferences={fileReferences}
            copyOwner={runtime}
            sessionId={message.sessionId}
            messageId={message.id}
            blocks={blocks}
            results={results}
            streaming={unfinishedRuns.has(message.runId)}
            labels={labels.messageBlocks}
            describeTool={describeTool}
            renderToolAction={toolActionForMessage(message.id)}
            toolDecisions={toolDecisionsByMessage.get(message.id)}
            document={proposal}
            plan={{
              labels: labels.proposedPlan,
              state: {
                status: proposalAction?.status ?? 'idle',
                phase: proposalAction?.phase,
                canSubmit: connected && !proposalBlocked && planProposal.availability === 'ready',
                connected,
                reconciling: proposalAction?.reconciling ?? false,
                error: proposalAction?.error ? labels.proposedPlan.error(proposalAction.error) : null,
                unavailable: connected
                  ? !canPrepare
                    ? preparationStatus === 'archived'
                      ? labels.executionAccess.archived
                      : labels.executionAccess.unverified
                    : labels.proposedPlanAvailability(proposalBlocked ? 'busy' : planProposal.availability)
                  : labels.disconnected,
              },
              onSubmit: (target, action, feedback) => invoke('proposedPlan.submit', { ...target, action, feedback }),
              onReconcile: (target) => invoke('proposedPlan.reconcile', target),
            }}
          />
        ) : message.role === 'assistant' ? (
          <HbarHistoricalPlanMessage
            toolActivity={toolActivities.get(message.runId) ?? EMPTY_TOOL_ACTIVITIES}
            fileReferences={fileReferences}
            copyOwner={runtime}
            sessionId={message.sessionId}
            messageId={message.id}
            blocks={blocks}
            results={results}
            streaming={unfinishedRuns.has(message.runId)}
            labels={labels.messageBlocks}
            describeTool={describeTool}
            renderToolAction={toolActionForMessage(message.id)}
            toolDecisions={toolDecisionsByMessage.get(message.id)}
            readOnlyLabel={labels.proposedPlanReadOnly}
          />
        ) : (
          <HbarMessageBlocks
            toolActivity={toolActivities.get(message.runId) ?? EMPTY_TOOL_ACTIVITIES}
            fileReferences={fileReferences}
            copyOwner={runtime}
            sessionId={message.sessionId}
            messageId={message.id}
            blocks={blocks}
            textFormat={message.role === 'user' ? 'literal' : 'markdown'}
            results={results}
            streaming={unfinishedRuns.has(message.runId)}
            labels={labels.messageBlocks}
            describeTool={describeTool}
            renderToolAction={toolActionForMessage(message.id)}
            toolDecisions={toolDecisionsByMessage.get(message.id)}
          />
        )
      const expectedText = conversationMessageExpectedText(message.content)
      const selectableRole = message.role === 'user' || message.role === 'assistant' ? message.role : null
      const children =
        selectableRole && expectedText.trim() ? (
          <HbarConversationSelection
            sessionId={message.sessionId}
            messageId={message.id}
            sourceRole={selectableRole}
            expectedText={expectedText}
            expectedRevision={drafts[message.sessionId]?.revision ?? 0}
            enabled={conversationSelectionEnabled && message.sessionId === sessionId}
            labels={labels.conversationSelection}
            onAdd={addConversationSelection}
          >
            {body}
          </HbarConversationSelection>
        ) : (
          body
        )
      return {
        id: message.id,
        role: message.role,
        author: labels.author[message.role],
        avatar: labels.avatar[message.role],
        appearance: 'transcript' as const,
        copyLabel: labels.copy,
        children,
        actions:
          message.role === 'user' ||
          (lastAssistantByRun.get(message.runId) === message.id && !unfinishedRuns.has(message.runId)) ||
          forkActionFor(message) ||
          messageFork.actions[forkKey(message)]?.status === 'created' ? (
            <HbarMessageActionBar
              sessionId={message.sessionId}
              messageId={message.id}
              content={message.content}
              labels={labels.messageActions}
              copyLabel={message.role === 'user' ? labels.messageActions.copyMessage : undefined}
              fork={forkActionFor(message)}
              metadata={
                <LumenText as="span">
                  {messageFork.actions[forkKey(message)]?.status === 'created'
                    ? labels.messageFork.createdAfterTimestamp(labels.timestamp(message.createdAt))
                    : labels.timestamp(message.createdAt)}
                </LumenText>
              }
            />
          ) : null,
      }
    }),
    ...Object.values(timeline.streams).map((stream) => ({
      id: stream.id,
      role: 'assistant' as const,
      author: labels.author.assistant,
      avatar: labels.avatar.assistant,
      streaming: true,
      appearance: 'transcript' as const,
      copyLabel: labels.copy,
      children: (
        <HbarMessageBlocks
          copyOwner={runtime}
          sessionId={stream.sessionId}
          messageId={stream.id}
          blocks={[
            { type: 'thinking', text: stream.thinking },
            { type: 'text', text: stream.text },
          ]}
          streaming
          labels={labels.messageBlocks}
        />
      ),
    })),
  ]

  const rowsById = new Map(messageRows.map((row) => [row.id, row]))
  const messages: LumenMessageProps[] = projectSessionTimelineSequence(timeline, goalLifecycleRows).flatMap(
    (item): LumenMessageProps[] => {
      if (item.kind === 'goalLifecycle')
        return [
          {
            id: item.row.id,
            role: 'system',
            author: labels.author.system,
            avatar: labels.avatar.system,
            appearance: 'transcript',
            copyLabel: labels.copy,
            children: <HbarGoalLifecycleCard row={item.row} labels={labels.goalLifecycle} />,
          },
        ]
      if (item.kind === 'goalContinuation')
        return [
          {
            id: item.continuation.id,
            role: 'system',
            author: labels.author.system,
            avatar: labels.avatar.system,
            appearance: 'transcript',
            copyLabel: labels.copy,
            children: <HbarGoalContinuation continuation={item.continuation} labels={labels.goalContinuation} />,
          },
        ]
      const row = rowsById.get(item.kind === 'message' ? item.projection.message.id : item.stream.id)
      return row ? [row] : []
    },
  )

  const activity: ReactNode =
    timeline.runs.length > 0 || decisionProjection.fallback.length > 0 ? (
      <LumenFrame className="hbar-app-react-session-activity">
        {timeline.runs.length > 0 && (
          <LumenAgentActivity03
            controlled={{
              body: (
                <HbarSessionRunActivity
                  key={sessionId}
                  runs={timeline.runs.map((run) => ({
                    id: run.id,
                    label: labels.timestamp(run.createdAt),
                    status: run.status,
                    detail: run.error ?? labels.runDetail(run.modelId),
                    duration: labels.runDuration(run.startedAt ?? run.createdAt, run.endedAt),
                  }))}
                  labels={labels.runs}
                  plan={
                    timeline.plan && (timeline.plan.plan.length > 0 || timeline.plan.explanation)
                      ? {
                          runId: timeline.plan.turnId,
                          explanation: timeline.plan.explanation ?? undefined,
                          steps: timeline.plan.plan.map((step, index) => ({
                            id: `${timeline.plan!.updatedAt}:${index}`,
                            title: step.step,
                            status: step.status,
                          })),
                        }
                      : undefined
                  }
                  cancellingRunIds={activeRuns
                    .filter(
                      (run) =>
                        runActions[run.id]?.commandId === 'operation.cancel' &&
                        (runActions[run.id]?.requestInFlight ||
                          ['submitting', 'unknown', 'succeeded'].includes(runActions[run.id]?.status ?? '')),
                    )
                    .map((run) => run.id)}
                  canCancelRun={canCancelRun}
                  retryingRunIds={timeline.runs
                    .filter((run) => runActions[run.id]?.status === 'submitting')
                    .map((run) => run.id)}
                  canRetryNewRun={canPrepare}
                  unknownRetryRunIds={timeline.runs
                    .filter(
                      (run) =>
                        runActions[run.id]?.commandId === 'run.retry' &&
                        (runActions[run.id]?.status === 'unknown' ||
                          (runActions[run.id]?.status === 'submitting' && runActions[run.id]?.phase === 'receipt')),
                    )
                    .map((run) => run.id)}
                  feedback={runErrorAction?.error ? labels.error(runErrorAction.error) : undefined}
                  onCancelRun={(operationId) =>
                    stopRun ? stopRun(operationId) : invoke('operation.cancel', { operationId })
                  }
                  onRetryRun={(operationId: string) => invoke('run.retry', { sessionId, operationId })}
                />
              ),
            }}
          />
        )}
        {decisionProjection.fallback.map(renderDecision)}
      </LumenFrame>
    ) : null

  const retryTimeline = () => sessionId && invoke('timeline.retry', { sessionId })
  const draftGoalReplacement = goalSlashReplacesCurrent(
    localSlashCommand(draft?.text ?? '', slashIds) === 'goal' ? localGoalSlash(draft?.text ?? '') : null,
    composerIntent.facts.sessionId === sessionId ? composerIntent.facts.snapshot?.goal : null,
  )
  const loadOlder = () => sessionId && invoke('timeline.loadOlder', { sessionId })
  const historyNotices = sessionId ? (
    <LumenFrame className="hbar-app-react-session-history-controls">
      {!connected && (
        <LumenText as="p" role="status">
          {labels.disconnected}
        </LumenText>
      )}
      {timeline.status === 'loading' && timeline.messages.length > 0 && (
        <LumenText as="p" role="status">
          {labels.refreshing}
        </LumenText>
      )}
      {timeline.status === 'error' && timeline.messages.length > 0 && (
        <LumenFrame className="hbar-app-react-session-history-error" role="alert">
          <LumenText as="span">{labels.error(timeline.error ?? 'EXECUTION_FAILED')}</LumenText>
          {connected && (
            <LumenButton size="s" onClick={retryTimeline}>
              {labels.retryTimeline}
            </LumenButton>
          )}
        </LumenFrame>
      )}
      {timeline.olderStatus === 'limit' ? (
        <LumenText as="p" role="status">
          {labels.historyLimit}
        </LumenText>
      ) : timeline.hasOlder || timeline.olderStatus === 'error' ? (
        <LumenFrame className="hbar-app-react-session-history-page">
          {timeline.olderStatus === 'error' && (
            <LumenText as="span" role="alert">
              {labels.error(timeline.olderError ?? 'EXECUTION_FAILED')}
            </LumenText>
          )}
          <LumenButton size="s" disabled={!connected || timeline.olderStatus === 'loading'} onClick={loadOlder}>
            {timeline.olderStatus === 'loading'
              ? labels.loadingOlder
              : timeline.olderStatus === 'error'
                ? labels.retryHistory
                : labels.loadOlder}
          </LumenButton>
        </LumenFrame>
      ) : null}
      {(goalHistory.available ||
        (composerIntent.facts.sessionId === sessionId && composerIntent.facts.snapshot?.goal)) &&
        goalHistoryProjection && (
          <LumenFrame
            className="hbar-app-react-session-history-page"
            data-goal-history-gap={goalHistoryProjection.gapReason ?? undefined}
          >
            {goalHistoryProjection.status === 'loading' ? (
              <LumenText as="span" role="status">
                {labels.goalHistory.loading}
              </LumenText>
            ) : goalHistoryProjection.gapReason ? (
              <LumenText as="span" role={goalHistoryProjection.gapReason === 'error' ? 'alert' : 'status'}>
                {labels.goalHistory.gap(goalHistoryProjection.gapReason)}
              </LumenText>
            ) : null}
            {goalHistoryProjection.limit && (
              <LumenText as="span" role="status">
                {labels.goalHistory.limit(GOAL_HISTORY_MAX_FACTS)}
              </LumenText>
            )}
            {goalHistory.available &&
              goalHistoryProjection.gap &&
              goalHistoryProjection.status !== 'loading' &&
              goalHistoryProjection.gapReason !== 'limit' && (
                <LumenButton
                  size="s"
                  disabled={
                    !connected || timeline.status !== 'ready' || goalHistoryProjection.olderStatus === 'loading'
                  }
                  onClick={() => invoke('goalHistory.refresh', { sessionId })}
                >
                  {labels.goalHistory.refresh}
                </LumenButton>
              )}
            {goalHistory.available &&
              !goalHistoryProjection.stale &&
              !goalHistoryProjection.limit &&
              goalHistoryProjection.hasOlder &&
              (!timeline.hasOlder || goalHistoryProjection.gap) && (
                <LumenButton
                  size="s"
                  disabled={
                    !connected ||
                    timeline.status !== 'ready' ||
                    goalHistoryProjection.status === 'loading' ||
                    goalHistoryProjection.olderStatus === 'loading'
                  }
                  onClick={() => invoke('goalHistory.loadOlder', { sessionId })}
                >
                  {goalHistoryProjection.olderStatus === 'loading'
                    ? labels.goalHistory.loadingOlder
                    : goalHistoryProjection.olderStatus === 'error'
                      ? labels.goalHistory.retryOlder
                      : labels.goalHistory.loadOlder}
                </LumenButton>
              )}
          </LumenFrame>
        )}
    </LumenFrame>
  ) : null

  const welcome =
    (!goalHistory.available ||
      (goalHistoryEntry?.status === 'ready' &&
        !goalHistoryProjection?.gap &&
        !goalHistoryEntry.hasOlder &&
        goalHistoryEntry.facts.length === 0)) &&
    !(composerIntent.facts.sessionId === sessionId && composerIntent.facts.snapshot?.goal) &&
    showSessionEmptyHero({
      connected,
      sessionId,
      loadedSessionId: timeline.sessionId,
      timelineStatus: timeline.status,
      timelineError: timeline.error,
      olderStatus: timeline.olderStatus,
      hasOlder: timeline.hasOlder,
      messageCount: timeline.messages.length,
      runCount: timeline.runs.length,
      streamCount: Object.keys(timeline.streams).length,
      approvalCount: timeline.approvals.length,
      userInputCount: timeline.userInputs.length,
      draftStatus: draft?.status ?? null,
      lastOperationId: draft?.lastOperationId ?? null,
      submissionPending: intentPending || Boolean(permissionEntry?.locked),
    })
  const launchDraftEntry = sessionId ? sessionLaunchDrafts.entries[sessionId] : undefined
  const confirmedEmptyTimeline =
    timeline.sessionId === sessionId &&
    timeline.status === 'ready' &&
    timeline.messages.length === 0 &&
    !timeline.hasOlder &&
    timeline.runs.length === 0 &&
    timeline.approvals.length === 0 &&
    timeline.userInputs.length === 0 &&
    Object.keys(timeline.streams).length === 0 &&
    draft?.lastOperationId === null
  const showLaunchLocation =
    welcome ||
    Boolean(launchDraftEntry && launchDraftEntry.workspaceId === sessionWorkspaceId && confirmedEmptyTimeline)
  const emptyTimeline = welcome ? (
    <HbarSessionEmptyHero labels={labels.emptyHero} />
  ) : (
    <LumenFrame className="hbar-app-react-session-empty">
      <LumenText as="p">
        {timeline.status === 'loading'
          ? labels.loading
          : timeline.error
            ? labels.error(timeline.error)
            : labels.emptyHistory}
      </LumenText>
      {connected && timeline.status === 'error' && sessionId && (
        <LumenButton size="s" onClick={retryTimeline}>
          {labels.retryTimeline}
        </LumenButton>
      )}
    </LumenFrame>
  )

  const visibleSlashFailure = (() => {
    if (!slashFailure || slashFailure.sessionId !== sessionId) return undefined
    if (
      agentAction?.status === 'unknown' &&
      ['RESULT_UNKNOWN', 'TIMEOUT', 'DISCONNECTED', 'CONNECTION_CLOSED'].includes(slashFailure.code)
    )
      return undefined
    if (
      slashFailure.code === 'RESULT_UNKNOWN' &&
      localSlashCommand(draft?.text ?? '', slashIds) === 'goal' &&
      intentEntry?.goalAction.status === 'succeeded'
    )
      return undefined
    if (slashFailure.code === 'ATTACHMENTS' && !draft?.attachments.length && !attachmentTransfers.length)
      return undefined
    switch (slashFailure.code) {
      case 'ATTACHMENTS':
        return labels.slash.attachmentsBlocked
      case 'RUN_ACTIVE':
        return labels.slash.modelBusy
      case 'GOAL_REQUIRED':
        return labels.slash.goalRequired
      case 'GOAL_RUN_ACTIVE':
        return labels.slash.goalBusy
      case 'GOAL_SNAPSHOT_UNAVAILABLE':
        return labels.slash.goalSnapshotUnavailable
      case 'AGENT_REQUIRED':
        return labels.slash.agentRequired
      case 'AGENT_CATALOG_UNAVAILABLE':
        return labels.slash.agentCatalogUnavailable
      case 'AGENT_PROFILE_UNAVAILABLE':
        return labels.slash.agentProfileUnavailable(slashFailure.profileId ?? '')
      default:
        return labels.slash.error(slashFailure.code)
    }
  })()

  const composer: ReactNode = sessionId ? (
    <LumenFrame
      className="hbar-app-react-session-footer"
      data-hbar-composer-session={sessionId}
      data-git-context-status={projectContext.context.status}
    >
      <HbarSessionLiveStatus
        sessionId={sessionId}
        timelineSessionId={timeline.sessionId}
        owned={activeConversationOwner}
        connected={connected}
        run={activeRun}
        labels={labels.liveStatus}
      />
      <HbarSessionStopNotice region="main" />
      <HbarSessionExecutionNotice
        key={`${sessionId}:${sessionWorkspaceId}`}
        status={preparationStatus}
        workspaceName={workspaceName}
        connected={connected}
        labels={labels.executionAccess}
        onOpenArchived={async () => {
          const target = { sessionId, workspaceId: sessionWorkspaceId }
          const selected = runtime.state.navigation.getSnapshot()
          if (selected.sessionId !== target.sessionId || selected.workspaceId !== target.workspaceId) return
          await runtime.commands.execute('archivedSessions.open', { workspaceId: target.workspaceId })
          const latest = runtime.state.navigation.getSnapshot()
          if (latest.sessionId !== target.sessionId || latest.workspaceId !== target.workspaceId) return
          await runtime.commands.execute('app.setSidebarVisible', { visible: true })
        }}
      />
      <HbarComposerGoal
        key={sessionId}
        sessionId={sessionId}
        workspaceId={navigation.workspaceId}
        connected={connected}
        labels={labels.intent}
        surface="submission"
        canPrepare={canPrepare}
      />
      <HbarComposerAgentNotice
        status={
          agentAction?.status === 'succeeded' && agentAction.draftCleared && draft?.text
            ? undefined
            : agentAction?.status
        }
        agentId={agentAction?.agent?.agentId}
        labels={labels.slash.agentNotice}
        connected={connected}
        onRetry={() => {
          if (!agentAction || !sessionId || !navigation.workspaceId) return
          void runtime.commands
            .execute('agentComposer.invoke', {
              sessionId: agentAction.sessionId,
              workspaceId: agentAction.workspaceId,
              draftText: agentAction.draftText,
              draftRevision: agentAction.draftRevision,
              profileId: agentAction.profileId,
              objective: agentAction.objective,
            })
            .catch((reason: unknown) => {
              setSlashFailure({
                sessionId,
                code:
                  reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
                    ? reason.code
                    : 'EXECUTION_FAILED',
              })
            })
        }}
        onOpen={() => {
          if (!agentAction?.agent || !sessionId || !navigation.workspaceId) return
          void runtime.commands
            .execute('agentComposer.openResult', {
              sessionId: agentAction.sessionId,
              workspaceId: agentAction.workspaceId,
              agentId: agentAction.agent.agentId,
            })
            .catch((reason: unknown) => {
              setSlashFailure({
                sessionId,
                code:
                  reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
                    ? reason.code
                    : 'EXECUTION_FAILED',
              })
            })
        }}
      />
      <HbarComposerAttachmentDropTarget
        key={sessionId}
        enabled={attachmentIntakeEnabled}
        label={labels.attachments.drop}
        onAdd={addAttachments}
      >
        {goalConfirmation?.sessionId === sessionId &&
          goalConfirmation.workspaceId === navigation.workspaceId &&
          goalConfirmation.revision === draft?.revision &&
          goalConfirmation.text === draft.text && (
            <LumenFrame
              className="hbar-composer-goal-confirmation"
              role="group"
              aria-label={
                goalConfirmation.action === 'clear'
                  ? labels.slash.goalConfirmClear(goalConfirmation.previousObjective)
                  : labels.slash.goalConfirmReplace(goalConfirmation.previousObjective)
              }
            >
              <LumenContentText context="dialog.body">
                {goalConfirmation.action === 'clear'
                  ? labels.slash.goalConfirmClear(goalConfirmation.previousObjective)
                  : labels.slash.goalConfirmReplace(goalConfirmation.previousObjective)}
              </LumenContentText>
              <LumenFrame className="hbar-composer-goal-confirmation-actions">
                <LumenButton type="button" size="s" onClick={() => setGoalConfirmation(null)}>
                  {labels.slash.goalCancel}
                </LumenButton>
                <LumenButton
                  type="button"
                  size="s"
                  tone="danger"
                  onClick={() => {
                    const confirmation = goalConfirmation
                    setGoalConfirmation(null)
                    void runGoalSlash(
                      confirmation,
                      confirmation.action === 'clear'
                        ? { action: 'clear' }
                        : { action: 'set', objective: confirmation.objective! },
                      confirmation.expectedGoalId,
                    )
                  }}
                >
                  {labels.slash.goalConfirm}
                </LumenButton>
              </LumenFrame>
            </LumenFrame>
          )}
        <HbarPromptComposer
          boundary="none"
          value={composerDraft?.text ?? ''}
          editor={
            files && sessionId && navigation.workspaceId
              ? ({ inputLabel, placeholder, disabled }) => (
                  <HbarComposerMentionEditor
                    key={`${sessionId}:${navigation.workspaceId}`}
                    sessionId={sessionId}
                    workspaceId={navigation.workspaceId!}
                    revision={composerDraft?.revision ?? 0}
                    text={composerDraft?.text ?? ''}
                    mentions={composerDraft?.mentions ?? []}
                    disabled={disabled}
                    connected={connected}
                    inputLabel={inputLabel}
                    placeholder={placeholder}
                    labels={labels.mentions}
                    slashLabels={slashLabels}
                    submitSlashCommands={submitSlashCommands}
                    slashOpenRequest={slashOpenRequest}
                    focusRequest={editorFocusRequest}
                    sendBehavior={sendBehavior}
                    files={files}
                    onContent={(text, mentions, expectedRevision) =>
                      saveComposerContent(sessionId, text, mentions, expectedRevision)
                    }
                    onSubmit={() => {
                      void submitLatest(sessionId, navigation.workspaceId!)
                    }}
                  />
                )
              : undefined
          }
          labels={{
            ...labels.prompt,
            placeholder:
              intent === 'goal'
                ? labels.intent.goalPlaceholder
                : planModeEntry?.status === 'ready' && planModeEntry.mode === 'plan'
                  ? labels.intent.planPlaceholder
                  : labels.prompt.placeholder,
          }}
          attachments={(draft?.attachments ?? []).map((attachment) => ({
            id: attachment.artifact.id,
            kind: attachment.kind,
            name: attachment.artifact.name,
          }))}
          attachmentContent={
            draft &&
            (workspaceContexts.length > 0 || workspaceContextError || (images && draft.attachments.length > 0)) ? (
              <>
                <HbarComposerWorkspaceContexts
                  contexts={workspaceContexts}
                  attachments={!images ? draft.attachments : []}
                  labels={labels.workspaceContexts}
                  removeAttachmentLabel={(attachment) =>
                    labels.prompt.removeAttachment({
                      id: attachment.artifact.id,
                      kind: attachment.kind,
                      name: attachment.artifact.name,
                    })
                  }
                  removeDisabled={
                    !connected ||
                    firstSendLocked ||
                    workspaceMoveLocked ||
                    draft.status === 'submitting' ||
                    draft.status === 'unknown' ||
                    intentPending
                  }
                  error={workspaceContextError}
                  onRemove={removeWorkspaceContext}
                  onRemoveAttachment={(attachment) =>
                    invoke('draft.removeAttachment', {
                      sessionId,
                      artifactId: attachment.artifact.id,
                      kind: attachment.kind,
                      expectedRevision: draft.revision,
                    })
                  }
                />
                {images && draft.attachments.length > 0 ? (
                  <HbarDraftImageAttachments
                    draft={draft}
                    removeLabel={labels.prompt.removeAttachment}
                    removeDisabled={
                      draft.status === 'submitting' ||
                      draft.status === 'unknown' ||
                      intentEntry?.submission.status === 'submitting' ||
                      workspaceMoveLocked
                    }
                    onRemove={(id, kind) =>
                      invoke('draft.removeAttachment', {
                        sessionId,
                        artifactId: id,
                        kind,
                        expectedRevision: draft.revision,
                      })
                    }
                  />
                ) : null}
              </>
            ) : undefined
          }
          disabled={
            !connected ||
            firstSendLocked ||
            workspaceMoveLocked ||
            timeline.status === 'loading' ||
            timeline.status === 'error'
          }
          submitting={draft?.status === 'submitting' || intentEntry?.submission.status === 'submitting'}
          uploading={(draft?.uploading ?? 0) > 0}
          canAddAttachments={canAddAttachments}
          canSubmit={
            !firstSendLocked &&
            !workspaceMoveLocked &&
            (canPrepare || localSlashCommand(draft?.text ?? '', slashIds) === 'settings') &&
            (localSlashCommand(draft?.text ?? '', slashIds)
              ? localSlashCanSubmit({
                  draftStatus: draft?.status,
                  modelPending,
                  intentPending: Boolean(intentPending),
                  permissionLocked: Boolean(permissionEntry?.locked) && !draftGoalReplacement,
                }) &&
                (localSlashCommand(draft?.text ?? '', slashIds) !== 'goal' ||
                  !['submitting', 'unknown'].includes(intentEntry?.goalAction.status ?? ''))
              : configured &&
                (!composerPlanMode.available || planModeEntry?.status === 'ready') &&
                !modelPending &&
                !intentPending &&
                attachmentTransfers.length === 0 &&
                !permissionEntry?.locked &&
                draft?.status !== 'unknown' &&
                Boolean(
                  (draft?.text.trim() || draft?.attachments.length || workspaceContexts.length) &&
                  (intent !== 'goal' || draft?.text.trim()),
                ))
          }
          canStop={Boolean(activeRun)}
          runningActions={{
            ...labels.runningActions,
            submit:
              (draft?.text.trim() || draft?.attachments.length || workspaceContexts.length) &&
              (intent !== 'goal' || draft?.text.trim())
                ? 'queue'
                : 'hidden',
          }}
          stopping={Boolean(activeRun && !canCancelRun(activeRun.id))}
          error={
            draft?.uploadError && !attachmentTransfers.some((item) => item.error === draft.uploadError)
              ? labels.attachments.error(draft.uploadError)
              : draft?.error
                ? labels.error(draft.error)
                : composerModel.sessionId === sessionId && composerModel.action.status === 'unknown'
                  ? labels.modelPicker.unknown
                  : visibleSlashFailure
          }
          controls={
            <LumenFrame className="hbar-session-composer-controls">
              <HbarComposerAddMenu
                key={`add:${sessionId}`}
                labels={labels.addMenu}
                canAddFiles={canAddAttachments}
                canOpenSlash={canOpenSlash}
                onFiles={prepareAttachment ? addAttachments : undefined}
                onOpenSlash={() => setSlashOpenRequest((request) => request + 1)}
                goalSlotRef={intent === 'goal' ? undefined : setGoalMenuSlot}
                triggerRef={composerGoalTrigger}
                goalPreparedRequest={goalPreparedRequest}
                onGoalPrepared={() => setEditorFocusRequest((request) => request + 1)}
              />
              {(composerPermission.available || composerPlanMode.available) && (
                <HbarComposerPermissionPicker
                  key={`permission:${sessionId}`}
                  sessionId={sessionId}
                  sessionLabel={sessionTitle}
                  entry={permissionEntry}
                  hostDefault={composerPermission.hostDefault}
                  defaultAvailable={composerPermission.available}
                  connected={connected}
                  disabled={
                    workspaceMoveLocked ||
                    firstSendLocked ||
                    draft?.status === 'submitting' ||
                    draft?.status === 'unknown' ||
                    intentPending
                  }
                  runActive={Boolean(activeRun)}
                  canPrepare={canPrepare}
                  labels={labels.permissionPicker}
                  onRefresh={async () => {
                    await runtime.commands.execute('composerPermission.refresh', {})
                  }}
                  onSelect={async (input) => {
                    await runtime.commands.execute('composerPermission.setChoice', input)
                  }}
                  onReconcile={async () => {
                    await runtime.commands.execute('composerPermission.reconcile', { sessionId })
                  }}
                  {...(composerPlanMode.available
                    ? {
                        plan: {
                          entry: planModeEntry,
                          onSetMode: async (mode: 'default' | 'plan', expectedRevision: number) => {
                            await runtime.commands.execute('composerPlanMode.setMode', {
                              sessionId,
                              mode,
                              expectedRevision,
                            })
                          },
                          onSelectOrdinary: async (input, expectedModeRevision) => {
                            await runtime.commands.execute('composerPlanChoice.selectOrdinary', {
                              sessionId: input.sessionId,
                              choice: input.choice,
                              expectedPermissionRevision: input.expectedRevision,
                              expectedModeRevision,
                              ...(input.confirmAllow ? { confirmAllow: true } : {}),
                            })
                          },
                          onRefresh: async () => {
                            await runtime.commands.execute('composerPlanMode.refresh', { sessionId })
                          },
                          onReconcile: async () => {
                            await runtime.commands.execute('composerPlanMode.reconcile', { sessionId })
                          },
                        },
                      }
                    : {})}
                />
              )}
              {projectContextLabels && (
                <LumenFrame className="hbar-session-project-context-toolbar">
                  {projectContextView(showLaunchLocation)}
                </LumenFrame>
              )}
              <HbarComposerIntentControls
                key={sessionId}
                preferMenu
                menuSlot={goalMenuSlot}
                onPrepared={() => setGoalPreparedRequest((request) => request + 1)}
                sessionId={sessionId}
                connected={connected}
                disabled={
                  workspaceMoveLocked ||
                  firstSendLocked ||
                  draft?.status === 'submitting' ||
                  draft?.status === 'unknown' ||
                  Boolean(permissionEntry?.locked)
                }
                canPrepare={canPrepare}
                labels={labels.intent}
              />
            </LumenFrame>
          }
          context={
            <>
              <HbarComposerBackgroundAgentFeedback
                kind={backgroundFeedback}
                error={
                  backgroundEntry?.action.error ??
                  backgroundEntry?.action.targets.find((target) => target.error)?.error ??
                  backgroundEntry?.error ??
                  null
                }
                disabled={!connected || backgroundPending || !activeConversationOwner}
                labels={labels.backgroundAgents}
                onReconcile={reconcileBackground}
                onRetry={retryBackground}
                onRefresh={() => {
                  if (backgroundTarget) invoke('composerBackgroundAgents.refresh', backgroundTarget)
                }}
              />
              {firstSendDraft && firstSendLabels && (
                <HbarPreSessionLaunchStatus
                  key={firstSendDraft.draftId}
                  draft={firstSendDraft}
                  labels={firstSendLabels}
                  connected={connected}
                />
              )}
              {launchTargetFailure?.sessionId === sessionId && firstSendLabels && (
                <LumenText as="p" role="alert">
                  {firstSendLabels.error(launchTargetFailure.code)}
                </LumenText>
              )}
              <HbarQueuedUserRuns
                state={queuedUserRuns}
                sessionId={sessionId}
                connected={connected}
                labels={labels.queuedUserRuns}
                activeRunId={
                  timeline.sessionId === sessionId &&
                  timeline.status === 'ready' &&
                  activeRun?.sessionId === sessionId &&
                  activeRun.status === 'running'
                    ? activeRun.id
                    : null
                }
                onRefresh={() => void invoke('queuedUserRuns.refresh', { sessionId })}
                onPrevious={() => void invoke('queuedUserRuns.previous', { sessionId })}
                onNext={() => void invoke('queuedUserRuns.next', { sessionId })}
                onStartEdit={(operationId) => void invoke('queuedUserRuns.startEdit', { sessionId, operationId })}
                onEditText={(operationId, text) =>
                  void invoke('queuedUserRuns.setEditText', { sessionId, operationId, text })
                }
                onSaveEdit={(operationId) => void invoke('queuedUserRuns.saveEdit', { sessionId, operationId })}
                onRetryEdit={(operationId) => void invoke('queuedUserRuns.retryEdit', { sessionId, operationId })}
                onGuide={(operationId, expectedRevision, activeRunId) =>
                  void invoke('queuedUserRuns.guide', { sessionId, operationId, expectedRevision, activeRunId })
                }
                onRetryGuide={(operationId) => void invoke('queuedUserRuns.retryGuide', { sessionId, operationId })}
                onDismissGuide={() => void invoke('queuedUserRuns.dismissGuide', { sessionId })}
                onCancelEdit={() => void invoke('queuedUserRuns.cancelEdit', { sessionId })}
                onRemove={(operationId, expectedRevision) =>
                  void invoke('queuedUserRuns.remove', { sessionId, operationId, expectedRevision })
                }
                onRetryRemoval={(operationId) => void invoke('queuedUserRuns.retryRemoval', { sessionId, operationId })}
                onDismissRemoval={() => void invoke('queuedUserRuns.dismissRemoval', { sessionId })}
              />
              <HbarComposerAttachmentTransfers
                transfers={attachmentTransfers}
                labels={labels.attachments}
                connected={connected}
                onRemove={(item) =>
                  invoke('draft.removeAttachmentTransfer', {
                    sessionId,
                    reservationId: item.id,
                    ownerRevision: item.ownerRevision,
                  })
                }
                onReconcile={(item) =>
                  invoke('draft.reconcileAttachment', {
                    sessionId,
                    reservationId: item.id,
                    ownerRevision: item.ownerRevision,
                  })
                }
                onAccept={(item) =>
                  invoke('draft.acceptReadyAttachment', {
                    sessionId,
                    reservationId: item.id,
                    ownerRevision: item.ownerRevision,
                    expectedRevision: draft?.revision ?? 0,
                  })
                }
              />
            </>
          }
          modelPicker={
            <LumenFrame className="hbar-session-composer-options">
              <HbarSessionUsageControl
                key={`usage:${sessionId}`}
                controls={controls}
                labels={labels.usage}
                onOpenMonitor={() => toggleTool('monitoring')}
              />
              <HbarComposerModelPicker
                key={sessionId}
                sessionId={sessionId}
                connected={connected}
                runActive={Boolean(activeRun)}
                disabled={
                  workspaceMoveLocked ||
                  firstSendLocked ||
                  draft?.status === 'submitting' ||
                  draft?.status === 'unknown' ||
                  intentPending ||
                  Boolean(activeRun && canPrepare)
                }
                canSelect={canPrepare && !activeRun && !workspaceMoveLocked}
                labels={labels.modelPicker}
                menuPresentation={modelMenuPresentation}
                openRequest={modelOpenRequest}
                onOpened={() => {
                  const target = pendingModelSlash.current
                  pendingModelSlash.current = null
                  localSlashInFlight.current = false
                  if (target?.sessionId === sessionId && target.workspaceId === navigation.workspaceId)
                    void clearLocalSlash(target).catch((reason: unknown) => {
                      setSlashFailure({
                        sessionId: target.sessionId,
                        code:
                          reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
                            ? reason.code
                            : 'EXECUTION_FAILED',
                      })
                    })
                }}
                onOpenFailed={(code) => {
                  const target = pendingModelSlash.current
                  pendingModelSlash.current = null
                  localSlashInFlight.current = false
                  if (target?.sessionId === sessionId) setSlashFailure({ sessionId, code })
                }}
              />
            </LumenFrame>
          }
          backgroundAction={
            !activeRun ? (
              <HbarComposerBackgroundAgentStop
                count={backgroundCount}
                disabled={
                  backgroundDisabled ||
                  backgroundUnknown ||
                  backgroundEntry?.action.status === 'requested' ||
                  backgroundEntry?.action.status === 'failed'
                }
                pending={backgroundPending}
                labels={labels.backgroundAgents}
                onStop={stopBackground}
              />
            ) : undefined
          }
          onChange={(text) => {
            setSlashFailure(null)
            invoke('draft.setText', { sessionId, text })
          }}
          onAddAttachments={undefined}
          onRemoveAttachment={(id, kind) =>
            invoke('draft.removeAttachment', {
              sessionId,
              artifactId: id,
              kind,
              expectedRevision: draft?.revision ?? 0,
            })
          }
          onSubmit={() => {
            if (sessionId && navigation.workspaceId) void submitLatest(sessionId, navigation.workspaceId)
          }}
          onStop={() => {
            if (activeRun) {
              if (stopRun) stopRun(activeRun.id)
              else invoke('operation.cancel', { operationId: activeRun.id })
            }
          }}
        />
      </HbarComposerAttachmentDropTarget>
      {projectContextLabels && (
        <LumenFrame className="hbar-session-project-context-below">{projectContextView(showLaunchLocation)}</LumenFrame>
      )}
      {sessionUsagePresentation(controls, labels.usage).notice && (
        <LumenText as="p" className="hbar-session-budget-notice" role="status">
          {sessionUsagePresentation(controls, labels.usage).notice}
        </LumenText>
      )}
    </LumenFrame>
  ) : null

  return (
    <LumenFrame ref={find.workspaceRef} className="hbar-app-react-session-workspace">
      <LumenPageHeader
        title={sessionTitle}
        context={workspaceName}
        status={
          activeRun
            ? {
                label: labels.runs.statusLabel(activeRun.status),
                tone: activeRun.status === 'waiting_approval' ? 'warning' : 'success',
              }
            : undefined
        }
        actionsLabel={labels.tools.label}
        actions={
          <>
            {find.trigger}
            {showFilesInHeader && (
              <SessionToolButton
                icon={Files}
                label={labels.tools.files}
                selected={isToolActive('files')}
                disabled={!sessionId}
                onClick={() => toggleTool('files')}
              />
            )}
            <SessionToolButton
              icon={ListChecks}
              label={labels.tools.activity}
              selected={isToolActive('activity')}
              disabled={!sessionId}
              onClick={() => toggleTool('activity')}
            />
            <HbarSessionToolsMenu
              key={`${sessionId}:${navigation.workspaceId}:${sourceTab?.instanceKey ?? ''}`}
              labels={labels.tools}
              selected={
                isToolActive('monitoring')
                  ? 'monitoring'
                  : isToolActive('agents')
                    ? 'agents'
                    : isToolActive('goals')
                      ? 'goals'
                      : null
              }
              disabled={!sessionId}
              onToggleTool={toggleTool}
              onSettings={() => {
                if (sessionId) invoke('app.openSettings', { scope: 'session', targetId: sessionId })
              }}
            />
          </>
        }
      />
      {toolFailure?.sessionId === sessionId &&
        toolFailure.workspaceId === navigation.workspaceId &&
        toolFailure.sourceTabInstanceKey === (sourceTab?.instanceKey ?? null) && (
          <LumenText as="p" role="alert">
            {labels.tools.error(toolFailure.code)}
          </LumenText>
        )}
      {sessionId && (
        <LumenFrame className="hbar-session-current-goal" data-current-goal-session={sessionId}>
          <HbarComposerGoal
            key={sessionId}
            sessionId={sessionId}
            workspaceId={navigation.workspaceId}
            connected={connected}
            labels={labels.intent}
            surface="summary"
            runActive={
              connected &&
              ((timeline.sessionId === sessionId && Boolean(activeRun)) ||
                (selectedExecution.target?.sessionId === sessionId &&
                  selectedExecution.target.workspaceId === sessionWorkspaceId &&
                  selectedExecution.status === 'ready' &&
                  selectedExecution.snapshot?.execution.activeCount !== undefined &&
                  selectedExecution.snapshot.execution.activeCount > 0))
            }
            executionReadError={
              connected &&
              selectedExecution.target?.sessionId === sessionId &&
              selectedExecution.target.workspaceId === sessionWorkspaceId &&
              selectedExecution.status === 'error'
            }
            executionChecking={
              connected &&
              selectedExecution.target?.sessionId === sessionId &&
              selectedExecution.target.workspaceId === sessionWorkspaceId &&
              selectedExecution.status === 'loading'
            }
            goalTriggerRef={composerGoalTrigger}
            canPrepare={canPrepare}
          />
        </LumenFrame>
      )}
      {navigationAccessory}
      <LumenFrame
        className="hbar-app-react-session-main"
        ref={reading.rootRef}
        data-reading-scope={reading.scope}
        data-reading-restoring={reading.restoring}
        onScrollCapture={reading.onScrollCapture}
        onWheelCapture={reading.onWheelCapture}
        onTouchStartCapture={reading.onTouchStartCapture}
        onPointerDownCapture={reading.onPointerDownCapture}
        onKeyDownCapture={reading.onKeyDownCapture}
      >
        <LumenAiChat01
          className="hbar-session-ai-chat"
          controlled={{
            body: (
              <LumenConversation
                title={labels.conversationTitle(sessionTitle)}
                header={find.bar}
                messages={messages}
                empty={emptyTimeline}
                beforeMessages={
                  <>
                    {reading.unavailable && (
                      <LumenText as="p" role="status">
                        {labels.readingPositionUnavailable}
                      </LumenText>
                    )}
                    {historyNotices}
                  </>
                }
                afterMessages={activity}
                composer={composer}
                scrollKey={sessionId ?? undefined}
                scrollTarget={find.scrollTarget ?? reading.scrollTarget}
                onScrollTargetResult={(result) => {
                  if (!reading.onScrollTargetResult(result)) find.onScrollTargetResult(result)
                }}
                followLatest={!find.open && !reading.restoring}
                contentRevision={`${timeline.cursor}:goal:${goalHistoryEntry?.status ?? 'idle'}:${goalLifecycleRows.map((row) => row.eventId).join(',')}:${Object.values(
                  timeline.streams,
                )
                  .map((stream) => `${stream.id}:${stream.version}`)
                  .sort()
                  .join(',')}`}
                latestLabel={labels.latest}
              />
            ),
          }}
        />
      </LumenFrame>
    </LumenFrame>
  )
}

export function HbarSessionWorkspace(props: HbarSessionWorkspaceProps) {
  return (
    <HbarSessionImageLayer options={props.images}>
      <SessionWorkspaceContent {...props} />
    </HbarSessionImageLayer>
  )
}
