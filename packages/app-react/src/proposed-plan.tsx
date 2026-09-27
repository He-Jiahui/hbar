import { useEffect, useId, useRef, useState } from 'react'
import { FileText, PencilLine, Play, RefreshCw } from 'lucide-react'
import { LumenButton, LumenFormField, LumenFrame, LumenIcon, LumenText, LumenTextarea } from '@lumen/app-ui'
import { MessageMarkdown, type MessageCodeContext } from './message-markdown'
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
  readonly scope: string
  readonly feedback: string
  readonly feedbackPlaceholder: string
  readonly submitting: string
  readonly accepted: string
  readonly unknown: string
  readonly checking: string
  readonly reconcile: string
  readonly error: (code: string) => string
}
export interface HbarProposedPlanProps {
  readonly target: HbarProposedPlanTarget
  readonly markdown: string
  readonly findSegmentId?: string
  readonly code?: MessageCodeContext | undefined
  readonly labels: HbarProposedPlanLabels
  readonly state: {
    readonly status: 'idle' | 'submitting' | 'unknown' | 'accepted' | 'failed'
    readonly canSubmit: boolean
    readonly connected: boolean
    readonly reconciling: boolean
    readonly error: string | null
    readonly unavailable: string | null
  }
  readonly onSubmit: (target: HbarProposedPlanTarget, action: 'implement' | 'continue', feedback: string) => void
  readonly onReconcile: (target: HbarProposedPlanTarget) => void
}

function ProposedPlanContent({
  target,
  markdown,
  findSegmentId,
  code,
  labels,
  state,
  onSubmit,
  onReconcile,
}: HbarProposedPlanProps) {
  const [feedback, setFeedback] = useState('')
  const feedbackId = useId()
  const scopeId = useId()
  const statusId = useId()
  const regionRef = useRef<HTMLElement | null>(null)
  const actionFocus = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    const cancel = () => {
      actionFocus.current = null
    }
    const moved = (event: FocusEvent) => {
      if (event.target !== actionFocus.current && event.target !== document.body) cancel()
    }
    const interacted = (event: Event) => {
      // Disabling a native button can blur it to BODY before a second activation
      // key arrives. That is not a deliberate move to another focus owner.
      if (
        event instanceof KeyboardEvent &&
        event.target === document.body &&
        actionFocus.current?.disabled &&
        (event.key === 'Enter' || event.key === ' ')
      )
        return
      if (!(event.target instanceof Node) || !actionFocus.current?.contains(event.target)) cancel()
    }
    document.addEventListener('pointerdown', interacted, true)
    document.addEventListener('keydown', interacted, true)
    document.addEventListener('focusin', moved, true)
    return () => {
      cancel()
      document.removeEventListener('pointerdown', interacted, true)
      document.removeEventListener('keydown', interacted, true)
      document.removeEventListener('focusin', moved, true)
    }
  }, [])
  useEffect(() => {
    if (state.status !== 'accepted') return
    const source = actionFocus.current
    actionFocus.current = null
    if (!source || !document.hasFocus() || document.querySelector('dialog:modal')) return
    if (document.activeElement !== document.body && document.activeElement !== source) return
    regionRef.current?.focus({ preventScroll: true })
  }, [state.status])
  const blocked =
    !state.connected ||
    !state.canSubmit ||
    state.reconciling ||
    state.status === 'submitting' ||
    state.status === 'unknown' ||
    state.status === 'accepted'
  return (
    <LumenFrame
      as="section"
      ref={(node) => {
        regionRef.current = node
      }}
      tabIndex={-1}
      className="hbar-proposed-plan"
      aria-label={labels.title}
      aria-describedby={state.status === 'accepted' ? statusId : undefined}
      aria-busy={state.status === 'submitting' || state.reconciling || undefined}
      data-proposal-message={target.messageId}
    >
      <LumenFrame className="hbar-proposed-plan-heading">
        <LumenIcon icon={FileText} tier="md" />
        <LumenText as="strong">{labels.title}</LumenText>
      </LumenFrame>
      <LumenFrame
        className="hbar-proposed-plan-document"
        role="region"
        aria-label={labels.document}
        tabIndex={0}
        data-session-find-segment={findSegmentId}
      >
        <MessageMarkdown text={markdown} code={code} />
      </LumenFrame>
      {state.status !== 'accepted' && (
        <LumenText as="p" id={scopeId} className="hbar-proposed-plan-scope" tone="muted">
          {labels.scope}
        </LumenText>
      )}
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
      {state.status !== 'accepted' && (
        <LumenFrame className="hbar-proposed-plan-actions">
          <LumenButton
            type="button"
            size="s"
            tone="primary"
            indicator="none"
            disabled={blocked}
            aria-describedby={scopeId}
            onClick={(event) => {
              actionFocus.current = event.currentTarget
              onSubmit(target, 'implement', '')
            }}
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
            aria-describedby={scopeId}
            onClick={(event) => {
              actionFocus.current = event.currentTarget
              onSubmit(target, 'continue', feedback.trim())
            }}
          >
            <LumenIcon icon={PencilLine} tier="sm" />
            {labels.continuePlanning}
          </LumenButton>
          {state.status === 'unknown' ? (
            <LumenButton
              type="button"
              size="s"
              variant="text"
              indicator="none"
              disabled={!state.connected || state.reconciling}
              onClick={(event) => {
                actionFocus.current = event.currentTarget
                onReconcile(target)
              }}
            >
              <LumenIcon icon={RefreshCw} tier="sm" />
              {labels.reconcile}
            </LumenButton>
          ) : null}
        </LumenFrame>
      )}
      {state.status === 'submitting' || state.status === 'accepted' || state.status === 'unknown' ? (
        <LumenText id={statusId} className="hbar-proposed-plan-status" as="p" role="status">
          {state.status === 'submitting'
            ? labels.submitting
            : state.status === 'accepted'
              ? labels.accepted
              : state.reconciling
                ? labels.checking
                : labels.unknown}
        </LumenText>
      ) : null}
      {state.error ? (
        <LumenText className="hbar-proposed-plan-status" as="p" role="alert" tone="danger">
          {state.error}
        </LumenText>
      ) : null}
      {!state.canSubmit &&
      state.unavailable &&
      state.status !== 'accepted' &&
      (state.status === 'idle' || state.status === 'failed' || !state.connected) ? (
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
