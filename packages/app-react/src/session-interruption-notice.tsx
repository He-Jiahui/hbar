import { CircleAlert, ChartNoAxesColumnIncreasing } from 'lucide-react'
import { LumenContentText, LumenButton, LumenFrame, LumenIcon } from '@lumen/app-ui'
import { createMessageScope } from './messages'
import './session-interruption-notice.css'

export interface HbarSessionInterruptionLabels {
  readonly status: Readonly<Record<'failed' | 'interrupted', string>>
  readonly openStatus: string
}

const {
  Provider: SessionInterruptionMessagesProvider,
  useMessages: useSessionInterruptionMessages,
} = createMessageScope<HbarSessionInterruptionLabels>()

/** Only an unsuperseded unexpected end belongs in the conversation. Details stay in status. */
function SessionInterruptionNoticeView({
  status,
  onOpenStatus,
}: {
  readonly status: 'failed' | 'interrupted' | null
  readonly onOpenStatus: () => void
}) {
  const { t } = useSessionInterruptionMessages()
  const labels: HbarSessionInterruptionLabels = {
    status: t('status'),
    openStatus: t('openStatus'),
  }
  if (status === null) return null
  return (
    <LumenFrame className="hbar-session-interruption-notice" data-interruption-status={status} role="status">
      <LumenIcon icon={CircleAlert} tier="sm" />
      <LumenContentText context="message.inline">{labels.status[status]}</LumenContentText>
      <LumenButton size="s" variant="text" indicator="none" onClick={onOpenStatus}>
        <LumenIcon icon={ChartNoAxesColumnIncreasing} tier="sm" />
        {labels.openStatus}
      </LumenButton>
    </LumenFrame>
  )
}

/** The legacy labels prop remains the host adapter for existing SDK callers. */
export function HbarSessionInterruptionNotice({
  status,
  labels,
  onOpenStatus,
}: {
  readonly status: 'failed' | 'interrupted' | null
  readonly labels: HbarSessionInterruptionLabels
  readonly onOpenStatus: () => void
}) {
  return (
    <SessionInterruptionMessagesProvider messages={labels}>
      <SessionInterruptionNoticeView status={status} onOpenStatus={onOpenStatus} />
    </SessionInterruptionMessagesProvider>
  )
}
