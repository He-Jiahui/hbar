import { LoaderCircle } from 'lucide-react'
import { LumenFrame, LumenIcon, LumenIndicator, LumenText, type LumenTone } from '@lumen/app-ui'
import type { RunStatus } from '@hbar/contracts'
import './session-execution-status.css'

/** Motion follows confirmed execution only; waiting, queued and offline states remain distinct. */
export function HbarSessionExecutionStatus({
  state,
  label,
  tone,
}: {
  readonly state: RunStatus | 'unconfirmed'
  readonly label: string
  readonly tone: LumenTone
}) {
  return (
    <LumenFrame as="span" className="hbar-session-execution-status" data-state={state} data-tone={tone}>
      {state === 'running' ? (
        <LumenIcon icon={LoaderCircle} tier="sm" className="hbar-session-execution-spinner" />
      ) : (
        <LumenIndicator state="idle" tone={tone} />
      )}
      <LumenText as="span" variant="label" tone={tone === 'info' ? 'neutral' : tone}>
        {label}
      </LumenText>
    </LumenFrame>
  )
}
