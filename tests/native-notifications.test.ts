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
        calls.push(args === undefined ? { command } : { command, args })
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

test('the document visibility helper reports a hidden document', () => {
  expect(shouldNotifyWhileHidden({ visibilityState: 'hidden' } as Pick<Document, 'visibilityState'>)).toBe(true)
  expect(shouldNotifyWhileHidden({ visibilityState: 'visible' } as Pick<Document, 'visibilityState'>)).toBe(false)
})

test('native adapter bounds Unicode text by bytes without changing the stable event ID', async () => {
  let request: unknown
  const port = createNativeNotificationPort(
    {
      __TAURI_INTERNALS__: {
        invoke: async (_command: string, args?: Record<string, unknown>) => {
          request = args?.request
          return true
        },
      },
    },
    true,
  )
  await port.notify({ id: 'original-event', title: '界'.repeat(240), body: '🙂'.repeat(4000) })
  expect(request).toEqual({ id: 'original-event', title: '界'.repeat(85), body: '🙂'.repeat(1024) })
  await port.notify({ id: 'empty-detail', title: 'Done', body: '' })
  expect(request).toEqual({ id: 'empty-detail', title: 'Done', body: '' })
})
