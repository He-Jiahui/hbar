import { useId, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  HelpCircle,
  RefreshCw,
  ShieldCheck,
  Terminal,
  X,
} from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenInput, LumenText, LumenTextarea } from '@lumen/app-ui'
import type { InteractionActionState, QuestionnaireDraftState, SessionDecision } from '@hbar/app-runtime'
import { toolInputText } from './session-message-model'
import './session-interactions.css'
import { HbarPlanExitDecision, type HbarPlanExitDecisionLabels, type HbarPlanExitTarget } from './plan-exit-decision'
import type { MessageClipboardPort } from './message-copy'
import { useDecisionResultFocus } from './decision-result-focus'

export interface HbarSessionDecisionLabels {
  readonly planExit: HbarPlanExitDecisionLabels
  readonly approval: string
  readonly questionnaire: string
  readonly pending: string
  readonly submitting: string
  readonly submitted: string
  readonly unknown: string
  readonly unavailable: string
  readonly allow: string
  readonly deny: string
  readonly allowed: string
  readonly denied: string
  readonly cancelled: string
  readonly answered: string
  readonly failed: string
  readonly reconcile: string
  readonly details: string
  readonly hideDetails: string
  readonly unavailableInput: string
  readonly path: string
  readonly command: string
  readonly proposedContent: string
  readonly oldFragment: string
  readonly newFragment: string
  readonly customAnswer: string
  readonly customPlaceholder: string
  readonly submit: string
  readonly secretAnswer: string
  readonly error: (code: string) => string
}
export interface HbarSessionDecisionProps {
  readonly copyOwner?: object | undefined
  readonly clipboard?: MessageClipboardPort | null | undefined
  readonly decision: SessionDecision
  readonly action?: InteractionActionState | undefined
  readonly answers?: QuestionnaireDraftState['answers'] | undefined
  readonly labels: HbarSessionDecisionLabels
  readonly connected: boolean
  readonly onPlanExit: (target: HbarPlanExitTarget) => void
  readonly onDecision: (target: {
    readonly sessionId: string
    readonly approvalId: string
    readonly decision: 'allowed' | 'denied'
  }) => void
  readonly onAnswer: (target: {
    readonly sessionId: string
    readonly requestId: string
    readonly questionId: string
    readonly answer: { readonly kind: 'option' | 'custom'; readonly value: string }
  }) => void
  readonly onSubmit: (target: {
    readonly sessionId: string
    readonly requestId: string
    readonly answers: Record<string, { answers: string[] }>
  }) => void
  readonly onReconcile: (target: { readonly sessionId: string; readonly actionId: string }) => void
}

function ApprovalPreview({
  decision,
  labels,
}: {
  readonly decision: Extract<SessionDecision, { kind: 'approval' }>
  readonly labels: HbarSessionDecisionLabels
}) {
  const [expanded, setExpanded] = useState(false)
  const id = useId()
  const { args } = decision.approval
  const command = decision.tool === 'shell' && typeof args.command === 'string' ? args.command : null
  const path = ['edit_file', 'write_file'].includes(decision.tool) && typeof args.path === 'string' ? args.path : null
  const replacement =
    decision.tool === 'edit_file' && typeof args.oldText === 'string' && typeof args.newText === 'string'
  const content = decision.tool === 'write_file' && typeof args.text === 'string' ? args.text : null
  return (
    <LumenFrame className="hbar-decision-preview">
      {path ? (
        <LumenText className="hbar-decision-path" as="p">
          <LumenIcon icon={FileText} tier="sm" />
          {labels.path} {path}
        </LumenText>
      ) : null}
      {command ? (
        <LumenFrame>
          <LumenText as="strong">{labels.command}</LumenText>
          <LumenText as="pre" tabIndex={0}>
            {command}
          </LumenText>
        </LumenFrame>
      ) : null}
      {replacement ? (
        <LumenFrame className="hbar-decision-replacement">
          <LumenText as="strong">{labels.oldFragment}</LumenText>
          <LumenText as="pre" tabIndex={0} data-fragment="old">
            {String(args.oldText)}
          </LumenText>
          <LumenText as="strong">{labels.newFragment}</LumenText>
          <LumenText as="pre" tabIndex={0} data-fragment="new">
            {String(args.newText)}
          </LumenText>
        </LumenFrame>
      ) : null}
      {content !== null ? (
        <LumenFrame>
          <LumenText as="strong">{labels.proposedContent}</LumenText>
          <LumenText as="pre" tabIndex={0}>
            {content}
          </LumenText>
        </LumenFrame>
      ) : null}
      <LumenButton
        size="s"
        variant="text"
        indicator="none"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded(!expanded)}
      >
        <LumenIcon icon={expanded ? ChevronDown : ChevronRight} tier="sm" />
        {expanded ? labels.hideDetails : labels.details}
      </LumenButton>
      {expanded ? (
        <LumenText id={id} as="pre" tabIndex={0}>
          {toolInputText(args, labels.unavailableInput)}
        </LumenText>
      ) : null}
    </LumenFrame>
  )
}

function DecisionContent({
  decision,
  action,
  answers = {},
  labels,
  connected,
  onDecision,
  onAnswer,
  onSubmit,
  onReconcile,
}: HbarSessionDecisionProps) {
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null)
  const id = useId()
  const scopedAction =
    action &&
    action.sessionId === decision.sessionId &&
    action.targetId === (decision.kind === 'approval' ? decision.id : decision.requestId)
      ? action
      : undefined
  const approvalStatus =
    decision.kind === 'approval'
      ? decision.approval.status !== 'pending'
        ? decision.approval.status
        : scopedAction?.resolution?.kind === 'approval'
          ? scopedAction.resolution.status
          : null
      : null
  const questionFact = decision.kind === 'questionnaire' ? decision.fact : null
  const complete = Boolean(approvalStatus || questionFact)
  const { region, rememberActionFocus } = useDecisionResultFocus(complete)
  const unknown = !complete && scopedAction?.status === 'unknown'
  const submitting = !complete && scopedAction?.status === 'submitting'
  const submitted = !complete && scopedAction?.status === 'succeeded'
  const available =
    decision.kind === 'approval'
      ? decision.approval.status === 'pending'
      : decision.pending && decision.requestId !== null
  const blocked = !connected || complete || unknown || submitting || submitted || !available
  const status =
    approvalStatus === 'allowed'
      ? labels.allowed
      : approvalStatus === 'denied'
        ? labels.denied
        : approvalStatus === 'cancelled' || questionFact?.status === 'cancelled'
          ? labels.cancelled
          : questionFact?.status === 'answered'
            ? labels.answered
            : questionFact?.status === 'failed'
              ? labels.failed
              : unknown
                ? labels.unknown
                : submitting
                  ? labels.submitting
                  : submitted
                    ? labels.submitted
                    : !available
                      ? labels.unavailable
                      : labels.pending
  const questions = decision.kind === 'questionnaire' ? decision.questions : []
  const active = questions.find((question) => question.id === activeQuestionId) ?? questions[0]
  const allAnswered = questions.every((question) => Boolean(answers[question.id]?.value.trim()))
  const setAnswer = (questionId: string, kind: 'option' | 'custom', value: string) => {
    if (!blocked && decision.kind === 'questionnaire' && decision.requestId)
      onAnswer({ sessionId: decision.sessionId, requestId: decision.requestId, questionId, answer: { kind, value } })
  }
  return (
    <LumenFrame
      as="section"
      ref={(node) => {
        region.current = node
      }}
      tabIndex={-1}
      className="hbar-session-decision"
      aria-label={decision.kind === 'approval' ? labels.approval : labels.questionnaire}
      aria-describedby={`${id}-status`}
      data-decision-id={decision.id}
      data-decision-kind={decision.kind}
      data-complete={complete || undefined}
      aria-busy={submitting || scopedAction?.reconciling || undefined}
    >
      <LumenFrame className="hbar-decision-heading">
        <LumenIcon
          icon={decision.kind === 'questionnaire' ? HelpCircle : decision.tool === 'shell' ? Terminal : ShieldCheck}
          tier="md"
        />
        <LumenText as="strong">{decision.kind === 'approval' ? labels.approval : labels.questionnaire}</LumenText>
        {decision.kind === 'approval' ? <LumenText as="code">{decision.tool}</LumenText> : null}
        <LumenText as="span" id={`${id}-status`} role="status" className="hbar-decision-status">
          {status}
        </LumenText>
      </LumenFrame>
      {decision.kind === 'approval' ? (
        <ApprovalPreview decision={decision} labels={labels} />
      ) : (
        <LumenFrame className="hbar-decision-questions">
          {questions.length > 1 ? (
            <LumenFrame className="hbar-decision-tabs" role="tablist" aria-label={labels.questionnaire}>
              {questions.map((question, index) => (
                <LumenButton
                  key={question.id}
                  id={`${id}-tab-${index}`}
                  size="s"
                  variant="text"
                  indicator="none"
                  role="tab"
                  aria-selected={active?.id === question.id}
                  aria-controls={`${id}-question`}
                  tabIndex={active?.id === question.id ? 0 : -1}
                  onClick={() => setActiveQuestionId(question.id)}
                  onKeyDown={(event) => {
                    const next =
                      event.key === 'ArrowRight'
                        ? (index + 1) % questions.length
                        : event.key === 'ArrowLeft'
                          ? (index + questions.length - 1) % questions.length
                          : event.key === 'Home'
                            ? 0
                            : event.key === 'End'
                              ? questions.length - 1
                              : null
                    if (next !== null) {
                      event.preventDefault()
                      setActiveQuestionId(questions[next]!.id)
                      document.getElementById(`${id}-tab-${next}`)?.focus()
                    }
                  }}
                >
                  {answers[question.id]?.value.trim() || questionFact?.status === 'answered' ? (
                    <LumenIcon icon={Check} tier="sm" />
                  ) : null}
                  {question.header}
                </LumenButton>
              ))}
            </LumenFrame>
          ) : null}
          {active ? (
            <LumenFrame
              id={`${id}-question`}
              role={questions.length > 1 ? 'tabpanel' : 'group'}
              aria-label={active.header}
              className="hbar-decision-question"
            >
              <LumenText as="p">{active.question}</LumenText>
              {complete ? (
                <LumenText as="p" className="hbar-decision-answer">
                  {questionFact?.status === 'answered'
                    ? active.isSecret
                      ? labels.secretAnswer
                      : (questionFact.answers[active.id]?.answers.join('; ') ?? labels.unavailable)
                    : status}
                </LumenText>
              ) : (
                <>
                  {(active.options ?? []).map((option) => (
                    <LumenFrame
                      as="label"
                      key={option.label}
                      className="hbar-decision-option"
                      data-selected={
                        (answers[active.id]?.kind === 'option' && answers[active.id]?.value === option.label) ||
                        undefined
                      }
                    >
                      <LumenInput
                        type="radio"
                        variant="plain"
                        name={`${decision.id}:${active.id}`}
                        checked={answers[active.id]?.kind === 'option' && answers[active.id]?.value === option.label}
                        disabled={blocked}
                        onChange={() => setAnswer(active.id, 'option', option.label)}
                      />
                      <LumenFrame>
                        <LumenText as="strong">{option.label}</LumenText>
                        <LumenText as="small" tone="muted">
                          {option.description}
                        </LumenText>
                      </LumenFrame>
                    </LumenFrame>
                  ))}
                  {active.isOther || !active.options?.length ? (
                    <LumenFrame as="label" className="hbar-decision-custom">
                      <LumenText as="span">{labels.customAnswer}</LumenText>
                      {active.isSecret ? (
                        <LumenInput
                          type="password"
                          variant="plain"
                          disabled={blocked}
                          maxLength={4000}
                          value={answers[active.id]?.kind === 'custom' ? (answers[active.id]?.value ?? '') : ''}
                          placeholder={labels.customPlaceholder}
                          onChange={(event) => setAnswer(active.id, 'custom', event.currentTarget.value)}
                        />
                      ) : (
                        <LumenTextarea
                          variant="plain"
                          disabled={blocked}
                          rows={3}
                          maxLength={4000}
                          value={answers[active.id]?.kind === 'custom' ? (answers[active.id]?.value ?? '') : ''}
                          placeholder={labels.customPlaceholder}
                          onChange={(event) => setAnswer(active.id, 'custom', event.currentTarget.value)}
                        />
                      )}
                    </LumenFrame>
                  ) : null}
                </>
              )}
            </LumenFrame>
          ) : null}
        </LumenFrame>
      )}
      {!complete ? (
        <LumenFrame className="hbar-decision-actions">
          {decision.kind === 'approval' ? (
            <>
              <LumenButton
                size="s"
                tone="primary"
                indicator="none"
                disabled={blocked}
                onClick={(event) => {
                  rememberActionFocus(event.currentTarget)
                  onDecision({ sessionId: decision.sessionId, approvalId: decision.id, decision: 'allowed' })
                }}
              >
                <LumenIcon icon={Check} tier="sm" />
                {labels.allow}
              </LumenButton>
              <LumenButton
                size="s"
                tone="danger"
                variant="text"
                indicator="none"
                disabled={blocked}
                onClick={(event) => {
                  rememberActionFocus(event.currentTarget)
                  onDecision({ sessionId: decision.sessionId, approvalId: decision.id, decision: 'denied' })
                }}
              >
                <LumenIcon icon={X} tier="sm" />
                {labels.deny}
              </LumenButton>
            </>
          ) : (
            <LumenButton
              size="s"
              tone="primary"
              indicator="none"
              disabled={blocked || !allAnswered}
              onClick={(event) => {
                if (decision.requestId) {
                  rememberActionFocus(event.currentTarget)
                  onSubmit({
                    sessionId: decision.sessionId,
                    requestId: decision.requestId,
                    answers: Object.fromEntries(
                      Object.entries(answers).map(([questionId, answer]) => [questionId, { answers: [answer.value] }]),
                    ),
                  })
                }
              }}
            >
              {labels.submit}
            </LumenButton>
          )}
          {unknown || submitted || !available ? (
            <LumenButton
              size="s"
              variant="text"
              indicator="none"
              disabled={!connected || scopedAction?.reconciling || !scopedAction}
              onClick={(event) => {
                if (scopedAction) {
                  rememberActionFocus(event.currentTarget)
                  onReconcile({ sessionId: decision.sessionId, actionId: scopedAction.id })
                }
              }}
            >
              <LumenIcon icon={RefreshCw} tier="sm" />
              {labels.reconcile}
            </LumenButton>
          ) : null}
        </LumenFrame>
      ) : null}
      {connected && !complete && scopedAction?.error ? (
        <LumenText as="p" role="alert" className="hbar-decision-error" tone="danger">
          {labels.error(scopedAction.error)}
        </LumenText>
      ) : null}
    </LumenFrame>
  )
}

export function HbarSessionDecision(props: HbarSessionDecisionProps) {
  if (props.decision.kind === 'approval' && props.decision.tool === 'exit_plan_mode')
    return (
      <HbarPlanExitDecision
        copyOwner={props.copyOwner}
        clipboard={props.clipboard}
        key={JSON.stringify([props.decision.sessionId, props.decision.id])}
        decision={props.decision}
        action={props.action}
        connected={props.connected}
        labels={props.labels.planExit}
        statusLabels={props.labels}
        onDecision={props.onPlanExit}
        onReconcile={props.onReconcile}
      />
    )
  return <DecisionContent key={JSON.stringify([props.decision.sessionId, props.decision.id])} {...props} />
}
