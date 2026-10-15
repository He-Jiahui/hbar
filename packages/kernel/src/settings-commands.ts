import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { settingsCommands } from '@hbar/contracts/commands/settings'
import { encodePath } from '@hbar/schema-core'
import type { SettingsService } from './settings-service'

export function createSettingsCommands(service: SettingsService) {
  const registry = new CommandRegistry({ execution: 'host' })
  const translate = async <Value>(operation: () => Promise<Value>): Promise<Value> => {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  }
  registry.register(settingsCommands['settings.describe'], () => service.describe())
  registry.register(settingsCommands['settings.get'], async ({ scope, path }) => {
    const snapshot = await translate(() => service.get(scope))
    if (!path) return settingsCommands['settings.get'].output.parse(snapshot)
    const encoded = encodePath(path)
    const report = snapshot.resolution.reports[encoded]
    if (!report) throw new CommandError('COMMAND_NOT_FOUND', 'Setting path is not registered')
    return settingsCommands['settings.get'].output.parse({
      ...snapshot,
      resolution: { ...snapshot.resolution, reports: { [encoded]: report } },
    })
  })
  registry.register(settingsCommands['settings.receipt'], (input, context) => {
    if (!context.actorId) throw new CommandError('INVALID_INPUT', 'Authenticated actor is required')
    const request = (() => {
      if (input.commandId === 'settings.apply') return settingsCommands['settings.apply'].input.parse(input.input)
      if (input.commandId === 'settings.set') {
        const original = settingsCommands['settings.set'].input.parse(input.input)
        return { ...original, changes: [{ op: 'set' as const, path: original.path, value: original.value }] }
      }
      const original = settingsCommands['settings.unset'].input.parse(input.input)
      return { ...original, changes: [{ op: 'unset' as const, path: original.path }] }
    })()
    return translate(async () =>
      settingsCommands['settings.receipt'].output.parse(
        await service.getReceipt(request.scope, context.actorId!, input.idempotencyKey, request),
      ),
    )
  })
  const execute = (
    input: {
      schemaVersion: number
      scope: Parameters<SettingsService['get']>[0]
      baselineRevisions: Record<string, number>
    },
    changes: Parameters<SettingsService['apply']>[0]['changes'],
    context: { actorId?: string; idempotencyKey?: string },
  ) => {
    if (!context.actorId || !context.idempotencyKey)
      throw new CommandError('INVALID_INPUT', 'Authenticated actor and idempotency key are required')
    return translate(async () =>
      settingsCommands['settings.apply'].output.parse(
        await service.apply({ ...input, changes, actorId: context.actorId!, idempotencyKey: context.idempotencyKey! }),
      ),
    )
  }
  registry.register(settingsCommands['settings.apply'], (input, context) => execute(input, input.changes, context), {
    durable: true,
  })
  registry.register(
    settingsCommands['settings.set'],
    (input, context) => execute(input, [{ op: 'set', path: input.path, value: input.value }], context),
    { durable: true },
  )
  registry.register(
    settingsCommands['settings.unset'],
    (input, context) => execute(input, [{ op: 'unset', path: input.path }], context),
    { durable: true },
  )
  return {
    ...createCommandClient(settingsCommands, registry),
    dispatchPrepared: registry.dispatchPrepared.bind(registry),
    dispatchPreparedTracked: registry.dispatchPreparedTracked.bind(registry),
    dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 500 }),
    dispose: () => registry.dispose(),
  }
}
