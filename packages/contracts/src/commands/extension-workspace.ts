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
