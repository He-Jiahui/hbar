import { LoaderCircle, RefreshCw, WifiOff } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenContentText } from '@lumen/app-ui'
import './host-connection-notice.css'

export type HbarHostConnection = 'connected' | 'connecting' | 'pairing' | 'disconnected'

export interface HbarHostConnectionNoticeLabels {
  readonly interrupted: string
  readonly connecting: string
  readonly pairing: string
  readonly preserved: string
  readonly reconnect: string
}

/** One workbench-level notice owns connection recovery; loaded views retain their content. */
export function HbarHostConnectionNotice({
  connection,
  labels,
  onReconnect,
}: {
  readonly connection: HbarHostConnection
  readonly labels: HbarHostConnectionNoticeLabels
  readonly onReconnect: () => void
}) {
  if (connection === 'connected') return null
  return (
    <LumenFrame className="hbar-host-connection-notice" role="status" aria-live="polite" aria-atomic="true">
      <LumenIcon
        icon={connection === 'connecting' ? LoaderCircle : WifiOff}
        tier="md"
        className={connection === 'connecting' ? 'hbar-action-icon-busy' : undefined}
      />
      <LumenFrame className="hbar-host-connection-message">
        <LumenContentText context="feedback.message">
          {connection === 'connecting'
            ? labels.connecting
            : connection === 'pairing'
              ? labels.pairing
              : labels.interrupted}
        </LumenContentText>
        <LumenContentText context="section.description" tone="muted">
          {labels.preserved}
        </LumenContentText>
      </LumenFrame>
      <LumenButton
        size="s"
        variant="text"
        indicator="none"
        disabled={connection === 'connecting'}
        onClick={onReconnect}
      >
        <LumenIcon icon={RefreshCw} tier="sm" />
        <LumenContentText context="control.label">{labels.reconnect}</LumenContentText>
      </LumenButton>
    </LumenFrame>
  )
}
