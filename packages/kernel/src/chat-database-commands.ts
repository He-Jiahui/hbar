import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { chatDatabaseCommands } from '@hbar/contracts/commands/chat-database'
import type { ChatDatabaseStatisticsService } from './chat-database-statistics'

export function createChatDatabaseCommands(statistics: ChatDatabaseStatisticsService) {
  const registry = new CommandRegistry({ execution: 'host', maxConcurrent: 8 })
  registry.register(chatDatabaseCommands['chatDatabase.statistics'], async (input) => {
    try {
      return await statistics.get(input.scope, input.refresh)
    } catch (reason) {
      if (reason instanceof HbarError) throw new CommandError(reason.code, reason.message)
      throw reason
    }
  })
  return {
    ...createCommandClient(chatDatabaseCommands, registry),
    dispatch: (value: unknown, actorId: string) => registry.dispatch(value, { actorId }),
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 100 }),
    dispose: () => registry.dispose(),
  }
}
