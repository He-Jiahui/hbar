import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { settingsScopeSchema, type SettingsFieldDescription } from './settings'
import { chatDatabaseMaintenanceCommands } from './chat-database-maintenance'
import { chatDatabaseDraftCommands } from './chat-database-drafts'
import { chatDatabaseTaskCommands } from './chat-database-tasks'
export * from './chat-database-maintenance'
export * from './chat-database-drafts'
export * from './chat-database-tasks'

const bytes = z.number().int().nonnegative().safe()
export const CHAT_DATABASE_PAGE_SIZE = 50
export const CHAT_DATABASE_MAX_PAGE_SIZE = 100
export const CHAT_DATABASE_PREVIEW_TTL_MS = 5 * 60_000
export const CHAT_DATABASE_REFRESH_MS = 30_000
export const CHAT_DATABASE_CAPACITY_TARGET = 0.9

export const chatDatabasePolicySchema = z.strictObject({
  retentionDays: z.number().int().min(1).max(36_500),
  archivedOnly: z.boolean(),
  autoEnabled: z.boolean(),
  scheduleEnabled: z.boolean(),
  scheduleKind: z.enum(['daily', 'weekly']),
  scheduleHour: z.number().int().min(0).max(23),
  scheduleMinute: z.number().int().min(0).max(59),
  scheduleWeekdays: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .max(7)
    .refine((days) => new Set(days).size === days.length, 'Weekdays must be unique'),
  timezone: z
    .string()
    .min(1)
    .max(80)
    .refine((timezone) => {
      if (/^[+-]/.test(timezone)) return false
      try {
        new Intl.DateTimeFormat('en', { timeZone: timezone }).format(0)
        return true
      } catch {
        return false
      }
    }, 'Choose a valid IANA timezone'),
  capacityEnabled: z.boolean(),
  capacityLimitMiB: z.number().int().min(1).max(1_048_576),
  capacityFirst: z.boolean(),
  cacheRetentionDays: z.number().int().min(0).max(36_500),
  attachmentRetentionDays: z.number().int().min(1).max(36_500),
})
export type ChatDatabasePolicy = z.output<typeof chatDatabasePolicySchema>
export const DEFAULT_CHAT_DATABASE_POLICY: Readonly<ChatDatabasePolicy> = Object.freeze({
  retentionDays: 90,
  archivedOnly: true,
  autoEnabled: false,
  scheduleEnabled: true,
  scheduleKind: 'daily',
  scheduleHour: 3,
  scheduleMinute: 0,
  scheduleWeekdays: [0],
  timezone: 'Asia/Shanghai',
  capacityEnabled: false,
  capacityLimitMiB: 1024,
  capacityFirst: false,
  cacheRetentionDays: 7,
  attachmentRetentionDays: 7,
})

/** Host-owned field metadata; views use the existing settings draft and CAS contract. */
export const chatDatabaseSettingsFields: readonly SettingsFieldDescription[] = Object.entries(
  DEFAULT_CHAT_DATABASE_POLICY,
).map(([name, defaultValue], index) => {
  const multiple = name === 'scheduleWeekdays'
  const type =
    multiple || typeof defaultValue === 'number' ? 'integer' : typeof defaultValue === 'boolean' ? 'boolean' : 'string'
  const bounds =
    name === 'retentionDays' || name === 'attachmentRetentionDays'
      ? { minimum: 1, maximum: 36_500 }
      : name === 'cacheRetentionDays'
        ? { minimum: 0, maximum: 36_500 }
        : name === 'scheduleHour'
          ? { minimum: 0, maximum: 23 }
          : name === 'scheduleMinute'
            ? { minimum: 0, maximum: 59 }
            : name === 'capacityLimitMiB'
              ? { minimum: 1, maximum: 1_048_576 }
              : multiple
                ? { minimum: 0, maximum: 6 }
                : {}
  const schedule = ['scheduleKind', 'scheduleHour', 'scheduleMinute', 'scheduleWeekdays', 'timezone'].includes(name)
  const capacity = name === 'capacityLimitMiB' || name === 'capacityFirst'
  const visibleWhen =
    schedule || capacity
      ? {
          all: [
            {
              path: [
                { kind: 'field' as const, name: `chatDatabase.${schedule ? 'scheduleEnabled' : 'capacityEnabled'}` },
              ],
              equals: true,
            },
            ...(multiple
              ? [{ path: [{ kind: 'field' as const, name: 'chatDatabase.scheduleKind' }], equals: 'weekly' }]
              : []),
          ],
        }
      : undefined
  return {
    path: [{ kind: 'field' as const, name: `chatDatabase.${name}` }],
    ...(visibleWhen ? { visibleWhen } : {}),
    type,
    nullable: false,
    defaultValue,
    multiple,
    allowedScopes:
      name === 'cacheRetentionDays' || name === 'attachmentRetentionDays'
        ? ['global']
        : ['global', 'workspace', 'session'],
    applyMode: 'immediate',
    group: 'chatDatabase',
    order: index * 10,
    component: multiple
      ? 'MultiSelect'
      : type === 'boolean'
        ? 'Switch'
        : name === 'scheduleKind'
          ? 'PopupSelect'
          : type === 'integer'
            ? 'NumberField'
            : 'TextField',
    labelKey: `i18n:settings.chatDatabase.${name}.label`,
    helpKey: `i18n:settings.chatDatabase.${name}.help`,
    ...(name === 'scheduleKind' ? { choices: ['daily', 'weekly'] } : {}),
    ...(multiple ? { choices: [0, 1, 2, 3, 4, 5, 6] } : {}),
    ...bounds,
  }
})

export const chatDatabaseCacheCategorySchema = z.enum([
  'models',
  'pluginBuild',
  'pluginExtract',
  'markdown',
  'mermaid',
  'attachments',
  'tmp',
  'protected',
])
export type ChatDatabaseCacheCategory = z.output<typeof chatDatabaseCacheCategorySchema>
export const chatDatabaseDiskUsageSchema = z.strictObject({
  databaseBytes: bytes,
  walBytes: bytes,
  shmBytes: bytes,
  logBytes: bytes,
  attachmentBytes: bytes,
  cacheBytes: bytes,
  scopedLogBytes: bytes,
  scopedAttachmentBytes: bytes,
  cacheCategories: z
    .array(
      z.strictObject({
        id: chatDatabaseCacheCategorySchema,
        bytes,
        clearable: z.boolean(),
      }),
    )
    .max(8),
  complete: z.boolean(),
  issues: z
    .array(z.strictObject({ category: z.enum(['database', 'logs', 'attachments', 'cache']), code: z.string().max(80) }))
    .max(32),
})
export type ChatDatabaseDiskUsage = z.output<typeof chatDatabaseDiskUsageSchema>
export const chatDatabaseUsageSchema = z.strictObject({
  sessionCount: bytes,
  archivedCount: bytes,
  messageCount: bytes,
  contentBytes: bytes,
  logicalBytes: bytes,
  lastActivityAt: bytes.nullable(),
  freePageBytes: bytes,
  revision: bytes,
  complete: z.boolean(),
})
export type ChatDatabaseUsage = z.output<typeof chatDatabaseUsageSchema>
export const chatDatabaseStatisticsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  scope: settingsScopeSchema,
  sampledAt: bytes,
  status: z.enum(['scanning', 'ready', 'error']),
  complete: z.boolean(),
  history: chatDatabaseUsageSchema,
  disk: chatDatabaseDiskUsageSchema,
  totalBytes: bytes,
  totalKind: z.enum(['physical', 'attributable']),
  policy: chatDatabasePolicySchema,
  policyRevisions: z.record(z.string(), bytes),
  error: z.string().max(160).nullable(),
})
export type ChatDatabaseStatistics = z.output<typeof chatDatabaseStatisticsSchema>
export type ChatDatabaseScope = z.output<typeof settingsScopeSchema>

const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.chat-database',
  kind: 'query' as const,
  execution: 'host' as const,
  stateEffect: 'none' as const,
  scope: 'global' as const,
  category: 'system.storage',
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as 'api'[],
})
export const chatDatabaseCommands = {
  ...chatDatabaseMaintenanceCommands,
  ...chatDatabaseDraftCommands,
  ...chatDatabaseTaskCommands,
  'chatDatabase.statistics': defineCommand(
    metadata('chatDatabase.statistics'),
    z.strictObject({ scope: settingsScopeSchema, refresh: z.boolean().default(false) }),
    chatDatabaseStatisticsSchema,
  ),
}
