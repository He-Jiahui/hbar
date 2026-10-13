import { realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { homedir } from 'node:os'
import { HbarError } from '@hbar/contracts'
import { nodeRelativePathSchema, type NodeFloor } from '@hbar/contracts/node'
import type { SandboxPathPort } from '@hbar/sandbox'
import { isPathWithin } from '@hbar/contracts/path-containment'
import type { ProcessPermissionPathPort } from './process-permissions'

export async function canonicalNodePath(path: string): Promise<string> {
  const missing: string[] = []
  let current = path
  for (;;) {
    try {
      return join(await realpath(current), ...missing.reverse())
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || !['ENOENT', 'ENOTDIR'].includes(String(error.code)))
        throw error
      const parent = dirname(current)
      if (parent === current) throw error
      missing.push(basename(current))
      current = parent
    }
  }
}
export const localNodePaths: SandboxPathPort = {
  canonical: canonicalNodePath,
  resolve,
  relative,
  isAbsolute,
  separator: process.platform === 'win32' ? '\\' : '/',
  caseInsensitive: process.platform === 'win32' || process.platform === 'darwin',
}
export const localProcessPermissionPaths: ProcessPermissionPathPort = {
  ...localNodePaths,
  exists: async (path) => {
    try {
      await stat(path)
      return true
    } catch (error) {
      if (error instanceof Error && 'code' in error && ['ENOENT', 'ENOTDIR'].includes(String(error.code))) return false
      throw error
    }
  },
}
function inside(root: string, path: string, protectedPath = false): boolean {
  return isPathWithin(root, path, { separator: localNodePaths.separator, caseInsensitive: protectedPath })
}
export function expandProtectedPath(path: string): string {
  return resolve(path.startsWith('~/') || path.startsWith('~\\') ? join(homedir(), path.slice(2)) : path)
}
export function nodeProtectedPaths(
  floor: NodeFloor,
  dataRoot: string,
  executionRoot?: string,
  allowManagedWorktreeWrite = false,
): string[] {
  const managedDirectories = floor.roots
    .map((root) => join(root.path, '.hbar-worktrees'))
    .filter((path) => {
      if (allowManagedWorktreeWrite && executionRoot && resolve(path) === resolve(executionRoot, '.hbar-worktrees'))
        return false
      return (
        !executionRoot ||
        !isPathWithin(path, executionRoot, {
          separator: localNodePaths.separator,
          caseInsensitive: localNodePaths.caseInsensitive,
        })
      )
    })
  return [
    dataRoot,
    join(homedir(), '.ssh'),
    join(homedir(), '.aws'),
    join(homedir(), '.config/gh'),
    ...floor.roots.map((root) => join(root.path, '.git/hooks')),
    ...managedDirectories,
    ...floor.protectedPaths.map(expandProtectedPath),
  ]
}
/** Canonicalize again immediately before each I/O; the executor independently checks symlinks as well. */
export async function nodeOwnedPath(
  floor: NodeFloor,
  dataRoot: string,
  rootId: string,
  requested: string,
  writing = false,
) {
  nodeRelativePathSchema.parse(requested)
  const root = floor.roots.find((root) => root.rootId === rootId)
  if (!root) throw new HbarError('NODE_DENIED', 'The node root is not shared')
  if (writing && root.access !== 'write') throw new HbarError('NODE_DENIED', 'The shared root is read only')
  const canonicalRoot = await realpath(root.path)
  if (canonicalRoot !== resolve(root.path))
    throw new HbarError('NODE_ROOT_CHANGED', 'The registered shared root resolves to a different location')
  const lexical = resolve(root.path, requested)
  const path = await canonicalNodePath(lexical)
  if (!inside(canonicalRoot, path)) throw new HbarError('NODE_DENIED', 'The path leaves the shared root')
  const protectedPaths = nodeProtectedPaths(floor, dataRoot, canonicalRoot)
  for (const blocked of protectedPaths) {
    const protectedPath = await canonicalNodePath(blocked)
    if (inside(protectedPath, path, true) || inside(resolve(blocked), lexical, true))
      throw new HbarError('NODE_DENIED', 'The path is protected by this node')
  }
  return { root: canonicalRoot, path, registration: root }
}
export async function validateNodeRoots(floor: NodeFloor, dataRoot: string, register = false): Promise<NodeFloor> {
  const seen = new Set<string>()
  const roots: NodeFloor['roots'] = []
  for (const root of floor.roots) {
    if (!isAbsolute(root.path)) throw new HbarError('INVALID_INPUT', 'Shared roots must be absolute local paths')
    const canonical = await realpath(root.path)
    if (!register && canonical !== resolve(root.path))
      throw new HbarError('NODE_ROOT_CHANGED', 'The persisted shared root resolves to a different location')
    if (!(await stat(canonical)).isDirectory()) throw new HbarError('INVALID_INPUT', 'Shared root is not a directory')
    if (inside(await canonicalNodePath(dataRoot), canonical, true))
      throw new HbarError('NODE_DENIED', 'The node data directory cannot be shared')
    if (seen.has(canonical)) throw new HbarError('INVALID_INPUT', 'Shared roots must be distinct')
    seen.add(canonical)
    roots.push({ ...root, path: canonical })
  }
  return { ...floor, roots }
}
