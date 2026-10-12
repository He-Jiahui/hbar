import { useId, useState } from 'react'
import { Check, FileText, PencilLine, RefreshCw } from 'lucide-react'
import { LumenContentText, LumenButton, LumenFrame, LumenIcon, LumenTextarea } from '@lumen/app-ui'
import type { InteractionActionState, SessionDecision } from '@hbar/app-runtime'
import { MessageMarkdown } from './message-markdown'
import type { HbarCodeBlockLabels } from './code-block-copy-action'
import type { MessageClipboardPort } from './message-copy'
import { useDecisionResultFocus } from './decision-result-focus'
import { createMessageScope } from './messages'
import './plan-exit-decision.css'

export interface HbarPlanExitDecisionLabels {
  readonly codeBlock: HbarCodeBlockLabels
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
type PlanExitStatusLabels = {
  readonly pending: string
  readonly submitting: string
  readonly unknown: string
  readonly cancelled: string
  readonly reconcile: string
  readonly error: (code: string) => string
}
type PlanExitDecisionMessages = HbarPlanExitDecisionLabels & PlanExitStatusLabels
const { Provider: PlanExitDecisionMessagesProvider, useMessages: usePlanExitDecisionMessages } =
  createMessageScope<PlanExitDecisionMessages>()

export interface HbarPlanExitTarget {
  readonly sessionId: string
  readonly approvalId: string
  readonly runId: string
  readonly callId: string
  readonly decision: 'implement' | 'continue'
  readonly feedback?: string
}

function PlanExitDecisionView({
  copyOwner,
  clipboard,
  decision,
  action,
  connected,
  onDecision,
  onReconcile,
}: {
  readonly copyOwner?: object | undefined
  readonly clipboard?: MessageClipboardPort | null | undefined
  readonly decision: Extract<SessionDecision, { kind: 'approval' }>
  readonly action?: InteractionActionState | undefined
  readonly connected: boolean
  readonly onDecision: (target: HbarPlanExitTarget) => void
  readonly onReconcile: (target: { readonly sessionId: string; readonly actionId: string }) => void
}) {
  const { t } = usePlanExitDecisionMessages()
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
  const { region, rememberActionFocus } = useDecisionResultFocus(complete)
  const unknown = !complete && scoped?.status === 'unknown'
  const busy = !complete && (scoped?.status === 'submitting' || scoped?.status === 'succeeded')
  const raw = decision.approval.args.plan
  const plan = typeof raw === 'string' && raw.trim() && raw.length <= 20_000 ? raw : null
  const blocked = !connected || complete || unknown || busy
  const target = {
    sessionId: decision.sessionId,
    approvalId: decision.id,
    runId: decision.runId,
    callId: decision.callId,
  }
  const confirmedFeedback = decision.approval.feedback ?? scoped?.submittedFeedback ?? feedback.trim()
  const statusText =
    status === 'allowed'
      ? t('implemented')
      : status === 'denied'
        ? t('continued')
        : status === 'cancelled'
          ? t('cancelled')
          : unknown
            ? t('unknown')
            : busy
              ? t('submitting')
              : t('pending')
  return (
    <LumenFrame
      as="section"
      ref={(node) => {
        region.current = node
      }}
      tabIndex={-1}
      className="hbar-plan-exit"
      aria-label={t('title')}
      aria-describedby={`${id}-status`}
      data-decision-id={decision.id}
      data-decision-kind="planExit"
      data-complete={complete || undefined}
      aria-busy={busy || scoped?.reconciling || undefined}
    >
      <LumenFrame className="hbar-plan-exit-heading">
        <LumenIcon icon={PencilLine} tier="md" />
        <LumenContentText context="record.title">{t('title')}</LumenContentText>
        <LumenContentText context="control.status" id={`${id}-status`} role="status" className="hbar-plan-exit-status">
          {statusText}
        </LumenContentText>
      </LumenFrame>
      <LumenFrame className="hbar-plan-exit-body">
        <LumenFrame className="hbar-plan-exit-document">
          <LumenFrame className="hbar-plan-exit-document-heading">
            <LumenIcon icon={FileText} tier="sm" />
            <LumenContentText context="record.title">{t('document')}</LumenContentText>
          </LumenFrame>
          <LumenFrame className="hbar-plan-exit-markdown" role="region" aria-label={t('document')} tabIndex={0}>
            {plan ? (
              <MessageMarkdown
                text={plan}
                code={{
                  sessionId: decision.sessionId,
                  messageId: decision.id,
                  segmentId: 'plan-exit',
                  labels: t('codeBlock'),
                  owner: copyOwner,
                  clipboard,
                }}
              />
            ) : (
              <LumenContentText context="feedback.message" role="alert">
                {t('invalidPlan')}
              </LumenContentText>
            )}
          </LumenFrame>
        </LumenFrame>
        {!complete ? (
          <LumenFrame as="label" className="hbar-plan-exit-feedback" htmlFor={`${id}-feedback`}>
            <LumenContentText context="message.inline">{t('feedback')}</LumenContentText>
            <LumenTextarea
              id={`${id}-feedback`}
              variant="plain"
              rows={3}
              maxLength={4000}
              value={feedback}
              disabled={blocked}
              placeholder={t('feedbackPlaceholder')}
              onChange={(event) => setFeedback(event.currentTarget.value)}
            />
          </LumenFrame>
        ) : status === 'denied' && confirmedFeedback ? (
          <LumenContentText context="section.description" className="hbar-plan-exit-confirmed-feedback">
            {confirmedFeedback}
          </LumenContentText>
        ) : null}
      </LumenFrame>
      {!complete ? (
        <LumenFrame className="hbar-plan-exit-actions">
          <LumenButton
            size="s"
            tone="primary"
            indicator="none"
            disabled={blocked || !plan}
            onClick={(event) => {
              rememberActionFocus(event.currentTarget)
              onDecision({ ...target, decision: 'implement' })
            }}
          >
            <LumenIcon icon={Check} tier="sm" />
            {t('implement')}
          </LumenButton>
          <LumenButton
            size="s"
            variant="text"
            indicator="none"
            disabled={blocked}
            onClick={(event) => {
              rememberActionFocus(event.currentTarget)
              onDecision({ ...target, decision: 'continue', ...(feedback.trim() ? { feedback: feedback.trim() } : {}) })
            }}
          >
            <LumenIcon icon={PencilLine} tier="sm" />
            {t('continuePlanning')}
          </LumenButton>
          {unknown ? (
            <LumenButton
              size="s"
              variant="text"
              indicator="none"
              disabled={!connected || scoped?.reconciling}
              onClick={(event) => {
                if (scoped) {
                  rememberActionFocus(event.currentTarget)
                  onReconcile({ sessionId: decision.sessionId, actionId: scoped.id })
                }
              }}
            >
              <LumenIcon icon={RefreshCw} tier="sm" />
              {t('reconcile')}
            </LumenButton>
          ) : null}
        </LumenFrame>
      ) : null}
      {!complete && scoped?.error ? (
        <LumenContentText context="feedback.message" role="alert" tone="danger" className="hbar-plan-exit-error">
          {t('error')(scoped.error)}
        </LumenContentText>
      ) : null}
    </LumenFrame>
  )
}

/** Existing label props adapt direct SDK callers to the Plan Exit message scope. */
export function HbarPlanExitDecision(props: {
  readonly copyOwner?: object | undefined
  readonly clipboard?: MessageClipboardPort | null | undefined
  readonly decision: Extract<SessionDecision, { kind: 'approval' }>
  readonly action?: InteractionActionState | undefined
  readonly connected: boolean
  readonly labels: HbarPlanExitDecisionLabels
  readonly statusLabels: PlanExitStatusLabels
  readonly onDecision: (target: HbarPlanExitTarget) => void
  readonly onReconcile: (target: { readonly sessionId: string; readonly actionId: string }) => void
}) {
  const { labels, statusLabels, ...decision } = props
  return (
    <PlanExitDecisionMessagesProvider messages={{ ...labels, ...statusLabels }}>
      <PlanExitDecisionView {...decision} />
    </PlanExitDecisionMessagesProvider>
  )
}
