import { expect, test } from 'bun:test'
import {
  createNotificationDesktopDelivery,
  requestNotificationDesktopPermission,
} from '../apps/web/src/notification-desktop-delivery'
import type { NotificationRecord } from '@hbar/contracts/commands/notifications'
import type { NativeNotificationPort, NativeNotification } from '../apps/web/src/native-notifications'

const record: NotificationRecord = {
  id: 'n1',
  sourceEventId: 'e1',
  kind: 'run.completed',
  title: 'Done',
  detail: 'Run finished',
  createdAt: 1,
  readAt: null,
  target: { kind: 'session', workspaceId: 'w1', sessionId: 's1' },
}
function harness() {
  let listener: ((record: NotificationRecord) => void) | undefined
  const runtime = {
    subscribeFreshNotification(fn: (record: NotificationRecord) => void) {
      listener = fn
      return () => {
        listener = undefined
      }
    },
  }
  return {
    runtime,
    emit(value = record) {
      listener?.(value)
    },
  }
}

test('desktop delivery only sends fresh background events and deduplicates source ids', async () => {
  const h = harness()
  const sent: unknown[] = []
  const delivery = createNotificationDesktopDelivery({
    runtime: h.runtime,
    native: {
      isAvailable: true,
      permission: async () => 'Granted',
      requestPermission: async () => 'Granted',
      notify: async (n) => {
        sent.push(n)
        return true
      },
    },
    scope: { visibilityState: 'hidden' },
  })
  delivery.begin()
  h.emit()
  h.emit()
  await Promise.resolve()
  expect(sent).toHaveLength(1)
  delivery.dispose()
})
test('desktop delivery stays quiet while visible and after dispose', async () => {
  const h = harness()
  let count = 0
  const delivery = createNotificationDesktopDelivery({
    runtime: h.runtime,
    native: {
      isAvailable: true,
      permission: async () => 'Granted',
      requestPermission: async () => 'Granted',
      notify: async () => {
        count++
        return true
      },
    },
    scope: { visibilityState: 'visible' },
  })
  delivery.begin()
  h.emit()
  delivery.dispose()
  expect(count).toBe(0)
})
test('permission request only occurs for Prompt', async () => {
  let requested = 0
  const native = {
    isAvailable: true,
    permission: async () => 'Prompt' as const,
    requestPermission: async () => {
      requested++
      return 'Denied' as const
    },
    notify: async () => false,
  }
  expect(await requestNotificationDesktopPermission(native)).toBe('Denied')
  expect(requested).toBe(1)
})

test('native rejection reports false instead of creating an unhandled promise', async () => {
  const h = harness()
  const results: boolean[] = []
  const delivery = createNotificationDesktopDelivery({
    runtime: h.runtime,
    native: {
      isAvailable: true,
      permission: async () => 'Granted',
      requestPermission: async () => 'Granted',
      notify: async () => {
        throw new Error('bridge')
      },
    },
    scope: { visibilityState: 'hidden' },
    onDeliveryResult: (_record, accepted) => results.push(accepted),
  })
  delivery.begin()
  h.emit()
  await Promise.resolve()
  await Promise.resolve()
  expect(results).toEqual([false])
  delivery.dispose()
})

function nativePort(notify: NativeNotificationPort['notify']): NativeNotificationPort {
  return { isAvailable: true, permission: async () => 'Granted', requestPermission: async () => 'Granted', notify }
}

test('a hidden native window delivers with a visible document and retains its original ID and localized copy', async () => {
  const h = harness()
  const sent: NativeNotification[] = []
  const delivery = createNotificationDesktopDelivery({
    runtime: h.runtime,
    native: nativePort(async (notification) => {
      sent.push(notification)
      return true
    }),
    scope: { visibilityState: 'visible', isNativeBackground: async () => true },
    messageCopy: (item) => ({ title: '运行已完成', body: item.detail }),
  })
  delivery.begin()
  h.emit()
  h.emit()
  await Bun.sleep(1)
  expect(sent).toEqual([{ id: record.id, title: '运行已完成', body: record.detail }])
  delivery.dispose()
})

test('disposal fences a pending native visibility reply before OS delivery', async () => {
  const h = harness()
  let resolveVisibility: ((value: boolean) => void) | undefined
  let sent = 0
  const delivery = createNotificationDesktopDelivery({
    runtime: h.runtime,
    native: nativePort(async () => {
      sent++
      return true
    }),
    scope: {
      visibilityState: 'visible',
      isNativeBackground: () =>
        new Promise((resolve) => {
          resolveVisibility = resolve
        }),
    },
  })
  delivery.begin()
  h.emit()
  delivery.dispose()
  resolveVisibility?.(true)
  await Bun.sleep(1)
  expect(sent).toBe(0)
})

test('a burst bounds native checks to four and queued deliveries to 64, with explicit overflow feedback', async () => {
  const h = harness()
  const visibilityReplies: Array<(value: boolean) => void> = []
  const results: boolean[] = []
  let sent = 0
  const delivery = createNotificationDesktopDelivery({
    runtime: h.runtime,
    native: nativePort(async () => {
      sent++
      return true
    }),
    scope: {
      visibilityState: 'visible',
      isNativeBackground: () =>
        new Promise((resolve) => {
          visibilityReplies.push(resolve)
        }),
    },
    onDeliveryResult: (_item, accepted) => results.push(accepted),
  })
  delivery.begin()
  for (let index = 0; index < 70; index++) h.emit({ ...record, id: `n${index}`, sourceEventId: `e${index}` })
  expect(visibilityReplies).toHaveLength(4)
  expect(results).toEqual([false, false])
  delivery.dispose()
  for (const resolve of visibilityReplies) resolve(true)
  await Bun.sleep(1)
  expect(sent).toBe(0)
})
