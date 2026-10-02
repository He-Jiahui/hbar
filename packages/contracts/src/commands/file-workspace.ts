import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { sessionFileTargetSchema } from './files'

const instanceId = z.string().min(1).max(160)
const previewId = z.string().uuid()
const revealLine = z.number().int().positive().safe().max(2_000_000)
const revealColumn = z.number().int().positive().safe().max(2_000_000)
const previewReveal = z.strictObject({
  line: revealLine,
  column: revealColumn.optional(),
})
const sourceSelection = {
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  startOffset: z
    .number()
    .int()
    .nonnegative()
    .max(2 * 1024 * 1024),
  endOffset: z
    .number()
    .int()
    .positive()
    .max(2 * 1024 * 1024),
}
const contextNote = z.string().trim().min(1).max(4000)
const fileComposerContextSelectionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('source-selection'), ...sourceSelection }),
  z.strictObject({ kind: z.literal('source-comment'), ...sourceSelection, note: contextNote }),
  z.strictObject({
    kind: z.literal('diff-comment'),
    cached: z.boolean(),
    expectedText: z.string().max(2 * 1024 * 1024),
    rowStart: z.number().int().nonnegative(),
    rowEnd: z.number().int().nonnegative(),
    diffSide: z.enum(['old', 'new']),
    note: contextNote,
  }),
])
export type FileComposerContextSelection = z.infer<typeof fileComposerContextSelectionSchema>
const sourceTarget = {
  sourceSessionId: z.string().min(1).max(160).nullable().optional(),
  sessionTarget: sessionFileTargetSchema.nullable().optional(),
}
const previewTarget = z.strictObject({
  instanceId,
  workspaceId: z.string().min(1).max(160),
  previewId,
  ...sourceTarget,
})
const editablePreviewTarget = z.strictObject({
  instanceId,
  workspaceId: z.string().min(1).max(160).optional(),
  previewId: previewId.optional(),
  ...sourceTarget,
})
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
const messageFilesMetadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.message-files',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  category: 'app.navigation',
  scope: 'client' as const,
  visibility: 'internal' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as ('api' | 'palette' | 'cli' | 'tui')[],
})
const messageFileOpenInput = z
  .strictObject({
    workspaceId: z.string().min(1).max(160),
    sessionId: z.string().min(1).max(160),
    sourceTabInstanceKey: z.string().uuid().nullable(),
    messageId: z.string().min(1).max(160),
    path: z.string().min(1).max(4000),
    line: revealLine.optional(),
    column: revealColumn.optional(),
  })
  .refine((value) => value.line !== undefined || value.column === undefined, {
    message: 'column requires line',
  })

export const fileWorkspaceCommands = {
  'fileWorkspace.selectPreview': defineCommand(metadata('fileWorkspace.selectPreview'), previewTarget, summary),
  'fileWorkspace.refreshPreview': defineCommand(metadata('fileWorkspace.refreshPreview'), previewTarget, summary),
  'fileWorkspace.closePreviews': defineCommand(
    metadata('fileWorkspace.closePreviews'),
    z.strictObject({
      instanceId,
      workspaceId: z.string().min(1).max(160),
      previewIds: z.array(previewId).min(1).max(32),
      ...sourceTarget,
    }),
    z.strictObject({
      closed: z.array(previewId).max(32),
      blocked: z.array(z.strictObject({ previewId, reason: z.enum(['dirty', 'submitting', 'unknown']) })).max(32),
    }),
  ),
  'fileWorkspace.addToComposer': defineCommand(
    metadata('fileWorkspace.addToComposer'),
    z.strictObject({
      instanceId,
      previewId: previewId.optional(),
      workspaceId: z.string().min(1).max(160),
      path: z.string().min(1).max(4000),
      sourceSessionId: z.string().min(1).max(160),
      sourceTabInstanceKey: z.string().uuid(),
      workbenchTabId: z.string().min(1).max(160).optional(),
      workbenchTabInstanceKey: z.string().uuid().optional(),
      expectedRevision: z.number().int().nonnegative(),
      sessionTarget: sessionFileTargetSchema.nullable().optional(),
      context: fileComposerContextSelectionSchema.optional(),
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
    z.strictObject({
      instanceId,
      workspaceId: z.string().min(1).max(160),
      mode: z.enum(['all', 'changed']),
      preservePreview: z.boolean().optional(),
      ...sourceTarget,
    }),
    summary,
  ),
  'fileWorkspace.refreshChanges': defineCommand(
    metadata('fileWorkspace.refreshChanges'),
    z.strictObject({
      instanceId,
      workspaceId: z.string().min(1).max(160),
      preservePreview: z.boolean().optional(),
      ...sourceTarget,
    }),
    summary,
  ),
  'fileWorkspace.filterChanges': defineCommand(
    metadata('fileWorkspace.filterChanges'),
    z.strictObject({
      instanceId,
      workspaceId: z.string().min(1).max(160),
      filter: z.string().max(4000),
      ...sourceTarget,
    }),
    summary,
  ),
  'fileWorkspace.pageChanges': defineCommand(
    metadata('fileWorkspace.pageChanges'),
    z.strictObject({
      instanceId,
      workspaceId: z.string().min(1).max(160),
      page: z.number().int().min(0).max(49),
      ...sourceTarget,
    }),
    summary,
  ),
  'fileWorkspace.openChange': defineCommand(
    metadata('fileWorkspace.openChange'),
    z.strictObject({
      instanceId,
      previewId: previewId.optional(),
      workspaceId: z.string().min(1).max(160),
      path: z.string().min(1).max(4000),
      cached: z.boolean().optional(),
      ...sourceTarget,
    }),
    summary,
  ),
  'fileWorkspace.setDocumentMode': defineCommand(
    metadata('fileWorkspace.setDocumentMode'),
    z.strictObject({
      instanceId,
      previewId: previewId.optional(),
      workspaceId: z.string().min(1).max(160),
      path: z.string().min(1).max(4000),
      mode: z.enum(['preview', 'source', 'edit']),
      ...sourceTarget,
    }),
    summary,
  ),
  'fileWorkspace.toggleTree': defineCommand(
    metadata('fileWorkspace.toggleTree'),
    z.strictObject({
      instanceId,
      workspaceId: z.string().min(1).max(160),
      path: z.string().min(1).max(4000),
      ...sourceTarget,
    }),
    summary,
  ),
  'fileWorkspace.refreshTree': defineCommand(
    metadata('fileWorkspace.refreshTree'),
    z.strictObject({
      instanceId,
      workspaceId: z.string().min(1).max(160),
      path: z.string().min(1).max(4000),
      ...sourceTarget,
    }),
    summary,
  ),
  'fileWorkspace.loadMoreTree': defineCommand(
    metadata('fileWorkspace.loadMoreTree'),
    z.strictObject({
      instanceId,
      workspaceId: z.string().min(1).max(160),
      path: z.string().min(1).max(4000),
      ...sourceTarget,
    }),
    summary,
  ),
  'fileWorkspace.filterTree': defineCommand(
    metadata('fileWorkspace.filterTree'),
    z.strictObject({
      instanceId,
      workspaceId: z.string().min(1).max(160),
      filter: z.string().max(160),
      ...sourceTarget,
    }),
    summary,
  ),
  'fileWorkspace.refresh': defineCommand(
    metadata('fileWorkspace.refresh'),
    z.strictObject({ instanceId, preservePreview: z.boolean().optional(), ...sourceTarget }),
    summary,
  ),
  'fileWorkspace.loadMore': defineCommand(
    metadata('fileWorkspace.loadMore'),
    z.strictObject({ instanceId, ...sourceTarget }),
    summary,
  ),
  'fileWorkspace.openEntry': defineCommand(
    metadata('fileWorkspace.openEntry'),
    z.strictObject({
      instanceId,
      preservePreview: z.boolean().optional(),
      workspaceId: z.string().min(1).max(160).optional(),
      path: z.string().min(1).max(4000),
      directory: z.boolean(),
      reveal: previewReveal.optional(),
      ...sourceTarget,
    }),
    summary,
  ),
  'fileWorkspace.consumeReveal': defineCommand(
    metadata('fileWorkspace.consumeReveal'),
    z.strictObject({
      ...previewTarget.shape,
      requestId: z.string().min(1).max(160),
      ...sourceTarget,
    }),
    summary,
  ),
  'messageFiles.open': defineCommand(
    messageFilesMetadata('messageFiles.open'),
    messageFileOpenInput,
    z.strictObject({ instanceId, previewId, path: z.string().min(1).max(4000) }),
  ),
  'fileWorkspace.showBrowser': defineCommand(metadata('fileWorkspace.showBrowser'), editablePreviewTarget, summary),
  'fileWorkspace.setText': defineCommand(
    metadata('fileWorkspace.setText'),
    editablePreviewTarget.extend({ text: z.string().max(2 * 1024 * 1024) }),
    summary,
  ),
  'fileWorkspace.save': defineCommand(metadata('fileWorkspace.save'), editablePreviewTarget, summary),
  'fileWorkspace.reconcile': defineCommand(metadata('fileWorkspace.reconcile'), editablePreviewTarget, summary),
  'fileWorkspace.discardAndReload': defineCommand(
    metadata('fileWorkspace.discardAndReload'),
    z.strictObject({
      instanceId,
      previewId: previewId.optional(),
      workspaceId: z.string().min(1).max(160),
      path: z.string().min(1).max(4000),
      expectedDraft: z.string().max(2 * 1024 * 1024),
      expectedSha256: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .nullable(),
      ...sourceTarget,
    }),
    summary,
  ),
}
