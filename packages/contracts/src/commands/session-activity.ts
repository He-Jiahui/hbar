import { defineCommand } from '@hbar/commands/protocol'
import { sessionActivityListInputSchema, sessionActivityPageSchema } from '../state/directory'

const id = 'session.activity.list'

export const sessionActivityCommands = {
  [id]: defineCommand(
    {
      id,
      version: 1,
      owner: 'hbar.session-activity',
      kind: 'query',
      execution: 'host',
      stateEffect: 'none',
      category: 'workspace.session',
      scope: 'workspace',
      titleKey: `commands.${id}.title`,
      descriptionKey: `commands.${id}.description`,
      surfaces: ['cli', 'tui', 'api', 'palette'],
      cli: {
        arguments: [
          { field: 'workspaceId', type: 'string', flag: 'workspace' },
          { field: 'sortBy', type: 'string', flag: 'sort-by' },
          { field: 'cursor', type: 'json', flag: 'cursor' },
          { field: 'limit', type: 'number', flag: 'limit' },
        ],
      },
    },
    sessionActivityListInputSchema,
    sessionActivityPageSchema,
  ),
}
