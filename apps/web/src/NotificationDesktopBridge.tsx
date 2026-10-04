import { useEffect, useMemo, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { LumenText } from '@lumen/app-ui/primitives'
import { useHbarRuntime, useHbarRuntimeState } from '@hbar/app-react'
import { createNativeNotificationPort } from './native-notifications'
import { createNotificationDesktopDelivery } from './notification-desktop-delivery'
import type { ShellLocale } from './shell-copy'
import { notificationCopy } from './notification-copy'

/** The app lifetime owns fresh delivery even while the center is closed. */
export function NotificationDesktopBridge({
  locale,
  connected,
}: {
  readonly locale: ShellLocale
  readonly connected: boolean
}) {
  const runtime = useHbarRuntime()
  const notificationRuntime = runtime.state.notifications.runtime
  const state = useHbarRuntimeState(notificationRuntime.reader)
  const native = useMemo(
    () => createNativeNotificationPort(globalThis, Reflect.has(globalThis, '__TAURI_INTERNALS__')),
    [],
  )
  const [failed, setFailed] = useState(false)
  const labels = useMemo(() => notificationCopy(locale), [locale])
  const nativeWindow = useMemo(() => (native.isAvailable ? getCurrentWindow() : null), [native])
  useEffect(() => {
    if (connected) void notificationRuntime.refresh()
  }, [connected, notificationRuntime])
  useEffect(() => {
    if (!native.isAvailable) return undefined
    const delivery = createNotificationDesktopDelivery({
      runtime: notificationRuntime,
      native,
      messageCopy: (record) => ({ title: labels.eventKinds[record.kind], body: record.detail }),
      scope: {
        get visibilityState() {
          return document.visibilityState
        },
        isNativeBackground: async () => {
          if (!nativeWindow) return false
          const [visible, focused] = await Promise.all([nativeWindow.isVisible(), nativeWindow.isFocused()])
          return !visible || !focused
        },
      },
      enabled: (record) => {
        const preferences = notificationRuntime.reader.getSnapshot().preferences
        return preferences?.nativeEnabled === true && Boolean(record && preferences[record.kind].desktop)
      },
      onDeliveryResult: (_record, accepted) => setFailed(!accepted),
    })
    delivery.begin()
    return () => delivery.dispose()
  }, [native, nativeWindow, notificationRuntime, labels])
  return failed && state.preferences?.nativeEnabled ? (
    <LumenText role="alert" tone="danger">
      {labels.deliveryFailed}
    </LumenText>
  ) : null
}
