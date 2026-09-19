import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'

const instanceId = z.string().min(1).max(160)
const section = z.enum(['dashboard', 'usage', 'git'])
export const performanceWindowSchema = z.enum(['2m', '15m', '1h'])
export const performanceTargetSchema = z.enum(['all', 'system', 'host'])
const summary = z.strictObject({
  instanceId,
  section,
  status: z.enum(['loading', 'ready', 'error']),
  error: z.string().nullable(),
})
const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.status-workspace',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  category: 'monitoring.performance',
  scope: 'client' as const,
  visibility: 'internal' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as ('api' | 'palette' | 'cli' | 'tui')[],
})

export const statusWorkspaceCommands = {
  'statusWorkspace.refresh': defineCommand(
    metadata('statusWorkspace.refresh'),
    z.strictObject({ instanceId }),
    summary,
  ),
  'statusWorkspace.setPerformanceQuery': defineCommand(
    metadata('statusWorkspace.setPerformanceQuery'),
    z.strictObject({ instanceId, window: performanceWindowSchema, target: performanceTargetSchema }),
    summary,
  ),
}

export type PerformanceWindow = z.output<typeof performanceWindowSchema>
export type PerformanceTarget = z.output<typeof performanceTargetSchema>
