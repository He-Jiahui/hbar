import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { usageCommands } from '@hbar/contracts/commands/usage'
import { UsageServiceError, type UsageService } from '@hbar/usage'

export function createUsageCommands(service: UsageService) {
  const registry = new CommandRegistry({ execution: 'host' })
  registry.register(usageCommands['usage.query'], async (input) => {
    try {
      return await service.query(input)
    } catch (error) {
      if (error instanceof UsageServiceError || error instanceof HbarError)
        throw new CommandError(error.code, error.message)
      throw error
    }
  })
  registry.register(usageCommands['usage.export'], async (input) => {
    try {
      return await service.export(input)
    } catch (error) {
      if (error instanceof UsageServiceError || error instanceof HbarError)
        throw new CommandError(error.code, error.message)
      throw error
    }
  })
  return {
    ...createCommandClient(usageCommands, registry),
    dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 500 }),
    dispose: () => registry.dispose(),
  }
}
