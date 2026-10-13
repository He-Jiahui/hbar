import { z } from 'zod'
import {
  gitBranchInfoSchema,
  gitCommitInfoSchema,
  gitDiffSchema,
  gitInfoSchema,
  gitStatsReportSchema,
  gitStatusSchema,
} from './index'
import { nodeOperationIdSchema } from './node-operation'
import { nodeRootIdSchema, nodeRelativePathSchema } from './node-address'
import { sessionLaunchBranchHeadSchema } from './commands/session-launch-branches'

const entityId = z.string().min(1).max(160)
const objectId = z.union([z.string().regex(/^[0-9a-f]{40}$/i), z.string().regex(/^[0-9a-f]{64}$/i)])
export const nodeGitQueryAuthoritySchema = z.strictObject({
  kind: z.literal('manual-query'),
  operationId: nodeOperationIdSchema,
  deviceId: entityId,
  workspaceId: entityId,
  sessionId: entityId.nullable(),
  nodeId: entityId,
  rootId: nodeRootIdSchema,
  expectedRoot: z.string().min(1).max(4_000),
})
const binding = z.strictObject({ authority: nodeGitQueryAuthoritySchema, cwd: nodeRelativePathSchema.default('.') })
const paths = z.array(nodeRelativePathSchema).max(100).default([])
const launchBranchReference = z.strictObject({
  name: z.string().min(1).max(1_000),
  ref: z.string().min(1).max(1_024),
  oid: objectId,
  current: z.boolean(),
  worktree: z.enum(['current', 'elsewhere', 'available', 'unknown']),
})
const launchBranchSnapshot = z.strictObject({
  repository: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('not-repository') }),
    z.strictObject({
      kind: z.literal('repository'),
      workspaceScope: z.enum(['repository-root', 'repository-subdirectory']),
      head: sessionLaunchBranchHeadSchema,
    }),
  ]),
  branches: z.array(launchBranchReference).max(5_000),
  incomplete: z.boolean(),
})

/** UI-initiated, read-only Git queries. Authority must be supplied by trusted Host scope. */
export const nodeGitQueryMethods = {
  'git.query.info': { input: binding, output: gitInfoSchema },
  'git.query.status': { input: binding, output: gitStatusSchema },
  'git.query.diff': {
    input: binding.extend({ cached: z.boolean().default(false), paths }),
    output: gitDiffSchema,
  },
  'git.query.log': {
    input: binding.extend({ limit: z.number().int().min(1).max(100).default(20) }),
    output: z.array(gitCommitInfoSchema).max(100),
  },
  'git.query.branchList': {
    input: binding,
    output: z.array(gitBranchInfoSchema).max(500),
  },
  'git.query.stats': {
    input: binding.extend({
      from: z.number().int().nonnegative().optional(),
      to: z.number().int().positive().optional(),
      bucketMs: z.number().int().positive(),
      maxBuckets: z.number().int().min(1).max(1_000),
      sources: z
        .array(z.enum(['auto', 'manual', 'external']))
        .min(1)
        .max(3),
    }),
    output: gitStatsReportSchema,
  },
  'git.query.diffToRemote': {
    input: binding.extend({ paths }),
    output: z.strictObject({ sha: objectId, diff: z.string().max(48 * 1024), truncated: z.boolean() }).nullable(),
  },
  'git.query.launchBranchSnapshot': { input: binding, output: launchBranchSnapshot },
} as const

export type NodeGitQueryMethod = keyof typeof nodeGitQueryMethods
export type NodeGitQueryAuthority = z.output<typeof nodeGitQueryAuthoritySchema>
