import { useMemo, type ReactNode } from 'react'
import { Bot, ChartNoAxesColumnIncreasing, Files, ListTodo, Settings, type LucideIcon } from 'lucide-react'
import {
  LumenFrame,
  LumenText,
  LumenApprovalRequest,
  LumenButton,
  LumenConversation,
  LumenIcon,
  LumenPageHeader,
  LumenPromptComposer,
  LumenQuestionnaire,
  LumenRunActivity,
  type LumenApprovalRequestLabels,
  type LumenMessageProps,
  type LumenPromptLabels,
  type LumenQuestionnaireLabels,
  type LumenRunActivityLabels,
  type LumenRunActivityStatus,
} from '@lumen/app-ui'
import type { SessionAttachmentUpload } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import {
  HbarMessageBlocks,
  HbarMessageActionBar,
  type HbarMessageBlocksLabels,
  type HbarMessageActionLabels,
} from './session-message'
import { projectSessionMessages } from './session-message-model'
import { HbarComposerModelPicker, type HbarComposerModelLabels } from './composer-model-picker'
import { HbarComposerGoal, HbarComposerIntentControls, type HbarComposerIntentLabels } from './composer-intent-controls'
import { HbarSessionUsageControl, sessionUsagePresentation, type HbarSessionUsageLabels } from './session-usage-control'
import './lumen-session-workspace.css'

export interface HbarSessionWorkspaceLabels {
  readonly conversationTitle: (title: string) => string
  readonly loading: string
  readonly empty: string
  readonly disconnected: string
  readonly refreshing: string
  readonly loadOlder: string
  readonly loadingOlder: string
  readonly retryHistory: string
  readonly retryTimeline: string
  readonly historyLimit: string
  readonly latest: string
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
  readonly modelPicker: HbarComposerModelLabels
  readonly intent: HbarComposerIntentLabels
  readonly messageBlocks: HbarMessageBlocksLabels
  readonly messageActions: HbarMessageActionLabels
  readonly tools: {
    readonly label: string
    readonly files: string
    readonly monitoring: string
    readonly agents: string
    readonly goals: string
    readonly settings: string
  }
  readonly runs: LumenRunActivityLabels
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
  readonly labels: HbarSessionWorkspaceLabels
  readonly connected: boolean
  readonly prepareAttachment?: ((file: File) => Promise<HbarSessionAttachmentSelection>) | undefined
}

export interface HbarSessionAttachmentSelection {
  readonly kind: 'image' | 'file'
  readonly upload: SessionAttachmentUpload
  release(): void
}

function decisionState(
  status: string | undefined,
  error: string | null | undefined,
  complete: boolean,
  labels: HbarSessionWorkspaceLabels,
) {
  if (complete || status === 'succeeded') return { status: 'complete' as const }
  if (status === 'submitting') return { status: 'pending' as const }
  return {
    status: 'idle' as const,
    ...(status === 'unknown' || status === 'failed' ? { error: labels.error(error ?? status) } : {}),
  }
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
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
    >
      <LumenIcon icon={icon} tier="sm" />
      <LumenText as="span" className="hbar-app-react-session-tool-label">
        {label}
      </LumenText>
    </LumenButton>
  )
}

export function HbarSessionWorkspace({
  sessionTitle,
  workspaceName,
  labels,
  connected,
  prepareAttachment,
}: HbarSessionWorkspaceProps) {
  const runtime = useHbarRuntime()
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const timeline = useHbarRuntimeState(runtime.state.timeline)
  const drafts = useHbarRuntimeState(runtime.state.drafts)
  const interactions = useHbarRuntimeState(runtime.state.interactions)
  const questionnaires = useHbarRuntimeState(runtime.state.questionnaires)
  const runActions = useHbarRuntimeState(runtime.state.runActions)
  const controls = useHbarRuntimeState(runtime.state.controls)
  const composerModel = useHbarRuntimeState(runtime.state.composerModel)
  const composerIntent = useHbarRuntimeState(runtime.state.composerIntent)
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const sessionId = navigation.sessionId
  const draft = sessionId ? drafts[sessionId] : undefined
  const intentEntry = sessionId ? composerIntent.entries[sessionId] : undefined
  const intentPending = intentEntry?.submission.status === 'submitting' || intentEntry?.submission.status === 'unknown'
  const intent = intentEntry?.intent ?? 'default'
  const model = controls.sessionId === sessionId ? controls.model : null
  const configured = model?.status === 'configured' && model.modelId !== null
  const modelPending =
    composerModel.sessionId === sessionId &&
    (composerModel.action.status === 'submitting' || composerModel.action.status === 'unknown')
  const activeRuns = timeline.runs.filter((run) => ['queued', 'running', 'waiting_approval'].includes(run.status))
  const activeRun = activeRuns[0]
  const execute = (name: string, input: unknown) =>
    (runtime.commands.execute as (command: string, value: unknown) => Promise<unknown>)(name, input)
  const invoke = (name: string, input: unknown) => void execute(name, input).catch(() => {})
  const addAttachments = (files: readonly File[]) => {
    if (!sessionId || !prepareAttachment) return
    const available = Math.max(0, 12 - ((draft?.attachments.length ?? 0) + (draft?.uploading ?? 0)))
    void (async () => {
      for (const file of files.slice(0, available)) {
        let release: (() => void) | undefined
        try {
          const selection = await prepareAttachment(file)
          release = selection.release
          await execute('draft.addAttachment', {
            sessionId,
            kind: selection.kind,
            upload: selection.upload,
          })
        } catch (error) {
          const code =
            error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
              ? error.code
              : error instanceof Error
                ? error.message
                : 'EXECUTION_FAILED'
          await execute('draft.reportAttachmentError', { sessionId, error: code.slice(0, 200) }).catch(() => {})
        } finally {
          release?.()
        }
      }
    })()
  }
  const runErrorAction = timeline.runs.map((run) => runActions[run.id]).find((action) => action?.error)
  const toolInstanceId = presentation.toolInstanceId
  const activeTool = toolInstanceId ? surfaces.panels[toolInstanceId] : undefined
  const isToolActive = (panelId: 'files' | 'monitoring' | 'agents' | 'goals') =>
    sessionId !== null &&
    activeTool?.panelId === panelId &&
    activeTool.workspaceId === navigation.workspaceId &&
    (panelId === 'files' || activeTool.sessionId === sessionId)
  const toggleTool = (panelId: 'files' | 'monitoring' | 'agents' | 'goals') => {
    if (!sessionId) return
    if (toolInstanceId && isToolActive(panelId)) {
      invoke('app.closePanel', { instanceId: toolInstanceId })
      return
    }
    invoke('app.openPanel', { panelId, workspaceId: navigation.workspaceId, sessionId, binding: 'followActive' })
  }

  const projectedMessages = useMemo(() => projectSessionMessages(timeline.messages), [timeline.messages])
  const lastAssistantByRun = new Map<string, string>()
  for (const { message } of projectedMessages) {
    if (message.role === 'assistant' && message.content.some((block) => block.type === 'text' && block.text.trim()))
      lastAssistantByRun.set(message.runId, message.id)
  }
  const unfinishedRuns = new Set(activeRuns.map((run) => run.id))
  const messages: LumenMessageProps[] = [
    ...projectedMessages.map(({ message, blocks, results }) => ({
      id: message.id,
      role: message.role,
      author: labels.author[message.role],
      avatar: labels.avatar[message.role],
      appearance: 'transcript' as const,
      copyLabel: labels.copy,
      children: (
        <HbarMessageBlocks
          sessionId={message.sessionId}
          messageId={message.id}
          blocks={blocks}
          results={results}
          streaming={unfinishedRuns.has(message.runId)}
          labels={labels.messageBlocks}
        />
      ),
      actions:
        lastAssistantByRun.get(message.runId) === message.id && !unfinishedRuns.has(message.runId) ? (
          <HbarMessageActionBar
            sessionId={message.sessionId}
            messageId={message.id}
            content={message.content}
            labels={labels.messageActions}
            metadata={<LumenText as="span">{labels.timestamp(message.createdAt)}</LumenText>}
          />
        ) : null,
    })),
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

  const activity: ReactNode =
    timeline.runs.length > 0 || timeline.approvals.length > 0 || timeline.userInputs.length > 0 ? (
      <LumenFrame className="hbar-app-react-session-activity">
        {timeline.runs.length > 0 && (
          <LumenRunActivity
            runs={timeline.runs.map((run) => ({
              id: run.id,
              label: labels.timestamp(run.createdAt),
              status: run.status as LumenRunActivityStatus,
              detail: run.error ?? labels.runDetail(run.modelId),
              duration: labels.runDuration(run.startedAt ?? run.createdAt, run.endedAt),
            }))}
            labels={labels.runs}
            listStrategy="content-grown"
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
              .filter((run) => ['submitting', 'unknown', 'succeeded'].includes(runActions[run.id]?.status ?? ''))
              .map((run) => run.id)}
            retryingRunIds={timeline.runs
              .filter((run) => runActions[run.id]?.status === 'submitting')
              .map((run) => run.id)}
            feedback={runErrorAction?.error ? labels.error(runErrorAction.error) : undefined}
            onCancelRun={(operationId) => invoke('operation.cancel', { operationId })}
            onRetryRun={(operationId) => invoke('run.retry', { sessionId, operationId })}
          />
        )}
        {timeline.approvals.map((approval) => {
          const action = interactions[`approval:${approval.id}`]
          return (
            <LumenApprovalRequest
              key={approval.id}
              id={approval.id}
              tool={approval.tool}
              summary={labels.approvalSummary(approval.tool)}
              details={JSON.stringify(approval.args, null, 2)}
              labels={labels.approval}
              state={decisionState(action?.status, action?.error, approval.status !== 'pending', labels)}
              onDecision={(_id, decision) =>
                invoke('approval.resolve', {
                  sessionId: approval.sessionId,
                  approvalId: approval.id,
                  decision: decision === 'deny' ? 'denied' : 'allowed',
                })
              }
            />
          )
        })}
        {timeline.userInputs.map((request) => {
          const action = interactions[`questionnaire:${request.requestId}`]
          const answerDraft = questionnaires[request.requestId]
          return (
            <LumenQuestionnaire
              key={request.requestId}
              requestId={request.requestId}
              questions={request.questions.map((question) => ({
                id: question.id,
                header: question.header,
                prompt: question.question,
                options: question.options?.map((option) => ({
                  value: option.label,
                  label: option.label,
                  description: option.description,
                })),
                acceptsCustomAnswer: question.isOther,
                secret: question.isSecret,
              }))}
              answers={answerDraft?.answers ?? {}}
              labels={labels.questionnaire}
              state={decisionState(action?.status, action?.error, false, labels)}
              onAnswer={(_requestId, questionId, answer) =>
                invoke('questionnaire.setAnswer', {
                  sessionId: request.sessionId,
                  requestId: request.requestId,
                  questionId,
                  answer,
                })
              }
              onSubmit={() =>
                invoke('questionnaire.answer', {
                  sessionId: request.sessionId,
                  requestId: request.requestId,
                  answers: Object.fromEntries(
                    Object.entries(answerDraft?.answers ?? {}).map(([questionId, answer]) => [
                      questionId,
                      { answers: [answer.value] },
                    ]),
                  ),
                })
              }
            />
          )
        })}
      </LumenFrame>
    ) : null

  const retryTimeline = () => sessionId && invoke('timeline.retry', { sessionId })
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
    </LumenFrame>
  ) : null

  const emptyTimeline = (
    <LumenFrame className="hbar-app-react-session-empty">
      <LumenText as="p">
        {timeline.status === 'loading' ? labels.loading : timeline.error ? labels.error(timeline.error) : labels.empty}
      </LumenText>
      {connected && timeline.status === 'error' && sessionId && (
        <LumenButton size="s" onClick={retryTimeline}>
          {labels.retryTimeline}
        </LumenButton>
      )}
    </LumenFrame>
  )

  const composer: ReactNode = sessionId ? (
    <LumenFrame className="hbar-app-react-session-footer">
      <HbarComposerGoal
        key={sessionId}
        sessionId={sessionId}
        workspaceId={navigation.workspaceId}
        connected={connected}
        labels={labels.intent}
      />
      <LumenPromptComposer
        value={draft?.text ?? ''}
        labels={{
          ...labels.prompt,
          placeholder:
            intent === 'goal'
              ? labels.intent.goalPlaceholder
              : intent === 'plan'
                ? labels.intent.planPlaceholder
                : labels.prompt.placeholder,
        }}
        attachments={(draft?.attachments ?? []).map((attachment) => ({
          id: attachment.artifact.id,
          kind: attachment.kind,
          name: attachment.artifact.name,
        }))}
        disabled={!connected || timeline.status === 'loading' || timeline.status === 'error'}
        submitting={draft?.status === 'submitting' || intentEntry?.submission.status === 'submitting'}
        uploading={(draft?.uploading ?? 0) > 0}
        canAddAttachments={
          Boolean(prepareAttachment) &&
          connected &&
          timeline.status !== 'loading' &&
          timeline.status !== 'error' &&
          draft?.status !== 'submitting' &&
          (draft?.attachments.length ?? 0) + (draft?.uploading ?? 0) < 12
        }
        canSubmit={
          configured &&
          !modelPending &&
          !intentPending &&
          draft?.status !== 'unknown' &&
          Boolean(draft?.text.trim() || draft?.attachments.length)
        }
        canStop={Boolean(activeRun)}
        stopping={Boolean(
          activeRun && ['submitting', 'unknown', 'succeeded'].includes(runActions[activeRun.id]?.status ?? ''),
        )}
        error={
          draft?.uploadError
            ? labels.error(draft.uploadError)
            : draft?.error
              ? labels.error(draft.error)
              : composerModel.sessionId === sessionId && composerModel.action.status === 'unknown'
                ? labels.modelPicker.unknown
                : controls.errors.model
                  ? labels.error(controls.errors.model)
                  : undefined
        }
        controls={
          <HbarComposerIntentControls
            key={sessionId}
            sessionId={sessionId}
            connected={connected}
            disabled={draft?.status === 'submitting' || draft?.status === 'unknown'}
            labels={labels.intent}
          />
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
              disabled={draft?.status === 'submitting' || draft?.status === 'unknown' || intentPending}
              labels={labels.modelPicker}
            />
          </LumenFrame>
        }
        onChange={(text) => invoke('draft.setText', { sessionId, text })}
        onAddAttachments={prepareAttachment ? addAttachments : undefined}
        onRemoveAttachment={(id, kind) =>
          invoke('draft.setAttachments', {
            sessionId,
            attachments: (draft?.attachments ?? []).filter(
              (attachment) => attachment.kind !== kind || attachment.artifact.id !== id,
            ),
          })
        }
        onSubmit={() => {
          if (!draft || !configured || !model.modelId || modelPending || intentPending) return
          invoke('composerIntent.submit', {
            sessionId,
            modelId: model.modelId,
            expectedIntentRevision: intentEntry?.revision ?? 0,
            input: {
              text: draft.text,
              images: draft.attachments.filter((item) => item.kind === 'image').map((item) => item.artifact),
              files: draft.attachments.filter((item) => item.kind === 'file').map((item) => item.artifact),
              ...(model.thinkingLevel ? { thinking: model.thinkingLevel } : {}),
            },
          })
        }}
        onStop={() => {
          if (activeRun) invoke('operation.cancel', { operationId: activeRun.id })
        }}
      />
      {sessionUsagePresentation(controls, labels.usage).notice && (
        <LumenText as="p" className="hbar-session-budget-notice" role="status">
          {sessionUsagePresentation(controls, labels.usage).notice}
        </LumenText>
      )}
    </LumenFrame>
  ) : null

  return (
    <LumenFrame className="hbar-app-react-session-workspace">
      <LumenPageHeader
        title={sessionTitle}
        context={workspaceName}
        status={
          activeRun
            ? {
                label: labels.runs.statusLabel(activeRun.status as LumenRunActivityStatus),
                tone: activeRun.status === 'waiting_approval' ? 'warning' : 'success',
              }
            : undefined
        }
        actionsLabel={labels.tools.label}
        actions={
          // Five host-labelled actions form a bounded, content-grown collection.
          // They wrap with the header instead of hiding tools behind a width breakpoint.
          <>
            <SessionToolButton
              icon={Files}
              label={labels.tools.files}
              selected={isToolActive('files')}
              disabled={!sessionId}
              onClick={() => toggleTool('files')}
            />
            <SessionToolButton
              icon={ChartNoAxesColumnIncreasing}
              label={labels.tools.monitoring}
              selected={isToolActive('monitoring')}
              disabled={!sessionId}
              onClick={() => toggleTool('monitoring')}
            />
            <SessionToolButton
              icon={Bot}
              label={labels.tools.agents}
              selected={isToolActive('agents')}
              disabled={!sessionId}
              onClick={() => toggleTool('agents')}
            />
            <SessionToolButton
              icon={ListTodo}
              label={labels.tools.goals}
              selected={isToolActive('goals')}
              disabled={!sessionId}
              onClick={() => toggleTool('goals')}
            />
            <SessionToolButton
              icon={Settings}
              label={labels.tools.settings}
              disabled={!sessionId}
              onClick={() => {
                if (sessionId) invoke('app.openSettings', { scope: 'session', targetId: sessionId })
              }}
            />
          </>
        }
      />
      <LumenFrame className="hbar-app-react-session-main">
        <LumenConversation
          title={labels.conversationTitle(sessionTitle)}
          header={null}
          messages={messages}
          empty={emptyTimeline}
          beforeMessages={historyNotices}
          afterMessages={activity}
          composer={composer}
          scrollKey={sessionId ?? undefined}
          contentRevision={`${timeline.cursor}:${Object.values(timeline.streams)
            .map((stream) => `${stream.id}:${stream.version}`)
            .sort()
            .join(',')}`}
          latestLabel={labels.latest}
        />
      </LumenFrame>
    </LumenFrame>
  )
}
