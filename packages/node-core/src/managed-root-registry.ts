import { lstat, readFile, realpath, stat } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { HbarError } from '@hbar/contracts'
import { nodeManagedWorktreeSchema, type NodeManagedWorktree } from '@hbar/contracts/node-worktree'
import { nodeRootIdSchema, type NodeFloor } from '@hbar/contracts/node'
import { isPathWithin } from '@hbar/contracts/path-containment'

const MANAGED_WORKTREE_DIRECTORY = '.hbar-worktrees'

function worktreeRootId(worktreeId: string): string {
  return nodeRootIdSchema.parse(`wt_${worktreeId}`)
}

function within(root: string, path: string): boolean {
  return isPathWithin(root, path, {
    separator: process.platform === 'win32' ? '\\' : '/',
    caseInsensitive: process.platform === 'win32' || process.platform === 'darwin',
  })
}

/** Revalidates persisted B provenance before a managed root is used. */
export async function validateManagedNodeWorktree(
  floor: NodeFloor,
  worktreeValue: NodeManagedWorktree,
): Promise<{ readonly parent: string; readonly path: string; readonly commonGitDir: string }> {
  const worktree = nodeManagedWorktreeSchema.parse(worktreeValue)
  if (worktree.worktreeRootId !== worktreeRootId(worktree.worktreeId))
    throw new HbarError('NODE_WORKTREE_METADATA', 'Managed root id does not match its worktree identity')
  const registration = floor.roots.find((root) => root.rootId === worktree.parentRootId)
  if (!registration || registration.access !== 'write')
    throw new HbarError('NODE_WORKTREE_METADATA', 'Managed worktree parent is no longer a writable registered root')
  const parent = await realpath(registration.path)
  if (parent !== resolve(registration.path))
    throw new HbarError('NODE_ROOT_CHANGED', 'Managed worktree parent no longer matches its registered root')
  const expectedPath = resolve(parent, MANAGED_WORKTREE_DIRECTORY, worktree.worktreeId)
  if (resolve(worktree.nodePath) !== expectedPath)
    throw new HbarError('NODE_WORKTREE_METADATA', 'Managed worktree path differs from its generated identity')
  if (
    (await realpath(expectedPath)) !== expectedPath ||
    !(await stat(expectedPath)).isDirectory() ||
    !within(parent, expectedPath)
  )
    throw new HbarError('NODE_WORKTREE_METADATA', 'Managed worktree is not a canonical directory beneath its parent')

  const parentGit = resolve(parent, '.git')
  const parentGitInfo = await lstat(parentGit)
  if (parentGitInfo.isSymbolicLink() || !parentGitInfo.isDirectory())
    throw new HbarError('NODE_WORKTREE_METADATA', 'Registered parent Git metadata must be a real .git directory')
  const commonWorktrees = await realpath(resolve(parentGit, 'worktrees'))
  if (!within(parentGit, commonWorktrees))
    throw new HbarError('NODE_WORKTREE_METADATA', 'Common Git worktree metadata escaped the registered parent')

  const marker = resolve(expectedPath, '.git')
  const markerInfo = await lstat(marker)
  if (markerInfo.isSymbolicLink() || !markerInfo.isFile())
    throw new HbarError('NODE_WORKTREE_METADATA', 'Managed worktree .git marker must be a regular file')
  const markerText = await readFile(marker, 'utf8')
  const markerMatch = /^gitdir: (.+)\r?\n?$/.exec(markerText)
  if (!markerMatch?.[1]) throw new HbarError('NODE_WORKTREE_METADATA', 'Managed worktree .git marker is invalid')
  const metadata = await realpath(resolve(expectedPath, markerMatch[1]))
  if (!within(commonWorktrees, metadata) || relative(commonWorktrees, metadata) !== worktree.worktreeId)
    throw new HbarError(
      'NODE_WORKTREE_METADATA',
      'Managed worktree common Git metadata differs from its registered parent',
    )
  const reciprocal = await readFile(resolve(metadata, 'gitdir'), 'utf8')
  const reciprocalMatch = /^(.+?)\r?\n?$/.exec(reciprocal)
  if (!reciprocalMatch?.[1] || (await realpath(resolve(metadata, reciprocalMatch[1]))) !== marker)
    throw new HbarError(
      'NODE_WORKTREE_METADATA',
      'Managed worktree Git metadata does not point back to its registered checkout',
    )
  return { parent, path: expectedPath, commonGitDir: parentGit }
}

/**
 * In-memory index for allocator-owned roots. The durable worktree manifest is
 * authoritative; registration never accepts caller-chosen IDs or paths.
 */
export class ManagedNodeRootRegistry {
  private readonly roots = new Map<string, NodeManagedWorktree>()

  constructor(private readonly floor: () => NodeFloor) {}

  async register(value: NodeManagedWorktree, access: 'read' | 'write' = 'write'): Promise<void> {
    if (access !== 'write') throw new HbarError('NODE_DENIED', 'Managed worktree roots must remain writable')
    const worktree = nodeManagedWorktreeSchema.parse(value)
    const floor = this.floor()
    if (floor.roots.some((root) => root.rootId === worktree.worktreeRootId))
      throw new HbarError('NODE_WORKTREE_METADATA', 'Managed worktree root id collides with a configured root')
    if (!this.roots.has(worktree.worktreeRootId) && this.roots.size + floor.roots.length >= 64)
      throw new HbarError('LIMIT_EXCEEDED', 'Node root capability limit reached')
    await validateManagedNodeWorktree(floor, worktree)
    const prior = this.roots.get(worktree.worktreeRootId)
    if (prior && JSON.stringify(prior) !== JSON.stringify(worktree))
      throw new HbarError('NODE_WORKTREE_METADATA', 'Managed worktree root identity conflicts with its provenance')
    this.roots.set(worktree.worktreeRootId, worktree)
  }

  async unregister(rootIdValue: string, worktreeId: string): Promise<void> {
    const rootId = nodeRootIdSchema.parse(rootIdValue)
    const prior = this.roots.get(rootId)
    if (!prior) return
    if (prior.worktreeId !== worktreeId || prior.worktreeRootId !== worktreeRootId(worktreeId))
      throw new HbarError('NODE_WORKTREE_METADATA', 'Cannot unregister a different managed worktree')
    this.roots.delete(rootId)
  }

  async resolve(
    rootIdValue: string,
    authority: {
      readonly sessionId: string
      readonly managedWorktree?: { readonly worktreeId: string; readonly targetRevision: number }
    },
  ): Promise<NodeManagedWorktree | null> {
    const resolved = await this.resolveDetails(rootIdValue, authority)
    return resolved?.worktree ?? null
  }

  async resolveCanonicalPath(rootIdValue: string, expectedPath: string) {
    const rootId = nodeRootIdSchema.parse(rootIdValue)
    const worktree = this.roots.get(rootId)
    if (!worktree || worktree.nodePath !== expectedPath) return null
    return { worktree, ...(await validateManagedNodeWorktree(this.floor(), worktree)) }
  }

  async resolveDetails(
    rootIdValue: string,
    authority: {
      readonly sessionId: string
      readonly managedWorktree?: { readonly worktreeId: string; readonly targetRevision: number }
    },
  ): Promise<{
    readonly worktree: NodeManagedWorktree
    readonly parent: string
    readonly path: string
    readonly commonGitDir: string
  } | null> {
    const rootId = nodeRootIdSchema.parse(rootIdValue)
    const worktree = this.roots.get(rootId)
    if (!worktree) return null
    if (
      worktree.sessionId !== authority.sessionId ||
      worktree.worktreeId !== authority.managedWorktree?.worktreeId ||
      worktree.targetRevision !== authority.managedWorktree?.targetRevision
    )
      throw new HbarError('NODE_DENIED', 'Managed worktree is not bound to this Session target')
    const validated = await validateManagedNodeWorktree(this.floor(), worktree)
    return { worktree, ...validated }
  }

  list(): NodeManagedWorktree[] {
    return [...this.roots.values()]
  }
}

export function managedNodeFloor(floor: NodeFloor, worktree: NodeManagedWorktree): NodeFloor {
  const roots = floor.roots.some((root) => root.rootId === worktree.worktreeRootId)
    ? floor.roots
    : [
        ...floor.roots,
        {
          rootId: worktree.worktreeRootId,
          name: `Worktree ${worktree.worktreeId.slice(0, 8)}`,
          path: worktree.nodePath,
          access: 'write' as const,
        },
      ]
  return { ...floor, roots }
}
