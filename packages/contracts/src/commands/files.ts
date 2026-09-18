import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { artifactSchema, idSchema } from '../index'

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
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
  'file.list': defineCommand(
    {
      ...metadata('file.list', 'query', 'workspace'),
      cli: {
        arguments: [
          { field: 'path', type: 'string' as const, position: 0 },
          { field: 'workspaceId', type: 'string' as const, flag: 'workspace' },
          { field: 'after', type: 'string' as const, flag: 'after' },
          { field: 'limit', type: 'number' as const, flag: 'limit' },
        ],
      },
    },
    z.strictObject({
      workspaceId: idSchema,
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
        ],
      },
    },
    z.strictObject({ workspaceId: idSchema, path: z.string().min(1).max(4000) }),
    workspaceTextFileSchema,
  ),
  'file.write': defineCommand(
    {
      ...metadata('file.write', 'command', 'workspace'),
      cli: {
        arguments: [
          { field: 'path', type: 'string' as const, position: 0 },
          { field: 'workspaceId', type: 'string' as const, flag: 'workspace' },
          { field: 'text', type: 'string' as const, flag: 'text' },
          { field: 'expectedSha256', type: 'string' as const, flag: 'expected-sha256' },
        ],
      },
    },
    z.strictObject({
      workspaceId: idSchema,
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

export type WorkspaceTextFile = z.output<typeof workspaceTextFileSchema>
export type WorkspaceFileWrite = z.output<typeof workspaceFileWriteSchema>
