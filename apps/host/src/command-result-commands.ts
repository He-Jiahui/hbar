import { HbarError } from '@hbar/contracts'
import { CommandError, CommandRegistry, createCommandClient, type CommandContext } from '@hbar/commands'
import { commandResultCommands } from '@hbar/contracts/commands/command-results'
import type { CommandReceiptReader } from './command-receipt-reader'

/** Both the network router and Session gateway use this registry and its authenticated context. */
export function createCommandResultCommands(reader: Pick<CommandReceiptReader, 'get' | 'page'>) {
  const registry = new CommandRegistry({ execution: 'host' })
  async function read<Output>(
    context: CommandContext,
    invoke: (actorId: string, signal: AbortSignal) => Promise<Output>,
  ): Promise<Output> {
    if (!context.actorId)
      throw new CommandError('COMMAND_PRINCIPAL_REQUIRED', 'Receipt reads require an authenticated device')
    try {
      return await invoke(context.actorId, context.signal)
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  }
  registry.register(commandResultCommands['command.receipt.get'], (input, context) =>
    read(context, (actorId, signal) => reader.get(actorId, input, signal)),
  )
  registry.register(commandResultCommands['command.result.read'], (input, context) =>
    read(context, (actorId, signal) => reader.page(actorId, input, signal)),
  )
  return {
    ...createCommandClient(commandResultCommands, registry),
    dispatchPrepared: registry.dispatchPrepared.bind(registry),
    dispatchPreparedTracked: registry.dispatchPreparedTracked.bind(registry),
    dispatch: (value: unknown, actorId: string) => registry.dispatch(value, { actorId }),
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 100 }),
    dispose: () => registry.dispose(),
  }
}
