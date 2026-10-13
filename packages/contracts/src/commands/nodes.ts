import { z } from 'zod'
import { defineCommand, type CommandMetadataInput } from '@hbar/commands/protocol'
import { nodeInviteSchema, registeredNodeSchema } from '../node-registry'
import { nodeListInputSchema, nodeListPageSchema } from '../node-management'

const metadata = (
  id: string,
  kind: 'command' | 'query',
  stateEffect: CommandMetadataInput['stateEffect'],
): CommandMetadataInput => ({
  id,
  version: 1,
  owner: 'hbar.nodes',
  kind,
  stateEffect,
  execution: 'host',
  scope: 'global',
  category: 'system.nodes',
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api', 'cli', 'palette'],
})
export const nodeCommands = {
  'node.invite': defineCommand(
    {
      ...metadata('node.invite', 'command', 'application'),
      cli: { arguments: [{ field: 'name', type: 'string', flag: 'name' }] },
    },
    z.strictObject({ name: registeredNodeSchema.shape.name }),
    nodeInviteSchema,
  ),
  'node.list': defineCommand(
    {
      ...metadata('node.list', 'query', 'none'),
      cli: {
        arguments: [
          { field: 'after', type: 'string', flag: 'after' },
          { field: 'limit', type: 'number', flag: 'limit' },
        ],
      },
    },
    nodeListInputSchema,
    nodeListPageSchema,
  ),
  'node.revoke': defineCommand(
    {
      ...metadata('node.revoke', 'command', 'persistent'),
      cli: { arguments: [{ field: 'selector', type: 'string', position: 0 }] },
    },
    z.strictObject({ selector: z.string().min(1).max(160) }),
    registeredNodeSchema,
  ),
} as const
