import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { NOTIFICATION_SCHEMA_SQL, createNotificationStorage } from '../packages/storage/src/notifications'
import { createNotificationService } from '../packages/kernel/src/notification-service'
import type { NotificationPreferences } from '../packages/contracts/src/commands/notifications'

const record = (id: string, sourceEventId: string, createdAt: number) => ({
  id,
  sourceEventId,
  kind: 'run.completed' as const,
  title: `Run ${id}`,
  detail: 'done',
  createdAt,
  readAt: null,
  target: { kind: 'session' as const, workspaceId: 'workspace', sessionId: 'session', runId: id },
})

describe('notifications storage', () => {
  test('replays durable writes, rejects payload conflicts, and restores receipts after reopen', () => {
    const directory = mkdtempSync(join(tmpdir(), 'hbar-notification-receipt-'))
    const path = join(directory, 'notifications.sqlite')
    const identity = { actorId: 'device-a', idempotencyKey: 'read-1' }
    try {
      const firstDb = new Database(path)
      firstDb.exec(NOTIFICATION_SCHEMA_SQL)
      const first = createNotificationStorage(firstDb)
      first.insert(record('n1', 'e1', 1))
      const initial = first.markRead('n1', 123, identity)
      expect(first.markRead('n1', 123, identity)).toEqual(initial)
      firstDb.close()

      const reopenedDb = new Database(path)
      reopenedDb.exec(NOTIFICATION_SCHEMA_SQL)
      const reopened = createNotificationStorage(reopenedDb)
      expect(reopened.markRead('n1', 123, identity).readAt).toBe(123)
      expect(() => reopened.markRead('n1', null, identity)).toThrow()
      reopenedDb.close()
    } finally {
      try {
        rmSync(directory, { recursive: true, force: true })
      } catch {
        /* Bun may release SQLite sidecars after the test turn. */
      }
    }
  })
  test('paginates equal timestamps without duplicates', () => {
    const db = new Database(':memory:')
    db.exec(NOTIFICATION_SCHEMA_SQL)
    const storage = createNotificationStorage(db)
    storage.insert(record('b', 'event-b', 100))
    storage.insert(record('a', 'event-a', 100))
    storage.insert(record('c', 'event-c', 99))
    const first = storage.page({ limit: 2 })
    const second = storage.page({ limit: 2, after: first.nextCursor })
    expect(first.items.map((item) => item.id)).toEqual(['b', 'a'])
    expect(second.items.map((item) => item.id)).toEqual(['c'])
    db.close()
  })
  test('rejects malformed cursors and missing notification IDs', () => {
    const db = new Database(':memory:')
    db.exec(NOTIFICATION_SCHEMA_SQL)
    const storage = createNotificationStorage(db)
    expect(() => storage.page({ limit: 2, after: 'not-a-cursor' })).toThrow()
    expect(() => storage.markRead('missing', Date.now())).toThrow()
    db.close()
  })
  test('source event insertion is idempotent', () => {
    const db = new Database(':memory:')
    db.exec(NOTIFICATION_SCHEMA_SQL)
    const storage = createNotificationStorage(db)
    expect(storage.insert(record('a', 'same', 1)).inserted).toBe(true)
    expect(storage.insert(record('b', 'same', 2)).inserted).toBe(false)
    expect(storage.page({}).items[0]?.id).toBe('a')
    db.close()
  })
  test('persists records, read state, preferences, and cursor across reopen', () => {
    const directory = mkdtempSync(join(tmpdir(), 'hbar-notifications-'))
    const path = join(directory, 'notifications.sqlite')
    const preferences: NotificationPreferences = {
      nativeEnabled: true,
      'run.completed': { inApp: false, desktop: true },
      'run.failed': { inApp: true, desktop: false },
      'approval.pending': { inApp: true, desktop: true },
      'schedule.failed': { inApp: false, desktop: false },
    }
    try {
      const firstDb = new Database(path)
      firstDb.exec(NOTIFICATION_SCHEMA_SQL)
      const first = createNotificationStorage(firstDb)
      first.insert(record('persisted', 'source-persisted', 10))
      first.insert(record('later', 'source-later', 9))
      first.markRead('persisted', Date.now())
      first.setPreferences(preferences)
      const page = first.page({ limit: 1 })
      expect(page.items[0]?.id).toBe('persisted')
      firstDb.close()

      const reopenedDb = new Database(path)
      reopenedDb.exec(NOTIFICATION_SCHEMA_SQL)
      const reopened = createNotificationStorage(reopenedDb)
      expect(reopened.insert(record('duplicate', 'source-persisted', 11)).inserted).toBe(false)
      expect(reopened.page({ limit: 1 }).items[0]?.readAt).not.toBeNull()
      expect(reopened.page({ limit: 1 }).unreadCount).toBe(1)
      expect(reopened.preferences()).toEqual(preferences)
      reopenedDb.close()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})

describe('notification service', () => {
  test('publishes invalidation after durable writes', async () => {
    const calls: string[] = []
    const preferences: NotificationPreferences = {
      nativeEnabled: false,
      'run.completed': { inApp: true, desktop: true },
      'run.failed': { inApp: true, desktop: true },
      'approval.pending': { inApp: true, desktop: true },
      'schedule.failed': { inApp: true, desktop: true },
    }
    const storage = {
      insertNotification: async (value: ReturnType<typeof record>) => {
        calls.push('insert')
        return { record: value, inserted: true }
      },
      notificationPage: async () => ({ items: [], nextCursor: null, unreadCount: 0 }),
      notificationBySourceEvent: async () => null,
      markNotificationRead: async (id: string) => ({ ...record(id, id, 1), readAt: Date.now() }),
      markAllNotificationsRead: async () => 1,
      notificationPreferences: async () => preferences,
      setNotificationPreferences: async (value: NotificationPreferences) => value,
      notificationReceipt: async () => null,
    }
    const events: string[] = []
    const service = createNotificationService({ storage, publish: (event) => events.push(event.params.kind) })
    await service.record({
      sourceEventId: 'event',
      kind: 'run.completed',
      title: 'Run',
      detail: '',
      target: { kind: 'session', workspaceId: 'w', sessionId: 's' },
    })
    expect(events).toEqual(['notifications'])
    expect(calls[0]).toBe('insert')
  })
})
