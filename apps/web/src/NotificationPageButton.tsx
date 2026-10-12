import { useEffect } from 'react'
import { Bell } from 'lucide-react'
import { LumenContentText, LumenButton, LumenFrame, LumenIcon } from '@lumen/app-ui'
import { createMessageScope, useHbarRuntime, useHbarRuntimeState } from '@hbar/app-react'
import './NotificationPageButton.css'

export interface NotificationPageButtonLabels {
  readonly bell: (count: number) => string
  readonly count: (count: number) => string
}

const NotificationPageButtonMessages = createMessageScope<NotificationPageButtonLabels>()

export interface NotificationPageButtonProps {
  readonly labels: NotificationPageButtonLabels
  readonly unreadCount: number
  readonly selected: boolean
  readonly onOpen: () => void
}

function NotificationPageButtonView({ unreadCount, selected, onOpen }: Omit<NotificationPageButtonProps, 'labels'>) {
  const { t } = NotificationPageButtonMessages.useMessages()
  const label = t('bell')(unreadCount)
  return (
    <LumenButton
      className="hbar-web-notification-page-button"
      variant="text"
      indicator="none"
      aria-label={label}
      title={label}
      aria-current={selected ? 'page' : undefined}
      onClick={onOpen}
    >
      <LumenIcon icon={Bell} tier="sm" />
      {unreadCount > 0 ? (
        <LumenContentText context="control.label" className="hbar-web-notification-count" aria-hidden="true">
          {t('count')(unreadCount)}
        </LumenContentText>
      ) : null}
    </LumenButton>
  )
}

export function NotificationPageButton({ labels, ...props }: NotificationPageButtonProps) {
  return (
    <NotificationPageButtonMessages.Provider messages={labels}>
      <NotificationPageButtonView {...props} />
    </NotificationPageButtonMessages.Provider>
  )
}

export function NotificationPageNavigation({
  labels,
  selected,
  onOpen,
  connected,
}: Omit<NotificationPageButtonProps, 'unreadCount'> & { readonly connected: boolean }) {
  const runtime = useHbarRuntime()
  const notifications = runtime.state.notifications
  const state = useHbarRuntimeState(notifications.reader)
  useEffect(() => {
    if (!connected) return
    void notifications.runtime.refresh({}).catch(() => undefined)
  }, [connected, notifications.runtime])
  return (
    <NotificationPageButtonMessages.Provider messages={labels}>
      <LumenFrame className="hbar-web-notification-navigation">
        <NotificationPageButtonView unreadCount={state.unreadCount} selected={selected} onOpen={onOpen} />
      </LumenFrame>
    </NotificationPageButtonMessages.Provider>
  )
}
