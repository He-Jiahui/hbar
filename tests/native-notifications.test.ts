import { expect, test } from 'bun:test'
import { createNativeNotificationPort, shouldNotifyWhileHidden } from '../apps/web/src/native-notifications'

test('native notification port is inert outside Tauri', async () => {
  const port = createNativeNotificationPort({}, false)
  expect(port.isAvailable).toBe(false)
  expect(await port.permission()).toBe('Unknown')
  expect(await port.requestPermission()).toBe('Unknown')
  expect(await port.notify({ id: 'event-1', title: 'Done', body: 'Finished' })).toBe(false)
})

test('native notification port maps permission and accepts only boolean delivery receipts', async () => {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = []
  const scope = {
    __TAURI_INTERNALS__: {
      invoke: async (command: string, args?: Record<string, unknown>) => {
        calls.push({ command, args })
        if (command === 'native_notification_permission') return 'Granted'
        if (command === 'request_native_notification_permission') return 'Denied'
        return true
      },
    },
  }
  const port = createNativeNotificationPort(scope, true)
  expect(port.isAvailable).toBe(true)
  expect(await port.permission()).toBe('Granted')
  expect(await port.requestPermission()).toBe('Denied')
  expect(await port.notify({ id: 'event-1', title: 'Done', body: 'Finished' })).toBe(true)
  expect(calls[2]).toEqual({
    command: 'send_native_notification',
    args: { request: { id: 'event-1', title: 'Done', body: 'Finished' } },
  })
})

test('hidden visibility is the only native delivery eligibility signal', () => {
  expect(shouldNotifyWhileHidden({ visibilityState: 'hidden' } as Document)).toBe(true)
  expect(shouldNotifyWhileHidden({ visibilityState: 'visible' } as Document)).toBe(false)
})
