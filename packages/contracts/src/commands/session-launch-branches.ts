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
const isolatedBaseAvailabilitySchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('available') }),
  z.strictObject({ state: z.literal('disabled'), reason: z.literal('repository-root-required') }),
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
      isolatedBase: isolatedBaseAvailabilitySchema,
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
    z.strictObject({
      kind: z.literal('repository'),
      workspaceScope: z.enum(['repository-root', 'repository-subdirectory']),
      head: sessionLaunchBranchHeadSchema,
    }),
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
  if (page.repository.kind === 'repository') {
    const subdirectory = page.repository.workspaceScope === 'repository-subdirectory'
    for (const [index, branch] of page.branches.entries()) {
      const availability = branch.availability.isolatedBase
      if ((subdirectory && availability.state !== 'disabled') || (!subdirectory && availability.state !== 'available'))
        context.addIssue({
          code: 'custom',
          path: ['branches', index, 'availability', 'isolatedBase'],
          message: 'Isolated-base availability must match the registered workspace repository scope',
        })
    }
    const refs = new Set<string>()
    for (const [index, branch] of page.branches.entries()) {
      if (refs.has(branch.ref))
        context.addIssue({ code: 'custom', path: ['branches', index, 'ref'], message: 'Duplicate local branch ref' })
      refs.add(branch.ref)
    }
  }
})

export type SessionLaunchBranchesInput = z.infer<typeof sessionLaunchBranchesInputSchema>
export type SessionLaunchBranchesRequest = z.input<typeof sessionLaunchBranchesInputSchema>
export type SessionLaunchBranchHead = z.infer<typeof sessionLaunchBranchHeadSchema>
export type SessionLaunchBranch = z.infer<typeof sessionLaunchBranchSchema>
export type SessionLaunchBranchesPage = z.infer<typeof sessionLaunchBranchesPageSchema>

export const sessionLaunchBranchCreateInputSchema = z.strictObject({
  workspaceId: idSchema,
  name: z.string().trim().min(1).max(1_000),
  baseRef: branchRefSchema,
  expectedBaseOid: gitObjectIdSchema,
})
export const sessionLaunchBranchCreateResultSchema = z
  .strictObject({
    workspaceId: idSchema,
    name: branchNameSchema,
    createdRef: branchRefSchema,
    createdOid: gitObjectIdSchema,
    baseRef: branchRefSchema,
    baseOid: gitObjectIdSchema,
  })
  .superRefine((result, context) => {
    if (result.createdRef.slice('refs/heads/'.length) !== result.name)
      context.addIssue({ code: 'custom', path: ['createdRef'], message: 'Created ref must match its branch name' })
    if (result.createdOid.toLowerCase() !== result.baseOid.toLowerCase())
      context.addIssue({ code: 'custom', path: ['createdOid'], message: 'Created ref must start at its base OID' })
  })

export type SessionLaunchBranchCreateRequest = z.input<typeof sessionLaunchBranchCreateInputSchema>
export type SessionLaunchBranchCreateResult = z.infer<typeof sessionLaunchBranchCreateResultSchema>

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

export interface SessionLaunchBranchCreateOptions extends SessionLaunchBranchesReadOptions {
  /** Correlates this single attempt; the Host does not journal/replay create acknowledgements. */
  readonly idempotencyKey: string
}

export interface SessionLaunchBranchesManager extends SessionLaunchBranchesReader {
  create(
    input: SessionLaunchBranchCreateRequest,
    options: SessionLaunchBranchCreateOptions,
  ): Promise<SessionLaunchBranchCreateResult>
}

const metadata = {
  id: 'sessionLaunchBranches.list',
  version: 2,
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
const createMetadata = {
  ...metadata,
  id: 'sessionLaunchBranches.create',
  version: 1,
  kind: 'command' as const,
  stateEffect: 'external' as const,
  titleKey: 'commands.sessionLaunchBranches.create.title',
  descriptionKey: 'commands.sessionLaunchBranches.create.description',
  idempotency: 'none' as const,
}

export const sessionLaunchBranchesCommands = {
  'sessionLaunchBranches.list': defineCommand(
    metadata,
    sessionLaunchBranchesInputSchema,
    sessionLaunchBranchesPageSchema,
  ),
  'sessionLaunchBranches.create': defineCommand(
    createMetadata,
    sessionLaunchBranchCreateInputSchema,
    sessionLaunchBranchCreateResultSchema,
  ),
}
