import { SessionWorkspaceComposer } from './session-workspace-composer'
import type { HbarSessionWorkspaceProps } from './session-workspace-contract'
export type { HbarSessionWorkspaceProps, HbarSessionWorkspaceLabels } from './session-workspace-contract'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { FolderOpen, ListChecks, Search, Settings, type LucideIcon } from 'lucide-react'
import {
  LumenContentText,
  LumenFrame,
  LumenButton,
  LumenConversation,
  LumenAiChat01,
  LumenAgentApproval01,
  LumenIcon,
  LumenPageHeader,
  type LumenMessageProps,
} from '@lumen/app-ui'
import {
  RuntimeCommandError,
  isSessionWorkspaceMoveLocked,
  messageForkActionKey,
  planProposalActionKey,
  projectSessionDecisions,
  sessionDecisionAction,
  getGoalHistoryProjection,
  GOAL_HISTORY_MAX_FACTS,
  type SessionDecision,
} from '@hbar/app-runtime'

import { useHbarRuntime, useHbarRuntimeSelector, useHbarRuntimeState } from './runtime'
import { HbarSessionImageLayer } from './session-images'
import {
  HbarMessageBlocks,
  HbarMessageActionBar,
  type HbarMessageBlocksProps,
  type HbarMessageForkAction,
} from './session-message'
import { projectSessionMessages, projectSessionTimelineSequence } from './session-message-model'
import { HbarRunFileChangesConnected } from './run-file-changes'

import { projectToolActivities, EMPTY_TOOL_ACTIVITIES } from './session-tool-activity-model'
import { conversationMessageExpectedText, type ConversationSelectionSubmission } from './conversation-selection-model'
import { HbarConversationSelection, useConversationSelectionKeyboardOwner } from './conversation-selection'
import { HbarSessionDecision } from './session-interactions'

import { settledSessionDecision } from './session-monitoring-decisions'

import { HbarDeletedSessionWorkspace } from './deleted-session-workspace'
import { useSessionReadingPosition } from './session-reading-position'
import { useSessionHistoryScroll } from './session-history-scroll'
import { HbarSessionMessageAnchors } from './conversation-anchors'

import { HbarHistoricalPlanMessage, HbarProposedPlanMessage } from './proposed-plan-message'

import { currentSessionRun } from './session-run-activity'
import { currentSessionRunFailure } from './session-run-failure-model'
import { HbarSessionInterruptionNotice } from './session-interruption-notice'

import { HbarContextCompactionMarker } from './session-context-history'
import { HbarActivityDisclosure } from './session-activity-disclosure'
import { groupCompletedSessionActivities } from './session-activity-group-model'
import { messageActivitySummary } from './session-message'
import { HbarSessionExecutionStatus } from './session-execution-status'

import { HbarAgentToolOpen } from './agent-tool-open'
import { agentToolOpenIdentity } from './agent-tool-open-model'

import { HbarSessionEmptyHero, showSessionEmptyHero } from './session-empty-hero'
import type { MessageFileReferenceContext } from './message-file-reference'

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
import { firstSendIsLocked } from './pre-session-launch-status'
import { useSessionFind } from './session-find'
import { useHbarMobileHeaderMenuSection, type HbarMobileHeaderMenuItem } from './mobile-header-menu'

import { HbarGoalLifecycleCard } from './goal-lifecycle'
import { projectGoalLifecycleRows } from './goal-lifecycle-model'
import { sessionPreparationStatus } from './session-execution-notice'

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

function SessionWorkspaceContent(props: HbarSessionWorkspaceProps) {
  const {
    sessionTitle,
    workspaceName,
    sessionWorkspaceId,
    labels,
    describeTool,
    connected,
    files,
    showFilesInHeader = true,
    navigationAccessory,
    fileChangeRenderer,
  } = props

  const runtime = useHbarRuntime()
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const sessionId = navigation.sessionId
  const executionAccess = useHbarRuntimeState(runtime.state.sessionExecutionAccess)
  const timeline = useHbarRuntimeState(runtime.state.timeline)
  const tabs = useHbarRuntimeState(runtime.state.workspaceTabs)
  const workspaceMoves = useHbarRuntimeState(runtime.state.sessionWorkspaceMove)
  const messageFork = useHbarRuntimeState(runtime.state.messageFork)
  const draft = useHbarRuntimeSelector(runtime.state.drafts, (state) => (sessionId ? state[sessionId] : undefined))
  const firstSendDrafts = useHbarRuntimeState(runtime.state.preSessionDrafts)
  const interactions = useHbarRuntimeState(runtime.state.interactions)
  const questionnaires = useHbarRuntimeState(runtime.state.questionnaires)
  const composerIntent = useHbarRuntimeState(runtime.state.composerIntent)
  const goalHistory = useHbarRuntimeState(runtime.state.goalHistory)
  const composerPermission = useHbarRuntimeState(runtime.state.composerPermission)
  const planProposal = useHbarRuntimeState(runtime.state.planProposal)
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const workspaceMoveEntry = sessionId
    ? (workspaceMoves.entries[sessionId] ??
      Object.values(workspaceMoves.entries).find((entry) => entry.targetSessionId === sessionId))
    : undefined
  const workspaceMoveLocked = isSessionWorkspaceMoveLocked(workspaceMoveEntry)
  const firstSendDraft = Object.values(firstSendDrafts).find(
    (entry) =>
      entry.sessionId === sessionId &&
      entry.capturedWorkspaceId === sessionWorkspaceId &&
      entry.error !== 'GOAL_PREPARED' &&
      entry.phase !== 'accepted' &&
      entry.phase !== 'idle',
  )
  const firstSendLocked = firstSendIsLocked(firstSendDraft)
  const find = useSessionFind(timeline, labels.find)
  useConversationSelectionKeyboardOwner(find.workspaceRef)
  const preparationStatus = sessionPreparationStatus(
    executionAccess,
    sessionId && navigation.workspaceId === sessionWorkspaceId ? { sessionId, workspaceId: sessionWorkspaceId } : null,
  )
  const canPrepare = preparationStatus === 'ready' && !firstSendLocked && !workspaceMoveLocked
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
  const activeRuns =
    timeline.sessionId === sessionId
      ? timeline.runs.filter(
          (run) => run.sessionId === sessionId && ['queued', 'running', 'waiting_approval'].includes(run.status),
        )
      : []
  const activeRun = currentSessionRun(activeRuns)
  const execute = (name: string, input: unknown) =>
    (runtime.commands.execute as (command: string, value: unknown) => Promise<unknown>)(name, input)
  const invoke = (name: string, input: unknown) => void execute(name, input).catch(() => {})
  const composerWrites = useRef(new Map<string, Set<Promise<unknown>>>())
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
  const sourceTab = tabs.items.find((item) => item.kind === 'session' && item.sessionId === sessionId)
  const sourceTabInstanceKey = sourceTab?.instanceKey ?? null
  const toggleTool = useCallback(
    (
      panelId: 'files' | 'activity' | 'monitoring' | 'agents' | 'goals',
      command: 'sessionTools.toggle' | 'sessionTools.open' = 'sessionTools.toggle',
    ) => {
      if (!sessionId || !navigation.workspaceId) return
      const target = {
        panelId,
        workspaceId: navigation.workspaceId,
        sessionId,
        sourceTabInstanceKey,
      }
      setToolFailure(null)
      void runtime.commands.execute(command, target).catch((reason: unknown) => {
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
    },
    [navigation.workspaceId, runtime, sessionId, sourceTabInstanceKey],
  )

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
            icon: FolderOpen,
            disabled: !sessionId,
            pressed: isToolActive('files'),
            onActivate: () => toggleTool('files'),
          } satisfies HbarMobileHeaderMenuItem,
        ]
      : []),
    {
      id: 'session-panel',
      order: 2,
      label: labels.tools.panel,
      icon: ListChecks,
      disabled: !sessionId,
      pressed: ['activity', 'monitoring', 'agents', 'goals'].some(
        (id) =>
          activeTool?.panelId === id &&
          activeTool.sessionId === sessionId &&
          activeTool.workspaceId === navigation.workspaceId,
      ),
      onActivate: () => toggleTool('monitoring'),
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
  const historyScroll = useSessionHistoryScroll({
    runtime,
    target: backgroundTarget,
    connected,
    ready: activeConversationOwner && timeline.sessionId === sessionId && timeline.status === 'ready',
    restoring: reading.restoring,
    findRequestId: find.scrollTarget?.requestId ?? null,
  })
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
    return <LumenAgentApproval01 key={`${decision.kind}:${decision.id}`} controlled={{ body }} />
  }
  const toolDecisionsByMessage = new Map(
    [...decisionProjection.byMessage].map(([messageId, rows]) => [
      messageId,
      new Map(
        [...rows].flatMap(([rowKey, decisions]) => {
          const pending = decisions.filter((decision) => !settledSessionDecision(decision, interactions))
          return pending.length ? [[rowKey, pending.map(renderDecision)] as const] : []
        }),
      ),
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
    const moveLocked = isSessionWorkspaceMoveLocked(currentMove)
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
  const sequence = groupCompletedSessionActivities(
    projectSessionTimelineSequence(timeline, goalLifecycleRows),
    ({ message }) =>
      Boolean(
        toolDecisionsByMessage.get(message.id)?.size ||
        proposal?.target.messageId === message.id ||
        forkActionFor(message) ||
        messageFork.actions[forkKey(message)]?.status === 'created',
      ),
  )
  const groupedMessageIds = new Set(
    sequence.flatMap((item) =>
      item.kind === 'activityGroup' ? item.projections.map(({ message }) => message.id) : [],
    ),
  )
  const messageRows: LumenMessageProps[] = [
    ...projectedMessages.map(({ message, blocks, results }) => {
      const fileWorkspaceId = navigation.workspaceId
      const fileReferences: MessageFileReferenceContext | undefined =
        files && message.sessionId === sessionId && fileWorkspaceId
          ? {
              owner: runtime,
              source: {
                workspaceId: fileWorkspaceId,
                sessionId: message.sessionId,
                messageId: message.id,
                sourceTabInstanceKey: sourceTab?.instanceKey ?? null,
              },
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
            activityDisplay={groupedMessageIds.has(message.id) ? 'rows' : 'auto'}
            toolActivity={toolActivities.get(message.runId) ?? EMPTY_TOOL_ACTIVITIES}
            fileReferences={fileReferences}
            copyOwner={runtime}
            sessionId={message.sessionId}
            messageId={message.id}
            blocks={blocks}
            results={results}
            streaming={!groupedMessageIds.has(message.id) && unfinishedRuns.has(message.runId)}
            labels={labels.messageBlocks}
            describeTool={describeTool}
            renderToolAction={toolActionForMessage(message.id)}
            toolDecisions={toolDecisionsByMessage.get(message.id)}
            readOnlyLabel={labels.proposedPlanReadOnly}
          />
        ) : (
          <HbarMessageBlocks
            activityDisplay={groupedMessageIds.has(message.id) ? 'rows' : 'auto'}
            toolActivity={toolActivities.get(message.runId) ?? EMPTY_TOOL_ACTIVITIES}
            fileReferences={fileReferences}
            copyOwner={runtime}
            sessionId={message.sessionId}
            messageId={message.id}
            blocks={blocks}
            textFormat={message.role === 'user' ? 'literal' : 'markdown'}
            results={results}
            streaming={!groupedMessageIds.has(message.id) && unfinishedRuns.has(message.runId)}
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
            expectedRevision={message.sessionId === sessionId ? (draft?.revision ?? 0) : 0}
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
                <LumenContentText context="message.inline">
                  {messageFork.actions[forkKey(message)]?.status === 'created'
                    ? labels.messageFork.createdAfterTimestamp(labels.timestamp(message.createdAt))
                    : labels.timestamp(message.createdAt)}
                </LumenContentText>
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
  const summarizedRuns = new Set(
    sequence.flatMap((item) => (item.kind === 'runFileChanges' && labels.fileChanges ? [item.runId] : [])),
  )
  const messages: LumenMessageProps[] = sequence.flatMap((item): LumenMessageProps[] => {
    if (item.kind === 'activityGroup') {
      const first = rowsById.get(item.id)
      if (!first) return []
      return [
        {
          ...first,
          actions: null,
          children: (
            <HbarActivityDisclosure
              summary={labels.messageBlocks.activity(
                messageActivitySummary(item.rows, labels.messageBlocks, describeTool),
              )}
            >
              {item.projections.map(({ message }) => (
                <LumenFrame key={message.id} data-activity-message-id={message.id}>
                  {rowsById.get(message.id)?.children}
                </LumenFrame>
              ))}
            </HbarActivityDisclosure>
          ),
        },
      ]
    }
    if (item.kind === 'contextCompaction')
      return labels.liveStatus.history
        ? [
            {
              id: `context-compaction:${item.marker.id}`,
              role: 'system',
              author: labels.author.system,
              avatar: labels.avatar.system,
              appearance: 'transcript',
              copyLabel: labels.copy,
              actions: null,
              children: (
                <HbarContextCompactionMarker
                  marker={item.marker}
                  sessionId={sessionId ?? ''}
                  labels={labels.liveStatus.history}
                />
              ),
            },
          ]
        : []
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
    if (item.kind === 'runFileChanges')
      return labels.fileChanges
        ? [
            {
              id: `run-file-changes:${item.runId}`,
              role: 'system',
              author: labels.author.system,
              avatar: labels.avatar.system,
              appearance: 'transcript',
              copyLabel: labels.copy,
              actions: rowsById.get(lastAssistantByRun.get(item.runId) ?? '')?.actions ?? null,
              children: (
                <HbarRunFileChangesConnected
                  sessionId={item.sessionId}
                  runId={item.runId}
                  summary={item.summary}
                  labels={labels.fileChanges}
                  connected={connected}
                  renderer={fileChangeRenderer}
                />
              ),
            },
          ]
        : []
    if (item.kind === 'goalContinuation') return [] // Run boundaries, including failed Goal continuations, belong to session status.
    const row = rowsById.get(item.kind === 'message' ? item.projection.message.id : item.stream.id)
    return row
      ? [
          {
            ...row,
            actions:
              item.kind === 'message' &&
              summarizedRuns.has(item.projection.message.runId) &&
              lastAssistantByRun.get(item.projection.message.runId) === row.id
                ? null
                : row.actions,
          },
        ]
      : []
  })

  const currentFailure =
    connected && timeline.sessionId === sessionId ? currentSessionRunFailure(timeline.runs, sessionId) : null
  const activity: ReactNode =
    decisionProjection.fallback.length > 0 || currentFailure ? (
      <LumenFrame className="hbar-app-react-session-activity">
        {decisionProjection.fallback.map(renderDecision)}
        <HbarSessionInterruptionNotice
          status={
            currentFailure?.status === 'failed' || currentFailure?.status === 'interrupted'
              ? currentFailure.status
              : null
          }
          labels={labels.interruption}
          onOpenStatus={() => toggleTool('monitoring', 'sessionTools.open')}
        />
      </LumenFrame>
    ) : null

  const retryTimeline = () => sessionId && invoke('timeline.retry', { sessionId })
  const loadOlder = () => sessionId && invoke('timeline.loadOlder', { sessionId })
  const historyNotices =
    connected && sessionId ? (
      <LumenFrame className="hbar-app-react-session-history-controls">
        {timeline.status === 'loading' && timeline.messages.length > 0 && (
          <LumenContentText context="feedback.message" role="status">
            {labels.refreshing}
          </LumenContentText>
        )}
        {timeline.status === 'error' && timeline.messages.length > 0 && (
          <LumenFrame className="hbar-app-react-session-history-error" role="alert">
            <LumenContentText context="message.inline">
              {labels.error(timeline.error ?? 'EXECUTION_FAILED')}
            </LumenContentText>
            {connected && (
              <LumenButton size="s" onClick={retryTimeline}>
                {labels.retryTimeline}
              </LumenButton>
            )}
          </LumenFrame>
        )}
        {timeline.olderStatus === 'limit' ? (
          <LumenContentText context="feedback.message" role="status">
            {labels.historyLimit}
          </LumenContentText>
        ) : timeline.olderStatus === 'loading' ? (
          <LumenContentText context="feedback.message" role="status">
            {labels.loadingOlder}
          </LumenContentText>
        ) : timeline.olderStatus === 'error' ? (
          <LumenFrame className="hbar-app-react-session-history-page">
            <LumenContentText context="message.inline" role="alert">
              {labels.error(timeline.olderError ?? 'EXECUTION_FAILED')}
            </LumenContentText>
            <LumenButton size="s" disabled={!connected} onClick={loadOlder}>
              {labels.retryHistory}
            </LumenButton>
          </LumenFrame>
        ) : timeline.hasOlder ? (
          <LumenContentText context="feedback.message" role="status">
            {labels.loadOlder}
          </LumenContentText>
        ) : null}
        {(goalHistory.available ||
          (composerIntent.facts.sessionId === sessionId && composerIntent.facts.snapshot?.goal)) &&
          goalHistoryProjection && (
            <LumenFrame
              className="hbar-app-react-session-history-page"
              data-goal-history-gap={goalHistoryProjection.gapReason ?? undefined}
            >
              {goalHistoryProjection.status === 'loading' ? (
                <LumenContentText context="message.inline" role="status">
                  {labels.goalHistory.loading}
                </LumenContentText>
              ) : goalHistoryProjection.gapReason ? (
                <LumenContentText
                  context="message.inline"
                  role={goalHistoryProjection.gapReason === 'error' ? 'alert' : 'status'}
                >
                  {labels.goalHistory.gap(goalHistoryProjection.gapReason)}
                </LumenContentText>
              ) : null}
              {goalHistoryProjection.limit && (
                <LumenContentText context="message.inline" role="status">
                  {labels.goalHistory.limit(GOAL_HISTORY_MAX_FACTS)}
                </LumenContentText>
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
  const emptyTimeline = welcome ? (
    <HbarSessionEmptyHero labels={labels.emptyHero} />
  ) : (
    <LumenFrame className="hbar-app-react-session-empty">
      <LumenContentText context="section.description">
        {connected && timeline.status === 'loading'
          ? labels.loading
          : connected && timeline.error
            ? labels.error(timeline.error)
            : labels.emptyHistory}
      </LumenContentText>
      {connected && timeline.status === 'error' && sessionId && (
        <LumenButton size="s" onClick={retryTimeline}>
          {labels.retryTimeline}
        </LumenButton>
      )}
    </LumenFrame>
  )

  return (
    <LumenFrame ref={find.workspaceRef} className="hbar-app-react-session-workspace">
      <LumenPageHeader
        title={sessionTitle}
        context={workspaceName}
        actionsLabel={labels.tools.label}
        actions={
          <>
            {activeRun && (
              <LumenFrame role="status" aria-live="polite" aria-atomic="true">
                <HbarSessionExecutionStatus
                  state={connected ? activeRun.status : 'unconfirmed'}
                  label={connected ? labels.runs.statusLabel(activeRun.status) : labels.liveStatus.offline}
                  tone={
                    !connected || activeRun.status === 'waiting_approval'
                      ? 'warning'
                      : activeRun.status === 'running'
                        ? 'info'
                        : 'neutral'
                  }
                />
              </LumenFrame>
            )}
            {find.trigger}
            {showFilesInHeader && (
              <SessionToolButton
                icon={FolderOpen}
                label={labels.tools.files}
                selected={isToolActive('files')}
                disabled={!sessionId}
                onClick={() => toggleTool('files')}
              />
            )}
            <SessionToolButton
              icon={ListChecks}
              label={labels.tools.panel}
              selected={['activity', 'monitoring', 'agents', 'goals'].some(
                (id) =>
                  activeTool?.panelId === id &&
                  activeTool.sessionId === sessionId &&
                  activeTool.workspaceId === navigation.workspaceId,
              )}
              disabled={!sessionId}
              onClick={() => toggleTool('monitoring')}
            />
            <SessionToolButton
              icon={Settings}
              label={labels.tools.settings}
              selected={false}
              disabled={!sessionId}
              onClick={() => {
                if (sessionId) invoke('app.openSettings', { scope: 'session', targetId: sessionId })
              }}
            />
          </>
        }
      />
      {connected &&
        toolFailure?.sessionId === sessionId &&
        toolFailure.workspaceId === navigation.workspaceId &&
        toolFailure.sourceTabInstanceKey === (sourceTab?.instanceKey ?? null) && (
          <LumenContentText context="feedback.message" role="alert">
            {labels.tools.error(toolFailure.code)}
          </LumenContentText>
        )}
      {navigationAccessory}
      <LumenFrame
        className="hbar-app-react-session-main"
        ref={reading.rootRef}
        data-reading-scope={reading.scope}
        data-reading-restoring={reading.restoring}
        onScrollCapture={(event) => {
          reading.onScrollCapture(event)
          historyScroll.onScrollCapture(event)
        }}
        onWheelCapture={(event) => {
          reading.onWheelCapture(event)
          historyScroll.onWheelCapture(event)
        }}
        onTouchStartCapture={(event) => {
          reading.onTouchStartCapture(event)
          historyScroll.onTouchStartCapture(event)
        }}
        onTouchMoveCapture={historyScroll.onTouchMoveCapture}
        onPointerDownCapture={(event) => {
          reading.onPointerDownCapture(event)
          historyScroll.onPointerDownCapture(event)
        }}
        onKeyDownCapture={(event) => {
          reading.onKeyDownCapture(event)
          historyScroll.onKeyDownCapture(event)
        }}
      >
        {backgroundTarget && activeConversationOwner && timeline.sessionId === sessionId && (
          <HbarSessionMessageAnchors
            timeline={timeline}
            target={backgroundTarget}
            labels={labels.anchors}
            connected={connected}
            navigating={reading.restoring}
            onBeforeNavigate={() => {
              find.close()
              reading.cancelNavigation()
            }}
          />
        )}
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
                      <LumenContentText context="feedback.message" role="status">
                        {labels.readingPositionUnavailable}
                      </LumenContentText>
                    )}
                    {historyNotices}
                  </>
                }
                afterMessages={activity}
                composer={
                  <SessionWorkspaceComposer {...props} composerWrites={composerWrites} toggleTool={toggleTool} />
                }
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
  const runtime = useHbarRuntime()
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const deletedId = useHbarRuntimeSelector(runtime.state.directory, (directory) =>
    navigation.sessionId && directory.deletedSessions?.[navigation.sessionId] ? navigation.sessionId : null,
  )
  return (
    <HbarSessionImageLayer options={props.images}>
      {deletedId ? (
        <HbarDeletedSessionWorkspace key={deletedId} {...props} sessionId={deletedId} />
      ) : (
        <SessionWorkspaceContent {...props} />
      )}
    </HbarSessionImageLayer>
  )
}
