import { z } from 'zod'
import { defineCommand, type CommandMetadataInput } from '@hbar/commands/protocol'
import { DEVICE_NAME_MAX_LENGTH, PAIRING_CODE_LENGTH } from '../index'
import { hostInfoSchema } from './system'

const statusSchema = z.enum(['disconnected', 'connecting', 'connected', 'pairing'])
const stateSchema = z.strictObject({ status: statusSchema, host: hostInfoSchema.nullable() })

function metadata(id: string, kind: 'command' | 'query'): CommandMetadataInput {
  return {
    id,
    version: 1,
    owner: 'hbar.client.connection',
    kind,
    execution: 'client',
    stateEffect: kind === 'query' ? 'none' : 'application',
    category: 'system.extensions',
    scope: 'client',
    titleKey: `commands.${id}.title`,
    descriptionKey: `commands.${id}.description`,
    surfaces: ['cli', 'tui', 'api', 'palette'],
  }
}

export const connectionCommands = {
  'connection.status': defineCommand(metadata('connection.status', 'query'), z.strictObject({}), stateSchema),
  'connection.connect': defineCommand(metadata('connection.connect', 'command'), z.strictObject({}), stateSchema),
  'connection.disconnect': defineCommand(metadata('connection.disconnect', 'command'), z.strictObject({}), stateSchema),
  'connection.reconnect': defineCommand(metadata('connection.reconnect', 'command'), z.strictObject({}), stateSchema),
  'pairing.accept': defineCommand(
    {
      ...metadata('pairing.accept', 'command'),
      cli: {
        arguments: [
          { field: 'code', type: 'string', position: 0 },
          { field: 'name', type: 'string', position: 1 },
        ],
      },
    },
    z.strictObject({
      code: z.string().length(PAIRING_CODE_LENGTH).regex(/^\d+$/),
      name: z.string().trim().min(1).max(DEVICE_NAME_MAX_LENGTH),
    }),
    stateSchema,
  ),
}

export type ConnectionCommandState = z.output<typeof stateSchema>
