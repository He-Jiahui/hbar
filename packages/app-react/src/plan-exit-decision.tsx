import { useId, useState } from 'react'
import { Check, FileText, PencilLine, RefreshCw } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenText, LumenTextarea } from '@lumen/app-ui'
import type { InteractionActionState, SessionDecision } from '@hbar/app-runtime'
import { MessageMarkdown } from './session-message'
import './plan-exit-decision.css'

export interface HbarPlanExitDecisionLabels {
  readonly title: string
  readonly document: string
  readonly feedback: string
  readonly feedbackPlaceholder: string
  readonly implement: string
  readonly continuePlanning: string
  readonly implemented: string
  readonly continued: string
  readonly invalidPlan: string
}

export interface HbarPlanExitTarget {
  readonly sessionId: string
  readonly approvalId: string
  readonly runId: string
  readonly callId: string
  readonly decision: 'implement' | 'continue'
  readonly feedback?: string
}

export function HbarPlanExitDecision({
  decision,
  action,
  connected,
  labels,
  statusLabels,
  onDecision,
  onReconcile,
}: {
  readonly decision: Extract<SessionDecision, { kind: 'approval' }>
  readonly action?: InteractionActionState | undefined
  readonly connected: boolean
  readonly labels: HbarPlanExitDecisionLabels
  readonly statusLabels: {
    readonly pending: string
    readonly submitting: string
    readonly unknown: string
    readonly cancelled: string
    readonly reconcile: string
    readonly error: (code: string) => string
  }
  readonly onDecision: (target: HbarPlanExitTarget) => void
  readonly onReconcile: (target: { readonly sessionId: string; readonly actionId: string }) => void
}) {
  const id = useId()
  // This is the card's explicitly owned feedback draft, not a copy of Host state.
  const [feedback, setFeedback] = useState('')
  const scoped = action?.sessionId === decision.sessionId && action.targetId === decision.id ? action : undefined
  const status =
    decision.approval.status !== 'pending'
      ? decision.approval.status
      : scoped?.resolution?.kind === 'approval'
        ? scoped.resolution.status
        : null
  const complete = status !== null
  const unknown = !complete && scoped?.status === 'unknown'
  const busy = !complete && (scoped?.status === 'submitting' || scoped?.status === 'succeeded')
  const raw = decision.approval.args.plan
  const plan = typeof raw === 'string' && raw.trim() && raw.length <= 20_000 ? raw : null
  const blocked = !connected || complete || unknown || busy || !plan
  const target = {
    sessionId: decision.sessionId,
    approvalId: decision.id,
    runId: decision.runId,
    callId: decision.callId,
  }
  const confirmedFeedback = decision.approval.feedback ?? scoped?.submittedFeedback ?? feedback.trim()
  const statusText =
    status === 'allowed'
      ? labels.implemented
      : status === 'denied'
        ? labels.continued
        : status === 'cancelled'
          ? statusLabels.cancelled
          : unknown
            ? statusLabels.unknown
            : busy
              ? statusLabels.submitting
              : statusLabels.pending
  return (
    <LumenFrame
      as="section"
      className="hbar-plan-exit"
      aria-label={labels.title}
      data-decision-id={decision.id}
      data-decision-kind="planExit"
      data-complete={complete || undefined}
      aria-busy={busy || scoped?.reconciling || undefined}
    >
      <LumenFrame className="hbar-plan-exit-heading">
        <LumenIcon icon={PencilLine} tier="md" />
        <LumenText as="strong">{labels.title}</LumenText>
        <LumenText as="span" role="status" className="hbar-plan-exit-status">
          {statusText}
        </LumenText>
      </LumenFrame>
      <LumenFrame className="hbar-plan-exit-body">
        <LumenFrame className="hbar-plan-exit-document">
          <LumenFrame className="hbar-plan-exit-document-heading">
            <LumenIcon icon={FileText} tier="sm" />
            <LumenText as="strong">{labels.document}</LumenText>
          </LumenFrame>
          <LumenFrame className="hbar-plan-exit-markdown" role="region" aria-label={labels.document} tabIndex={0}>
            {plan ? (
              <MessageMarkdown text={plan} />
            ) : (
              <LumenText as="p" role="alert">
                {labels.invalidPlan}
              </LumenText>
            )}
          </LumenFrame>
        </LumenFrame>
        {!complete ? (
          <LumenFrame as="label" className="hbar-plan-exit-feedback" htmlFor={`${id}-feedback`}>
            <LumenText as="span">{labels.feedback}</LumenText>
            <LumenTextarea
              id={`${id}-feedback`}
              variant="plain"
              rows={3}
              maxLength={4000}
              value={feedback}
              disabled={blocked}
              placeholder={labels.feedbackPlaceholder}
              onChange={(event) => setFeedback(event.currentTarget.value)}
            />
          </LumenFrame>
        ) : status === 'denied' && confirmedFeedback ? (
          <LumenText as="p" className="hbar-plan-exit-confirmed-feedback">
            {confirmedFeedback}
          </LumenText>
        ) : null}
      </LumenFrame>
      {!complete ? (
        <LumenFrame className="hbar-plan-exit-actions">
          <LumenButton
            size="s"
            tone="primary"
            indicator="none"
            disabled={blocked}
            onClick={() => onDecision({ ...target, decision: 'implement' })}
          >
            <LumenIcon icon={Check} tier="sm" />
            {labels.implement}
          </LumenButton>
          <LumenButton
            size="s"
            variant="text"
            indicator="none"
            disabled={blocked}
            onClick={() =>
              onDecision({ ...target, decision: 'continue', ...(feedback.trim() ? { feedback: feedback.trim() } : {}) })
            }
          >
            <LumenIcon icon={PencilLine} tier="sm" />
            {labels.continuePlanning}
          </LumenButton>
          {unknown ? (
            <LumenButton
              size="s"
              variant="text"
              indicator="none"
              disabled={!connected || scoped?.reconciling}
              onClick={() => {
                if (scoped) onReconcile({ sessionId: decision.sessionId, actionId: scoped.id })
              }}
            >
              <LumenIcon icon={RefreshCw} tier="sm" />
              {statusLabels.reconcile}
            </LumenButton>
          ) : null}
        </LumenFrame>
      ) : null}
      {!complete && scoped?.error ? (
        <LumenText as="p" role="alert" tone="danger" className="hbar-plan-exit-error">
          {statusLabels.error(scoped.error)}
        </LumenText>
      ) : null}
    </LumenFrame>
  )
}
