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
  if (typeof scope !== 'object' || scope === null) return null
  const bridge: unknown = Reflect.get(scope, '__TAURI_INTERNALS__')
  if (typeof bridge !== 'object' || bridge === null) return null
  const invoke: unknown = Reflect.get(bridge, 'invoke')
  if (typeof invoke !== 'function') return null
  return {
    invoke: async (command, args) => {
      const value: unknown = Reflect.apply(invoke, bridge, args === undefined ? [command] : [command, args])
      return await value
    },
  }
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
