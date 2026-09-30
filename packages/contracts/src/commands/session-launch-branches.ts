import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema } from '../index'

const branchNameSchema = z.string().min(1).max(1_000)
const gitObjectIdSchema = z.union([z.string().regex(/^[0-9a-f]{40}$/i), z.string().regex(/^[0-9a-f]{64}$/i)])
const branchRefSchema = z
  .string()
  .min('refs/heads/'.length + 1)
  .max(1_011)
  .refine((value) => value.startsWith('refs/heads/'))

export const sessionLaunchBranchHeadSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('branch'), ref: branchRefSchema, name: branchNameSchema, oid: gitObjectIdSchema }),
  z.strictObject({ kind: z.literal('detached'), oid: gitObjectIdSchema }),
  z.strictObject({ kind: z.literal('unborn'), ref: branchRefSchema, name: branchNameSchema }),
  z.strictObject({ kind: z.literal('symbolic'), ref: z.string().min(1).max(1_024), oid: gitObjectIdSchema.nullable() }),
])

const sharedCurrentAvailabilitySchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('available') }),
  z.strictObject({ state: z.literal('disabled'), reason: z.literal('checked-out-elsewhere') }),
  z.strictObject({ state: z.literal('unknown'), reason: z.literal('worktree-state-unavailable') }),
])

export const sessionLaunchBranchSchema = z
  .strictObject({
    name: branchNameSchema,
    ref: branchRefSchema,
    tipOid: gitObjectIdSchema,
    current: z.boolean(),
    availability: z.strictObject({
      /** A shared-workspace switch is blocked only when another worktree owns the branch. */
      sharedCurrent: sharedCurrentAvailabilitySchema,
      /** Isolated launch creates a new branch from this ref, so checkout elsewhere is allowed. */
      isolatedBase: z.strictObject({ state: z.literal('available') }),
    }),
  })
  .refine((value) => value.ref.slice('refs/heads/'.length) === value.name)

export const sessionLaunchBranchesInputSchema = z.strictObject({
  workspaceId: idSchema,
  /** Case-insensitive literal substring of local refs/heads names; remote refs are intentionally omitted. */
  search: z.string().max(256).default(''),
  limit: z.number().int().min(1).max(50).default(25),
  cursor: z.string().min(1).max(2_048).optional(),
})

const snapshotPageSchema = z.strictObject({
  workspaceId: idSchema,
  repository: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('not-repository') }),
    z.strictObject({ kind: z.literal('repository'), head: sessionLaunchBranchHeadSchema }),
  ]),
  branches: z.array(sessionLaunchBranchSchema).max(50),
  nextCursor: z.string().min(1).max(2_048).nullable(),
  /** True means the bounded local-ref scan did not cover every matching ref. */
  incomplete: z.boolean(),
})

export const sessionLaunchBranchesPageSchema = snapshotPageSchema.superRefine((page, context) => {
  if (
    page.repository.kind === 'not-repository' &&
    (page.branches.length > 0 || page.nextCursor !== null || page.incomplete)
  )
    context.addIssue({
      code: 'custom',
      path: ['repository'],
      message: 'A non-repository page cannot contain branches or a cursor',
    })
  if (
    page.repository.kind === 'repository' &&
    (page.repository.head.kind === 'branch' || page.repository.head.kind === 'unborn') &&
    page.repository.head.ref.slice('refs/heads/'.length) !== page.repository.head.name
  )
    context.addIssue({ code: 'custom', path: ['repository', 'head'], message: 'Head name must match its Git ref' })
})

export type SessionLaunchBranchesInput = z.infer<typeof sessionLaunchBranchesInputSchema>
export type SessionLaunchBranchesRequest = z.input<typeof sessionLaunchBranchesInputSchema>
export type SessionLaunchBranchHead = z.infer<typeof sessionLaunchBranchHeadSchema>
export type SessionLaunchBranch = z.infer<typeof sessionLaunchBranchSchema>
export type SessionLaunchBranchesPage = z.infer<typeof sessionLaunchBranchesPageSchema>

export interface SessionLaunchBranchesReadOptions {
  readonly signal?: AbortSignal
  readonly requestId?: string
}

export interface SessionLaunchBranchesReader {
  list(
    input: SessionLaunchBranchesRequest,
    options?: SessionLaunchBranchesReadOptions,
  ): Promise<SessionLaunchBranchesPage>
}

const metadata = {
  id: 'sessionLaunchBranches.list',
  version: 1,
  owner: 'hbar.session-launch-branches',
  kind: 'query' as const,
  execution: 'host' as const,
  stateEffect: 'none' as const,
  category: 'workspace.session-launch-target',
  scope: 'workspace' as const,
  titleKey: 'commands.sessionLaunchBranches.list.title',
  descriptionKey: 'commands.sessionLaunchBranches.list.description',
  visibility: 'internal' as const,
  surfaces: ['api'] as 'api'[],
  timeoutMs: 15_000,
  maxConcurrent: 4,
  cancelMode: 'cooperative' as const,
}

export const sessionLaunchBranchesCommands = {
  'sessionLaunchBranches.list': defineCommand(
    metadata,
    sessionLaunchBranchesInputSchema,
    sessionLaunchBranchesPageSchema,
  ),
}
