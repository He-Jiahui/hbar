import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema } from '../index'

const instanceId = z.string().min(1).max(160)
const field = z.enum(['objective', 'modelId', 'title', 'tokenBudget', 'thinkingLevel', 'approval'])
const summary = z.strictObject({
  instanceId,
  parentSessionId: idSchema,
  view: z.enum(['list', 'create', 'detail']),
  selectedAgentId: idSchema.nullable(),
  status: z.enum(['loading', 'ready', 'error']),
  itemCount: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  creationStatus: z.enum(['idle', 'submitting', 'succeeded', 'failed', 'unknown']),
  error: z.string().nullable(),
})
const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.agent-workspace',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  category: 'agent.goal.plan',
  scope: 'client' as const,
  visibility: 'internal' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as ('api' | 'palette' | 'cli' | 'tui')[],
})

export const agentWorkspaceCommands = {
  'agentWorkspace.refresh': defineCommand(metadata('agentWorkspace.refresh'), z.strictObject({ instanceId }), summary),
  'agentWorkspace.loadMore': defineCommand(
    metadata('agentWorkspace.loadMore'),
    z.strictObject({ instanceId }),
    summary,
  ),
  'agentWorkspace.showList': defineCommand(
    metadata('agentWorkspace.showList'),
    z.strictObject({ instanceId }),
    summary,
  ),
  'agentWorkspace.showCreate': defineCommand(
    metadata('agentWorkspace.showCreate'),
    z.strictObject({ instanceId }),
    summary,
  ),
  'agentWorkspace.showAgent': defineCommand(
    metadata('agentWorkspace.showAgent'),
    z.strictObject({ instanceId, agentId: idSchema }),
    summary,
  ),
  'agentWorkspace.setField': defineCommand(
    metadata('agentWorkspace.setField'),
    z.strictObject({ instanceId, field, value: z.string().max(4_000) }),
    summary,
  ),
  'agentWorkspace.create': defineCommand(metadata('agentWorkspace.create'), z.strictObject({ instanceId }), summary),
  'agentWorkspace.cancel': defineCommand(
    metadata('agentWorkspace.cancel'),
    z.strictObject({ instanceId, agentId: idSchema }),
    summary,
  ),
}
