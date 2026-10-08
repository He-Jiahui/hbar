import { LumenContentText, LumenFrame, LumenStatus } from '@lumen/app-ui'
import type { RunStatus } from '@hbar/contracts'
import './session-live-status.css'

export interface HbarSessionLiveStatusLabels {
  readonly label: string
  readonly offline: string
  readonly statusLabel: (status: RunStatus) => string
}

export interface HbarSessionLiveStatusProps {
  readonly sessionId: string
  readonly timelineSessionId: string | null
  readonly owned: boolean
  readonly connected: boolean
  readonly run: Readonly<{ id: string; status: RunStatus }> | undefined
  readonly labels: HbarSessionLiveStatusLabels
}

/** One current-run status, outside the transcript scroll; never projects another session's facts. */
export function HbarSessionLiveStatus({
  sessionId,
  timelineSessionId,
  owned,
  connected,
  run,
  labels,
}: HbarSessionLiveStatusProps) {
  if (
    !owned ||
    timelineSessionId !== sessionId ||
    !run ||
    !['queued', 'running', 'waiting_approval'].includes(run.status)
  )
    return null
  return (
    <LumenFrame
      className="hbar-session-live-status"
      data-session-live-status={run.id}
      data-session-id={sessionId}
      data-run-status={connected ? run.status : 'unconfirmed'}
      role="status"
      aria-label={labels.label}
      aria-live="polite"
      aria-atomic="true"
    >
      <LumenContentText context="feedback.title">{labels.label}</LumenContentText>
      <LumenFrame
        className="hbar-session-live-status-reading"
        role="group"
        aria-label={connected ? labels.statusLabel(run.status) : labels.offline}
        tabIndex={0}
      >
        <LumenStatus
          className="hbar-session-live-status-badge"
          value={connected ? labels.statusLabel(run.status) : labels.offline}
          tone={
            !connected || run.status === 'waiting_approval' ? 'warning' : run.status === 'running' ? 'info' : 'neutral'
          }
        />
      </LumenFrame>
    </LumenFrame>
  )
}
