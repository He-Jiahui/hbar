import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { settingsScopeSchema } from './settings'
import { chatDatabaseOperationSchema } from './chat-database-maintenance'

const time = z.number().int().nonnegative().safe()
export const chatDatabaseTaskSchema = z.strictObject({
  schemaVersion: z.literal(1),
  scope: settingsScopeSchema,
  explicit: z.boolean(),
  autoEnabled: z.boolean(),
  scheduleEnabled: z.boolean(),
  capacityEnabled: z.boolean(),
  lastDueAt: time.nullable(),
  nextDueAt: time.nullable(),
  lastRunAt: time.nullable(),
  operation: chatDatabaseOperationSchema.nullable(),
  error: z.string().max(160).nullable(),
})
export type ChatDatabaseTask = z.output<typeof chatDatabaseTaskSchema>
export const chatDatabaseTaskCommands = {
  'chatDatabase.task': defineCommand(
    {
      id: 'chatDatabase.task',
      version: 1,
      owner: 'hbar.chat-database',
      kind: 'query',
      execution: 'host',
      stateEffect: 'none',
      scope: 'global',
      category: 'system.storage',
      titleKey: 'commands.chatDatabase.task.title',
      descriptionKey: 'commands.chatDatabase.task.description',
      surfaces: ['api'],
    },
    z.strictObject({ scope: settingsScopeSchema }),
    chatDatabaseTaskSchema,
  ),
}
