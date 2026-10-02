import { describe, expect, test } from 'bun:test'
import { createNotificationsRuntime } from '../packages/app-runtime/src/notifications'
import type {
  NotificationPage,
  NotificationPreferences,
  NotificationRecord,
} from '../packages/contracts/src/commands/notifications'
import type { NotificationsPort } from '../packages/app-runtime/src/notifications'

const prefs: NotificationPreferences = {
  nativeEnabled: false,
  'run.completed': { inApp: true, desktop: true },
  'run.failed': { inApp: true, desktop: true },
  'approval.pending': { inApp: true, desktop: true },
  'schedule.failed': { inApp: true, desktop: true },
}
const item = (id: string, readAt: number | null = null): NotificationRecord => ({
  id,
  sourceEventId: `event-${id}`,
  kind: 'run.completed',
  title: id,
  detail: '',
  createdAt: 1,
  readAt,
  target: { kind: 'session', workspaceId: 'w', sessionId: 's' },
})

describe('notifications runtime projection', () => {
  test('late refresh cannot overwrite newer generation', async () => {
    let resolveFirst:
      ((value: { items: NotificationRecord[]; nextCursor: string | null; unreadCount: number }) => void) | undefined
    let call = 0
    const port: NotificationsPort = {
      page: (): Promise<NotificationPage> =>
        ++call === 1
          ? new Promise((resolve) => {
              resolveFirst = resolve
            })
          : Promise.resolve({ items: [item('new')], nextCursor: null, unreadCount: 1 }),
      preferences: async () => prefs,
      markRead: async () => item('new'),
      markAllRead: async () => ({ updated: 1 }),
      setPreferences: async (value: NotificationPreferences) => value,
    }
    const runtime = createNotificationsRuntime(port)
    const first = runtime.refresh()
    await runtime.refresh()
    resolveFirst?.({ items: [item('old')], nextCursor: null, unreadCount: 1 })
    await first
    expect(runtime.reader.getSnapshot().items.map((entry) => entry.id)).toEqual(['new'])
    runtime.dispose()
  })
  test('read state and preference changes project without duplicating records', async () => {
    let current = item('one')
    const port: NotificationsPort = {
      page: async () => ({ items: [current], nextCursor: null, unreadCount: current.readAt === null ? 1 : 0 }),
      preferences: async () => prefs,
      markRead: async ({ read }) => {
        current = { ...current, readAt: read ? 10 : null }
        return current
      },
      markAllRead: async () => ({ updated: 1 }),
      setPreferences: async (value: NotificationPreferences) => value,
    }
    const runtime = createNotificationsRuntime(port)
    await runtime.refresh()
    await runtime.markRead('one', true)
    expect(runtime.reader.getSnapshot().unreadCount).toBe(0)
    await runtime.setPreferences({ ...prefs, 'run.completed': { inApp: false, desktop: true } })
    expect(runtime.reader.getSnapshot().items).toHaveLength(1)
    runtime.dispose()
  })
  test('dispose ignores late reads', async () => {
    let resolve:
      ((value: { items: NotificationRecord[]; nextCursor: string | null; unreadCount: number }) => void) | undefined
    const port: NotificationsPort = {
      page: (): Promise<NotificationPage> =>
        new Promise((done) => {
          resolve = done
        }),
      preferences: async () => prefs,
      markRead: async () => item('x'),
      markAllRead: async () => ({ updated: 0 }),
      setPreferences: async (value: NotificationPreferences) => value,
    }
    const runtime = createNotificationsRuntime(port)
    const read = runtime.refresh()
    runtime.dispose()
    resolve?.({ items: [item('late')], nextCursor: null, unreadCount: 1 })
    await read
    expect(runtime.reader.getSnapshot().items).toEqual([])
  })
  test('fresh events are deduplicated and do not replay history', async () => {
    const port: NotificationsPort = {
      page: async () => ({ items: [item('history')], nextCursor: null, unreadCount: 1 }),
      preferences: async () => prefs,
      markRead: async () => item('history'),
      markAllRead: async () => ({ updated: 0 }),
      setPreferences: async (value: NotificationPreferences) => value,
    }
    const runtime = createNotificationsRuntime(port)
    const fresh: string[] = []
    runtime.subscribeFreshNotification((record) => fresh.push(record.id))
    await runtime.refresh()
    runtime.acceptFreshNotification({ sourceEventId: 'event-history', record: item('history') })
    runtime.acceptFreshNotification({ sourceEventId: 'event-new', record: item('new') })
    runtime.acceptFreshNotification({ sourceEventId: 'event-new', record: item('new') })
    expect(fresh).toEqual(['new'])
    expect(runtime.reader.getSnapshot().items.map((record) => record.id)).toEqual(['new', 'history'])
    runtime.dispose()
  })
})
