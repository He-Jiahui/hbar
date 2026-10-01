import { CircleAlert, Hourglass, LoaderCircle } from 'lucide-react'
import { LumenIcon } from '@lumen/app-ui'
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
    <span
      className="hbar-app-react-session-activity-indicator"
      role="img"
      aria-label={execution.label}
      title={execution.label}
      data-state={execution.state}
    >
      <LumenIcon
        icon={
          execution.state === 'waiting_approval' ? CircleAlert : execution.state === 'queued' ? Hourglass : LoaderCircle
        }
        tier="sm"
      />
    </span>
  )
}
