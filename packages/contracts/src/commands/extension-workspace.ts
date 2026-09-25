import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema } from '../index'

const instanceId = z.string().min(1).max(160)
const summary = z.strictObject({
  instanceId,
  status: z.enum(['loading', 'ready', 'error']),
  pluginCount: z.number().int().nonnegative(),
  skillCount: z.number().int().nonnegative(),
  error: z.string().nullable(),
})
const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.extension-workspace',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  category: 'system.extensions',
  scope: 'client' as const,
  visibility: 'internal' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as ('api' | 'palette' | 'cli' | 'tui')[],
})

export const extensionWorkspaceCommands = {
  'extensionWorkspace.inspect': defineCommand(
    metadata('extensionWorkspace.inspect'),
    z.strictObject({ instanceId, pluginId: idSchema }),
    summary,
  ),
  'extensionWorkspace.back': defineCommand(
    metadata('extensionWorkspace.back'),
    z.strictObject({ instanceId }),
    summary,
  ),
  'extensionWorkspace.setQuery': defineCommand(
    metadata('extensionWorkspace.setQuery'),
    z.strictObject({ instanceId, query: z.string().max(200) }),
    summary,
  ),
  'extensionWorkspace.setPage': defineCommand(
    metadata('extensionWorkspace.setPage'),
    z.strictObject({ instanceId, collection: z.enum(['plugins', 'skills']), page: z.number().int().min(0).max(499) }),
    summary,
  ),
  'extensionWorkspace.refresh': defineCommand(
    metadata('extensionWorkspace.refresh'),
    z.strictObject({ instanceId }),
    summary,
  ),
  'extensionWorkspace.setEnabled': defineCommand(
    metadata('extensionWorkspace.setEnabled'),
    z.strictObject({ instanceId, pluginId: idSchema, enabled: z.boolean() }),
    summary,
  ),
}
