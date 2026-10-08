import { useEffect, useMemo, useRef, useState } from 'react'
import { useHbarRuntimeState, type HbarRuntimeView } from '@hbar/app-react'
import type { NotificationRecord } from '@hbar/contracts/commands/notifications'
import type { ShellLocale } from './shell-copy'
import { notificationCopy } from './notification-copy'
import { createNativeNotificationPort, type NativeNotificationPort } from './native-notifications'
import { requestNotificationDesktopPermission } from './notification-desktop-delivery'
import { NotificationsPageView } from './notifications-page-view'

export interface NotificationsPageProps {
  readonly runtime: HbarRuntimeView
  readonly locale: ShellLocale
  readonly onNavigate: (target: NotificationRecord['target']) => void | Promise<void>
  readonly variant?: 1 | 3 | 4 | 5 | 6
  readonly native?: NativeNotificationPort
}

export function NotificationsPage({ runtime, locale, onNavigate, variant = 1, native }: NotificationsPageProps) {
  const labels = useMemo(() => notificationCopy(locale), [locale])
  const state = useHbarRuntimeState(runtime.state.notifications.reader)
  const [tab, setTab] = useState<1 | 3>(variant === 3 ? 3 : 1)
  const [permissionError, setPermissionError] = useState(false)
  const [permissionPending, setPermissionPending] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const permissionOwner = useRef({ mounted: true, pending: false })
  useEffect(() => {
    const lifetime = permissionOwner.current
    lifetime.mounted = true
    return () => {
      lifetime.mounted = false
    }
  }, [])
  const nativePort = useMemo(
    () => native ?? createNativeNotificationPort(globalThis, Reflect.has(globalThis, '__TAURI_INTERNALS__')),
    [native],
  )
  const toggleNative = async () => {
    const preferences = runtime.state.notifications.reader.getSnapshot().preferences
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
      const latest = runtime.state.notifications.reader.getSnapshot().preferences
      if (!latest) return
      await runtime.state.notifications.runtime.setPreferences({ ...latest, nativeEnabled: true })
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
  const reconcile = () => {
    setReconciling(true)
    void runtime.state.notifications.runtime
      .reconcile()
      .catch(() => undefined)
      .finally(() => {
        if (permissionOwner.current.mounted) setReconciling(false)
      })
  }
  return (
    <NotificationsPageView
      runtime={runtime.state.notifications.runtime}
      state={state}
      labels={labels}
      onNavigate={onNavigate}
      tab={tab}
      onTab={setTab}
      nativeAvailable={nativePort.isAvailable}
      permissionPending={permissionPending}
      permissionError={permissionError}
      reconciling={reconciling}
      onToggleNative={() => void toggleNative()}
      onReconcile={reconcile}
      onLoadMore={loadMore}
    />
  )
}
