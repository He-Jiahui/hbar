import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { z } from 'zod'
import type { DesktopElement } from './types'

/** Native platform entries are classified from the current Tauri command boundary.
 *
 * The old desktop-chrome copy catalog was removed from the current desktop host. Keep
 * those entries visible as pending findings instead of importing a retired contract.
 */
export async function collectNativePlatformElements(root: string): Promise<DesktopElement[]> {
  const [main, build, capability] = await Promise.all(
    [
      'apps/desktop/src-tauri/src/main.rs',
      'apps/desktop/src-tauri/build.rs',
      'apps/desktop/src-tauri/capabilities/main.json',
    ].map((path) => readFile(resolve(root, path), 'utf8').catch(() => '')),
  )
  let notificationsOwned = false
  try {
    const capabilities = z
      .object({ webviews: z.array(z.string()), permissions: z.array(z.string()) })
      .safeParse(JSON.parse(capability ?? ''))
    notificationsOwned =
      capabilities.success &&
      capabilities.data.webviews.includes('main') &&
      capabilities.data.permissions.includes('allow-send-native-notification') &&
      Boolean(build?.includes('send_native_notification')) &&
      Boolean(main?.includes('fn native_notification_permission')) &&
      Boolean(main?.includes('fn request_native_notification_permission')) &&
      Boolean(main?.includes('fn send_native_notification')) &&
      Boolean(main?.includes('fn native_notification_delivery_status'))
  } catch {
    /* A missing or invalid platform boundary remains pending. */
  }
  return [
    {
      id: 'window-title',
      component: 'TauriWindowTitle',
      source: 'DesktopChromeCopy.windowTitle / ToolWindowOpenOptions.title',
    },
    { id: 'tray-open', component: 'TauriTrayOpen', source: 'DesktopChromeCopy.trayOpen' },
    { id: 'tray-exit', component: 'TauriTrayExit', source: 'DesktopChromeCopy.trayExit' },
    { id: 'tray-tooltip', component: 'TauriTrayTooltip', source: 'DesktopChromeCopy.trayTooltip' },
    { id: 'notification-title', component: 'TauriNotificationTitle', source: 'NativeNotification.title' },
    { id: 'notification-body', component: 'TauriNotificationBody', source: 'NativeNotification.body' },
    {
      id: 'close-confirmation-title',
      component: 'WindowsCloseConfirmationTitle',
      source: 'DesktopChromeCopy.closeConfirmation.title',
    },
    {
      id: 'close-confirmation-message',
      component: 'WindowsCloseConfirmationMessage',
      source: 'DesktopChromeCopy.closeConfirmation.message',
    },
    {
      id: 'close-confirmation-yes',
      component: 'WindowsCloseConfirmationYes',
      source: 'Windows OS locale / standard IDYES button',
    },
    {
      id: 'close-confirmation-no',
      component: 'WindowsCloseConfirmationNo',
      source: 'Windows OS locale / standard IDNO button',
    },
  ].map((entry) => {
    const notification = entry.id.startsWith('notification')
    const confirmation = entry.id.startsWith('close-confirmation')
    const systemAction = entry.id === 'close-confirmation-yes' || entry.id === 'close-confirmation-no'
    const owned = notification ? notificationsOwned : systemAction ? false : false
    return {
      id: `native::${entry.id}`,
      path: 'apps/desktop/src-tauri/src/main.rs',
      line: 1,
      owner: 'desktop-platform',
      surface: 'platform',
      component: entry.component,
      category: 'platform',
      context: null,
      contentSources: [entry.source],
      accessibleNameSources: [entry.source],
      actionBindings: {},
      targetSources: [
        notification
          ? 'notification.id'
          : confirmation
            ? 'original main window / explicit exit or tray hide decision'
            : 'main WebView / original tray menu action id',
      ],
      stateSources: [
        notification
          ? 'NativeNotificationPort permission / delivery receipt'
          : 'DesktopChromeController latest locale / serialized native receipt',
      ],
      flow: notification
        ? 'operating-system renderer / bounded UTF-8 payload'
        : systemAction
          ? 'operating-system standard button renderer and locale'
          : entry.id === 'close-confirmation-message'
            ? 'operating-system wrapped paragraphs / 4000 UTF-16 units'
            : 'operating-system renderer / 127 UTF-16 units; no source truncation',
      lumenMapping: 'native platform adapter with host-owned copy',
      status: owned ? 'composed' : 'pending',
      issues: owned ? [] : ['native-platform-contract-pending'],
    }
  })
}
