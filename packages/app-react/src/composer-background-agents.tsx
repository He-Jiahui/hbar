import { LoaderCircle, Square } from 'lucide-react'
import { LumenContentText, LumenButton, LumenFrame, LumenIcon } from '@lumen/app-ui'
import { HbarComposerFeedback } from './composer-feedback'
import './composer-background-agents.css'

export interface HbarComposerBackgroundAgentLabels {
  readonly stop: (count: number) => string
  readonly stopping: string
  readonly requested: string
  readonly unknown: string
  readonly checking: string
  readonly settled: string
  readonly failed: (code: string) => string
  readonly readFailed: (code: string) => string
  readonly reconcile: string
  readonly retry: string
  readonly refresh: string
}

/** Stops only the Host-confirmed direct children captured by the owning ViewModel. */
export function HbarComposerBackgroundAgentStop({
  count,
  disabled,
  pending,
  labels,
  onStop,
}: {
  readonly count: number
  readonly disabled: boolean
  readonly pending: boolean
  readonly labels: HbarComposerBackgroundAgentLabels
  readonly onStop: () => void
}) {
  if (count === 0) return null
  return (
    <LumenButton
      type="button"
      className="hbar-prompt-primary-action hbar-composer-background-stop"
      aria-label={labels.stop(count)}
      title={labels.stop(count)}
      variant="solid"
      indicator="none"
      tone="danger"
      disabled={disabled}
      loading={pending}
      onClick={onStop}
    >
      {pending ? (
        <LumenIcon icon={LoaderCircle} tier="md" className="hbar-action-icon-busy" />
      ) : (
        <LumenIcon icon={Square} tier="md" fill="currentColor" strokeWidth={0} />
      )}
    </LumenButton>
  )
}

export type HbarBackgroundAgentFeedbackKind =
  'submitting' | 'requested' | 'unknown' | 'checking' | 'settled' | 'failed' | 'read-error'

/** Cancellation acceptance and actual settlement are distinct, visible states. */
export function HbarComposerBackgroundAgentFeedback({
  kind,
  error,
  disabled,
  labels,
  onReconcile,
  onRetry,
  onRefresh,
}: {
  readonly kind: HbarBackgroundAgentFeedbackKind | null
  readonly error: string | null
  readonly disabled: boolean
  readonly labels: HbarComposerBackgroundAgentLabels
  readonly onReconcile: () => void
  readonly onRetry: () => void
  readonly onRefresh: () => void
}) {
  if (!kind) return null
  const message =
    kind === 'submitting'
      ? labels.stopping
      : kind === 'requested'
        ? labels.requested
        : kind === 'unknown'
          ? labels.unknown
          : kind === 'checking'
            ? labels.checking
            : kind === 'settled'
              ? labels.settled
              : kind === 'read-error'
                ? labels.readFailed(error ?? 'EXECUTION_FAILED')
                : labels.failed(error ?? 'EXECUTION_FAILED')
  const failure = kind === 'failed' || kind === 'read-error'
  return (
    <HbarComposerFeedback tone={failure || kind === 'unknown' ? 'danger' : 'neutral'}>
      <LumenFrame
        className="hbar-composer-background-feedback"
        data-state={kind}
        role={failure ? 'alert' : 'status'}
        aria-live="polite"
      >
        <LumenContentText context="section.description" tone={failure ? 'danger' : 'muted'}>
          {message}
        </LumenContentText>
        {kind === 'unknown' || kind === 'requested' ? (
          <LumenButton type="button" size="s" variant="text" indicator="none" disabled={disabled} onClick={onReconcile}>
            {labels.reconcile}
          </LumenButton>
        ) : kind === 'failed' ? (
          <LumenButton type="button" size="s" variant="text" indicator="none" disabled={disabled} onClick={onRetry}>
            {labels.retry}
          </LumenButton>
        ) : kind === 'read-error' ? (
          <LumenButton type="button" size="s" variant="text" indicator="none" disabled={disabled} onClick={onRefresh}>
            {labels.refresh}
          </LumenButton>
        ) : null}
      </LumenFrame>
    </HbarComposerFeedback>
  )
}
