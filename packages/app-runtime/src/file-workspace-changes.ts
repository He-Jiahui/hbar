import { CommandError, createCommandClient } from '@hbar/commands'
import { directoryCommands } from '@hbar/contracts/commands'
import { gitCommands } from '@hbar/contracts/commands/git'
import type { GitStatus } from '@hbar/contracts'
import { canonicalFilePath } from './file-workspace-documents'
import type { FileWorkspaceChangesState, FileWorkspaceEntryState, RuntimeOptions } from './types'

export const FILE_CHANGES_PAGE_SIZE = 100
export const emptyFileChanges = (): FileWorkspaceChangesState => ({
  status: 'idle',
  cwd: null,
  root: null,
  branch: null,
  items: [],
  filter: '',
  page: 0,
  limitReached: false,
  error: null,
})

function code(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'EXECUTION_FAILED'
}
function hostPath(path: string): string {
  const slash = path.replaceAll('\\', '/')
  return slash === '/' || /^[a-z]:\/$/i.test(slash) ? slash : slash.replace(/\/+$/, '')
}

/** Porcelain paths are repository-root relative, but file.read and git pathspecs belong to the selected workspace. */
export function workspaceChanges(status: GitStatus, cwd: string): FileWorkspaceChangesState['items'] {
  if (!status.root) return []
  const root = hostPath(status.root)
  const target = hostPath(cwd)
  const fold =
    /^[a-z]:\//i.test(root) || root.startsWith('//') ? (value: string) => value.toLowerCase() : (value: string) => value
  const equal = fold(target) === fold(root)
  if (!equal && !fold(target).startsWith(fold(root.endsWith('/') ? root : `${root}/`)))
    throw new CommandError('INVALID_OUTPUT', 'Git repository does not own the requested workspace')
  const prefix = equal ? '' : `${target.slice(root.endsWith('/') ? root.length : root.length + 1)}/`
  const relative = (path: string) => {
    const canonical = canonicalFilePath(path)
    if (prefix && !fold(canonical).startsWith(fold(prefix))) return null
    return canonicalFilePath(canonical.slice(prefix.length))
  }
  const items = status.entries.flatMap((item) => {
    const path = relative(item.path)
    if (!path) return []
    const originalPath = item.originalPath ? relative(item.originalPath) : null
    return [
      {
        path,
        index: item.index,
        worktree: item.worktree,
        ...(originalPath ? { originalPath } : {}),
        ...(item.index === '?' && item.worktree === '?' && item.path.endsWith('/') ? { directory: true } : {}),
      },
    ]
  })
  return [...new Map(items.map((item) => [item.path, item])).values()].sort((a, b) => a.path.localeCompare(b.path))
}

export function filteredFileChanges(changes: FileWorkspaceChangesState) {
  const filter = changes.filter.trim().toLocaleLowerCase()
  return changes.items.filter(
    (item) => !filter || `${item.path}\n${item.originalPath ?? ''}`.toLocaleLowerCase().includes(filter),
  )
}

interface ChangePorts {
  readonly read: (instanceId: string) => FileWorkspaceEntryState | undefined
  readonly replace: (entry: FileWorkspaceEntryState) => void
  readonly workspaceId: (instanceId: string) => string | null
  readonly openFile: (instanceId: string, path: string) => Promise<unknown>
  readonly openFolder: (instanceId: string, path: string) => Promise<unknown>
  readonly isDisposed: () => boolean
}

/** Read-only Git projections share the existing panel fact; request controllers own no document data. */
export function createFileWorkspaceChanges(options: RuntimeOptions, ports: ChangePorts) {
  const directory = createCommandClient(directoryCommands, options.directory)
  const git = options.git ? createCommandClient(gitCommands, options.git) : null
  const pending = new Map<string, AbortController>()
  const target = (instanceId: string, workspaceId: string) => {
    const entry = ports.read(instanceId)
    if (!entry || entry.workspaceId !== workspaceId || ports.workspaceId(instanceId) !== workspaceId)
      throw new CommandError('VERSION_CONFLICT', 'The file operation belongs to another workspace')
    return entry
  }
  const cancel = (instanceId: string) => {
    const controller = pending.get(instanceId)
    if (!controller) return
    controller.abort()
    pending.delete(instanceId)
    const entry = ports.read(instanceId)
    if (entry)
      ports.replace({
        ...entry,
        changes:
          entry.changes.status === 'loading'
            ? { ...entry.changes, status: 'error', error: 'CANCELLED' }
            : entry.changes,
        diff: entry.diff?.status === 'loading' ? { ...entry.diff, status: 'error', error: 'CANCELLED' } : entry.diff,
      })
  }
  const begin = (instanceId: string) => {
    cancel(instanceId)
    const controller = new AbortController()
    pending.set(instanceId, controller)
    return controller
  }
  const matches = (instanceId: string, workspaceId: string, controller: AbortController) =>
    !ports.isDisposed() && pending.get(instanceId) === controller && ports.workspaceId(instanceId) === workspaceId
  const requireGit = () => {
    if (!git) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Git commands are unavailable')
    return git
  }

  const load = async (instanceId: string, workspaceId: string, preservePreview = false) => {
    target(instanceId, workspaceId)
    const controller = begin(instanceId)
    const entry = target(instanceId, workspaceId)
    ports.replace({
      ...entry,
      view: preservePreview ? entry.view : 'browser',
      browserMode: 'changed',
      changes: { ...entry.changes, status: 'loading', error: null },
    })
    try {
      const workspace = await directory.execute('workspace.get', { workspaceId }, { signal: controller.signal })
      if (!workspace || workspace.id !== workspaceId) throw new CommandError('NOT_FOUND', 'Workspace no longer exists')
      if (!matches(instanceId, workspaceId, controller))
        throw new CommandError('CANCELLED', 'File changes request was superseded')
      const status = await requireGit().execute('git.status', { cwd: workspace.path }, { signal: controller.signal })
      if (!matches(instanceId, workspaceId, controller))
        throw new CommandError('CANCELLED', 'File changes request was superseded')
      const latest = target(instanceId, workspaceId)
      const changes: FileWorkspaceChangesState = {
        ...latest.changes,
        status: 'ready',
        cwd: workspace.path,
        root: status.root,
        branch: status.branch,
        items: workspaceChanges(status, workspace.path),
        page: 0,
        limitReached: status.entries.length === 5000,
        error: null,
      }
      const page = preservePreview
        ? Math.min(
            latest.changes.page,
            Math.max(0, Math.ceil(filteredFileChanges(changes).length / FILE_CHANGES_PAGE_SIZE) - 1),
          )
        : 0
      ports.replace({ ...latest, changes: { ...changes, page } })
      return target(instanceId, workspaceId)
    } catch (error) {
      if (matches(instanceId, workspaceId, controller)) {
        const latest = target(instanceId, workspaceId)
        ports.replace({ ...latest, changes: { ...latest.changes, status: 'error', error: code(error) } })
      }
      throw error instanceof CommandError ? error : new CommandError(code(error), 'Could not read workspace changes')
    } finally {
      if (pending.get(instanceId) === controller) pending.delete(instanceId)
    }
  }

  const open = async (instanceId: string, workspaceId: string, rawPath: string, selectedCached?: boolean) => {
    const entry = target(instanceId, workspaceId)
    const path = canonicalFilePath(rawPath)
    const change = entry.changes.items.find((item) => item.path === path)
    if (!change || !entry.changes.cwd || entry.changes.status !== 'ready')
      throw new CommandError('VERSION_CONFLICT', 'Refresh the original changed-file list')
    if (change.index === '?' && change.worktree === '?') {
      cancel(instanceId)
      await (change.directory ? ports.openFolder(instanceId, path) : ports.openFile(instanceId, path))
      return target(instanceId, workspaceId)
    }
    const cached = selectedCached ?? (change.worktree === ' ' && change.index !== ' ')
    const controller = begin(instanceId)
    ports.replace({
      ...entry,
      view: 'diff',
      diff: { path, cached, status: 'loading', text: '', truncated: false, error: null },
    })
    try {
      const result = await requireGit().execute(
        'git.diff',
        { cwd: entry.changes.cwd, cached, paths: [path, ...(change.originalPath ? [change.originalPath] : [])] },
        { signal: controller.signal },
      )
      if (!matches(instanceId, workspaceId, controller))
        throw new CommandError('CANCELLED', 'File diff request was superseded')
      if (result.cached !== cached) throw new CommandError('INVALID_OUTPUT', 'Git returned another diff mode')
      const latest = target(instanceId, workspaceId)
      ports.replace({
        ...latest,
        diff: { path, cached, status: 'ready', text: result.diff, truncated: result.truncated, error: null },
      })
      return target(instanceId, workspaceId)
    } catch (error) {
      if (matches(instanceId, workspaceId, controller)) {
        const latest = target(instanceId, workspaceId)
        ports.replace({
          ...latest,
          diff: { path, cached, status: 'error', text: '', truncated: false, error: code(error) },
        })
      }
      throw error instanceof CommandError
        ? error
        : new CommandError(code(error), 'Could not read the original file diff')
    } finally {
      if (pending.get(instanceId) === controller) pending.delete(instanceId)
    }
  }
  return {
    load,
    open,
    cancel,
    dispose: () => {
      for (const controller of pending.values()) controller.abort()
      pending.clear()
    },
  }
}
