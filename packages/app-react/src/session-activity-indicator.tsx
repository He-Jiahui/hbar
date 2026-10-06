import { CircleAlert, Hourglass, LoaderCircle } from 'lucide-react'
import { LumenFrame, LumenIcon, LumenIndicator } from '@lumen/app-ui'
import type { SessionActivityExecution } from '@hbar/contracts/sidebar-directory'
import './session-activity-indicator.css'

export interface SessionActivityIndicatorContent {
  readonly state: SessionActivityExecution['state']
  readonly label: string
}

/** Same Host-owned execution hint in grouped and Time navigation; never a second action. */
export function SessionActivityIndicator({
  execution,
}: {
  readonly execution: SessionActivityIndicatorContent | undefined
}) {
  if (!execution || execution.state === 'idle') return null
  return (
    <LumenFrame
      as="span"
      className="hbar-app-react-session-activity-indicator"
      role="img"
      aria-label={execution.label}
      title={execution.label}
      data-state={execution.state}
    >
      {execution.state === 'running' ? (
        <LumenIndicator state="running" tone="info" />
      ) : (
        <LumenIcon
          icon={
            execution.state === 'waiting_approval'
              ? CircleAlert
              : execution.state === 'queued'
                ? Hourglass
                : LoaderCircle
          }
          tier="sm"
        />
      )}
    </LumenFrame>
  )
}
