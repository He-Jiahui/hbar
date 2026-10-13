import { posix, win32 } from 'node:path'
import { HbarError } from '@hbar/contracts'
import { nodeRelativePathSchema } from '@hbar/contracts/node'
import type { NodeExecutionTarget } from './execution-port'
import { isPathWithin } from '@hbar/contracts/path-containment'

export interface NodeExecutionPath {
  readonly target: NodeExecutionTarget
  readonly path: string
}

/** Resolve a caller path through A's pinned mount aliases; all physical roots remain B identities. */
export function resolveNodeExecutionPath(target: NodeExecutionTarget, requested: string): NodeExecutionPath {
  const paths = target.platform === 'win32' ? win32 : posix
  if (requested.split(/[\\/]+/).includes('..'))
    throw new HbarError('PATH_DENIED', 'Workspace node paths cannot traverse parent directories')
  if (target.platform !== 'win32' && requested.includes('\\'))
    throw new HbarError('PATH_DENIED', 'Use the workspace node POSIX path separator')
  const manifest = target.authority.workspaceMounts
  if (!manifest) return { target, path: nodeExecutionRelativePath(target, requested) }
  const bindings = manifest?.roots ?? []
  const absolute = paths.isAbsolute(requested) ? paths.normalize(requested) : undefined
  const managedPrimary =
    !!target.authority.managedWorktree &&
    target.location.rootId === `wt_${target.authority.managedWorktree.worktreeId}` &&
    target.location.nodeId === manifest.nodeId &&
    manifest.roots.some((item) => item.rootId === manifest.primaryRootId)
  let binding = manifest?.roots.find((item) => item.rootId === target.location.rootId)
  let relativePath = requested
  if (absolute) {
    if (
      managedPrimary &&
      isPathWithin(paths.normalize(target.location.nodePath), absolute, {
        separator: target.platform === 'win32' ? '\\' : '/',
        caseInsensitive: false,
      })
    ) {
      const checked = nodeRelativePathSchema.safeParse(
        paths.relative(target.location.nodePath, absolute).replaceAll('\\', '/'),
      )
      if (!checked.success) throw new HbarError('PATH_DENIED', 'The path leaves the managed workspace root')
      return { target, path: paths.normalize(checked.data || '.').replaceAll('\\', '/') || '.' }
    }
    binding = bindings.find((item) =>
      isPathWithin(paths.normalize(item.expectedRoot), absolute, {
        separator: target.platform === 'win32' ? '\\' : '/',
        caseInsensitive: false,
      }),
    )
    if (!binding) throw new HbarError('PATH_DENIED', 'The absolute path does not match a pinned node workspace root')
    if (managedPrimary && binding.rootId === manifest.primaryRootId)
      throw new HbarError('PATH_DENIED', 'Managed workspace access cannot return to its parent checkout')
    relativePath = paths.relative(binding.expectedRoot, absolute)
  } else {
    const alias = bindings.find((item) => requested === item.alias || requested.startsWith(`${item.alias}/`))
    if (alias) {
      binding = alias
      relativePath = requested === alias.alias ? '.' : requested.slice(alias.alias.length + 1)
      if (managedPrimary && alias.rootId === manifest.primaryRootId) {
        const checked = nodeRelativePathSchema.safeParse(relativePath.replaceAll('\\', '/'))
        if (!checked.success) throw new HbarError('PATH_DENIED', 'The path leaves the managed workspace root')
        return { target, path: paths.normalize(checked.data || '.').replaceAll('\\', '/') || '.' }
      }
    } else if (!binding) {
      if (!managedPrimary)
        throw new HbarError('WORKSPACE_SCOPE', 'The pinned mount manifest has no primary execution root')
      relativePath = nodeExecutionRelativePath(target, requested)
      return { target, path: relativePath }
    }
  }
  const checked = nodeRelativePathSchema.safeParse(relativePath.replaceAll('\\', '/'))
  if (!checked.success) throw new HbarError('PATH_DENIED', 'The path leaves its pinned node workspace root')
  if (!binding) return { target, path: nodeExecutionRelativePath(target, requested) }
  return {
    target: {
      ...target,
      location: { ...target.location, rootId: binding.rootId, nodePath: binding.expectedRoot },
    },
    path: paths.normalize(checked.data || '.').replaceAll('\\', '/') || '.',
  }
}

/** Translate model-facing absolute B paths without resolving anything on A's filesystem. */
export function nodeExecutionRelativePath(
  target: Pick<NodeExecutionTarget, 'location' | 'platform'>,
  requested: string,
): string {
  const paths = target.platform === 'win32' ? win32 : posix
  if (requested.split(/[\\/]+/).includes('..'))
    throw new HbarError('PATH_DENIED', 'Workspace node paths cannot traverse parent directories')
  if (target.platform !== 'win32' && requested.includes('\\'))
    throw new HbarError('PATH_DENIED', 'Use the workspace node POSIX path separator')
  if (
    paths.isAbsolute(requested) &&
    !isPathWithin(paths.normalize(target.location.nodePath), paths.normalize(requested), {
      separator: target.platform === 'win32' ? '\\' : '/',
      caseInsensitive: false,
    })
  )
    throw new HbarError('PATH_DENIED', 'The absolute path does not match the exact bound node root')
  const path = paths.isAbsolute(requested)
    ? paths.relative(target.location.nodePath, requested)
    : nodeRelativePathSchema.parse(requested)
  const checked = nodeRelativePathSchema.safeParse(path)
  if (!checked.success) throw new HbarError('PATH_DENIED', 'The path leaves the bound workspace node root')
  return paths.normalize(checked.data || '.').replaceAll('\\', '/')
}
