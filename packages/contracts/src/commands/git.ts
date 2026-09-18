import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import {
  gitBranchInfoSchema,
  gitCommitInfoSchema,
  gitDiffSchema,
  gitInfoSchema,
  gitStatusSchema,
  gitWorktreeInfoSchema,
} from '../index'

const pathSchema = z.string().min(1).max(4_000)
const branchNameSchema = z.string().min(1).max(1_000)
const cwdSchema = pathSchema.optional()
const cwdArgument = { field: 'cwd', type: 'string' as const, flag: 'cwd' }
const pathsArgument = { field: 'paths', type: 'json' as const, flag: 'paths-json' }
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
}
