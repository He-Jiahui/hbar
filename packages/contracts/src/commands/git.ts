import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import {
  gitBranchInfoSchema,
  gitCommitInfoSchema,
  gitDiffSchema,
  gitInfoSchema,
  gitStatsReportSchema,
  gitStatusSchema,
  gitWorktreeInfoSchema,
  idSchema,
} from '../index'
import { sessionFileTargetSchema } from './files'

const pathSchema = z.string().min(1).max(4_000)
const branchNameSchema = z.string().min(1).max(1_000)
const cwdSchema = pathSchema.optional()
const cwdArgument = { field: 'cwd', type: 'string' as const, flag: 'cwd' }
const pathsArgument = { field: 'paths', type: 'json' as const, flag: 'paths-json' }
const statsSourcesArgument = { field: 'sources', type: 'json' as const, flag: 'sources-json' }
const metadata = (id: string, kind: 'command' | 'query', stateEffect: 'none' | 'external') => ({
  id,
  version: 1,
  owner: 'hbar.git',
  kind,
  execution: 'host' as const,
  stateEffect,
  category: 'monitoring.git',
  scope: 'workspace' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['cli', 'tui', 'api', 'palette'] as ('cli' | 'tui' | 'api' | 'palette')[],
  cancelMode: 'cooperative' as const,
  timeoutMs: 120_000,
})
const branchInputSchema = z
  .strictObject({
    cwd: cwdSchema,
    operation: z.enum(['list', 'create', 'switch', 'delete']).default('list'),
    name: branchNameSchema.optional(),
    force: z.boolean().default(false),
  })
  .superRefine((input, context) => {
    if (input.operation !== 'list' && input.name === undefined)
      context.addIssue({ code: 'custom', path: ['name'], message: 'Branch name is required for mutations' })
  })
const worktreeInputSchema = z
  .strictObject({
    cwd: cwdSchema,
    operation: z.enum(['list', 'add', 'remove']).default('list'),
    path: pathSchema.optional(),
    branch: branchNameSchema.optional(),
    createBranch: z.boolean().default(false),
    force: z.boolean().default(false),
  })
  .superRefine((input, context) => {
    if (input.operation !== 'list' && input.path === undefined)
      context.addIssue({ code: 'custom', path: ['path'], message: 'Worktree path is required for mutations' })
  })

/** Read-only Git context resolved from a session; callers cannot choose its cwd. */
export const sessionGitTargetSchema = sessionFileTargetSchema.extend({ workspaceId: idSchema })
export type SessionGitTarget = z.infer<typeof sessionGitTargetSchema>

const sessionGitRelativePathSchema = z
  .string()
  .min(1)
  .max(4_000)
  .refine((value) => {
    return (
      !value.startsWith('/') &&
      !value.startsWith('\\') &&
      !/^[a-z]:/i.test(value) &&
      !value.includes('\\') &&
      !value.includes('\0') &&
      value.split('/').every((part) => part !== '..')
    )
  }, 'Git paths must stay relative to the session execution root')
const sessionGitDiffPathSchema = sessionGitRelativePathSchema

export const sessionGitStatusEntrySchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('path'),
    path: sessionGitRelativePathSchema,
    index: z.string().length(1),
    worktree: z.string().length(1),
    directory: z.literal(true).optional(),
  }),
  z
    .strictObject({
      kind: z.literal('rename'),
      from: sessionGitRelativePathSchema.nullable(),
      to: sessionGitRelativePathSchema.nullable(),
      index: z.string().length(1),
      worktree: z.string().length(1),
    })
    .refine(
      (entry) => entry.from !== null || entry.to !== null,
      'A scoped rename must touch the session execution root',
    ),
  z.strictObject({
    kind: z.literal('copy'),
    from: sessionGitRelativePathSchema.nullable(),
    to: sessionGitRelativePathSchema,
    index: z.string().length(1),
    worktree: z.string().length(1),
  }),
])
export type SessionGitStatusEntry = z.infer<typeof sessionGitStatusEntrySchema>

/** Session Git projection; all entry paths are relative to the resolved execution root. */
export const sessionGitStatusSchema = z.strictObject({
  target: sessionGitTargetSchema,
  branch: z.string().min(1).max(1_000).nullable(),
  head: z
    .string()
    .regex(/^[0-9a-f]{7,64}$/i)
    .nullable(),
  upstream: z.string().min(1).max(1_000).nullable(),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  isRepository: z.boolean(),
  dirty: z.boolean(),
  repositoryDirty: z.boolean(),
  entries: z.array(sessionGitStatusEntrySchema).max(5_000),
})
export type SessionGitStatus = z.infer<typeof sessionGitStatusSchema>

export const sessionGitDiffSchema = z.strictObject({
  target: sessionGitTargetSchema,
  diff: z.string().max(512_000),
  cached: z.boolean(),
  truncated: z.boolean(),
})
export type SessionGitDiff = z.infer<typeof sessionGitDiffSchema>

const sessionMetadata = (id: string) => ({
  ...metadata(id, 'query', 'none'),
  scope: 'session' as const,
  surfaces: ['api'] as 'api'[],
  visibility: 'internal' as const,
  timeoutMs: 30_000,
  maxConcurrent: 8,
})
export const sessionGitCommands = {
  'sessionGit.info': defineCommand(sessionMetadata('sessionGit.info'), sessionGitTargetSchema, gitInfoSchema),
  'sessionGit.status': defineCommand(
    sessionMetadata('sessionGit.status'),
    sessionGitTargetSchema,
    sessionGitStatusSchema,
  ),
  'sessionGit.diff': defineCommand(
    sessionMetadata('sessionGit.diff'),
    sessionGitTargetSchema.extend({
      cached: z.boolean().default(false),
      paths: z.array(sessionGitDiffPathSchema).max(100).default([]),
    }),
    sessionGitDiffSchema,
  ),
}

export const gitCommands = {
  'git.info': defineCommand(
    { ...metadata('git.info', 'query', 'none'), cli: { arguments: [cwdArgument] } },
    z.strictObject({ cwd: cwdSchema }),
    gitInfoSchema,
  ),
  'git.status': defineCommand(
    { ...metadata('git.status', 'query', 'none'), cli: { arguments: [cwdArgument] } },
    z.strictObject({ cwd: cwdSchema }),
    gitStatusSchema,
  ),
  'git.diff': defineCommand(
    {
      ...metadata('git.diff', 'query', 'none'),
      cli: {
        arguments: [cwdArgument, { field: 'cached', type: 'boolean', flag: 'cached' }, pathsArgument],
      },
    },
    z.strictObject({
      cwd: cwdSchema,
      cached: z.boolean().default(false),
      paths: z.array(pathSchema).max(100).default([]),
    }),
    gitDiffSchema,
  ),
  'git.log': defineCommand(
    {
      ...metadata('git.log', 'query', 'none'),
      cli: {
        arguments: [cwdArgument, { field: 'limit', type: 'number', flag: 'limit' }],
      },
    },
    z.strictObject({ cwd: cwdSchema, limit: z.number().int().min(1).max(100).default(20) }),
    z.array(gitCommitInfoSchema).max(100),
  ),
  'git.stats': defineCommand(
    {
      ...metadata('git.stats', 'query', 'none'),
      cli: {
        arguments: [
          cwdArgument,
          { field: 'from', type: 'number', flag: 'from' },
          { field: 'to', type: 'number', flag: 'to' },
          { field: 'bucketMs', type: 'number', flag: 'bucket-ms' },
          { field: 'maxBuckets', type: 'number', flag: 'max-buckets' },
          statsSourcesArgument,
        ],
      },
    },
    z.strictObject({
      cwd: cwdSchema,
      from: z.number().int().nonnegative().optional(),
      to: z.number().int().positive().optional(),
      bucketMs: z.number().int().min(60_000).max(2_592_000_000).default(86_400_000),
      maxBuckets: z.number().int().min(1).max(1_000).default(120),
      sources: z
        .array(z.enum(['auto', 'manual', 'external']))
        .min(1)
        .max(3)
        .default(['auto', 'manual', 'external']),
    }),
    gitStatsReportSchema,
  ),
  'git.commit': defineCommand(
    {
      ...metadata('git.commit', 'command', 'external'),
      cli: {
        arguments: [
          { field: 'message', type: 'string', position: 0 },
          cwdArgument,
          pathsArgument,
          { field: 'stage', type: 'boolean', flag: 'stage' },
        ],
      },
    },
    z.strictObject({
      cwd: cwdSchema,
      message: z.string().trim().min(1).max(4_000),
      paths: z.array(pathSchema).max(100).default([]),
      stage: z.boolean().default(false),
      sessionId: z.string().min(1).max(128).optional(),
      runId: z.string().min(1).max(128).optional(),
    }),
    gitCommitInfoSchema,
  ),
  'git.branch': defineCommand(
    {
      ...metadata('git.branch', 'command', 'external'),
      cli: {
        arguments: [
          { field: 'operation', type: 'string', position: 0 },
          { field: 'name', type: 'string', position: 1 },
          cwdArgument,
          { field: 'force', type: 'boolean', flag: 'force' },
        ],
      },
    },
    branchInputSchema,
    z.union([z.array(gitBranchInfoSchema).max(500), gitBranchInfoSchema]),
  ),
  'git.worktree': defineCommand(
    {
      ...metadata('git.worktree', 'command', 'external'),
      cli: {
        arguments: [
          { field: 'operation', type: 'string', position: 0 },
          { field: 'path', type: 'string', position: 1 },
          cwdArgument,
          { field: 'branch', type: 'string', flag: 'branch' },
          { field: 'createBranch', type: 'boolean', flag: 'create-branch' },
          { field: 'force', type: 'boolean', flag: 'force' },
        ],
      },
    },
    worktreeInputSchema,
    z.union([z.array(gitWorktreeInfoSchema).max(100), gitWorktreeInfoSchema]),
  ),
  'git.diffToRemote': defineCommand(
    { ...metadata('git.diffToRemote', 'query', 'none'), cli: { arguments: [cwdArgument] } },
    z.strictObject({ cwd: cwdSchema }),
    z
      .strictObject({
        sha: z.string().regex(/^[0-9a-f]{7,64}$/i),
        diff: z.string().max(512_000),
        truncated: z.boolean(),
      })
      .nullable(),
  ),
  ...sessionGitCommands,
}
