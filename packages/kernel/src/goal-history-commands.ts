import { CommandError, type CommandRegistry } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { goalHistoryCommands, goalHistoryPageSchema } from '@hbar/contracts/commands/goal-history'
import type { StoragePort } from '@hbar/storage'

export function registerGoalHistoryCommand(registry: CommandRegistry, storage: StoragePort | undefined): void {
  registry.register(goalHistoryCommands['goal.history'], async (input, context) => {
    if (!storage) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Goal history storage is unavailable')
    if (context.signal.aborted) throw new CommandError('CANCELLED', 'Goal history read was cancelled')
    try {
      const result = await storage.call('goalHistory', input)
      if (context.signal.aborted) throw new CommandError('CANCELLED', 'Goal history read was cancelled')
      const page = goalHistoryPageSchema.safeParse(result)
      const beforeSeq = input.beforeSeq
      if (
        !page.success ||
        page.data.sessionId !== input.sessionId ||
        (input.anchorSeq !== undefined && page.data.anchorSeq !== input.anchorSeq) ||
        (beforeSeq !== undefined && page.data.items.some((item) => item.seq >= beforeSeq)) ||
        page.data.items.length > input.limit
      )
        throw new CommandError('INVALID_OUTPUT', 'Goal history response does not match its query')
      return page.data
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  })
}
