import { useEffect } from 'react'
import { Bell } from 'lucide-react'
import { LumenButton, LumenContentText, LumenFrame, LumenIcon } from '@lumen/app-ui'
import { useHbarRuntime, useHbarRuntimeState } from '@hbar/app-react'
import './NotificationPageButton.css'

export interface NotificationPageButtonLabels {
  readonly bell: (count: number) => string
  readonly count: (count: number) => string
}

export interface NotificationPageButtonProps {
  readonly labels: NotificationPageButtonLabels
  readonly unreadCount: number
  readonly selected: boolean
  readonly onOpen: () => void
}

export function NotificationPageButton({ labels, unreadCount, selected, onOpen }: NotificationPageButtonProps) {
  const label = labels.bell(unreadCount)
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
        <LumenContentText context="metric.value" className="hbar-web-notification-count" aria-hidden="true">
          {labels.count(unreadCount)}
        </LumenContentText>
      ) : null}
    </LumenButton>
  )
}

export function NotificationPageNavigation({
  labels,
  selected,
  onOpen,
}: Omit<NotificationPageButtonProps, 'unreadCount'>) {
  const runtime = useHbarRuntime()
  const notifications = runtime.state.notifications
  const state = useHbarRuntimeState(notifications.reader)
  useEffect(() => {
    void notifications.runtime.refresh({}).catch(() => undefined)
  }, [notifications.runtime])
  return (
    <LumenFrame className="hbar-web-notification-navigation">
      <NotificationPageButton labels={labels} unreadCount={state.unreadCount} selected={selected} onOpen={onOpen} />
    </LumenFrame>
  )
}
