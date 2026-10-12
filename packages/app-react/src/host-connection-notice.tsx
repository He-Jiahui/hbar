import { LoaderCircle, RefreshCw, WifiOff } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenContentText } from '@lumen/app-ui'
import { createMessageScope } from './messages'
import './host-connection-notice.css'

export type HbarHostConnection = 'connected' | 'connecting' | 'pairing' | 'disconnected'

export interface HbarHostConnectionNoticeLabels {
  readonly interrupted: string
  readonly connecting: string
  readonly pairing: string
  readonly preserved: string
  readonly reconnect: string
}
const hostConnectionMessages = createMessageScope<HbarHostConnectionNoticeLabels>()

/** One workbench-level notice owns connection recovery; loaded views retain their content. */
export function HbarHostConnectionNotice(props: {
  readonly connection: HbarHostConnection
  readonly labels: HbarHostConnectionNoticeLabels
  readonly onReconnect: () => void
}) {
  const { labels, ...viewProps } = props
  return (
    <hostConnectionMessages.Provider messages={labels}>
      <HostConnectionNoticeContent {...viewProps} />
    </hostConnectionMessages.Provider>
  )
}

function HostConnectionNoticeContent({ connection, onReconnect }: Omit<Parameters<typeof HbarHostConnectionNotice>[0], 'labels'>) {
  const { t } = hostConnectionMessages.useMessages()
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
            ? t('connecting')
            : connection === 'pairing'
              ? t('pairing')
              : t('interrupted')}
        </LumenContentText>
        <LumenContentText context="section.description" tone="muted">
          {t('preserved')}
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
        <LumenContentText context="control.label">{t('reconnect')}</LumenContentText>
      </LumenButton>
    </LumenFrame>
  )
}
