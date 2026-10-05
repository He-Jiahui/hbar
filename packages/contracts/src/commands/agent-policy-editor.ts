import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema } from '../index'
const target = { instanceId: idSchema, parentSessionId: idSchema }
const result = z.strictObject({
  parentSessionId: idSchema,
  status: z.enum(['loading', 'ready', 'saving', 'error', 'unknown']),
  count: z.number().int().min(0).max(32),
  error: z.string().nullable(),
})
const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.agent-policy-editor',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  visibility: 'internal' as const,
  category: 'agent.goal.plan',
  scope: 'client' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as 'api'[],
})
export const agentPolicyEditorCommands = {
  'agentPolicy.load': defineCommand(metadata('agentPolicy.load'), z.strictObject(target), result),
  'agentPolicy.add': defineCommand(metadata('agentPolicy.add'), z.strictObject(target), result),
  'agentPolicy.change': defineCommand(
    metadata('agentPolicy.change'),
    z.strictObject({
      ...target,
      rowId: idSchema,
      field: z.enum(['difficulty', 'modelId', 'thinkingLevel', 'weight']),
      value: z.string().max(160),
    }),
    result,
  ),
  'agentPolicy.remove': defineCommand(
    metadata('agentPolicy.remove'),
    z.strictObject({ ...target, rowId: idSchema }),
    result,
  ),
  'agentPolicy.save': defineCommand(
    metadata('agentPolicy.save'),
    z.strictObject({ ...target, inherit: z.boolean().default(false) }),
    result,
  ),
}
