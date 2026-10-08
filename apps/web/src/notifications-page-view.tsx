import { LumenButton, LumenContentText, LumenFrame, LumenToggle } from '@lumen/app-ui'
import { HbarNotifications, type HbarNotificationsLabels } from '@hbar/app-react'
import type { NotificationsRuntime, NotificationsState } from '@hbar/app-runtime'
import type { NotificationRecord } from '@hbar/contracts/commands/notifications'
import './notifications-page.css'

export interface NotificationsPageViewProps {
  readonly runtime: NotificationsRuntime
  readonly state: NotificationsState
  readonly labels: HbarNotificationsLabels
  readonly tab: 1 | 3
  readonly nativeAvailable: boolean
  readonly permissionPending: boolean
  readonly permissionError: boolean
  readonly reconciling: boolean
  readonly onTab: (tab: 1 | 3) => void
  readonly onToggleNative: () => void
  readonly onReconcile: () => void
  readonly onLoadMore: () => void
  readonly onNavigate: (target: NotificationRecord['target']) => void | Promise<void>
}

/** The host owns copy, notification data, permission and mutation lifetimes. */
export function NotificationsPageView({
  runtime,
  state,
  labels,
  tab,
  nativeAvailable,
  permissionPending,
  permissionError,
  reconciling,
  onTab,
  onToggleNative,
  onReconcile,
  onLoadMore,
  onNavigate,
}: NotificationsPageViewProps) {
  const atCapacity = state.items.length >= 400
  return (
    <LumenFrame className="hbar-web-notifications-page" aria-busy={state.status === 'loading'}>
      {state.error && (
        <LumenContentText context="feedback.paragraph" role="alert" tone="danger">
          {state.error}
        </LumenContentText>
      )}
      {state.mutation === 'unknown' && (
        <LumenFrame
          className="hbar-web-notification-actions"
          role="group"
          aria-label={reconciling ? labels.reconciling : labels.reconcile}
          tabIndex={0}
        >
          <LumenButton disabled={reconciling} onClick={onReconcile}>
            {reconciling ? labels.reconciling : labels.reconcile}
          </LumenButton>
        </LumenFrame>
      )}
      <LumenFrame as="nav" className="hbar-web-notification-actions" aria-label={labels.filters} tabIndex={0}>
        <LumenButton aria-pressed={tab === 1} onClick={() => onTab(1)}>
          {labels.centerTab}
        </LumenButton>
        <LumenButton aria-pressed={tab === 3} onClick={() => onTab(3)}>
          {labels.preferencesTab}
        </LumenButton>
      </LumenFrame>
      {nativeAvailable && (
        <LumenFrame className="hbar-web-notification-native">
          <LumenFrame
            className="hbar-web-notification-actions"
            role="group"
            aria-label={labels.nativeEnabled}
            tabIndex={0}
          >
            <LumenToggle
              id="hbar-notifications-native-enabled"
              label={labels.nativeEnabled}
              checked={state.preferences?.nativeEnabled === true}
              onChange={onToggleNative}
              disabled={
                !state.preferences ||
                permissionPending ||
                state.mutation === 'submitting' ||
                state.mutation === 'unknown'
              }
            />
          </LumenFrame>
          {permissionError && (
            <LumenContentText context="feedback.paragraph" role="alert">
              {labels.permissionDenied}
            </LumenContentText>
          )}
        </LumenFrame>
      )}
      <HbarNotifications runtime={runtime} labels={labels} onNavigate={onNavigate} variant={tab} />
      {tab === 1 && !atCapacity && state.nextCursor && (
        <LumenFrame className="hbar-web-notification-actions" role="group" aria-label={labels.loadMore} tabIndex={0}>
          <LumenButton onClick={onLoadMore} disabled={state.status === 'loading'}>
            {labels.loadMore}
          </LumenButton>
        </LumenFrame>
      )}
      {tab === 1 && atCapacity && (
        <LumenContentText context="feedback.detail" role="status">
          {labels.capacity(state.items.length)}
        </LumenContentText>
      )}
    </LumenFrame>
  )
}
