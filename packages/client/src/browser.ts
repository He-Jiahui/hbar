import { CommandError, createCommandClient, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { browserCommands } from '@hbar/contracts/commands/browser'
import type { ClientTransport } from './transport'

const externalCommands = new Set([
  'browser.navigate',
  'browser.click',
  'browser.type',
  'browser.press',
  'browser.evaluate',
])

export function createBrowserCommandClient(client: ClientTransport) {
  return createCommandClient(browserCommands, {
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
        if (
          externalCommands.has(commandId) &&
          error instanceof HbarError &&
          ['DISCONNECTED', 'TIMEOUT'].includes(error.code)
        )
          throw new CommandError('RESULT_UNKNOWN', 'Browser action response was lost; inspect browser state')
        throw error
      }
    },
  })
}
