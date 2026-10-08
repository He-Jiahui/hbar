import { readNativeInvokeBridge } from './native-invoke'

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

function permission(value: unknown): NativeNotificationPermission {
  return value === 'Granted' || value === 'Denied' || value === 'Prompt' ? value : 'Unknown'
}

function nativeText(value: string, maximumBytes: number): string {
  const encoder = new TextEncoder()
  if (encoder.encode(value).byteLength <= maximumBytes) return value
  let bytes = 0
  let text = ''
  for (const character of value) {
    const size = encoder.encode(character).byteLength
    if (bytes + size > maximumBytes) break
    bytes += size
    text += character
  }
  return text
}

export function createNativeNotificationPort(scope: unknown, native: boolean): NativeNotificationPort {
  const bridge = native ? readNativeInvokeBridge(scope) : null
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
      const result = await bridge.invoke('send_native_notification', {
        request: {
          id: notification.id,
          title: nativeText(notification.title, 256),
          body: nativeText(notification.body, 4096),
        },
      })
      return result === true
    },
  }
}

export function shouldNotifyWhileHidden(scope: Pick<Document, 'visibilityState'> = document): boolean {
  return scope.visibilityState === 'hidden'
}
