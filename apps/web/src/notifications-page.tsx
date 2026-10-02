import { useEffect, useMemo, useRef, useState } from 'react'
import { LumenButton, LumenFrame, LumenText } from '@lumen/app-ui'
import { HbarNotifications, useHbarRuntimeState, type HbarRuntimeView } from '@hbar/app-react'
import type { NotificationRecord } from '@hbar/contracts/commands/notifications'
import type { ShellLocale } from './shell-copy'
import { notificationCopy } from './notification-copy'
import { createNativeNotificationPort, type NativeNotificationPort } from './native-notifications'
import { requestNotificationDesktopPermission } from './notification-desktop-delivery'

export interface NotificationsPageProps {
  readonly runtime: HbarRuntimeView
  readonly locale: ShellLocale
  readonly onNavigate: (target: NotificationRecord['target']) => void
  readonly variant?: 1 | 3 | 4 | 5 | 6
  readonly native?: NativeNotificationPort
}

export function NotificationsPage({ runtime, locale, onNavigate, variant = 1, native }: NotificationsPageProps) {
  const labels = useMemo(() => notificationCopy(locale), [locale])
  const state = useHbarRuntimeState(runtime.state.notifications.reader)
  const [tab, setTab] = useState<1 | 3>(variant === 3 ? 3 : 1)
  const [permissionError, setPermissionError] = useState(false)
  const [permissionPending, setPermissionPending] = useState(false)
  const permissionOwner = useRef({ mounted: true, pending: false })
  useEffect(() => {
    permissionOwner.current.mounted = true
    return () => {
      permissionOwner.current.mounted = false
    }
  }, [])
  const nativePort = useMemo(
    () => native ?? createNativeNotificationPort(globalThis, Reflect.has(globalThis, '__TAURI_INTERNALS__')),
    [native],
  )
  const toggleNative = async () => {
    const preferences = state.preferences
    if (!nativePort.isAvailable || !preferences || permissionOwner.current.pending) return
    permissionOwner.current.pending = true
    setPermissionPending(true)
    try {
      if (preferences.nativeEnabled) {
        await runtime.state.notifications.runtime.setPreferences({ ...preferences, nativeEnabled: false })
        if (permissionOwner.current.mounted) setPermissionError(false)
        return
      }
      let permission
      try {
        permission = await requestNotificationDesktopPermission(nativePort)
      } catch {
        if (permissionOwner.current.mounted) setPermissionError(true)
        return
      }
      if (!permissionOwner.current.mounted) return
      if (permission !== 'Granted') {
        setPermissionError(true)
        return
      }
      await runtime.state.notifications.runtime.setPreferences({ ...preferences, nativeEnabled: true })
      if (permissionOwner.current.mounted) setPermissionError(false)
    } catch {
      // The runtime publishes the persistence failure beside this setting.
    } finally {
      permissionOwner.current.pending = false
      if (permissionOwner.current.mounted) setPermissionPending(false)
    }
  }
  const loadMore = () => {
    void runtime.state.notifications.runtime.loadMore()
  }
  const atCapacity = state.items.length >= 400
  return (
    <LumenFrame aria-busy={state.status === 'loading'}>
      {state.error ? (
        <LumenText role="alert" tone="danger">
          {state.error}
        </LumenText>
      ) : null}
      <LumenFrame as="nav" aria-label={labels.filters}>
        <LumenButton onClick={() => setTab(1)}>{labels.centerTab}</LumenButton>
        <LumenButton onClick={() => setTab(3)}>{labels.preferencesTab}</LumenButton>
      </LumenFrame>
      {nativePort.isAvailable ? (
        <LumenFrame>
          <LumenButton
            role="switch"
            aria-checked={state.preferences?.nativeEnabled === true}
            onClick={() => void toggleNative()}
            disabled={!state.preferences || permissionPending}
          >
            {labels.nativeEnabled}
          </LumenButton>
          {permissionError ? <LumenText role="alert">{labels.permissionDenied}</LumenText> : null}
        </LumenFrame>
      ) : null}
      <HbarNotifications
        runtime={runtime.state.notifications.runtime}
        labels={labels}
        onNavigate={onNavigate}
        variant={tab}
      />
      {tab === 1 && !atCapacity && state.nextCursor ? (
        <LumenButton onClick={loadMore} disabled={state.status === 'loading'}>
          {labels.loadMore}
        </LumenButton>
      ) : null}
      {tab === 1 && atCapacity ? <LumenText>{labels.capacity(state.items.length)}</LumenText> : null}
    </LumenFrame>
  )
}
