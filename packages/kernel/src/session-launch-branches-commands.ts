import { createHash } from 'node:crypto'
import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError, idSchema } from '@hbar/contracts'
import {
  sessionLaunchBranchCreateResultSchema,
  sessionLaunchBranchesCommands,
  sessionLaunchBranchHeadSchema,
  sessionLaunchBranchesPageSchema,
} from '@hbar/contracts/commands/session-launch-branches'
import type { GitLaunchBranchSnapshot, GitService } from '@hbar/plugin-sdk'
import type { StoragePort } from '@hbar/storage'
import { z } from 'zod'

const MAX_LAUNCH_BRANCH_REFS = 5_000
const gitObjectIdSchema = z.union([z.string().regex(/^[0-9a-f]{40}$/i), z.string().regex(/^[0-9a-f]{64}$/i)])
const gitLaunchBranchCreateResultSchema = z.strictObject({
  ref: z.string().min('refs/heads/'.length + 1).max(1_011).startsWith('refs/heads/'),
  oid: gitObjectIdSchema,
})
const gitLaunchBranchSnapshotSchema = z
  .strictObject({
    repository: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('not-repository') }),
      z.strictObject({
        kind: z.literal('repository'),
        workspaceScope: z.enum(['repository-root', 'repository-subdirectory']),
        head: sessionLaunchBranchHeadSchema,
      }),
    ]),
    branches: z
      .array(
        z
          .strictObject({
            name: z.string().min(1).max(1_000),
            ref: z
              .string()
              .min('refs/heads/'.length + 1)
              .max(1_011)
              .startsWith('refs/heads/'),
            oid: gitObjectIdSchema,
            current: z.boolean(),
            worktree: z.enum(['current', 'elsewhere', 'available', 'unknown']),
          })
          .refine((branch) => branch.ref.slice('refs/heads/'.length) === branch.name),
      )
      .max(MAX_LAUNCH_BRANCH_REFS),
    incomplete: z.boolean(),
  })
  .superRefine((snapshot, context) => {
    if (snapshot.repository.kind === 'not-repository') {
      if (snapshot.branches.length > 0 || snapshot.incomplete)
        context.addIssue({ code: 'custom', path: ['repository'], message: 'Non-repository snapshots must be empty' })
      return
    }

    const head = snapshot.repository.head
    if ((head.kind === 'branch' || head.kind === 'unborn') && head.ref.slice('refs/heads/'.length) !== head.name)
      context.addIssue({ code: 'custom', path: ['repository', 'head'], message: 'Head name must match its Git ref' })

    const refs = new Set<string>()
    for (const [index, branch] of snapshot.branches.entries()) {
      if (refs.has(branch.ref))
        context.addIssue({ code: 'custom', path: ['branches', index, 'ref'], message: 'Duplicate local branch ref' })
      refs.add(branch.ref)
    }
  })
type ValidatedGitLaunchBranchSnapshot = z.infer<typeof gitLaunchBranchSnapshotSchema>

const cursorPayloadSchema = z.strictObject({
  version: z.literal(1),
  workspaceId: idSchema,
  search: z.string().max(512),
  snapshot: z.string().regex(/^[0-9a-f]{64}$/),
  offset: z.number().int().min(1).max(MAX_LAUNCH_BRANCH_REFS),
})
type CursorPayload = z.infer<typeof cursorPayloadSchema>

function invalidCursor(): CommandError {
  return new CommandError(
    'INVALID_CURSOR',
    'Branch discovery cursor is stale or does not match this workspace and search',
  )
}

function decodeCursor(value: string): CursorPayload {
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8')
    if (!decoded || Buffer.from(decoded, 'utf8').toString('base64url') !== value) throw invalidCursor()
    const input: unknown = JSON.parse(decoded)
    const parsed = cursorPayloadSchema.safeParse(input)
    if (!parsed.success) throw invalidCursor()
    return parsed.data
  } catch (error) {
    if (error instanceof CommandError) throw error
    throw invalidCursor()
  }
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

function snapshotFingerprint(snapshot: ValidatedGitLaunchBranchSnapshot): string {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
}

function matchesSearch(name: string, search: string): boolean {
  return normalizeSearch(name).includes(normalizeSearch(search))
}

function normalizeSearch(search: string): string {
  return search.normalize('NFC').toLowerCase()
}

function sharedCurrentAvailability(worktree: ValidatedGitLaunchBranchSnapshot['branches'][number]['worktree']) {
  if (worktree === 'elsewhere') return { state: 'disabled' as const, reason: 'checked-out-elsewhere' as const }
  if (worktree === 'unknown') return { state: 'unknown' as const, reason: 'worktree-state-unavailable' as const }
  return { state: 'available' as const }
}

function invalidSnapshot(): CommandError {
  return new CommandError('INVALID_OUTPUT', 'Git returned an invalid launch branch snapshot')
}

function validateSnapshot(value: unknown): ValidatedGitLaunchBranchSnapshot {
  try {
    const result = gitLaunchBranchSnapshotSchema.safeParse(value)
    if (!result.success) throw invalidSnapshot()
    return result.data
  } catch {
    throw invalidSnapshot()
  }
}

function projectPage(
  workspaceId: string,
  snapshot: ValidatedGitLaunchBranchSnapshot,
  branches: ValidatedGitLaunchBranchSnapshot['branches'][number][],
  nextCursor: string | null,
) {
  return sessionLaunchBranchesPageSchema.parse({
    workspaceId,
    repository: snapshot.repository,
    branches: branches.map((branch) => ({
      name: branch.name,
      ref: branch.ref,
      tipOid: branch.oid,
      current: branch.current,
      availability: {
        sharedCurrent: sharedCurrentAvailability(branch.worktree),
        isolatedBase:
          snapshot.repository.kind === 'repository' && snapshot.repository.workspaceScope === 'repository-subdirectory'
            ? { state: 'disabled' as const, reason: 'repository-root-required' as const }
            : { state: 'available' as const },
      },
    })),
    nextCursor,
    incomplete: snapshot.incomplete,
  })
}

export function createSessionLaunchBranchesCommands(
  storage: StoragePort,
  git: Pick<GitService, 'launchBranchSnapshot'> & Partial<Pick<GitService, 'createLaunchBranch'>>,
  options: {
    readonly manualQuery?: (
      input: {
        readonly workspaceId: string
        readonly actorId: string
        readonly requestId: string
        readonly cwd: string
      },
      signal: AbortSignal,
    ) => Promise<GitLaunchBranchSnapshot | null>
  } = {},
) {
  const registry = new CommandRegistry({ execution: 'host' })
  const read = async <Value>(operation: () => Promise<Value>): Promise<Value> => {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  }

  registry.register(sessionLaunchBranchesCommands['sessionLaunchBranches.list'], async (input, context) =>
    read(async () => {
      if (!context.actorId) throw new CommandError('INVALID_INPUT', 'Authenticated actor is required')
      if (typeof git.launchBranchSnapshot !== 'function')
        throw new CommandError('CAPABILITY_UNAVAILABLE', 'Registered Git service cannot discover launch branches')
      context.signal.throwIfAborted()
      const cursor = input.cursor ? decodeCursor(input.cursor) : null
      const search = normalizeSearch(input.search)
      if (cursor && (cursor.workspaceId !== input.workspaceId || cursor.search !== search)) throw invalidCursor()

      const workspace = await storage.call('workspace', input.workspaceId)
      context.signal.throwIfAborted()
      const rawSnapshot: unknown = options.manualQuery
        ? ((await options.manualQuery(
            {
              workspaceId: input.workspaceId,
              actorId: context.actorId,
              requestId: context.requestId,
              cwd: workspace.path,
            },
            context.signal,
          )) ?? (await git.launchBranchSnapshot(workspace.path, context.signal)))
        : await git.launchBranchSnapshot(workspace.path, context.signal)
      context.signal.throwIfAborted()
      const snapshot = validateSnapshot(rawSnapshot)
      const fingerprint = snapshotFingerprint(snapshot)
      if (cursor && cursor.snapshot !== fingerprint) throw invalidCursor()
      if (snapshot.repository.kind === 'not-repository') return projectPage(input.workspaceId, snapshot, [], null)

      const matchingBranches = snapshot.branches.filter((branch) => matchesSearch(branch.name, input.search))
      const offset = cursor?.offset ?? 0
      if (offset > matchingBranches.length) throw invalidCursor()
      const pageBranches = matchingBranches.slice(offset, offset + input.limit)
      const end = offset + pageBranches.length
      const nextCursor =
        end < matchingBranches.length
          ? encodeCursor({
              version: 1,
              workspaceId: input.workspaceId,
              search,
              snapshot: fingerprint,
              offset: end,
            })
          : null
      return projectPage(input.workspaceId, snapshot, pageBranches, nextCursor)
    }),
  )

  registry.register(
    sessionLaunchBranchesCommands['sessionLaunchBranches.create'],
    async (input, context) => {
      if (!context.actorId || !context.idempotencyKey)
        throw new CommandError('INVALID_INPUT', 'Authenticated actor and single-attempt correlation key are required')
      if (typeof git.createLaunchBranch !== 'function')
        throw new CommandError('CAPABILITY_UNAVAILABLE', 'Registered Git service cannot create launch branches')
      if (context.signal.aborted) throw new CommandError('CANCELLED', 'Branch creation was cancelled before dispatch')

      const workspace = await read(() => storage.call('workspace', input.workspaceId))
      if (context.signal.aborted) throw new CommandError('CANCELLED', 'Branch creation was cancelled before dispatch')
      try {
        const raw: unknown = await git.createLaunchBranch(
          workspace.path,
          { name: input.name, baseRef: input.baseRef, expectedBaseOid: input.expectedBaseOid },
          context.signal,
        )
        if (context.signal.aborted)
          throw new CommandError('RESULT_UNKNOWN', 'Branch creation was interrupted; verify the original ref')
        const created = gitLaunchBranchCreateResultSchema.safeParse(raw)
        if (
          !created.success ||
          created.data.ref !== `refs/heads/${input.name}` ||
          created.data.oid.toLowerCase() !== input.expectedBaseOid.toLowerCase()
        )
          throw new CommandError('RESULT_UNKNOWN', 'Branch creation could not be verified; inspect the original ref')
        return sessionLaunchBranchCreateResultSchema.parse({
          workspaceId: input.workspaceId,
          name: input.name,
          createdRef: created.data.ref,
          createdOid: created.data.oid,
          baseRef: input.baseRef,
          baseOid: input.expectedBaseOid,
        })
      } catch (error: unknown) {
        if (error instanceof CommandError) throw error
        if (error instanceof HbarError) {
          if (
            [
              'GIT_INVALID_BRANCH',
              'GIT_BRANCH_EXISTS',
              'GIT_BRANCH_BASE_NOT_FOUND',
              'GIT_BRANCH_BASE_CHANGED',
              'GIT_NOT_REPOSITORY',
              'PATH_DENIED',
            ].includes(error.code)
          )
            throw new CommandError(error.code, error.message)
        }
        throw new CommandError('RESULT_UNKNOWN', 'Branch creation outcome is uncertain; verify the original ref')
      }
    },
    { durable: true },
  )

  return {
    ...createCommandClient(sessionLaunchBranchesCommands, registry),
    dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    describe: (id: string) => registry.describe(id),
    list: (filter?: { readonly includeInternal?: boolean }) =>
      registry.list({ limit: 500, ...(filter?.includeInternal ? { includeInternal: true } : {}) }),
    dispose: () => registry.dispose(),
  }
}
