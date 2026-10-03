import type { NotificationRecord } from '@hbar/contracts/commands/notifications'
import type { NotificationsRuntime } from '@hbar/app-runtime'
import type { NativeNotification, NativeNotificationPermission, NativeNotificationPort } from './native-notifications'
import { useEffect } from 'react'

export interface NotificationDesktopDeliveryScope {
  readonly visibilityState: Document['visibilityState']
  readonly isNativeBackground?: () => boolean | Promise<boolean>
}

export interface NotificationDesktopDeliveryOptions {
  readonly runtime: Pick<NotificationsRuntime, 'subscribeFreshNotification'>
  readonly native: NativeNotificationPort
  readonly scope?: NotificationDesktopDeliveryScope
  readonly enabled?: (record?: NotificationRecord) => boolean
  readonly onPermission?: (permission: NativeNotificationPermission) => void
  readonly onDeliveryResult?: (record: NotificationRecord, accepted: boolean) => void
  readonly messageCopy?: (record: NotificationRecord) => Pick<NativeNotification, 'title' | 'body'>
}

export interface NotificationDesktopDelivery {
  begin(): void
  end(): void
  dispose(): void
}

function background(scope: NotificationDesktopDeliveryScope): boolean | Promise<boolean> {
  return scope.visibilityState === 'hidden' ? true : (scope.isNativeBackground?.() ?? false)
}

export function createNotificationDesktopDelivery(
  options: NotificationDesktopDeliveryOptions,
): NotificationDesktopDelivery {
  const scope = options.scope ?? (typeof document === 'undefined' ? { visibilityState: 'visible' } : document)
  const seen = new Set<string>()
  const queue: NotificationRecord[] = []
  let inFlight = 0
  let lifetime = 0
  let unsubscribe: (() => void) | undefined
  let disposed = false
  let active = false
  const report = (record: NotificationRecord, accepted: boolean) => {
    try {
      options.onDeliveryResult?.(record, accepted)
    } catch {
      /* isolate a presentation callback */
    }
  }
  const deliver = async (record: NotificationRecord, owner: number) => {
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      const probe = background(scope)
      const eligible =
        typeof probe === 'boolean'
          ? probe
          : await Promise.race([
              probe,
              new Promise<never>((_resolve, reject) => {
                timeout = setTimeout(() => reject(new Error('Native window state query timed out')), 2000)
              }),
            ])
      if (disposed || !active || owner !== lifetime || !eligible || options.enabled?.(record) === false) return
      const copy = options.messageCopy?.(record) ?? { title: record.title, body: record.detail }
      const accepted = await options.native.notify({ id: record.id, ...copy })
      if (!disposed && active && owner === lifetime) report(record, accepted)
    } catch {
      if (!disposed && active && owner === lifetime) report(record, false)
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  }
  const pump = () => {
    while (!disposed && active && inFlight < 4 && queue.length > 0) {
      const record = queue.shift()
      if (!record) return
      inFlight++
      void deliver(record, lifetime).finally(() => {
        inFlight--
        pump()
      })
    }
  }
  const listener = (record: NotificationRecord) => {
    if (disposed || !active || options.enabled?.(record) === false || !options.native.isAvailable) return
    if (seen.has(record.sourceEventId)) return
    seen.add(record.sourceEventId)
    if (seen.size > 400) {
      const oldest = seen.values().next().value
      if (typeof oldest === 'string') seen.delete(oldest)
    }
    if (queue.length >= 64) {
      report(record, false)
      return
    }
    queue.push(record)
    pump()
  }
  return {
    begin() {
      if (disposed || active) return
      lifetime++
      active = true
      unsubscribe = options.runtime.subscribeFreshNotification(listener)
    },
    end() {
      active = false
      lifetime++
      queue.length = 0
      unsubscribe?.()
      unsubscribe = undefined
    },
    dispose() {
      if (disposed) return
      disposed = true
      active = false
      lifetime++
      queue.length = 0
      unsubscribe?.()
      unsubscribe = undefined
      seen.clear()
    },
  }
}

export async function requestNotificationDesktopPermission(
  native: NativeNotificationPort,
): Promise<NativeNotificationPermission> {
  const current = await native.permission()
  if (current === 'Prompt') return native.requestPermission()
  return current
}

export function useNotificationDesktopDelivery(options: NotificationDesktopDeliveryOptions | null): void {
  useEffect(() => {
    if (!options) return undefined
    const delivery = createNotificationDesktopDelivery(options)
    delivery.begin()
    return () => delivery.dispose()
  }, [options])
}
