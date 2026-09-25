import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'

const instanceId = z.string().min(1).max(160)
const summary = z.strictObject({
  instanceId,
  workspaceId: z.string().min(1).max(160),
  path: z.string().max(4000),
  view: z.enum(['browser', 'document', 'diff']),
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
  'fileWorkspace.addToComposer': defineCommand(
    metadata('fileWorkspace.addToComposer'),
    z.strictObject({
      instanceId,
      workspaceId: z.string().min(1).max(160),
      path: z.string().min(1).max(4000),
      sourceSessionId: z.string().min(1).max(160),
      sourceTabInstanceKey: z.string().uuid(),
      workbenchTabId: z.string().min(1).max(160).optional(),
      workbenchTabInstanceKey: z.string().uuid().optional(),
      expectedRevision: z.number().int().nonnegative(),
    }),
    z.strictObject({
      sessionId: z.string().min(1).max(160),
      sessionTitle: z.string().min(1),
      revision: z.number().int().nonnegative(),
      added: z.boolean(),
    }),
  ),
  'fileWorkspace.setBrowserMode': defineCommand(
    metadata('fileWorkspace.setBrowserMode'),
    z.strictObject({ instanceId, workspaceId: z.string().min(1).max(160), mode: z.enum(['all', 'changed']) }),
    summary,
  ),
  'fileWorkspace.refreshChanges': defineCommand(
    metadata('fileWorkspace.refreshChanges'),
    z.strictObject({ instanceId, workspaceId: z.string().min(1).max(160) }),
    summary,
  ),
  'fileWorkspace.filterChanges': defineCommand(
    metadata('fileWorkspace.filterChanges'),
    z.strictObject({ instanceId, workspaceId: z.string().min(1).max(160), filter: z.string().max(4000) }),
    summary,
  ),
  'fileWorkspace.pageChanges': defineCommand(
    metadata('fileWorkspace.pageChanges'),
    z.strictObject({ instanceId, workspaceId: z.string().min(1).max(160), page: z.number().int().min(0).max(49) }),
    summary,
  ),
  'fileWorkspace.openChange': defineCommand(
    metadata('fileWorkspace.openChange'),
    z.strictObject({
      instanceId,
      workspaceId: z.string().min(1).max(160),
      path: z.string().min(1).max(4000),
      cached: z.boolean().optional(),
    }),
    summary,
  ),
  'fileWorkspace.setDocumentMode': defineCommand(
    metadata('fileWorkspace.setDocumentMode'),
    z.strictObject({
      instanceId,
      workspaceId: z.string().min(1).max(160),
      path: z.string().min(1).max(4000),
      mode: z.enum(['preview', 'edit']),
    }),
    summary,
  ),
  'fileWorkspace.toggleTree': defineCommand(
    metadata('fileWorkspace.toggleTree'),
    z.strictObject({ instanceId, workspaceId: z.string().min(1).max(160), path: z.string().min(1).max(4000) }),
    summary,
  ),
  'fileWorkspace.refreshTree': defineCommand(
    metadata('fileWorkspace.refreshTree'),
    z.strictObject({ instanceId, workspaceId: z.string().min(1).max(160), path: z.string().min(1).max(4000) }),
    summary,
  ),
  'fileWorkspace.loadMoreTree': defineCommand(
    metadata('fileWorkspace.loadMoreTree'),
    z.strictObject({ instanceId, workspaceId: z.string().min(1).max(160), path: z.string().min(1).max(4000) }),
    summary,
  ),
  'fileWorkspace.filterTree': defineCommand(
    metadata('fileWorkspace.filterTree'),
    z.strictObject({ instanceId, workspaceId: z.string().min(1).max(160), filter: z.string().max(4000) }),
    summary,
  ),
  'fileWorkspace.refresh': defineCommand(metadata('fileWorkspace.refresh'), z.strictObject({ instanceId }), summary),
  'fileWorkspace.loadMore': defineCommand(metadata('fileWorkspace.loadMore'), z.strictObject({ instanceId }), summary),
  'fileWorkspace.openEntry': defineCommand(
    metadata('fileWorkspace.openEntry'),
    z.strictObject({
      instanceId,
      workspaceId: z.string().min(1).max(160).optional(),
      path: z.string().min(1).max(4000),
      directory: z.boolean(),
    }),
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
