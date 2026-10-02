import type {
  NotificationCreateInput,
  NotificationPage,
  NotificationPageInput,
  NotificationPreferences,
  NotificationRecord,
  NotificationFreshEvent,
} from '@hbar/contracts/commands/notifications'
import { notificationCreateInputSchema } from '@hbar/contracts/commands/notifications'
export interface NotificationWriteIdentity {
  readonly actorId: string
  readonly idempotencyKey: string
}

export interface NotificationDesktopDeliveryPort {
  deliver(record: NotificationRecord): Promise<void>
}
export interface NotificationServiceOptions {
  readonly storage: {
    insertNotification(record: NotificationRecord): Promise<{ record: NotificationRecord; inserted: boolean }>
    notificationPage(input: NotificationPageInput): Promise<NotificationPage>
    markNotificationRead(
      id: string,
      readAt: number | null,
      identity?: NotificationWriteIdentity,
    ): Promise<NotificationRecord>
    markAllNotificationsRead(readAt: number, identity?: NotificationWriteIdentity): Promise<number>
    notificationPreferences(): Promise<NotificationPreferences>
    setNotificationPreferences(
      input: NotificationPreferences,
      identity?: NotificationWriteIdentity,
    ): Promise<NotificationPreferences>
    notificationReceipt(
      commandId: 'notification.markRead' | 'notification.markAllRead' | 'notification.preferences.set',
      input: unknown,
      identity: NotificationWriteIdentity,
    ): Promise<unknown | null>
  }
  readonly publish?: (event: { method: 'host.changed'; params: { kind: 'notifications' } }) => void
  readonly publishFresh?: (event: NotificationFreshEvent) => void
}
export interface NotificationService {
  record(input: NotificationCreateInput): Promise<{ record: NotificationRecord; inserted: boolean }>
  page(input: NotificationPageInput): Promise<NotificationPage>
  markRead(id: string, read: boolean, identity: NotificationWriteIdentity): Promise<NotificationRecord>
  markAllRead(identity: NotificationWriteIdentity): Promise<{ updated: number }>
  preferences(): Promise<NotificationPreferences>
  setPreferences(input: NotificationPreferences, identity: NotificationWriteIdentity): Promise<NotificationPreferences>
  receipt(
    commandId: 'notification.markRead' | 'notification.markAllRead' | 'notification.preferences.set',
    input: unknown,
    identity: NotificationWriteIdentity,
  ): Promise<unknown | null>
}

export function createNotificationService(options: NotificationServiceOptions): NotificationService {
  return {
    async record(raw) {
      const input = notificationCreateInputSchema.parse(raw)
      const record: NotificationRecord = {
        id: crypto.randomUUID(),
        sourceEventId: input.sourceEventId,
        kind: input.kind,
        title: input.title,
        detail: input.detail,
        createdAt: input.createdAt ?? Date.now(),
        readAt: null,
        target: input.target,
      }
      const result = await options.storage.insertNotification(record)
      if (result.inserted) {
        options.publishFresh?.({ sourceEventId: result.record.sourceEventId, record: result.record, ...(result.record.sequence === undefined ? {} : { sequence: result.record.sequence }) })
        options.publish?.({ method: 'host.changed', params: { kind: 'notifications' } })
      }
      return result
    },
    page: (input) => options.storage.notificationPage(input),
    async markRead(id, read, identity) {
      const result = await options.storage.markNotificationRead(id, read ? Date.now() : null, identity)
      options.publish?.({ method: 'host.changed', params: { kind: 'notifications' } })
      return result
    },
    async markAllRead(identity) {
      const updated = await options.storage.markAllNotificationsRead(Date.now(), identity)
      options.publish?.({ method: 'host.changed', params: { kind: 'notifications' } })
      return { updated }
    },
    preferences: () => options.storage.notificationPreferences(),
    async setPreferences(input, identity) {
      const result = await options.storage.setNotificationPreferences(input, identity)
      options.publish?.({ method: 'host.changed', params: { kind: 'notifications' } })
      return result
    },
    receipt: (commandId, input, identity) => options.storage.notificationReceipt(commandId, input, identity),
  }
}
