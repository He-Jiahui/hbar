import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema } from '../index'
import { toolWindowDescriptorSchema } from '../tool-windows'

const instanceIdSchema = z.string().min(1).max(160)
/** Built-in global destinations occupy the main workspace, independently of session tools. */
export const appPageIds = [
  'settings',
  'status',
  'run-board',
  'schedules',
  'prompt-templates',
  'onboarding',
  'notifications',
] as const
export type AppPageId = (typeof appPageIds)[number]
export const workbenchPanelIds = ['files', 'browser', 'resource-file'] as const
export function isWorkbenchPanelId(panelId: string): boolean {
  return workbenchPanelIds.some((id) => id === panelId)
}
export const appPageKindSchema = z.enum(['session', ...appPageIds])
const pageIds: ReadonlySet<string> = new Set(appPageIds)
export function isAppPageId(panelId: string): panelId is AppPageId {
  return pageIds.has(panelId)
}
const panelBindingSchema = z.enum(['followActive', 'pinned'])
const panelSummarySchema = z.strictObject({
  instanceId: instanceIdSchema,
  panelId: z.string().min(1).max(128),
  workspaceId: idSchema.nullable(),
  sessionId: idSchema.nullable(),
  binding: panelBindingSchema,
  focused: z.boolean(),
})
const windowSummarySchema = z.strictObject({
  windowId: instanceIdSchema,
  page: z.strictObject({ kind: z.string().min(1).max(128), params: z.record(z.string(), z.unknown()) }),
  focused: z.boolean(),
})
const presentationSummarySchema = z.strictObject({
  page: appPageKindSchema,
  pageInstanceId: instanceIdSchema.nullable(),
  toolInstanceId: instanceIdSchema.nullable(),
  modalInstanceId: instanceIdSchema.nullable(),
  sidebarOpen: z.boolean(),
})
const metadata = (id: string, execution: 'client' | 'platform' = 'client') => ({
  id,
  version: 1,
  owner: 'hbar.app-runtime',
  kind: 'command' as const,
  execution,
  stateEffect: 'application' as const,
  scope: 'client' as const,
  category: 'app.navigation',
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['cli', 'tui', 'api', 'palette'] as ('cli' | 'tui' | 'api' | 'palette')[],
})
const panelTarget = {
  instanceId: instanceIdSchema.optional(),
  workspaceId: idSchema.optional(),
  sessionId: idSchema.optional(),
  binding: panelBindingSchema.default('followActive'),
}
export const panelNavigationParamsSchema = z.strictObject({
  id: z.string().uuid().optional(),
  url: z.string().url().max(16384).optional(),
  title: z.string().max(1024).optional(),
  descriptor: toolWindowDescriptorSchema.optional(),
  scheduleId: idSchema.optional(),
  occurrenceId: idSchema.optional(),
  runId: idSchema.optional(),
  approvalId: idSchema.optional(),
})

export const surfaceCommands = {
  'app.openPanel': defineCommand(
    {
      ...metadata('app.openPanel'),
      cli: {
        arguments: [
          { field: 'panelId', type: 'string' as const, position: 0 },
          { field: 'instanceId', type: 'string' as const, flag: 'instance' },
          { field: 'workspaceId', type: 'string' as const, flag: 'workspace' },
          { field: 'sessionId', type: 'string' as const, flag: 'session' },
          { field: 'binding', type: 'string' as const, flag: 'binding' },
        ],
      },
    },
    z.strictObject({
      panelId: z.string().min(1).max(128),
      ...panelTarget,
      params: panelNavigationParamsSchema.optional(),
    }),
    panelSummarySchema,
  ),
  'app.closePanel': defineCommand(
    { ...metadata('app.closePanel'), cli: { arguments: [{ field: 'instanceId', type: 'string', position: 0 }] } },
    z.strictObject({ instanceId: instanceIdSchema }),
    z.strictObject({ instanceId: instanceIdSchema, closed: z.boolean() }),
  ),
  'app.back': defineCommand(
    { ...metadata('app.back'), cli: { arguments: [] } },
    z.strictObject({}),
    presentationSummarySchema,
  ),
  'app.setSidebarVisible': defineCommand(
    {
      ...metadata('app.setSidebarVisible'),
      cli: { arguments: [{ field: 'visible', type: 'boolean', position: 0, flag: 'visible' }] },
    },
    z.strictObject({ visible: z.boolean() }),
    presentationSummarySchema,
  ),
  'app.openSettings': defineCommand(
    {
      ...metadata('app.openSettings'),
      cli: {
        arguments: [
          { field: 'scope', type: 'string', position: 0 },
          { field: 'targetId', type: 'string', flag: 'target' },
          { field: 'section', type: 'string', flag: 'section' },
          { field: 'instanceId', type: 'string', flag: 'instance' },
          { field: 'workspaceId', type: 'string', flag: 'workspace' },
          { field: 'sessionId', type: 'string', flag: 'session' },
          { field: 'binding', type: 'string', flag: 'binding' },
        ],
      },
    },
    z.strictObject({
      scope: z.enum(['global', 'workspace', 'session']),
      targetId: idSchema.optional(),
      section: z.string().max(128).optional(),
      ...panelTarget,
    }),
    panelSummarySchema,
  ),
  'app.openStatus': defineCommand(
    {
      ...metadata('app.openStatus'),
      cli: {
        arguments: [
          { field: 'section', type: 'string', position: 0 },
          { field: 'instanceId', type: 'string', flag: 'instance' },
          { field: 'workspaceId', type: 'string', flag: 'workspace' },
          { field: 'sessionId', type: 'string', flag: 'session' },
          { field: 'binding', type: 'string', flag: 'binding' },
        ],
      },
    },
    z.strictObject({ section: z.enum(['dashboard', 'usage', 'git']).default('dashboard'), ...panelTarget }),
    panelSummarySchema,
  ),
  'app.openSettingsEditor': defineCommand(
    {
      ...metadata('app.openSettingsEditor'),
      cli: {
        arguments: [
          { field: 'path', type: 'string', position: 0 },
          { field: 'entryId', type: 'string', flag: 'entry' },
          { field: 'scope', type: 'string', flag: 'scope' },
          { field: 'targetId', type: 'string', flag: 'target' },
          { field: 'instanceId', type: 'string', flag: 'instance' },
          { field: 'workspaceId', type: 'string', flag: 'workspace' },
          { field: 'sessionId', type: 'string', flag: 'session' },
          { field: 'binding', type: 'string', flag: 'binding' },
        ],
      },
    },
    z.strictObject({
      scope: z.enum(['global', 'workspace', 'session']),
      targetId: idSchema.optional(),
      path: z.string().min(1).max(512),
      entryId: z.string().min(1).max(256).optional(),
      ...panelTarget,
    }),
    panelSummarySchema,
  ),
  'app.openWindow': defineCommand(
    {
      ...metadata('app.openWindow', 'platform'),
      cli: {
        arguments: [
          { field: 'windowId', type: 'string', position: 0 },
          { field: 'page', type: 'json', flag: 'page' },
        ],
      },
    },
    z.strictObject({
      windowId: instanceIdSchema,
      page: z.strictObject({ kind: z.string().min(1).max(128), params: z.record(z.string(), z.unknown()).default({}) }),
    }),
    windowSummarySchema,
  ),
  'app.closeWindow': defineCommand(
    {
      ...metadata('app.closeWindow', 'platform'),
      cli: { arguments: [{ field: 'windowId', type: 'string', position: 0 }] },
    },
    z.strictObject({ windowId: instanceIdSchema }),
    z.strictObject({ windowId: instanceIdSchema, closed: z.boolean() }),
  ),
}
