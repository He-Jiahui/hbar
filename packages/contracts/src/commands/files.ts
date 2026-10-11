import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { artifactSchema, idSchema } from '../index'
import { workspaceFindResultSchema } from '../workspace-query'
import { chatDatabaseUploadOwnerSchema } from './chat-database-drafts'
import { runFileChangesCommands } from './run-file-changes'

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
/** A Host-owned session context, never a client-selected filesystem root. */
export const sessionFileTargetSchema = z.strictObject({
  sessionId: idSchema,
  expectedRevision: z.number().int().nonnegative().safe(),
})
export const workspaceFileEntrySchema = z.strictObject({
  name: z.string().min(1).max(1024),
  path: z.string().min(1).max(4000),
  directory: z.boolean(),
})
export const workspaceFilePageSchema = z.strictObject({
  items: z.array(workspaceFileEntrySchema).max(500),
  nextCursor: z.string().min(1).max(4000).optional(),
})
export const workspaceTextFileSchema = z.strictObject({
  workspaceId: idSchema,
  sessionTarget: sessionFileTargetSchema.optional(),
  path: z.string().min(1).max(4000),
  text: z.string().max(2 * 1024 * 1024),
  size: z
    .number()
    .int()
    .nonnegative()
    .max(2 * 1024 * 1024),
  sha256: sha256Schema,
})
export const workspaceFileWriteSchema = z.strictObject({
  workspaceId: idSchema,
  sessionTarget: sessionFileTargetSchema.optional(),
  path: z.string().min(1).max(4000),
  created: z.boolean(),
  beforeSha256: sha256Schema.nullable(),
  afterSha256: sha256Schema,
  size: z
    .number()
    .int()
    .nonnegative()
    .max(2 * 1024 * 1024),
})
export const attachmentUploadInputSchema = z.strictObject({
  sourceId: z.string().min(1).max(256),
  sha256: sha256Schema,
  name: z.string().min(1).max(240),
  owner: chatDatabaseUploadOwnerSchema.optional(),
  mime: z.string().min(1).max(120),
  size: z
    .number()
    .int()
    .min(1)
    .max(10 * 1024 * 1024),
})

const metadata = (id: string, kind: 'command' | 'query', scope: 'workspace' | 'global') => ({
  id,
  version: 1,
  owner: 'hbar.files',
  kind,
  execution: 'host' as const,
  stateEffect: kind === 'query' ? ('none' as const) : ('persistent' as const),
  category: 'files.tools',
  scope,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['cli', 'tui', 'api', 'palette'] as ('cli' | 'tui' | 'api' | 'palette')[],
})

export const fileCommands = {
  ...runFileChangesCommands,
  'file.find': defineCommand(
    {
      ...metadata('file.find', 'query', 'workspace'),
      cli: {
        arguments: [
          { field: 'query', type: 'string' as const, position: 0 },
          { field: 'workspaceId', type: 'string' as const, flag: 'workspace' },
          { field: 'sessionTarget', type: 'json' as const, flag: 'session-target-json' },
          { field: 'path', type: 'string' as const, flag: 'path' },
          { field: 'limit', type: 'number' as const, flag: 'limit' },
        ],
      },
    },
    z.strictObject({
      workspaceId: idSchema,
      sessionTarget: sessionFileTargetSchema.optional(),
      query: z.string().trim().min(1).max(160),
      path: z.string().max(4000).default('.'),
      limit: z.number().int().min(1).max(200).default(50),
    }),
    workspaceFindResultSchema,
  ),
  'file.list': defineCommand(
    {
      ...metadata('file.list', 'query', 'workspace'),
      cli: {
        arguments: [
          { field: 'path', type: 'string' as const, position: 0 },
          { field: 'workspaceId', type: 'string' as const, flag: 'workspace' },
          { field: 'sessionTarget', type: 'json' as const, flag: 'session-target-json' },
          { field: 'after', type: 'string' as const, flag: 'after' },
          { field: 'limit', type: 'number' as const, flag: 'limit' },
        ],
      },
    },
    z.strictObject({
      workspaceId: idSchema,
      sessionTarget: sessionFileTargetSchema.optional(),
      path: z.string().max(4000).default('.'),
      after: z.string().min(1).max(4000).optional(),
      limit: z.number().int().min(1).max(500).default(200),
    }),
    workspaceFilePageSchema,
  ),
  'file.read': defineCommand(
    {
      ...metadata('file.read', 'query', 'workspace'),
      cli: {
        arguments: [
          { field: 'path', type: 'string' as const, position: 0 },
          { field: 'workspaceId', type: 'string' as const, flag: 'workspace' },
          { field: 'sessionTarget', type: 'json' as const, flag: 'session-target-json' },
        ],
      },
    },
    z.strictObject({
      workspaceId: idSchema,
      sessionTarget: sessionFileTargetSchema.optional(),
      path: z.string().min(1).max(4000),
    }),
    workspaceTextFileSchema,
  ),
  'file.write': defineCommand(
    {
      ...metadata('file.write', 'command', 'workspace'),
      cli: {
        arguments: [
          { field: 'path', type: 'string' as const, position: 0 },
          { field: 'workspaceId', type: 'string' as const, flag: 'workspace' },
          { field: 'sessionTarget', type: 'json' as const, flag: 'session-target-json' },
          { field: 'text', type: 'string' as const, flag: 'text' },
          { field: 'expectedSha256', type: 'string' as const, flag: 'expected-sha256' },
        ],
      },
    },
    z.strictObject({
      workspaceId: idSchema,
      sessionTarget: sessionFileTargetSchema.optional(),
      path: z.string().min(1).max(4000),
      text: z.string().max(2 * 1024 * 1024),
      expectedSha256: sha256Schema.nullable(),
    }),
    workspaceFileWriteSchema,
  ),
  'attachment.query': defineCommand(
    {
      ...metadata('attachment.query', 'query', 'global'),
      cli: { arguments: [{ field: 'artifactId', type: 'string' as const, position: 0 }] },
    },
    z.strictObject({ artifactId: sha256Schema }),
    artifactSchema,
  ),
}

export const attachmentCommands = {
  'attachment.upload': defineCommand(
    {
      id: 'attachment.upload',
      version: 1,
      owner: 'hbar.attachments',
      kind: 'command',
      execution: 'client',
      stateEffect: 'persistent',
      category: 'files.tools',
      scope: 'client',
      titleKey: 'commands.attachment.upload.title',
      descriptionKey: 'commands.attachment.upload.description',
      surfaces: ['cli', 'tui', 'api', 'palette'],
      cancelMode: 'cooperative',
      timeoutMs: 120_000,
      maxConcurrent: 4,
      cli: { arguments: [{ field: 'sourceId', type: 'string', position: 0 }] },
    },
    attachmentUploadInputSchema,
    artifactSchema,
  ),
}

export type WorkspaceTextFile = z.output<typeof workspaceTextFileSchema>
export type SessionFileTarget = z.output<typeof sessionFileTargetSchema>
export type WorkspaceFileWrite = z.output<typeof workspaceFileWriteSchema>
export type AttachmentUploadInput = z.output<typeof attachmentUploadInputSchema>
