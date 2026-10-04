import { CommandError } from '@hbar/commands'
import type { GitStatus } from '@hbar/contracts'
import { sessionGitStatusSchema } from '@hbar/contracts/commands/git'
import type { SessionGitStatus, SessionGitStatusEntry, SessionGitTarget } from '@hbar/contracts/commands/git'
import { posix, win32 } from 'node:path'

type PathApi = typeof posix

function usesWindowsPaths(...values: string[]) {
  return values.some(
    (value) => /^[a-z]:[\\/]/i.test(value) || value.startsWith('\\\\') || /^\/\/[^/]+\/[^/]+(?:\/|$)/.test(value),
  )
}

function inside(root: string, candidate: string, pathApi: PathApi) {
  const relation = pathApi.relative(root, candidate)
  return (
    relation === '' || (relation !== '..' && !relation.startsWith(`..${pathApi.sep}`) && !pathApi.isAbsolute(relation))
  )
}

function samePath(left: string, right: string) {
  const windows = usesWindowsPaths(left, right)
  const pathApi = windows ? win32 : posix
  const normalizedLeft = pathApi.resolve(left)
  const normalizedRight = pathApi.resolve(right)
  return windows
    ? normalizedLeft.toLocaleLowerCase('en-US') === normalizedRight.toLocaleLowerCase('en-US')
    : normalizedLeft === normalizedRight
}

export function assertSessionGitExecutionRoot(expectedRoot: string, returnedCwd: string) {
  if (!samePath(expectedRoot, returnedCwd))
    throw new CommandError('INVALID_OUTPUT', 'Git returned a result for another session execution root')
}

function repositoryPathSegments(path: string, windows: boolean) {
  if (path.includes('\\'))
    throw new CommandError('INVALID_OUTPUT', 'Git returned a path with an unsupported backslash character')
  const normalized = path
  const directory = normalized.endsWith('/')
  const value = directory ? normalized.slice(0, -1) : normalized
  if (!value || value.startsWith('/') || (windows && /^[a-z]:/i.test(value)) || value.includes('\0'))
    throw new CommandError('INVALID_OUTPUT', 'Git returned a path outside the repository-relative status format')
  const segments = value.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..'))
    throw new CommandError('INVALID_OUTPUT', 'Git returned a malformed repository-relative status path')
  return { segments, directory }
}

function projectPath(path: string, scopeSegments: readonly string[], windows: boolean) {
  const parsed = repositoryPathSegments(path, windows)
  if (parsed.segments.length < scopeSegments.length) return null
  const fold = (segment: string) => (windows ? segment.toLocaleLowerCase('en-US') : segment)
  if (
    scopeSegments.some((segment, index) => {
      const candidate = parsed.segments[index]
      return candidate === undefined || fold(candidate) !== fold(segment)
    })
  )
    return null
  const relative = parsed.segments.slice(scopeSegments.length).join('/')
  if (relative) return { path: relative, directory: parsed.directory }
  return parsed.directory ? { path: '.', directory: true } : null
}

/** Convert repository-root-relative porcelain paths into session execution-root-relative entries. */
export function projectSessionGitStatus(
  target: SessionGitTarget,
  status: GitStatus,
  executionRoot: string,
): SessionGitStatus {
  assertSessionGitExecutionRoot(executionRoot, status.cwd)
  const repositoryRootValue = status.root
  if (repositoryRootValue === null) {
    if (status.entries.length > 0)
      throw new CommandError('INVALID_OUTPUT', 'Git returned status entries without a repository root')
    return sessionGitStatusSchema.parse({
      target,
      branch: status.branch,
      head: status.head,
      upstream: status.upstream,
      ahead: status.ahead,
      behind: status.behind,
      isRepository: false,
      dirty: false,
      repositoryDirty: status.dirty,
      entries: [],
    })
  }

  const windows = usesWindowsPaths(repositoryRootValue, executionRoot)
  const pathApi = windows ? win32 : posix
  if (!windows && (repositoryRootValue.includes('\\') || executionRoot.includes('\\')))
    throw new CommandError('INVALID_OUTPUT', 'Session execution roots with backslash path segments are unsupported')
  const repositoryRoot = pathApi.resolve(repositoryRootValue)
  const sessionRoot = pathApi.resolve(executionRoot)
  if (!inside(repositoryRoot, sessionRoot, pathApi))
    throw new CommandError('INVALID_OUTPUT', 'Git repository does not own the resolved session execution root')
  const relativeRoot = pathApi.relative(repositoryRoot, sessionRoot).replaceAll('\\', '/')
  const scopeSegments = relativeRoot && relativeRoot !== '.' ? relativeRoot.split('/') : []
  const entries: SessionGitStatusEntry[] = []

  for (const item of status.entries) {
    const to = projectPath(item.path, scopeSegments, windows)
    if (item.originalPath) {
      const from = projectPath(item.originalPath, scopeSegments, windows)
      const isCopy = item.index === 'C' || item.worktree === 'C'
      if (isCopy) {
        // A copy leaves its source intact, so only a destination in scope is a scoped change.
        if (!to) continue
        entries.push({
          kind: 'copy',
          from: from?.path ?? null,
          to: to.path,
          index: item.index,
          worktree: item.worktree,
        })
        continue
      }
      if (!to && !from) continue
      entries.push({
        kind: 'rename',
        from: from?.path ?? null,
        to: to?.path ?? null,
        index: item.index,
        worktree: item.worktree,
      })
      continue
    }
    if (!to) continue
    const isUntrackedDirectory = item.index === '?' && item.worktree === '?' && to.directory
    entries.push({
      kind: 'path',
      path: to.path,
      index: item.index,
      worktree: item.worktree,
      ...(isUntrackedDirectory ? { directory: true } : {}),
    })
  }

  const result = {
    target,
    branch: status.branch,
    head: status.head,
    upstream: status.upstream,
    ahead: status.ahead,
    behind: status.behind,
    isRepository: true,
    dirty: entries.length > 0,
    repositoryDirty: status.dirty,
    entries,
  }
  return sessionGitStatusSchema.parse(result)
}
