import { useId, useState } from 'react'
import { FileText, PencilLine, Play, RefreshCw } from 'lucide-react'
import { LumenButton, LumenFormField, LumenFrame, LumenIcon, LumenText, LumenTextarea } from '@lumen/app-ui'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import './proposed-plan.css'

export interface HbarProposedPlanTarget {
  readonly sessionId: string
  readonly messageId: string
  readonly sourceRunId: string
  readonly sourceSeq: number
  readonly fingerprint: string
}
export interface HbarProposedPlanLabels {
  readonly title: string
  readonly document: string
  readonly implement: string
  readonly continuePlanning: string
  readonly feedback: string
  readonly feedbackPlaceholder: string
  readonly submitting: string
  readonly accepted: string
  readonly unknown: string
  readonly reconcile: string
}
export interface HbarProposedPlanProps {
  readonly target: HbarProposedPlanTarget
  readonly markdown: string
  readonly labels: HbarProposedPlanLabels
  readonly state: {
    readonly status: 'idle' | 'submitting' | 'unknown' | 'accepted' | 'failed'
    readonly canSubmit: boolean
    readonly error: string | null
    readonly unavailable: string | null
  }
  readonly onSubmit: (target: HbarProposedPlanTarget, action: 'implement' | 'continue', feedback: string) => void
  readonly onReconcile: (target: HbarProposedPlanTarget) => void
}

function ProposedPlanContent({ target, markdown, labels, state, onSubmit, onReconcile }: HbarProposedPlanProps) {
  const [feedback, setFeedback] = useState('')
  const feedbackId = useId()
  const blocked =
    !state.canSubmit || state.status === 'submitting' || state.status === 'unknown' || state.status === 'accepted'
  return (
    <LumenFrame
      as="section"
      className="hbar-proposed-plan"
      aria-label={labels.title}
      aria-busy={state.status === 'submitting' || undefined}
      data-proposal-message={target.messageId}
    >
      <LumenFrame className="hbar-proposed-plan-heading">
        <LumenIcon icon={FileText} tier="md" />
        <LumenText as="strong">{labels.title}</LumenText>
      </LumenFrame>
      <LumenFrame className="hbar-proposed-plan-document" role="region" aria-label={labels.document} tabIndex={0}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
          {markdown}
        </ReactMarkdown>
      </LumenFrame>
      {state.status !== 'accepted' ? (
        <LumenFrame className="hbar-proposed-plan-feedback">
          <LumenFormField label={labels.feedback} controlId={feedbackId}>
            <LumenTextarea
              id={feedbackId}
              className="hbar-proposed-plan-feedback-input"
              variant="plain"
              value={feedback}
              onChange={(event) => setFeedback(event.currentTarget.value)}
              placeholder={labels.feedbackPlaceholder}
              rows={3}
              maxLength={4000}
              disabled={blocked}
            />
          </LumenFormField>
        </LumenFrame>
      ) : null}
      <LumenFrame className="hbar-proposed-plan-actions">
        <LumenButton
          type="button"
          size="s"
          tone="primary"
          indicator="none"
          disabled={blocked}
          onClick={() => onSubmit(target, 'implement', '')}
        >
          <LumenIcon icon={Play} tier="sm" />
          {labels.implement}
        </LumenButton>
        <LumenButton
          type="button"
          size="s"
          variant="text"
          indicator="none"
          disabled={blocked}
          onClick={() => onSubmit(target, 'continue', feedback.trim())}
        >
          <LumenIcon icon={PencilLine} tier="sm" />
          {labels.continuePlanning}
        </LumenButton>
        {state.status === 'unknown' ? (
          <LumenButton type="button" size="s" variant="text" indicator="none" onClick={() => onReconcile(target)}>
            <LumenIcon icon={RefreshCw} tier="sm" />
            {labels.reconcile}
          </LumenButton>
        ) : null}
      </LumenFrame>
      {state.status === 'submitting' || state.status === 'accepted' || state.status === 'unknown' ? (
        <LumenText className="hbar-proposed-plan-status" as="p" role="status">
          {state.status === 'submitting'
            ? labels.submitting
            : state.status === 'accepted'
              ? labels.accepted
              : labels.unknown}
        </LumenText>
      ) : null}
      {state.error ? (
        <LumenText className="hbar-proposed-plan-status" as="p" role="alert" tone="danger">
          {state.error}
        </LumenText>
      ) : null}
      {!state.canSubmit && state.unavailable ? (
        <LumenText className="hbar-proposed-plan-status" as="p" tone="muted">
          {state.unavailable}
        </LumenText>
      ) : null}
    </LumenFrame>
  )
}

/** The host owns acceptance; local state is only this proposal's editable refinement feedback. */
export function HbarProposedPlan(props: HbarProposedPlanProps) {
  return (
    <ProposedPlanContent
      key={JSON.stringify([props.target.sessionId, props.target.messageId, props.target.fingerprint])}
      {...props}
    />
  )
}
