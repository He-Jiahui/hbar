import { COMMAND_PROTOCOL_VERSION, CommandError, type CommandDescriptor, type ExecuteOptions } from '@hbar/commands'
import type { ClientTransport } from './transport'

/** Generic Host discovery/execution adapter used by application, TUI, and other catalog consumers. */
export function createCommandCatalogClient(client: ClientTransport) {
  return {
    list(input: { readonly after?: string; readonly limit: number }) {
      return client.call('command.catalog', input)
    },
    async execute(
      descriptor: CommandDescriptor,
      input: Readonly<Record<string, unknown>>,
      options: ExecuteOptions = {},
    ) {
      if (descriptor.metadata.execution !== 'host')
        throw new CommandError('INVALID_INPUT', 'The Host catalog adapter only executes Host commands')
      if (options.version !== undefined && options.version !== descriptor.metadata.version)
        throw new CommandError('VERSION_MISMATCH', 'Command version does not match the catalog descriptor')
      if (descriptor.metadata.idempotency === 'required' && !options.idempotencyKey)
        throw new CommandError('INVALID_INPUT', 'An idempotency key is required for this command')
      return await client.call('command.execute', {
        protocol: COMMAND_PROTOCOL_VERSION,
        requestId: options.requestId ?? crypto.randomUUID(),
        commandId: descriptor.metadata.id,
        commandVersion: descriptor.metadata.version,
        ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
        input,
      })
    },
  }
}
