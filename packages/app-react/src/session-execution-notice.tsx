import { useRef, useState } from 'react'
import { Archive, ShieldQuestion } from 'lucide-react'
import { LumenContentText, LumenButton, LumenFrame, LumenIcon } from '@lumen/app-ui'
import type { SessionExecutionAccess, SessionExecutionTarget } from '@hbar/app-runtime'

export interface HbarSessionExecutionLabels {
  readonly archived: string
  readonly unverified: string
  readonly openArchived: (workspaceName: string) => string
  readonly opening: string
  readonly error: (code: string) => string
}

/** A ready fact for another target is never permission for the retained conversation. */
export function sessionPreparationStatus(
  access: SessionExecutionAccess,
  target: SessionExecutionTarget | null,
): 'ready' | 'archived' | 'unverified' {
  return target &&
    access.target?.sessionId === target.sessionId &&
    access.target.workspaceId === target.workspaceId &&
    access.kind !== 'unverified'
    ? access.kind
    : 'unverified'
}

/** One nearby status and one explicit read-only list entry, never an implicit restore or navigation. */
export function HbarSessionExecutionNotice({
  status,
  workspaceName,
  connected,
  labels,
  onOpenArchived,
}: {
  readonly status: 'ready' | 'archived' | 'unverified'
  readonly workspaceName: string
  readonly connected: boolean
  readonly labels: HbarSessionExecutionLabels
  readonly onOpenArchived: () => Promise<void>
}) {
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  if (status === 'ready') return null
  const open = () => {
    if (!connected || inFlight.current) return
    inFlight.current = true
    setOpening(true)
    setError(null)
    void onOpenArchived()
      .catch((reason: unknown) => {
        setError(
          reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
            ? reason.code
            : 'EXECUTION_FAILED',
        )
      })
      .finally(() => {
        inFlight.current = false
        setOpening(false)
      })
  }
  return (
    <LumenFrame className="hbar-session-execution-notice" data-session-execution-access={status}>
      <LumenFrame className="hbar-session-execution-summary" role="status">
        <LumenIcon icon={status === 'archived' ? Archive : ShieldQuestion} tier="sm" />
        <LumenContentText context="message.inline" className="hbar-session-execution-copy">
          {status === 'archived' ? labels.archived : labels.unverified}
        </LumenContentText>
      </LumenFrame>
      {status === 'archived' && (
        <LumenButton size="s" variant="text" indicator="none" disabled={!connected || opening} onClick={open}>
          {opening ? labels.opening : labels.openArchived(workspaceName)}
        </LumenButton>
      )}
      {error && (
        <LumenContentText context="feedback.message" role="alert">
          {labels.error(error)}
        </LumenContentText>
      )}
    </LumenFrame>
  )
}
