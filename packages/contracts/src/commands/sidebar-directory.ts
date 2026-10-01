import { defineCommand } from '@hbar/commands/protocol'
import {
  sessionActivityGlobalListInputSchema,
  sessionActivityGlobalPageSchema,
  workspaceSidebarListInputSchema,
  workspaceSidebarPageSchema,
} from '../state/sidebar-directory'

function query(id: string) {
  return {
    id,
    version: 1,
    owner: 'hbar.sidebar-directory',
    kind: 'query' as const,
    execution: 'host' as const,
    stateEffect: 'none' as const,
    category: 'workspace.session',
    scope: 'global' as const,
    titleKey: `commands.${id}.title`,
    descriptionKey: `commands.${id}.description`,
    surfaces: ['cli', 'tui', 'api', 'palette'] as ('cli' | 'tui' | 'api' | 'palette')[],
  }
}

export const sidebarDirectoryCommands = {
  'workspace.sidebar.list': defineCommand(
    {
      ...query('workspace.sidebar.list'),
      cli: {
        arguments: [
          { field: 'organization', type: 'string', flag: 'organization' },
          { field: 'sortBy', type: 'string', flag: 'sort-by' },
          { field: 'locale', type: 'string', flag: 'locale' },
          { field: 'cursor', type: 'json', flag: 'cursor' },
          { field: 'limit', type: 'number', flag: 'limit' },
          { field: 'includeWorkspaceIds', type: 'json', flag: 'include-workspace-ids' },
        ],
      },
    },
    workspaceSidebarListInputSchema,
    workspaceSidebarPageSchema,
  ),
  'session.activity.global.list': defineCommand(
    {
      ...query('session.activity.global.list'),
      cli: {
        arguments: [
          { field: 'cursor', type: 'json', flag: 'cursor' },
          { field: 'limit', type: 'number', flag: 'limit' },
        ],
      },
    },
    sessionActivityGlobalListInputSchema,
    sessionActivityGlobalPageSchema,
  ),
}
