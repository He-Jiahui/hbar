import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema } from '../index'
import { workflowStatusSchema } from '../workflow'

const instanceId = z.string().min(1).max(160)
const actionStatus = z.enum(['idle', 'submitting', 'succeeded', 'failed', 'unknown'])
const summary = z.strictObject({
  instanceId,
  sessionId: idSchema,
  status: z.enum(['loading', 'ready', 'error']),
  workflowStatus: workflowStatusSchema.nullable(),
  actionStatus,
  visibleEvidence: z.number().int().nonnegative(),
  error: z.string().nullable(),
})
const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.workflow-workspace',
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

export const workflowWorkspaceCommands = {
  'workflowWorkspace.refresh': defineCommand(
    metadata('workflowWorkspace.refresh'),
    z.strictObject({ instanceId }),
    summary,
  ),
  'workflowWorkspace.loadMoreEvidence': defineCommand(
    metadata('workflowWorkspace.loadMoreEvidence'),
    z.strictObject({ instanceId }),
    summary,
  ),
  'workflowWorkspace.acceptCheck': defineCommand(
    metadata('workflowWorkspace.acceptCheck'),
    z.strictObject({ instanceId, itemId: idSchema, checkId: idSchema, decision: z.enum(['accepted', 'rejected']) }),
    summary,
  ),
  'workflowWorkspace.applyPatch': defineCommand(
    metadata('workflowWorkspace.applyPatch'),
    z.strictObject({ instanceId, agentId: idSchema }),
    summary,
  ),
}
