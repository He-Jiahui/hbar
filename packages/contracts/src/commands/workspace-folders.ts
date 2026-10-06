import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { workspaceSchema } from '../state/directory'

export const WORKSPACE_FOLDER_LIMIT = 32
export const WORKSPACE_DIRECTORY_PAGE_SIZE = 200
const id = z.string().min(1).max(160)
export const workspaceFolderAliasSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u)
  .refine((value) => !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value) && !value.endsWith('.'))
export const workspaceFolderSchema = z.strictObject({
  id,
  alias: workspaceFolderAliasSchema,
  path: z.string().trim().min(1).max(4000),
})
export const workspaceFoldersSchema = z
  .array(workspaceFolderSchema)
  .min(1)
  .max(WORKSPACE_FOLDER_LIMIT)
  .superRefine((folders, context) => {
    for (const field of ['id', 'alias'] as const) {
      const values = folders.map((folder) => folder[field].toLocaleLowerCase())
      if (new Set(values).size !== values.length)
        context.addIssue({ code: 'custom', message: `Folder ${field} must be unique` })
    }
  })
export const workspaceFolderSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(1),
  workspaceId: id,
  revision: z.number().int().nonnegative().safe(),
  folders: workspaceFoldersSchema,
})
const createInput = z.strictObject({ folders: workspaceFoldersSchema })
const saveInput = z.strictObject({
  workspaceId: id,
  expectedRevision: z.number().int().nonnegative().safe(),
  folders: workspaceFoldersSchema,
})
export const workspaceFolderMutationSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('create'), input: createInput }),
  z.strictObject({ operation: z.literal('save'), input: saveInput }),
])
export const workspaceFolderResultSchema = z.strictObject({
  workspace: workspaceSchema,
  snapshot: workspaceFolderSnapshotSchema,
})
export const workspaceFolderReceiptSchema = z.strictObject({
  request: workspaceFolderMutationSchema,
  result: workspaceFolderResultSchema,
})
export const workspaceDirectoryEntrySchema = z.strictObject({
  name: z.string().min(1).max(1024),
  path: z.string().min(1).max(4000),
})
export const workspaceDirectoryPageSchema = z.strictObject({
  path: z.string().min(1).max(4000),
  parent: z.string().min(1).max(4000).nullable(),
  roots: z.array(workspaceDirectoryEntrySchema).max(64),
  items: z.array(workspaceDirectoryEntrySchema).max(WORKSPACE_DIRECTORY_PAGE_SIZE),
  nextCursor: z.string().max(1024).nullable(),
  scanTruncated: z.boolean(),
})
const metadata = (name: string, kind: 'query' | 'command', scope: 'global' | 'workspace') => ({
  id: name,
  version: 1,
  owner: 'hbar.workspace-folders',
  kind,
  execution: 'host' as const,
  stateEffect: kind === 'query' ? ('none' as const) : ('persistent' as const),
  scope,
  category: 'workspace.session',
  titleKey: `commands.${name}.title`,
  descriptionKey: `commands.${name}.description`,
  surfaces: ['api'] as 'api'[],
})
export const workspaceFolderCommands = {
  'workspace.folders.get': defineCommand(
    metadata('workspace.folders.get', 'query', 'workspace'),
    z.strictObject({ workspaceId: id }),
    workspaceFolderSnapshotSchema,
  ),
  'workspace.folders.browse': defineCommand(
    metadata('workspace.folders.browse', 'query', 'global'),
    z.strictObject({ path: z.string().min(1).max(4000).optional(), after: z.string().max(1024).optional() }),
    workspaceDirectoryPageSchema,
  ),
  'workspace.folders.create': defineCommand(
    { ...metadata('workspace.folders.create', 'command', 'global'), idempotency: 'required' },
    createInput,
    workspaceFolderResultSchema,
  ),
  'workspace.folders.save': defineCommand(
    { ...metadata('workspace.folders.save', 'command', 'workspace'), idempotency: 'required' },
    saveInput,
    workspaceFolderResultSchema,
  ),
  'workspace.folders.receipt': defineCommand(
    metadata('workspace.folders.receipt', 'query', 'global'),
    z.strictObject({ idempotencyKey: id, request: workspaceFolderMutationSchema }),
    workspaceFolderReceiptSchema.nullable(),
  ),
}
export type WorkspaceFolder = z.infer<typeof workspaceFolderSchema>
export type WorkspaceFolderSnapshot = z.infer<typeof workspaceFolderSnapshotSchema>
export type WorkspaceFolderMutation = z.infer<typeof workspaceFolderMutationSchema>
export type WorkspaceFolderResult = z.infer<typeof workspaceFolderResultSchema>
export type WorkspaceFolderReceipt = z.infer<typeof workspaceFolderReceiptSchema>
export type WorkspaceDirectoryPage = z.infer<typeof workspaceDirectoryPageSchema>

/** A filesystem alias, not localized UI copy. */
export function workspaceFolderAlias(name: string): string {
  const candidate = name
    .replace(/[^\p{L}\p{N}._-]/gu, '-')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .slice(0, 64)
    .replace(/\.+$/, '')
  return workspaceFolderAliasSchema.safeParse(candidate).success ? candidate : 'root'
}
