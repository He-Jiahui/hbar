import { LumenButton, LumenFrame, LumenContentText } from '@lumen/app-ui'
import type { ComposerIntentState } from '@hbar/app-runtime'

export interface HbarComposerGoalRecoveryLabels {
  readonly unknown: string
  readonly checking: string
  readonly waiting: string
  readonly failed: string
  readonly offline: string
  readonly reconcile: string
}

/** Both Goal entry points describe the same original operation and its owner-held read. */
export function HbarComposerGoalRecovery({
  action,
  connected,
  busy = false,
  labels,
  onReconcile,
  descriptionId,
}: {
  readonly action: ComposerIntentState['entries'][string]['goalAction'] | undefined
  readonly connected: boolean
  readonly busy?: boolean
  readonly labels: HbarComposerGoalRecoveryLabels
  readonly onReconcile: () => void
  readonly descriptionId?: string | undefined
}) {
  if (action?.status !== 'unknown') return null
  const recovery = action.reconciliation
  const checking = busy || recovery?.status === 'checking' || recovery?.requestInFlight === true
  const message = !connected
    ? labels.offline
    : recovery?.requestInFlight && recovery.status !== 'checking'
      ? labels.waiting
      : checking
        ? labels.checking
        : recovery?.status === 'failed'
          ? labels.failed
          : labels.unknown
  return (
    <LumenFrame
      className="hbar-composer-intent-feedback"
      role={checking ? 'status' : 'alert'}
      aria-busy={checking || undefined}
      data-testid="composer-goal-recovery"
    >
      <LumenContentText context="feedback.paragraph" id={descriptionId}>
        {message}
      </LumenContentText>
      <LumenButton type="button" size="s" disabled={!connected || checking} onClick={onReconcile}>
        {labels.reconcile}
      </LumenButton>
    </LumenFrame>
  )
}
