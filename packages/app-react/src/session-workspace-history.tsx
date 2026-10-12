import { SessionWorkspaceHeader } from './session-workspace-header'
import { SessionHistoryNotices } from './session-history-notices'
import { useSessionToolActions } from './session-tool-actions'
import { awaitComposerWrites } from './session-composer-writes'
import { SessionWorkspaceComposer } from './session-workspace-composer'
import type { SessionWorkspaceHistoryProps } from './session-workspace-contract'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import {
  LumenContentText,
  LumenFrame,
  LumenButton,
  LumenConversation,
  LumenAiChat01,
  LumenAgentApproval01,
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
  type SessionDecision,
} from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeSelector, useHbarRuntimeState } from './runtime'
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
import { useConversationSelectionKeyboardOwner } from './conversation-selection'
import { SessionConversationSelection } from './session-conversation-selection'
import { HbarSessionDecision } from './session-interactions'
import { settledSessionDecision } from './session-monitoring-decisions'
import { useSessionReadingPosition } from './session-reading-position'
import { useSessionHistoryScroll } from './session-history-scroll'
import { HbarSessionMessageAnchors } from './conversation-anchors'
import { HbarHistoricalPlanMessage, HbarProposedPlanMessage } from './proposed-plan-message'

import { currentSessionRunFailure } from './session-run-failure-model'
import { HbarSessionInterruptionNotice } from './session-interruption-notice'
import { HbarContextCompactionMarker } from './session-context-history'
import { HbarActivityDisclosure } from './session-activity-disclosure'
import { groupCompletedSessionActivities } from './session-activity-group-model'
import { messageActivitySummary } from './session-message'
import { HbarAgentToolOpen } from './agent-tool-open'
import { agentToolOpenIdentity } from './agent-tool-open-model'
import { HbarSessionEmptyHero, showSessionEmptyHero } from './session-empty-hero'
import type { MessageFileReferenceContext } from './message-file-reference'
import './lumen-session-workspace.css'
import { firstSendIsLocked } from './pre-session-launch-status'
import { useSessionFind } from './session-find'
import { HbarGoalLifecycleCard } from './goal-lifecycle'
import { projectGoalLifecycleRows } from './goal-lifecycle-model'
import { sessionPreparationStatus } from './session-execution-notice'
import { useSessionHistoryMessages } from './session-workspace-messages'

export function SessionWorkspaceHistory(props: SessionWorkspaceHistoryProps) {
  const { sessionTitle, sessionWorkspaceId, describeTool, connected, files, navigationAccessory, fileChangeRenderer } =
    props
  const { t } = useSessionHistoryMessages()

  const runtime = useHbarRuntime()
  const toolActions = useSessionToolActions()
  const { toggleTool } = toolActions

  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const sessionId = navigation.sessionId
  const executionAccess = useHbarRuntimeState(runtime.state.sessionExecutionAccess)
  const timeline = useHbarRuntimeState(runtime.state.timeline)
  const tabs = useHbarRuntimeState(runtime.state.workspaceTabs)
  const workspaceMoveEntry = useHbarRuntimeSelector(runtime.state.sessionWorkspaceMove, (state) =>
    sessionId
      ? (state.entries[sessionId] ?? Object.values(state.entries).find((entry) => entry.targetSessionId === sessionId))
      : undefined,
  )
  const messageFork = useHbarRuntimeState(runtime.state.messageFork)
  const draftStatus = useHbarRuntimeSelector(runtime.state.drafts, (state) =>
    sessionId ? state[sessionId]?.status : undefined,
  )
  const lastOperationId = useHbarRuntimeSelector(runtime.state.drafts, (state) =>
    sessionId ? state[sessionId]?.lastOperationId : undefined,
  )
  const firstSendDraft = useHbarRuntimeSelector(runtime.state.preSessionDrafts, (state) =>
    Object.values(state).find(
      (entry) =>
        entry.sessionId === sessionId &&
        entry.capturedWorkspaceId === sessionWorkspaceId &&
        entry.error !== 'GOAL_PREPARED' &&
        entry.phase !== 'accepted' &&
        entry.phase !== 'idle',
    ),
  )
  const interactions = useHbarRuntimeState(runtime.state.interactions)
  const questionnaires = useHbarRuntimeState(runtime.state.questionnaires)
  const intentPending = useHbarRuntimeSelector(runtime.state.composerIntent, (state) =>
    sessionId ? ['submitting', 'unknown'].includes(state.entries[sessionId]?.submission.status ?? '') : false,
  )
  const goal = useHbarRuntimeSelector(runtime.state.composerIntent, (state) =>
    state.facts.sessionId === sessionId ? state.facts.snapshot?.goal : undefined,
  )
  const goalHistoryAvailable = useHbarRuntimeSelector(runtime.state.goalHistory, (state) => state.available)
  const goalHistoryEntry = useHbarRuntimeSelector(runtime.state.goalHistory, (state) =>
    sessionId ? state.sessions[sessionId] : undefined,
  )
  const permissionLocked = useHbarRuntimeSelector(runtime.state.composerPermission, (state) =>
    sessionId ? state.entries[sessionId]?.locked : undefined,
  )
  const proposal = useHbarRuntimeSelector(runtime.state.planProposal, (state) =>
    state.sessionId === sessionId ? state.proposal : null,
  )
  const proposalAvailability = useHbarRuntimeSelector(runtime.state.planProposal, (state) => state.availability)
  const proposalAction = useHbarRuntimeSelector(runtime.state.planProposal, (state) =>
    proposal ? state.actions[planProposalActionKey(proposal.target)] : undefined,
  )
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const workspaceMoveLocked = isSessionWorkspaceMoveLocked(workspaceMoveEntry)
  const firstSendLocked = firstSendIsLocked(firstSendDraft)
  const find = useSessionFind(timeline)
  useConversationSelectionKeyboardOwner(find.workspaceRef)
  const preparationStatus = sessionPreparationStatus(
    executionAccess,
    sessionId && navigation.workspaceId === sessionWorkspaceId ? { sessionId, workspaceId: sessionWorkspaceId } : null,
  )
  const canPrepare = preparationStatus === 'ready' && !firstSendLocked && !workspaceMoveLocked
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
    draftStatus !== 'submitting' &&
    draftStatus !== 'unknown'
  const activeRuns =
    timeline.sessionId === sessionId
      ? timeline.runs.filter(
          (run) => run.sessionId === sessionId && ['queued', 'running', 'waiting_approval'].includes(run.status),
        )
      : []
  const execute = (name: string, input: unknown) =>
    (runtime.commands.execute as (command: string, value: unknown) => Promise<unknown>)(name, input)
  const invoke = (name: string, input: unknown) => void execute(name, input).catch(() => {})
  const composerWrites = useRef(new Map<string, Set<Promise<unknown>>>())
  const sourceTab = tabs.items.find((item) => item.kind === 'session' && item.sessionId === sessionId)

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
          labels={t('agentToolOpen')}
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
        labels={t('decisions')}
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
  const proposalBlocked = !canPrepare || intentPending || draftStatus === 'submitting' || draftStatus === 'unknown'
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
          ? t('messageFork').submitting
          : status === 'unknown'
            ? t('messageFork').recheck
            : status === 'failed'
              ? t('messageFork').retry
              : t('messageFork').ready,
      status,
      error:
        status === 'unknown' ? t('messageFork').unknown : action?.error ? t('messageFork').error(action.error) : null,
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
              labels: t('fileReferences'),
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
            labels={t('messageBlocks')}
            describeTool={describeTool}
            renderToolAction={toolActionForMessage(message.id)}
            toolDecisions={toolDecisionsByMessage.get(message.id)}
            document={proposal}
            plan={{
              labels: t('proposedPlan'),
              state: {
                status: proposalAction?.status ?? 'idle',
                phase: proposalAction?.phase,
                canSubmit: connected && !proposalBlocked && proposalAvailability === 'ready',
                connected,
                reconciling: proposalAction?.reconciling ?? false,
                error: proposalAction?.error ? t('proposedPlan').error(proposalAction.error) : null,
                unavailable: connected
                  ? !canPrepare
                    ? preparationStatus === 'archived'
                      ? t('executionAccess').archived
                      : t('executionAccess').unverified
                    : t('proposedPlanAvailability')(proposalBlocked ? 'busy' : proposalAvailability)
                  : t('disconnected'),
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
            labels={t('messageBlocks')}
            describeTool={describeTool}
            renderToolAction={toolActionForMessage(message.id)}
            toolDecisions={toolDecisionsByMessage.get(message.id)}
            readOnlyLabel={t('proposedPlanReadOnly')}
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
            labels={t('messageBlocks')}
            describeTool={describeTool}
            renderToolAction={toolActionForMessage(message.id)}
            toolDecisions={toolDecisionsByMessage.get(message.id)}
          />
        )
      const expectedText = conversationMessageExpectedText(message.content)
      const selectableRole = message.role === 'user' || message.role === 'assistant' ? message.role : null
      const children =
        selectableRole && expectedText.trim() ? (
          <SessionConversationSelection
            sessionId={message.sessionId}
            messageId={message.id}
            sourceRole={selectableRole}
            expectedText={expectedText}
            enabled={conversationSelectionEnabled && message.sessionId === sessionId}
            labels={t('conversationSelection')}
            onAdd={addConversationSelection}
          >
            {body}
          </SessionConversationSelection>
        ) : (
          body
        )
      return {
        id: message.id,
        role: message.role,
        author: t('author')[message.role],
        avatar: t('avatar')[message.role],
        appearance: 'transcript' as const,
        copyLabel: t('copy'),
        children,
        actions:
          (lastAssistantByRun.get(message.runId) === message.id && !unfinishedRuns.has(message.runId)) ||
          forkActionFor(message) ||
          messageFork.actions[forkKey(message)]?.status === 'created' ? (
            <HbarMessageActionBar
              sessionId={message.sessionId}
              messageId={message.id}
              content={message.content}
              labels={t('messageActions')}
              copyLabel={message.role === 'user' ? t('messageActions').copyMessage : undefined}
              fork={forkActionFor(message)}
              metadata={
                <LumenContentText context="message.inline">
                  {messageFork.actions[forkKey(message)]?.status === 'created'
                    ? t('messageFork').createdAfterTimestamp(t('timestamp')(message.createdAt))
                    : t('timestamp')(message.createdAt)}
                </LumenContentText>
              }
            />
          ) : null,
      }
    }),
    ...Object.values(timeline.streams).map((stream) => ({
      id: stream.id,
      role: 'assistant' as const,
      author: t('author').assistant,
      avatar: t('avatar').assistant,
      streaming: true,
      appearance: 'transcript' as const,
      copyLabel: t('copy'),
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
          labels={t('messageBlocks')}
        />
      ),
    })),
  ]

  const rowsById = new Map(messageRows.map((row) => [row.id, row]))
  const summarizedRuns = new Set(
    sequence.flatMap((item) => (item.kind === 'runFileChanges' && t('fileChanges') ? [item.runId] : [])),
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
              summary={t('messageBlocks').activity(messageActivitySummary(item.rows, t('messageBlocks'), describeTool))}
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
    if (item.kind === 'contextCompaction') {
      const historyLabels = t('liveStatus').history
      return historyLabels
        ? [
            {
              id: `context-compaction:${item.marker.id}`,
              role: 'system',
              author: t('author').system,
              avatar: t('avatar').system,
              appearance: 'transcript',
              copyLabel: t('copy'),
              actions: null,
              children: (
                <HbarContextCompactionMarker marker={item.marker} sessionId={sessionId ?? ''} labels={historyLabels} />
              ),
            },
          ]
        : []
    }
    if (item.kind === 'goalLifecycle')
      return [
        {
          id: item.row.id,
          role: 'system',
          author: t('author').system,
          avatar: t('avatar').system,
          appearance: 'transcript',
          copyLabel: t('copy'),
          children: <HbarGoalLifecycleCard row={item.row} labels={t('goalLifecycle')} />,
        },
      ]
    if (item.kind === 'runFileChanges') {
      const fileChangesLabels = t('fileChanges')
      return fileChangesLabels
        ? [
            {
              id: `run-file-changes:${item.runId}`,
              role: 'system',
              author: t('author').system,
              avatar: t('avatar').system,
              appearance: 'transcript',
              copyLabel: t('copy'),
              actions: rowsById.get(lastAssistantByRun.get(item.runId) ?? '')?.actions ?? null,
              children: (
                <HbarRunFileChangesConnected
                  sessionId={item.sessionId}
                  runId={item.runId}
                  summary={item.summary}
                  labels={fileChangesLabels}
                  connected={connected}
                  renderer={fileChangeRenderer}
                />
              ),
            },
          ]
        : []
    }
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
          labels={t('interruption')}
          onOpenStatus={() => toggleTool('monitoring', 'sessionTools.open')}
        />
      </LumenFrame>
    ) : null

  const retryTimeline = () => sessionId && invoke('timeline.retry', { sessionId })

  const welcome =
    (!goalHistoryAvailable ||
      (goalHistoryEntry?.status === 'ready' &&
        !goalHistoryProjection?.gap &&
        !goalHistoryEntry.hasOlder &&
        goalHistoryEntry.facts.length === 0)) &&
    !goal &&
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
      draftStatus: draftStatus ?? null,
      lastOperationId: lastOperationId ?? null,
      submissionPending: intentPending || Boolean(permissionLocked),
    })
  const emptyTimeline = welcome ? (
    <HbarSessionEmptyHero labels={t('emptyHero')} />
  ) : (
    <LumenFrame className="hbar-app-react-session-empty">
      <LumenContentText context="section.description">
        {connected && timeline.status === 'loading'
          ? t('loading')
          : connected && timeline.error
            ? t('error')(timeline.error)
            : t('emptyHistory')}
      </LumenContentText>
      {connected && timeline.status === 'error' && sessionId && (
        <LumenButton size="s" onClick={retryTimeline}>
          {t('retryTimeline')}
        </LumenButton>
      )}
    </LumenFrame>
  )

  return (
    <LumenFrame ref={find.workspaceRef} className="hbar-app-react-session-workspace">
      <SessionWorkspaceHeader {...props} find={find} toolActions={toolActions} />
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
            labels={t('anchors')}
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
                title={t('conversationTitle')(sessionTitle)}
                header={find.bar}
                messages={messages}
                empty={emptyTimeline}
                beforeMessages={
                  <>
                    {reading.unavailable && (
                      <LumenContentText context="feedback.message" role="status">
                        {t('readingPositionUnavailable')}
                      </LumenContentText>
                    )}
                    <SessionHistoryNotices connected={connected} />
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
                latestLabel={t('latest')}
              />
            ),
          }}
        />
      </LumenFrame>
    </LumenFrame>
  )
}
