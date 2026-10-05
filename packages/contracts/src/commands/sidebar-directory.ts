import { defineCommand } from '@hbar/commands/protocol'
import {
  sessionActivityGlobalListInputSchema,
  sessionActivityGlobalPageSchema,
  workspaceSidebarListInputSchema,
  workspaceSidebarPageSchema,
  sessionSidebarPageSchema,
  sessionExecutionGetInputSchema,
  sessionExecutionSnapshotSchema,
  sessionAgentChildrenInputSchema,
  sessionAgentChildrenPageSchema,
  sessionAgentAncestorsInputSchema,
  sessionAgentAncestorsSchema,
} from '../state/sidebar-directory'
import { sessionActivityListInputSchema } from '../state/directory'

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
  'session.agentChildren.list': defineCommand(
    { ...query('session.agentChildren.list'), scope: 'session' },
    sessionAgentChildrenInputSchema,
    sessionAgentChildrenPageSchema,
  ),
  'session.agentAncestors.get': defineCommand(
    { ...query('session.agentAncestors.get'), scope: 'session' },
    sessionAgentAncestorsInputSchema,
    sessionAgentAncestorsSchema,
  ),
  'session.execution.get': defineCommand(
    {
      ...query('session.execution.get'),
      category: 'session.execution',
      scope: 'workspace',
      cli: {
        arguments: [
          { field: 'sessionId', type: 'string', flag: 'session' },
          { field: 'workspaceId', type: 'string', flag: 'workspace' },
        ],
      },
    },
    sessionExecutionGetInputSchema,
    sessionExecutionSnapshotSchema,
  ),
  'session.sidebar.list': defineCommand(
    {
      ...query('session.sidebar.list'),
      scope: 'workspace',
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
    sessionSidebarPageSchema,
  ),
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
