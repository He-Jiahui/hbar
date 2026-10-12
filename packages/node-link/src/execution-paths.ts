import { posix, win32 } from 'node:path'
import { HbarError } from '@hbar/contracts'
import { nodeRelativePathSchema } from '@hbar/contracts/node'
import type { NodeExecutionTarget } from './execution-port'
import { isPathWithin } from '@hbar/contracts/path-containment'

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
