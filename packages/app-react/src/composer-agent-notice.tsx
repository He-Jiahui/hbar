import { Bot } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenText } from '@lumen/app-ui'
import { HbarComposerFeedback } from './composer-feedback'
import './composer-agent-notice.css'

export interface HbarComposerAgentNoticeLabels {
  readonly creating: string
  readonly unknown: string
  readonly retry: string
  readonly created: string
  readonly open: string
}

export function HbarComposerAgentNotice({
  status,
  agentId,
  labels,
  connected,
  onRetry,
  onOpen,
}: {
  readonly status: 'submitting' | 'unknown' | 'succeeded' | 'failed' | 'idle' | undefined
  readonly agentId: string | null | undefined
  readonly labels: HbarComposerAgentNoticeLabels
  readonly connected: boolean
  readonly onRetry: () => void
  readonly onOpen: () => void
}) {
  if (!status || status === 'idle' || status === 'failed') return null
  return (
    <HbarComposerFeedback tone={status === 'unknown' ? 'danger' : 'neutral'}>
      <LumenFrame className="hbar-composer-agent-notice" role={status === 'unknown' ? 'alert' : 'status'}>
        <LumenIcon icon={Bot} tier="sm" />
        <LumenText as="span" className="hbar-composer-agent-notice-text">
          {status === 'submitting' ? labels.creating : status === 'unknown' ? labels.unknown : labels.created}
        </LumenText>
        {status === 'unknown' && (
          <LumenButton size="s" disabled={!connected} onClick={onRetry}>
            {labels.retry}
          </LumenButton>
        )}
        {status === 'succeeded' && agentId && (
          <LumenButton size="s" onClick={onOpen}>
            {labels.open}
          </LumenButton>
        )}
      </LumenFrame>
    </HbarComposerFeedback>
  )
}
