import { z } from 'zod'

export const toolWindowDockSchema = z.enum(['left', 'right', 'top', 'bottom', 'editor', 'window'])
export type ToolWindowDock = z.infer<typeof toolWindowDockSchema>

export const toolWindowDefaultDockSchema = z.enum(['left', 'right', 'top', 'bottom', 'editor'])
export type ToolWindowDefaultDock = z.infer<typeof toolWindowDefaultDockSchema>

export const toolWindowScopeSchema = z.enum(['global', 'workspace', 'session', 'run'])
export type ToolWindowScope = z.infer<typeof toolWindowScopeSchema>

export const toolWindowIconSchema = z.enum([
  'activity',
  'bar-chart-3',
  'circle-help',
  'file-search',
  'folder',
  'git-branch',
  'globe',
  'layout-grid',
  'list-checks',
  'message-square',
  'terminal-square',
  'wrench',
])
export type ToolWindowIcon = z.infer<typeof toolWindowIconSchema>

export const toolWindowSizeSchema = z
  .object({
    width: z.number().int().min(160).max(2_000).optional(),
    height: z.number().int().min(120).max(2_000).optional(),
  })
  .strict()

export const toolWindowDescriptorSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9._-]{0,95}$/),
    title: z.string().trim().min(1).max(120),
    icon: toolWindowIconSchema.default('layout-grid'),
    defaultDock: toolWindowDefaultDockSchema.default('right'),
    allowedDocks: z.array(toolWindowDockSchema).max(6).optional(),
    scope: toolWindowScopeSchema.default('global'),
    canPopout: z.boolean().default(true),
    closable: z.boolean().default(true),
    minSize: toolWindowSizeSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.allowedDocks && !value.allowedDocks.includes(value.defaultDock))
      context.addIssue({ code: 'custom', path: ['allowedDocks'], message: 'allowedDocks must include defaultDock' })
    if (value.allowedDocks && new Set(value.allowedDocks).size !== value.allowedDocks.length)
      context.addIssue({ code: 'custom', path: ['allowedDocks'], message: 'allowedDocks must not contain duplicates' })
    if (!value.canPopout && value.allowedDocks?.includes('window'))
      context.addIssue({ code: 'custom', path: ['allowedDocks'], message: 'window requires canPopout=true' })
  })

export type ToolWindowDescriptor = z.infer<typeof toolWindowDescriptorSchema>

const toolWindowContributionBaseSchema = toolWindowDescriptorSchema
  .extend({
    kind: z.enum(['json', 'markdown']),
    content: z.string().max(2_000_000),
    owner: z.string().regex(/^[a-z][a-z0-9.-]{0,95}$/).optional(),
  })
  .strict()

/** Parse the pre-v4 `placement` field while emitting only the canonical descriptor. */
export const toolWindowContributionSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const record = value as Record<string, unknown>
  if (record.defaultDock !== undefined || record.placement === undefined) return value
  const { placement, ...rest } = record
  return { ...rest, defaultDock: placement }
}, toolWindowContributionBaseSchema)

export type ToolWindowContribution = z.infer<typeof toolWindowContributionSchema>

export function normalizeToolWindowDescriptor(value: unknown): ToolWindowDescriptor | null {
  const parsed = toolWindowDescriptorSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
