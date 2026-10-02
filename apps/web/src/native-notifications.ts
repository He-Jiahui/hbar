export type NativeNotificationPermission = 'Granted' | 'Denied' | 'Prompt' | 'Unknown'

export interface NativeNotification {
  readonly id: string
  readonly title: string
  readonly body: string
}

export interface NativeNotificationPort {
  readonly isAvailable: boolean
  readonly permission: () => Promise<NativeNotificationPermission>
  readonly requestPermission: () => Promise<NativeNotificationPermission>
  /** Returns true only when the native bridge accepted a new OS delivery. */
  readonly notify: (notification: NativeNotification) => Promise<boolean>
}

interface NativeInvokeBridge {
  readonly invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>
}

function permission(value: unknown): NativeNotificationPermission {
  return value === 'Granted' || value === 'Denied' || value === 'Prompt' ? value : 'Unknown'
}

function invokeBridge(scope: unknown): NativeInvokeBridge | null {
  const bridge = (scope as { readonly __TAURI_INTERNALS__?: NativeInvokeBridge } | null)?.__TAURI_INTERNALS__
  return bridge && typeof bridge.invoke === 'function' ? bridge : null
}

export function createNativeNotificationPort(scope: unknown, native: boolean): NativeNotificationPort {
  const bridge = native ? invokeBridge(scope) : null
  if (!bridge) {
    return {
      isAvailable: false,
      permission: async () => 'Unknown',
      requestPermission: async () => 'Unknown',
      notify: async () => false,
    }
  }
  return {
    isAvailable: true,
    permission: async () => permission(await bridge.invoke('native_notification_permission')),
    requestPermission: async () => permission(await bridge.invoke('request_native_notification_permission')),
    notify: async (notification) => {
      const result = await bridge.invoke('send_native_notification', { request: notification })
      return result === true
    },
  }
}

export function shouldNotifyWhileHidden(scope: Pick<Document, 'visibilityState'> = document): boolean {
  return scope.visibilityState === 'hidden'
}
