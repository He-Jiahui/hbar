import { z } from 'zod'
import { gitCommitInfoSchema, gitDiffSchema, gitInfoSchema, gitStatusSchema } from './index'
import { nodeRootIdSchema, nodeRelativePathSchema } from './node-address'
import { nodeCallAuthoritySchema } from './node-authority'
import { nodeWorktreeProvisioningAuthoritySchema } from './node-worktree-provisioning'

const binding = z.strictObject({
  operationId: z.string().min(1).max(330),
  rootId: nodeRootIdSchema,
  expectedRoot: z.string().min(1).max(4_000),
  authority: nodeCallAuthoritySchema,
})
const cwd = nodeRelativePathSchema.default('.')
const paths = z.array(nodeRelativePathSchema).max(100).default([])
const read = binding.extend({ cwd })
const mutation = binding.extend({ cwd })
const worktreeBinding = z.strictObject({
  operationId: z.string().min(1).max(330),
  rootId: nodeRootIdSchema,
  expectedRoot: z.string().min(1).max(4_000),
  provisioning: nodeWorktreeProvisioningAuthoritySchema,
})
const managedWorktreeId = z.string().regex(/^[a-f0-9]{32}$/)
const worktreeOperation = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('add'),
    worktreeId: managedWorktreeId,
    branch: z.string().min(1).max(255),
    createBranch: z.boolean(),
    startPoint: z.string().min(1).max(255).optional(),
  }),
  z.strictObject({ kind: z.literal('remove'), worktreeId: managedWorktreeId }),
])

/** Named, bounded Git operations carried over the authenticated workspace-node link. */
export const nodeGitMethods = {
  'git.info': { input: read, output: gitInfoSchema },
  'git.status': { input: read, output: gitStatusSchema },
  'git.diff': {
    input: read.extend({ cached: z.boolean().default(false), paths }),
    output: gitDiffSchema,
  },
  'git.log': {
    input: read.extend({ limit: z.number().int().min(1).max(100).default(20) }),
    output: z.array(gitCommitInfoSchema).max(100),
  },
  'git.stage': {
    input: mutation.extend({ paths: z.array(nodeRelativePathSchema).min(1).max(100) }),
    output: z.strictObject({ paths }),
  },
  'git.unstage': {
    input: mutation.extend({ paths: z.array(nodeRelativePathSchema).min(1).max(100) }),
    output: z.strictObject({ paths }),
  },
  'git.commit': {
    input: mutation.extend({
      message: z.string().trim().min(1).max(4_000),
      paths,
      stage: z.boolean().default(false),
      source: z.enum(['auto', 'manual']).default('auto'),
    }),
    output: gitCommitInfoSchema,
  },
  'git.worktree': {
    input: worktreeBinding.extend({ operation: worktreeOperation }),
    output: z.strictObject({ path: z.string().min(1).max(4_000) }),
  },
} as const

export type NodeGitMethod = keyof typeof nodeGitMethods
export type NodeGitWorktreeOperation = z.infer<typeof worktreeOperation>
