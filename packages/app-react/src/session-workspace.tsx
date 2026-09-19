import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { HbarAppUiCompactUsage } from 'hbar-app-ui/ai-usage'
import { HbarAppUiApprovalRequest } from 'hbar-app-ui/approval-request'
import { HbarAppUiConversation, type HbarAppUiMessageProps } from 'hbar-app-ui/conversation'
import { HbarAppUiPromptComposer, type HbarAppUiPromptLabels } from 'hbar-app-ui/prompt-composer'
import { HbarAppUiQuestionnaire } from 'hbar-app-ui/questionnaire'
import { HbarAppUiRunActivity } from 'hbar-app-ui/run-activity'
import type {
  HbarAppUiApprovalRequestLabels,
  HbarAppUiQuestionnaireLabels,
  HbarAppUiRunActivityLabels,
  HbarAppUiRunActivityStatus,
} from 'hbar-app-ui/types'
import { HbarAppUiPageAction, HbarAppUiPageHeader } from 'hbar-app-ui/workbench'
import type { SessionAttachmentUpload, SessionControlsState, SessionTimelineState } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import './session-workspace.css'

type ContentBlock = SessionTimelineState['messages'][number]['content'][number]

export interface HbarSessionWorkspaceLabels {
  readonly conversationTitle: (title: string) => string
  readonly loading: string
  readonly empty: string
  readonly author: Readonly<Record<'user' | 'assistant' | 'system' | 'tool', string>>
  readonly avatar: Readonly<Record<'user' | 'assistant' | 'system' | 'tool', string>>
  readonly copy: string
  readonly thinking: string
  readonly toolCall: (name: string) => string
  readonly toolResult: (name: string, failed: boolean) => string
  readonly attachment: (kind: 'image' | 'file', name: string) => string
  readonly timestamp: (value: number) => string
  readonly error: (code: string) => string
  readonly prompt: HbarAppUiPromptLabels
  readonly model: (name: string, thinkingLevel: string | null) => string
  readonly modelUnavailable: string
  readonly tools: {
    readonly label: string
    readonly files: string
    readonly monitoring: string
    readonly agents: string
    readonly goals: string
    readonly settings: string
  }
  readonly runs: HbarAppUiRunActivityLabels
  readonly runDetail: (modelId: string) => string
  readonly runDuration: (startedAt: number, endedAt: number | null) => string
  readonly approval: HbarAppUiApprovalRequestLabels
  readonly approvalSummary: (tool: string) => string
  readonly questionnaire: HbarAppUiQuestionnaireLabels
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
        <details key={key} className="hbar-app-react-thinking">
          <summary>{labels.thinking}</summary>
          <Markdown text={block.text} />
        </details>
      )
    if (block.type === 'tool_call')
      return (
        <details key={key} className="hbar-app-react-tool-block">
          <summary>{labels.toolCall(block.name)}</summary>
          <pre>{JSON.stringify(block.args, null, 2)}</pre>
        </details>
      )
    if (block.type === 'tool_result')
      return (
        <details key={key} className="hbar-app-react-tool-block" open={block.isError}>
          <summary>{labels.toolResult(block.name, block.isError)}</summary>
          <pre>{block.text}</pre>
        </details>
      )
    return (
      <p key={key} className="hbar-app-react-attachment-block">
        {labels.attachment(block.type, block.artifact.name)}
      </p>
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
  const draft = sessionId ? drafts[sessionId] : undefined
  const model = controls.sessionId === sessionId ? controls.model : null
  const configured = model?.status === 'configured' && model.modelId !== null
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
  const runErrorAction = activeRuns.map((run) => runActions[run.id]).find((action) => action?.error)
  const toolInstanceId = presentation.toolInstanceId
  const activeTool = toolInstanceId ? surfaces.panels[toolInstanceId] : undefined
  const toggleTool = (panelId: 'files' | 'monitoring' | 'agents' | 'goals') => {
    if (toolInstanceId && activeTool?.panelId === panelId) {
      invoke('app.closePanel', { instanceId: toolInstanceId })
      return
    }
    invoke('app.openPanel', { panelId, sessionId, binding: 'followActive' })
  }

  const messages: HbarAppUiMessageProps[] = [
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
            <details className="hbar-app-react-thinking">
              <summary>{labels.thinking}</summary>
              <Markdown text={stream.thinking} />
            </details>
          )}
          {stream.text && <Markdown text={stream.text} />}
        </>
      ),
    })),
  ]

  const activity: ReactNode =
    timeline.runs.length > 0 || timeline.approvals.length > 0 || timeline.userInputs.length > 0 ? (
      <div className="hbar-app-react-session-activity">
        {timeline.runs.length > 0 && (
          <HbarAppUiRunActivity
            runs={timeline.runs.map((run) => ({
              id: run.id,
              label: labels.timestamp(run.createdAt),
              status: run.status as HbarAppUiRunActivityStatus,
              detail: run.error ?? labels.runDetail(run.modelId),
              duration: labels.runDuration(run.startedAt ?? run.createdAt, run.endedAt),
            }))}
            labels={labels.runs}
            listStrategy="content-grown"
            cancellingRunIds={activeRuns
              .filter((run) => ['submitting', 'unknown', 'succeeded'].includes(runActions[run.id]?.status ?? ''))
              .map((run) => run.id)}
            feedback={runErrorAction?.error ? labels.error(runErrorAction.error) : undefined}
            onCancelRun={(operationId) => invoke('operation.cancel', { operationId })}
          />
        )}
        {timeline.approvals.map((approval) => {
          const action = interactions[`approval:${approval.id}`]
          return (
            <HbarAppUiApprovalRequest
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
            <HbarAppUiQuestionnaire
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
      </div>
    ) : null

  const composer: ReactNode = sessionId ? (
    <div className="hbar-app-react-session-footer">
      <HbarAppUiPromptComposer
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
          <span className="hbar-app-react-model-status">
            {configured ? labels.model(model.model!.modelName, model.thinkingLevel) : labels.modelUnavailable}
          </span>
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
      <HbarAppUiCompactUsage {...usageContent(controls, labels.usage)} />
    </div>
  ) : null

  return (
    <div className="hbar-app-react-session-workspace">
      <HbarAppUiPageHeader
        title={sessionTitle}
        context={workspaceName}
        status={
          activeRun
            ? {
                label: labels.runs.statusLabel(activeRun.status as HbarAppUiRunActivityStatus),
                tone: activeRun.status === 'waiting_approval' ? 'warning' : 'positive',
              }
            : undefined
        }
        actionsLabel={labels.tools.label}
        actions={
          sessionId ? (
            <>
              <HbarAppUiPageAction
                icon="files"
                label={labels.tools.files}
                selected={activeTool?.panelId === 'files'}
                onClick={() => toggleTool('files')}
              />
              <HbarAppUiPageAction
                icon="monitoring"
                label={labels.tools.monitoring}
                selected={activeTool?.panelId === 'monitoring'}
                onClick={() => toggleTool('monitoring')}
              />
              <HbarAppUiPageAction
                icon="agents"
                label={labels.tools.agents}
                selected={activeTool?.panelId === 'agents'}
                onClick={() => toggleTool('agents')}
              />
              <HbarAppUiPageAction
                icon="goals"
                label={labels.tools.goals}
                selected={activeTool?.panelId === 'goals'}
                onClick={() => toggleTool('goals')}
              />
              <HbarAppUiPageAction
                icon="settings"
                label={labels.tools.settings}
                onClick={() => invoke('app.openSettings', { scope: 'session', targetId: sessionId })}
              />
            </>
          ) : undefined
        }
      />
      <div className="hbar-app-react-session-main">
        <HbarAppUiConversation
          title={labels.conversationTitle(sessionTitle)}
          header={null}
          messages={messages}
          empty={
            <p>
              {timeline.status === 'loading'
                ? labels.loading
                : timeline.error
                  ? labels.error(timeline.error)
                  : labels.empty}
            </p>
          }
          afterMessages={activity}
          composer={composer}
        />
      </div>
    </div>
  )
}
