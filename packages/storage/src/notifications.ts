import type { Database } from 'bun:sqlite'
import { HbarError } from '@hbar/contracts'
import { z } from 'zod'
import {
  notificationKindSchema,
  notificationPageInputSchema,
  notificationPreferencesSchema,
  notificationRecordSchema,
  type NotificationPage,
  type NotificationPageInput,
  type NotificationPreferences,
  type NotificationRecord,
} from '@hbar/contracts/commands/notifications'
import { createFeatureCommandReceipts, type FeatureWriteIdentity } from './feature-command-receipts'

export const NOTIFICATION_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS notifications(
  id TEXT PRIMARY KEY,
  sourceEventId TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  readAt INTEGER,
  targetJson TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notifications_created_id ON notifications(createdAt DESC,id DESC);
CREATE INDEX IF NOT EXISTS notifications_unread ON notifications(readAt,createdAt DESC,id DESC);
CREATE TABLE IF NOT EXISTS notification_preferences(kind TEXT PRIMARY KEY, inApp INTEGER NOT NULL, desktop INTEGER NOT NULL);
`

const DEFAULT_PREFERENCES: NotificationPreferences = {
  nativeEnabled: false,
  'run.completed': { inApp: true, desktop: true },
  'run.failed': { inApp: true, desktop: true },
  'approval.pending': { inApp: true, desktop: true },
  'schedule.failed': { inApp: true, desktop: true },
}

export interface NotificationStorage {
  page(input: NotificationPageInput): NotificationPage
  insert(record: NotificationRecord): { record: NotificationRecord; inserted: boolean }
  markRead(id: string, readAt: number | null, identity?: FeatureWriteIdentity): NotificationRecord
  markAllRead(readAt: number, identity?: FeatureWriteIdentity): number
  preferences(): NotificationPreferences
  setPreferences(input: NotificationPreferences, identity?: FeatureWriteIdentity): NotificationPreferences
  receipt(
    commandId: 'notification.markRead' | 'notification.markAllRead' | 'notification.preferences.set',
    input: unknown,
    identity: FeatureWriteIdentity,
  ): unknown | null
}

export function createNotificationStorage(db: Database): NotificationStorage {
  const receipts = createFeatureCommandReceipts(db)
  const rawRowSchema = z.object({
    sequence: z.number().int().nonnegative().optional(),
    id: z.string(),
    sourceEventId: z.string(),
    kind: z.string(),
    title: z.string(),
    detail: z.string(),
    createdAt: z.number(),
    readAt: z.number().nullable(),
    targetJson: z.string(),
  })
  const encodeCursor = (record: NotificationRecord): string => `${record.createdAt}:${record.id}`
  const decodeCursor = (value: string | null): { createdAt: number; id: string } | null => {
    if (!value) return null
    const [time, id] = value.split(':', 2)
    const createdAt = Number(time)
    if (!Number.isSafeInteger(createdAt) || typeof id !== 'string' || id.length === 0)
      throw new HbarError('INVALID_CURSOR', 'Invalid notification cursor')
    return { createdAt, id }
  }
  const parseJson = (value: string): unknown => JSON.parse(value) as unknown
  const rowRecord = (value: unknown): NotificationRecord => {
    const row = rawRowSchema.parse(value)
    return notificationRecordSchema.parse({
      id: row.id,
      sourceEventId: row.sourceEventId,
      kind: row.kind,
      title: row.title,
      detail: row.detail,
      createdAt: row.createdAt,
      readAt: row.readAt ?? null,
      target: parseJson(row.targetJson),
      ...(row.sequence === undefined ? {} : { sequence: row.sequence }),
    })
  }
  const preferenceRowSchema = z.object({ kind: z.string(), inApp: z.number(), desktop: z.number() })
  const readPreferences = (): NotificationPreferences => {
    const result = { ...DEFAULT_PREFERENCES }
    for (const row of db
      .query('SELECT kind,inApp,desktop FROM notification_preferences')
      .all()
      .map((value) => preferenceRowSchema.parse(value))) {
      const kind = notificationKindSchema.safeParse(row.kind)
      if (kind.success) result[kind.data] = { inApp: row.inApp === 1, desktop: row.desktop === 1 }
      else if (row.kind === '__native__') result.nativeEnabled = row.desktop === 1
    }
    return notificationPreferencesSchema.parse(result)
  }
  return {
    page(raw) {
      const input = notificationPageInputSchema.parse(raw)
      const cursor = decodeCursor(input.after)
      const rows = db
        .query(
          `SELECT rowid AS sequence,* FROM notifications WHERE (? = 0 OR readAt IS NULL) AND (? IS NULL OR createdAt < ? OR (createdAt = ? AND id < ?)) ORDER BY createdAt DESC,id DESC LIMIT ?`,
        )
        .all(
          input.unreadOnly ? 1 : 0,
          cursor ? 1 : null,
          cursor?.createdAt ?? null,
          cursor?.createdAt ?? null,
          cursor?.id ?? null,
          input.limit + 1,
        )
      const items = rows.slice(0, input.limit).map(rowRecord)
      const unreadCount = z
        .object({ count: z.number() })
        .parse(db.query('SELECT COUNT(*) AS count FROM notifications WHERE readAt IS NULL').get()).count
      const watermark = z.object({ watermark: z.number() }).parse(db.query('SELECT COALESCE(MAX(rowid),0) AS watermark FROM notifications').get()).watermark
      return {
        items,
        nextCursor: rows.length > input.limit ? (items.at(-1) ? encodeCursor(items.at(-1)!) : null) : null,
        unreadCount,
        watermark,
      }
    },
    insert(record) {
      const existing = db.query('SELECT rowid AS sequence,* FROM notifications WHERE sourceEventId=?').get(record.sourceEventId)
      if (existing) return { record: rowRecord(existing), inserted: false }
      db.query(
        'INSERT INTO notifications(id,sourceEventId,kind,title,detail,createdAt,readAt,targetJson) VALUES(?,?,?,?,?,?,?,?)',
      ).run(
        record.id,
        record.sourceEventId,
        record.kind,
        record.title,
        record.detail,
        record.createdAt,
        record.readAt,
        JSON.stringify(record.target),
      )
      const saved = db.query('SELECT rowid AS sequence,* FROM notifications WHERE id=?').get(record.id)
      if (!saved) throw new Error('Notification insert could not be read')
      return { record: rowRecord(saved), inserted: true }
    },
    markRead(id, readAt, identity) {
      return receipts.run(
        'notification.markRead',
        { id, read: readAt !== null },
        identity,
        notificationRecordSchema,
        () => {
          db.query('UPDATE notifications SET readAt=? WHERE id=?').run(readAt, id)
          const row = db.query('SELECT * FROM notifications WHERE id=?').get(id)
          if (!row) throw new HbarError('NOT_FOUND', 'Notification not found')
          return rowRecord(row)
        },
      )
    },
    markAllRead(readAt, identity) {
      return receipts.run(
        'notification.markAllRead',
        {},
        identity,
        z.strictObject({ updated: z.number().int().nonnegative() }),
        () => ({
          updated: Number(db.query('UPDATE notifications SET readAt=? WHERE readAt IS NULL').run(readAt).changes),
        }),
      ).updated
    },
    preferences: readPreferences,
    setPreferences(input, identity) {
      const parsed = notificationPreferencesSchema.parse(input)
      return receipts.run('notification.preferences.set', parsed, identity, notificationPreferencesSchema, () => {
        const set = db.query(
          'INSERT INTO notification_preferences(kind,inApp,desktop) VALUES(?,?,?) ON CONFLICT(kind) DO UPDATE SET inApp=excluded.inApp,desktop=excluded.desktop',
        )
        for (const kind of notificationKindSchema.options)
          set.run(kind, parsed[kind].inApp ? 1 : 0, parsed[kind].desktop ? 1 : 0)
        set.run('__native__', 0, parsed.nativeEnabled ? 1 : 0)
        return readPreferences()
      })
    },
    receipt(commandId, input, identity) {
      return receipts.lookup({ commandId, input, ...identity })
    },
  }
}
