import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { gitCommitSourceSchema, idSchema } from '../index'

const instanceId = z.string().min(1).max(160)
const section = z.enum(['dashboard', 'usage', 'git'])
export const performanceWindowSchema = z.enum(['2m', '15m', '1h'])
export const performanceTargetSchema = z.enum(['all', 'system', 'host'])
export const statusUsageScopeSchema = z.enum(['global', 'workspace', 'session'])
export const statusUsageWindowSchema = z.enum(['1h', '24h', '7d', '30d'])
export const statusUsageAggregationSchema = z.enum(['minute', 'hour', 'day'])
export const statusExportFormatSchema = z.enum(['json', 'csv'])
export const statusGitWindowSchema = z.enum(['7d', '30d', '90d', '1y'])
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
  'statusWorkspace.setUsageQuery': defineCommand(
    metadata('statusWorkspace.setUsageQuery'),
    z.strictObject({
      instanceId,
      scope: statusUsageScopeSchema,
      includeDescendants: z.boolean(),
      window: statusUsageWindowSchema,
      aggregation: statusUsageAggregationSchema,
      providerId: z.string().min(1).max(160).nullable(),
      modelId: z.string().min(1).max(160).nullable(),
    }),
    summary,
  ),
  'statusWorkspace.exportUsage': defineCommand(
    {
      ...metadata('statusWorkspace.exportUsage'),
      cancelMode: 'cooperative',
      timeoutMs: 120_000,
      maxConcurrent: 1,
    },
    z.strictObject({ instanceId, format: statusExportFormatSchema }),
    summary,
  ),
  'statusWorkspace.setGitQuery': defineCommand(
    metadata('statusWorkspace.setGitQuery'),
    z.strictObject({
      instanceId,
      workspaceId: idSchema,
      window: statusGitWindowSchema,
      sources: z
        .array(gitCommitSourceSchema)
        .min(1)
        .max(3)
        .refine((sources) => new Set(sources).size === sources.length, 'Git sources must be unique'),
    }),
    summary,
  ),
}

export type PerformanceWindow = z.output<typeof performanceWindowSchema>
export type PerformanceTarget = z.output<typeof performanceTargetSchema>
export type StatusUsageScope = z.output<typeof statusUsageScopeSchema>
export type StatusUsageWindow = z.output<typeof statusUsageWindowSchema>
export type StatusUsageAggregation = z.output<typeof statusUsageAggregationSchema>
export type StatusExportFormat = z.output<typeof statusExportFormatSchema>
export type StatusGitWindow = z.output<typeof statusGitWindowSchema>
