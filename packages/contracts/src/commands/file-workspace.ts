import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'

const instanceId = z.string().min(1).max(160)
const summary = z.strictObject({
  instanceId,
  workspaceId: z.string().min(1).max(160),
  path: z.string().max(4000),
  view: z.enum(['browser', 'document']),
  selectedPath: z.string().max(4000).nullable(),
  status: z.enum(['loading', 'ready', 'error']),
  documentStatus: z.enum(['idle', 'loading', 'ready', 'submitting', 'succeeded', 'failed', 'unknown']),
  dirty: z.boolean(),
  error: z.string().nullable(),
})
const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.file-workspace',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  category: 'files.tools',
  scope: 'client' as const,
  visibility: 'internal' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as ('api' | 'palette' | 'cli' | 'tui')[],
})

export const fileWorkspaceCommands = {
  'fileWorkspace.refresh': defineCommand(metadata('fileWorkspace.refresh'), z.strictObject({ instanceId }), summary),
  'fileWorkspace.loadMore': defineCommand(metadata('fileWorkspace.loadMore'), z.strictObject({ instanceId }), summary),
  'fileWorkspace.openEntry': defineCommand(
    metadata('fileWorkspace.openEntry'),
    z.strictObject({ instanceId, path: z.string().min(1).max(4000), directory: z.boolean() }),
    summary,
  ),
  'fileWorkspace.showBrowser': defineCommand(
    metadata('fileWorkspace.showBrowser'),
    z.strictObject({ instanceId }),
    summary,
  ),
  'fileWorkspace.setText': defineCommand(
    metadata('fileWorkspace.setText'),
    z.strictObject({ instanceId, text: z.string().max(2 * 1024 * 1024) }),
    summary,
  ),
  'fileWorkspace.save': defineCommand(metadata('fileWorkspace.save'), z.strictObject({ instanceId }), summary),
  'fileWorkspace.reconcile': defineCommand(
    metadata('fileWorkspace.reconcile'),
    z.strictObject({ instanceId }),
    summary,
  ),
  'fileWorkspace.discardAndReload': defineCommand(
    metadata('fileWorkspace.discardAndReload'),
    z.strictObject({
      instanceId,
      workspaceId: z.string().min(1).max(160),
      path: z.string().min(1).max(4000),
      expectedDraft: z.string().max(2 * 1024 * 1024),
      expectedSha256: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .nullable(),
    }),
    summary,
  ),
}
