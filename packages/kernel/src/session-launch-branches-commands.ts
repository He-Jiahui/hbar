import { createHash } from 'node:crypto'
import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError, idSchema } from '@hbar/contracts'
import {
  sessionLaunchBranchesCommands,
  sessionLaunchBranchesPageSchema,
} from '@hbar/contracts/commands/session-launch-branches'
import type { GitLaunchBranchSnapshot, GitService } from '@hbar/plugin-sdk'
import type { StoragePort } from '@hbar/storage'
import { z } from 'zod'

const MAX_LAUNCH_BRANCH_REFS = 5_000
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

function snapshotFingerprint(snapshot: GitLaunchBranchSnapshot): string {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
}

function matchesSearch(name: string, search: string): boolean {
  return normalizeSearch(name).includes(normalizeSearch(search))
}

function normalizeSearch(search: string): string {
  return search.normalize('NFC').toLowerCase()
}

function sharedCurrentAvailability(worktree: GitLaunchBranchSnapshot['branches'][number]['worktree']) {
  if (worktree === 'elsewhere') return { state: 'disabled' as const, reason: 'checked-out-elsewhere' as const }
  if (worktree === 'unknown') return { state: 'unknown' as const, reason: 'worktree-state-unavailable' as const }
  return { state: 'available' as const }
}

function projectPage(
  workspaceId: string,
  snapshot: GitLaunchBranchSnapshot,
  branches: GitLaunchBranchSnapshot['branches'][number][],
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
        isolatedBase: { state: 'available' as const },
      },
    })),
    nextCursor,
    incomplete: snapshot.incomplete,
  })
}

export function createSessionLaunchBranchesCommands(
  storage: StoragePort,
  git: Pick<GitService, 'launchBranchSnapshot'>,
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
      const snapshot = await git.launchBranchSnapshot(workspace.path, context.signal)
      context.signal.throwIfAborted()
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

  return {
    ...createCommandClient(sessionLaunchBranchesCommands, registry),
    dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 500 }),
    dispose: () => registry.dispose(),
  }
}
