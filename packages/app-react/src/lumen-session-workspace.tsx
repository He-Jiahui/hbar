import { useState, type ReactNode } from 'react'
import { ArrowUpRight, Bot, ChartNoAxesColumnIncreasing, Files, ListTodo, Settings } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import {
  LumenFrame,
  LumenText,
  LumenApprovalRequest,
  LumenButton,
  LumenCompactUsage,
  LumenConversation,
  LumenIcon,
  LumenPageAction,
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
import type { SessionAttachmentUpload, SessionControlsState, SessionTimelineState } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { HbarLumenDisclosure } from './lumen-disclosure'
import './lumen-session-workspace.css'

type ContentBlock = SessionTimelineState['messages'][number]['content'][number]

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
  readonly model: (name: string, thinkingLevel: string | null) => string
  readonly modelUnavailable: string
  readonly configureModel: (currentModel: string) => string
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
  readonly usage: {
    readonly title: string
    readonly description: string
    readonly total: (tokens: number) => string
    readonly remaining: (remaining: number, limit: number) => string
    readonly progress: (used: number, limit: number) => string
    readonly input: string
    readonly output: string
    readonly cost: string
    readonly rate: string
    readonly unavailable: string
    readonly gap: string
    readonly sparkline: string
    readonly number: (value: number) => string
    readonly currency: (value: number) => string
    readonly tokensPerSecond: (value: number) => string
  }
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

function Markdown({ text }: { readonly text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
      {text}
    </ReactMarkdown>
  )
}

function MessageBlocks({
  blocks,
  labels,
}: {
  readonly blocks: readonly ContentBlock[]
  readonly labels: HbarSessionWorkspaceLabels
}) {
  return blocks.map((block, index) => {
    const key = `${block.type}:${'callId' in block ? block.callId : index}`
    if (block.type === 'text') return <Markdown key={key} text={block.text} />
    if (block.type === 'thinking')
      return (
        <HbarLumenDisclosure key={key} className="hbar-app-react-thinking" label={labels.thinking}>
          <Markdown text={block.text} />
        </HbarLumenDisclosure>
      )
    if (block.type === 'tool_call')
      return (
        <HbarLumenDisclosure key={key} className="hbar-app-react-tool-block" label={labels.toolCall(block.name)}>
          <LumenText as="pre">{JSON.stringify(block.args, null, 2)}</LumenText>
        </HbarLumenDisclosure>
      )
    if (block.type === 'tool_result')
      return (
        <HbarLumenDisclosure
          key={key}
          className="hbar-app-react-tool-block"
          defaultOpen={block.isError}
          label={labels.toolResult(block.name, block.isError)}
        >
          <LumenText as="pre">{block.text}</LumenText>
        </HbarLumenDisclosure>
      )
    return (
      <LumenText as="p" key={key} className="hbar-app-react-attachment-block">
        {labels.attachment(block.type, block.artifact.name)}
      </LumenText>
    )
  })
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

function usageContent(controls: SessionControlsState, labels: HbarSessionWorkspaceLabels['usage']) {
  const report = controls.usage
  const budget = controls.budget
  const total = report ? report.totals.input + report.totals.output : null
  const used = budget?.usedTokens ?? 0
  const limit = budget?.limit ?? 0
  const metric = (label: string, value: string) => ({ id: label, label, value })
  const available = (value: number | null, formatter: (item: number) => string) =>
    value === null ? labels.unavailable : formatter(value)
  return {
    density: 'inline' as const,
    title: labels.title,
    description: report?.gap ? `${labels.description} ${labels.gap}` : labels.description,
    value: total === null ? labels.unavailable : labels.total(total),
    detail: budget ? labels.remaining(budget.remainingTokens, budget.limit) : labels.unavailable,
    progress: budget ? used / limit : 0,
    progressLabel: budget ? labels.progress(used, limit) : labels.unavailable,
    tone:
      budget?.phase === 'exhausted'
        ? ('danger' as const)
        : budget && budget.remainingTokens < budget.limit * 0.2
          ? ('warning' as const)
          : ('accent' as const),
    sparkline: (report?.series ?? []).map((point) => ({
      id: String(point.start),
      value: point.billableTokens,
    })),
    sparklineLabel: labels.sparkline,
    metrics: [
      metric(labels.cost, report ? available(report.cost.value, labels.currency) : labels.unavailable),
      metric(labels.rate, report ? available(report.rates.total.value, labels.tokensPerSecond) : labels.unavailable),
    ],
  }
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
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const sessionId = navigation.sessionId
  const [modelActionError, setModelActionError] = useState<{ sessionId: string; code: string } | null>(null)
  const draft = sessionId ? drafts[sessionId] : undefined
  const model = controls.sessionId === sessionId ? controls.model : null
  const configured = model?.status === 'configured' && model.modelId !== null
  const modelSummary = configured ? labels.model(model.model!.modelName, model.thinkingLevel) : labels.modelUnavailable
  const activeRuns = timeline.runs.filter((run) => ['queued', 'running', 'waiting_approval'].includes(run.status))
  const activeRun = activeRuns[0]
  const execute = (name: string, input: unknown) =>
    (runtime.commands.execute as (command: string, value: unknown) => Promise<unknown>)(name, input)
  const invoke = (name: string, input: unknown) => void execute(name, input).catch(() => {})
  const configureModel = () => {
    if (!sessionId) return
    setModelActionError(null)
    void runtime.commands
      .execute('app.openSettings', { scope: 'session', targetId: sessionId, section: 'model' })
      .catch((reason: unknown) => {
        const code =
          reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
            ? reason.code
            : 'EXECUTION_FAILED'
        setModelActionError({ sessionId, code })
      })
  }
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
    activeTool?.panelId === panelId &&
    activeTool.workspaceId === navigation.workspaceId &&
    (panelId === 'files' || activeTool.sessionId === sessionId)
  const toggleTool = (panelId: 'files' | 'monitoring' | 'agents' | 'goals') => {
    if (toolInstanceId && isToolActive(panelId)) {
      invoke('app.closePanel', { instanceId: toolInstanceId })
      return
    }
    invoke('app.openPanel', { panelId, workspaceId: navigation.workspaceId, sessionId, binding: 'followActive' })
  }

  const messages: LumenMessageProps[] = [
    ...timeline.messages.map((message) => ({
      id: message.id,
      role: message.role,
      author: labels.author[message.role],
      avatar: labels.avatar[message.role],
      timestamp: labels.timestamp(message.createdAt),
      copyLabel: labels.copy,
      children: <MessageBlocks blocks={message.content} labels={labels} />,
    })),
    ...Object.values(timeline.streams).map((stream) => ({
      id: stream.id,
      role: 'assistant' as const,
      author: labels.author.assistant,
      avatar: labels.avatar.assistant,
      streaming: true,
      copyLabel: labels.copy,
      children: (
        <>
          {stream.thinking && (
            <HbarLumenDisclosure className="hbar-app-react-thinking" label={labels.thinking}>
              <Markdown text={stream.thinking} />
            </HbarLumenDisclosure>
          )}
          {stream.text && <Markdown text={stream.text} />}
        </>
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
      <LumenPromptComposer
        value={draft?.text ?? ''}
        labels={labels.prompt}
        attachments={(draft?.attachments ?? []).map((attachment) => ({
          id: attachment.artifact.id,
          kind: attachment.kind,
          name: attachment.artifact.name,
        }))}
        disabled={!connected || timeline.status === 'loading' || timeline.status === 'error'}
        submitting={draft?.status === 'submitting'}
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
          configured && draft?.status !== 'unknown' && Boolean(draft?.text.trim() || draft?.attachments.length)
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
              : controls.errors.model
                ? labels.error(controls.errors.model)
                : undefined
        }
        context={
          <LumenFrame className="hbar-app-react-model-context">
            <LumenButton
              className="hbar-app-react-model-control"
              size="s"
              variant="text"
              indicator="none"
              aria-label={labels.configureModel(modelSummary)}
              title={labels.configureModel(modelSummary)}
              disabled={!connected}
              onClick={configureModel}
            >
              <LumenText as="span" className="hbar-app-react-model-value">
                {modelSummary}
              </LumenText>
              <LumenIcon icon={ArrowUpRight} tier="sm" />
            </LumenButton>
            {modelActionError?.sessionId === sessionId && (
              <LumenText as="span" role="alert">
                {labels.error(modelActionError.code)}
              </LumenText>
            )}
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
          if (!draft || !configured || !model.modelId) return
          invoke('run.submit', {
            sessionId,
            modelId: model.modelId,
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
      <LumenCompactUsage {...usageContent(controls, labels.usage)} />
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
          sessionId ? (
            <>
              <LumenPageAction
                icon={<LumenIcon icon={Files} tier="sm" />}
                label={labels.tools.files}
                selected={isToolActive('files')}
                onClick={() => toggleTool('files')}
              />
              <LumenPageAction
                icon={<LumenIcon icon={ChartNoAxesColumnIncreasing} tier="sm" />}
                label={labels.tools.monitoring}
                selected={isToolActive('monitoring')}
                onClick={() => toggleTool('monitoring')}
              />
              <LumenPageAction
                icon={<LumenIcon icon={Bot} tier="sm" />}
                label={labels.tools.agents}
                selected={isToolActive('agents')}
                onClick={() => toggleTool('agents')}
              />
              <LumenPageAction
                icon={<LumenIcon icon={ListTodo} tier="sm" />}
                label={labels.tools.goals}
                selected={isToolActive('goals')}
                onClick={() => toggleTool('goals')}
              />
              <LumenPageAction
                icon={<LumenIcon icon={Settings} tier="sm" />}
                label={labels.tools.settings}
                onClick={() => invoke('app.openSettings', { scope: 'session', targetId: sessionId })}
              />
            </>
          ) : undefined
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
