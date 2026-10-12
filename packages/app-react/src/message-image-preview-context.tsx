import type { ReactNode } from 'react'
import { createMessageScope } from './messages'

export interface MessageImagePreviewLabels {
  readonly loading: string
  readonly failed: string
  readonly retry: string
  readonly open: (name: string) => string
}
const messageImagePreviewMessages = createMessageScope<MessageImagePreviewLabels>()

export function MessageImagePreviewProvider({
  labels,
  children,
}: {
  readonly labels: MessageImagePreviewLabels
  readonly children: ReactNode
}) {
  return (
    <messageImagePreviewMessages.Provider messages={labels}>
      {children}
    </messageImagePreviewMessages.Provider>
  )
}

export function useMessageImagePreviewMessages() {
  return messageImagePreviewMessages.useOptionalMessages()
}

/** Compatibility adapter for consumers that still need the previous full labels object. */
export function useMessageImagePreviewLabels(): MessageImagePreviewLabels | null {
  const messages = useMessageImagePreviewMessages()
  if (!messages) return null
  const { t } = messages
  return {
    loading: t('loading'),
    failed: t('failed'),
    retry: t('retry'),
    open: t('open'),
  }
}
