import { defineCommand } from '@hbar/commands/protocol'
import { workspaceActivityListInputSchema, workspaceActivityPageSchema } from '../state/directory'

const id = 'workspace.activity.list'

export const workspaceActivityCommands = {
  [id]: defineCommand(
    {
      id,
      version: 1,
      owner: 'hbar.workspace-activity',
      kind: 'query',
      execution: 'host',
      stateEffect: 'none',
      category: 'workspace.session',
      scope: 'global',
      titleKey: `commands.${id}.title`,
      descriptionKey: `commands.${id}.description`,
      surfaces: ['cli', 'tui', 'api', 'palette'],
      cli: {
        arguments: [
          { field: 'sortBy', type: 'string', flag: 'sort-by' },
          { field: 'cursor', type: 'json', flag: 'cursor' },
          { field: 'limit', type: 'number', flag: 'limit' },
          { field: 'includeWorkspaceIds', type: 'json', flag: 'include-workspace-ids' },
        ],
      },
    },
    workspaceActivityListInputSchema,
    workspaceActivityPageSchema,
  ),
}
