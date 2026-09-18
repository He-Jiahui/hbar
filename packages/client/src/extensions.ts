import { CommandError, createCommandClient, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { extensionCommands } from '@hbar/contracts/commands/extensions'
import type { ClientTransport } from './transport'

const mutations = new Set(['plugin.set', 'plugin.install', 'plugin.remove', 'plugin.enable', 'plugin.disable'])

export function createExtensionCommandClient(client: ClientTransport) {
  return createCommandClient(extensionCommands, {
    async execute(commandId, input, options) {
      try {
        return await client.call('command.execute', {
          protocol: COMMAND_PROTOCOL_VERSION,
          requestId: options?.requestId ?? crypto.randomUUID(),
          commandId,
          commandVersion: options?.version ?? 1,
          input,
        })
      } catch (error) {
        if (mutations.has(commandId) && error instanceof HbarError && ['DISCONNECTED', 'TIMEOUT'].includes(error.code))
          throw new CommandError('RESULT_UNKNOWN', 'Plugin operation response was lost; query plugin.list before retrying')
        throw error
      }
    },
  })
}
