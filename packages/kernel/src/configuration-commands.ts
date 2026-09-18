import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { configurationCommands } from '@hbar/contracts/commands/configuration'
import type { ModeService } from '@hbar/plugin-sdk'
import type { Kernel } from './index'
import { toModelDescriptor } from './model-commands'

export function createConfigurationCommands(kernel: Kernel, modes: ModeService) {
  const registry = new CommandRegistry({ execution: 'host' })
  const translate = async <Value>(operation: () => Promise<Value>): Promise<Value> => {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  }

  registry.register(configurationCommands['permission.get'], () => ({ mode: kernel.permissionMode() }))
  registry.register(
    configurationCommands['permission.set'],
    ({ mode }) => translate(() => kernel.setPermissionMode(mode)),
    { durable: true },
  )
  registry.register(configurationCommands['mode.get'], ({ sessionId }) => translate(() => modes.get(sessionId)))
  registry.register(
    configurationCommands['mode.set'],
    ({ sessionId, mode }) => translate(() => modes.set(sessionId, mode)),
    { durable: true },
  )
  registry.register(
    configurationCommands['provider.save'],
    ({ provider, apiKey }) => translate(async () => toModelDescriptor(await kernel.saveProvider(provider, apiKey))),
    { durable: true },
  )
  registry.register(
    configurationCommands['provider.delete'],
    ({ id }) =>
      translate(async () => {
        const deleted = (await kernel.models()).some((model) => model.providerId === id)
        if (deleted) await kernel.deleteProvider(id)
        return { deleted }
      }),
    { durable: true },
  )

  return {
    ...createCommandClient(configurationCommands, registry),
    dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 500 }),
    dispose: () => registry.dispose(),
  }
}
