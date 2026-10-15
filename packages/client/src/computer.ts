import { CommandError, createCommandClient, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { computerCommands } from '@hbar/contracts/commands/computer'
import type { ClientTransport } from './transport'

const externalCommands = new Set([
  'computer.click',
  'computer.doubleClick',
  'computer.type',
  'computer.key',
  'computer.scroll',
  'computer.move',
  'computer.wait',
  'computer.launch',
])

export function createComputerCommandClient(client: ClientTransport) {
  return createCommandClient(computerCommands, {
    async execute(commandId, input, options) {
      try {
        return await client.call(
          'command.execute',
          {
            protocol: COMMAND_PROTOCOL_VERSION,
            requestId: options?.requestId ?? crypto.randomUUID(),
            commandId,
            commandVersion: options?.version ?? 1,
            input,
          },
          { signal: options?.signal },
        )
      } catch (error) {
        if (
          externalCommands.has(commandId) &&
          error instanceof HbarError &&
          ['DISCONNECTED', 'TIMEOUT'].includes(error.code)
        )
          throw new CommandError('RESULT_UNKNOWN', 'Computer action response was lost; inspect computer state')
        throw error
      }
    },
  })
}
