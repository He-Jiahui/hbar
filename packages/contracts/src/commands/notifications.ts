import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema } from '../index'

export const notificationKindSchema = z.enum(['run.completed', 'run.failed', 'approval.pending', 'schedule.failed'])
export type NotificationKind = z.infer<typeof notificationKindSchema>
export const notificationTargetSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('session'),
    workspaceId: idSchema,
    sessionId: idSchema,
    runId: idSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal('approval'),
    workspaceId: idSchema,
    sessionId: idSchema,
    runId: idSchema,
    approvalId: idSchema,
  }),
  z.strictObject({ kind: z.literal('schedule'), scheduleId: idSchema, occurrenceId: idSchema.optional() }),
])
export type NotificationTarget = z.infer<typeof notificationTargetSchema>
export const notificationRecordSchema = z.strictObject({
  id: idSchema,
  sourceEventId: idSchema,
  kind: notificationKindSchema,
  title: z.string().min(1).max(240),
  detail: z.string().max(4_000),
  createdAt: z.number().int().nonnegative(),
  readAt: z.number().int().nonnegative().nullable(),
  target: notificationTargetSchema,
  sequence: z.number().int().nonnegative().optional(),
})
export type NotificationRecord = z.infer<typeof notificationRecordSchema>
export const notificationFreshEventSchema = z
  .strictObject({
    record: notificationRecordSchema,
    sourceEventId: idSchema,
    sequence: z.number().int().nonnegative().optional(),
  })
  .refine((value) => value.sourceEventId === value.record.sourceEventId, {
    message: 'Fresh notification sourceEventId must match record.sourceEventId',
    path: ['sourceEventId'],
  })
export type NotificationFreshEvent = z.infer<typeof notificationFreshEventSchema>
export const notificationCreatedWireSchema = z.object({
  method: z.literal('notifications.created'),
  params: notificationFreshEventSchema,
})
export type NotificationCreatedWire = z.infer<typeof notificationCreatedWireSchema>
export const notificationPageInputSchema = z.strictObject({
  after: z.string().max(240).nullable().default(null),
  limit: z.number().int().min(1).max(100).default(40),
  unreadOnly: z.boolean().default(false),
})
export type NotificationPageInput = z.input<typeof notificationPageInputSchema>
export const notificationPageSchema = z.strictObject({
  items: z.array(notificationRecordSchema).max(100),
  nextCursor: z.string().max(160).nullable(),
  unreadCount: z.number().int().nonnegative(),
  watermark: z.number().int().nonnegative().optional(),
})
export type NotificationPage = z.infer<typeof notificationPageSchema>
export const notificationPreferenceSchema = z.strictObject({ inApp: z.boolean(), desktop: z.boolean() })
export const notificationPreferencesSchema = z.strictObject({
  nativeEnabled: z.boolean().default(false),
  'run.completed': notificationPreferenceSchema,
  'run.failed': notificationPreferenceSchema,
  'approval.pending': notificationPreferenceSchema,
  'schedule.failed': notificationPreferenceSchema,
})
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>
export const notificationCreateInputSchema = z.strictObject({
  sourceEventId: idSchema,
  kind: notificationKindSchema,
  title: z.string().min(1).max(240),
  detail: z.string().max(4_000),
  createdAt: z.number().int().nonnegative().optional(),
  target: notificationTargetSchema,
})
export type NotificationCreateInput = z.infer<typeof notificationCreateInputSchema>

const metadata = (id: string, kind: 'query' | 'command', stateEffect: 'none' | 'persistent') => ({
  id,
  version: 1,
  owner: 'hbar.notifications',
  kind,
  execution: 'host' as const,
  stateEffect,
  category: 'notifications',
  scope: 'global' as const,
  ...(kind === 'command' ? { idempotency: 'required' as const } : {}),
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['cli', 'tui', 'api', 'palette'] as ('cli' | 'tui' | 'api' | 'palette')[],
})
export const notificationCommands = {
  'notification.page': defineCommand(
    metadata('notification.page', 'query', 'none'),
    notificationPageInputSchema,
    notificationPageSchema,
  ),
  'notification.markRead': defineCommand(
    metadata('notification.markRead', 'command', 'persistent'),
    z.strictObject({ id: idSchema, read: z.boolean() }),
    notificationRecordSchema,
  ),
  'notification.markAllRead': defineCommand(
    metadata('notification.markAllRead', 'command', 'persistent'),
    z.strictObject({}),
    z.strictObject({ updated: z.number().int().nonnegative() }),
  ),
  'notification.preferences.get': defineCommand(
    metadata('notification.preferences.get', 'query', 'none'),
    z.strictObject({}),
    notificationPreferencesSchema,
  ),
  'notification.preferences.set': defineCommand(
    metadata('notification.preferences.set', 'command', 'persistent'),
    notificationPreferencesSchema,
    notificationPreferencesSchema,
  ),
  'notification.receipt': defineCommand(
    metadata('notification.receipt', 'query', 'none'),
    z.strictObject({
      commandId: z.enum(['notification.markRead', 'notification.markAllRead', 'notification.preferences.set']),
      input: z.union([
        z.strictObject({ id: idSchema, read: z.boolean() }),
        z.strictObject({}),
        notificationPreferencesSchema,
      ]),
      idempotencyKey: z.string().min(1).max(128),
    }),
    z
      .union([
        notificationRecordSchema,
        z.strictObject({ updated: z.number().int().nonnegative() }),
        notificationPreferencesSchema,
      ])
      .nullable(),
  ),
}
