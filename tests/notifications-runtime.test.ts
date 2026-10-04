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
  test('a new live event still reaches desktop listeners when an invalidation snapshot arrives first', async () => {
    let version = 1
    const port: NotificationsPort = {
      page: async () => ({
        items: version === 1 ? [item('base')] : [item('new'), item('base')],
        nextCursor: null,
        unreadCount: version,
        watermark: version,
      }),
      preferences: async () => prefs,
      markRead: async () => item('base', 2),
      markAllRead: async () => ({ updated: 0 }),
      setPreferences: async (value) => value,
    }
    const runtime = createNotificationsRuntime(port)
    await runtime.refresh()
    const delivered: string[] = []
    runtime.subscribeFreshNotification((record) => delivered.push(record.id))
    version = 2
    await runtime.refresh()
    runtime.acceptFreshNotification({ sourceEventId: 'event-new', sequence: 2, record: item('new') })
    runtime.acceptFreshNotification({ sourceEventId: 'event-new', sequence: 2, record: item('new') })
    expect(delivered).toEqual(['new'])
    expect(runtime.reader.getSnapshot().unreadCount).toBe(2)
    expect(runtime.reader.getSnapshot().items.map((record) => record.id)).toEqual(['new', 'base'])
    runtime.acceptFreshNotification({ sourceEventId: 'event-old', sequence: 1, record: item('old') })
    expect(delivered).toEqual(['new'])
    runtime.dispose()
  })

  test('a fresh record outside the loaded page is already included at the refreshed Host watermark', async () => {
    let watermark = 1
    const port: NotificationsPort = {
      page: async () => ({ items: [item('base')], nextCursor: 'more', unreadCount: watermark, watermark }),
      preferences: async () => prefs,
      markRead: async () => item('base', 2),
      markAllRead: async () => ({ updated: 0 }),
      setPreferences: async (value) => value,
    }
    const runtime = createNotificationsRuntime(port)
    await runtime.refresh()
    runtime.acceptFreshNotification({ sourceEventId: 'event-outside', sequence: 2, record: item('outside') })
    expect(runtime.reader.getSnapshot().unreadCount).toBe(2)
    watermark = 2
    await runtime.refresh()
    expect(runtime.reader.getSnapshot().unreadCount).toBe(2)
    expect(runtime.reader.getSnapshot().items.map((entry) => entry.id)).toEqual(['base'])
    runtime.dispose()
  })
  test('unknown write reconciles by receipt without replay and keeps null pending', async () => {
    let writes = 0
    let receiptCalls = 0
    const port: NotificationsPort = {
      page: async () => ({ items: [item('one')], nextCursor: null, unreadCount: 1 }),
      preferences: async () => prefs,
      markRead: async () => {
        writes++
        throw new Error('disconnected')
      },
      markAllRead: async () => ({ updated: 0 }),
      setPreferences: async (value) => value,
      receipt: async () => {
        receiptCalls++
        return null
      },
    }
    const runtime = createNotificationsRuntime(port)
    await runtime.refresh()
    await expect(runtime.markRead('one', true)).rejects.toThrow()
    await expect(runtime.reconcile()).rejects.toThrow()
    await expect(runtime.markRead('one', true)).rejects.toMatchObject({ code: 'BUSY' })
    expect(writes).toBe(1)
    expect(receiptCalls).toBe(1)
    runtime.dispose()
  })

  test('fresh read state and mark-all do not resurrect unread overlay', async () => {
    let current = item('one')
    const port: NotificationsPort = {
      page: async () => ({ items: [current], nextCursor: null, unreadCount: current.readAt === null ? 1 : 0 }),
      preferences: async () => prefs,
      markRead: async ({ id, read }) => {
        current = { ...current, readAt: read ? 2 : null }
        return id === 'new' ? item('new', read ? 2 : null) : current
      },
      markAllRead: async () => {
        current = { ...current, readAt: 3 }
        return { updated: 1 }
      },
      setPreferences: async (value) => value,
    }
    const runtime = createNotificationsRuntime(port)
    await runtime.refresh()
    runtime.acceptFreshNotification({ sourceEventId: 'event-new', record: item('new') })
    await runtime.markRead('new', true)
    expect(runtime.reader.getSnapshot().unreadCount).toBe(1)
    await runtime.markAllRead()
    expect(runtime.reader.getSnapshot().unreadCount).toBe(0)
    expect(runtime.reader.getSnapshot().items.every((entry) => entry.readAt !== null)).toBe(true)
    runtime.dispose()
  })

  test('watermark prevents double counting fresh already included in host unread count', async () => {
    const port: NotificationsPort = {
      page: async () => ({ items: [item('page')], nextCursor: null, unreadCount: 2, watermark: 10 }),
      preferences: async () => prefs,
      markRead: async () => item('page', 2),
      markAllRead: async () => ({ updated: 0 }),
      setPreferences: async (value) => value,
    }
    const runtime = createNotificationsRuntime(port)
    await runtime.refresh()
    runtime.acceptFreshNotification({ sourceEventId: 'event-old', sequence: 9, record: item('old') })
    runtime.acceptFreshNotification({ sourceEventId: 'event-new', sequence: 11, record: item('new') })
    expect(runtime.reader.getSnapshot().unreadCount).toBe(3)
    await runtime.refresh()
    expect(runtime.reader.getSnapshot().unreadCount).toBe(3)
    runtime.dispose()
  })

  test('mark-all refresh preserves a fresh event created after the confirmed watermark', async () => {
    let calls = 0
    const port: NotificationsPort = {
      page: async () => {
        calls++
        return calls === 1
          ? { items: [item('base')], nextCursor: null, unreadCount: 1, watermark: 1 }
          : { items: [item('base', 10), item('after')], nextCursor: null, unreadCount: 1, watermark: 2 }
      },
      preferences: async () => prefs,
      markRead: async () => item('base', 10),
      markAllRead: async () => ({ updated: 1 }),
      setPreferences: async (value) => value,
    }
    const runtime = createNotificationsRuntime(port)
    await runtime.refresh()
    const all = runtime.markAllRead()
    runtime.acceptFreshNotification({ sourceEventId: 'event-after', sequence: 2, record: item('after') })
    await all
    expect(runtime.reader.getSnapshot().items.find((entry) => entry.id === 'after')?.readAt).toBeNull()
    expect(runtime.reader.getSnapshot().unreadCount).toBe(1)
    runtime.dispose()
  })

  test('legacy pages use the host unread count without adding unsequenced fresh events', async () => {
    const port: NotificationsPort = {
      page: async () => ({ items: [item('base')], nextCursor: null, unreadCount: 2 }),
      preferences: async () => prefs,
      markRead: async () => item('base', 1),
      markAllRead: async () => ({ updated: 0 }),
      setPreferences: async (value) => value,
    }
    const runtime = createNotificationsRuntime(port)
    await runtime.refresh()
    runtime.acceptFreshNotification({ sourceEventId: 'event-legacy', record: item('legacy') })
    await runtime.refresh()
    expect(runtime.reader.getSnapshot().unreadCount).toBe(2)
    runtime.dispose()
  })
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
