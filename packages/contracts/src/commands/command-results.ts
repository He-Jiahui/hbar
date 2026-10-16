import { defineCommand, type CommandMetadataInput } from '@hbar/commands/protocol'
import {
  commandReceiptReadInputSchema,
  commandReceiptViewSchema,
  commandResultReadInputSchema,
  commandResultReadOutputSchema,
} from '../command-receipt-read'

const base = {
  version: 1,
  owner: 'hbar.command-results',
  kind: 'query',
  execution: 'host',
  stateEffect: 'none',
  scope: 'session',
  category: 'command.results',
  surfaces: ['cli', 'api'],
} satisfies Partial<CommandMetadataInput>

/** These queries only read the authenticated actor's original receipt; they never acknowledge or replay it. */
export const commandResultCommands = {
  'command.receipt.get': defineCommand(
    {
      ...base,
      id: 'command.receipt.get',
      titleKey: 'commands.command.receipt.get.title',
      descriptionKey: 'commands.command.receipt.get.description',
      cli: {
        arguments: [
          { field: 'operationKey', type: 'string', position: 0, flag: 'operation-key' },
          { field: 'sessionId', type: 'string', flag: 'session' },
        ],
      },
    },
    commandReceiptReadInputSchema,
    commandReceiptViewSchema.nullable(),
  ),
  'command.result.read': defineCommand(
    {
      ...base,
      id: 'command.result.read',
      titleKey: 'commands.command.result.read.title',
      descriptionKey: 'commands.command.result.read.description',
      cli: {
        arguments: [
          { field: 'operationKey', type: 'string', position: 0, flag: 'operation-key' },
          { field: 'sessionId', type: 'string', flag: 'session' },
          { field: 'channel', type: 'string', flag: 'channel' },
          { field: 'offset', type: 'number', flag: 'offset' },
          { field: 'limit', type: 'number', flag: 'limit' },
          { field: 'expectedSha256', type: 'string', flag: 'expected-sha256' },
        ],
      },
    },
    commandResultReadInputSchema,
    commandResultReadOutputSchema,
  ),
}
