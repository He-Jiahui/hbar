import { CommandError, createCommandClient } from '@hbar/commands'
import { directoryCommands } from '@hbar/contracts/commands'
import { gitCommands } from '@hbar/contracts/commands/git'
import type { SessionGitStatus } from '@hbar/contracts/commands/git'
import type { SessionFileTarget } from '@hbar/contracts/commands/files'
import type { GitStatus } from '@hbar/contracts'
import { assertResolvedFileTarget, canonicalFilePath, sameSessionFileTarget } from './file-workspace-documents'
import { MAX_FILE_PREVIEWS, projectFileEntry, replaceFilePreview } from './file-workspace-previews'
import type {
  FileWorkspaceChangesState,
  FileWorkspaceEntryState,
  FileWorkspacePreviewState,
  RuntimeOptions,
} from './types'

export const FILE_CHANGES_PAGE_SIZE = 100
export const emptyFileChanges = (): FileWorkspaceChangesState => ({
  status: 'idle',
  isRepository: null,
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

/** Session Git paths are already normalized to the Host-selected execution root; never rebase them via a shared cwd. */
export function sessionWorkspaceChanges(status: SessionGitStatus): FileWorkspaceChangesState['items'] {
  return status.entries
    .flatMap((item) => {
      if (item.kind === 'path')
        return [
          {
            path: item.path,
            index: item.index,
            worktree: item.worktree,
            ...(item.directory ? { directory: true } : {}),
          },
        ]
      const path = item.kind === 'copy' ? item.to : (item.to ?? item.from)
      if (!path) return []
      const originalPath = item.from && item.from !== path ? item.from : undefined
      return [{ path, index: item.index, worktree: item.worktree, ...(originalPath ? { originalPath } : {}) }]
    })
    .sort((left, right) => left.path.localeCompare(right.path))
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
  readonly sourceSessionId: (instanceId: string) => string | null
  readonly openFile: (instanceId: string, path: string) => Promise<unknown>
  readonly openFolder: (instanceId: string, path: string) => Promise<unknown>
  readonly isDisposed: () => boolean
  readonly onPreviewOpened?: ((instanceId: string) => void) | undefined
}

/** Read-only Git projections share the existing panel fact; request controllers own no document data. */
export function createFileWorkspaceChanges(options: RuntimeOptions, ports: ChangePorts) {
  const directory = createCommandClient(directoryCommands, options.directory)
  const git = options.git ? createCommandClient(gitCommands, options.git) : null
  const pending = new Map<string, AbortController>()
  const pendingDiffs = new Map<string, AbortController>()
  const diffKey = (instanceId: string, previewId: string) => `${instanceId}\0${previewId}`
  const target = (instanceId: string, workspaceId: string) => {
    const entry = ports.read(instanceId)
    if (
      !entry ||
      entry.workspaceId !== workspaceId ||
      ports.workspaceId(instanceId) !== workspaceId ||
      entry.sourceSessionId !== ports.sourceSessionId(instanceId)
    )
      throw new CommandError('VERSION_CONFLICT', 'The file operation belongs to another workspace')
    assertResolvedFileTarget(entry.sourceSessionId, entry.sessionTarget, entry.error)
    return entry
  }
  const cancelList = (instanceId: string) => {
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
      })
  }
  const cancelDiff = (instanceId: string, previewId: string) => {
    const key = diffKey(instanceId, previewId)
    const controller = pendingDiffs.get(key)
    if (!controller) return
    controller.abort()
    pendingDiffs.delete(key)
    const entry = ports.read(instanceId)
    const preview = entry?.previews.find((value) => value.id === previewId)
    if (entry && preview?.kind === 'diff' && preview.diff.status === 'loading')
      ports.replace(
        replaceFilePreview(entry, { ...preview, diff: { ...preview.diff, status: 'error', error: 'CANCELLED' } }),
      )
  }
  const cancel = (instanceId: string) => {
    cancelList(instanceId)
    for (const key of pendingDiffs.keys())
      if (key.startsWith(`${instanceId}\0`)) cancelDiff(instanceId, key.slice(instanceId.length + 1))
  }
  const begin = (instanceId: string) => {
    cancelList(instanceId)
    const controller = new AbortController()
    pending.set(instanceId, controller)
    return controller
  }
  const matches = (
    instanceId: string,
    workspaceId: string,
    sourceSessionId: string | null,
    sessionTarget: SessionFileTarget | null,
    controller: AbortController,
  ) => {
    const entry = ports.read(instanceId)
    return (
      !ports.isDisposed() &&
      pending.get(instanceId) === controller &&
      ports.workspaceId(instanceId) === workspaceId &&
      ports.sourceSessionId(instanceId) === sourceSessionId &&
      entry?.sourceSessionId === sourceSessionId &&
      sameSessionFileTarget(entry.sessionTarget, sessionTarget)
    )
  }
  const requireGit = () => {
    if (!git) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Git commands are unavailable')
    return git
  }

  const load = async (instanceId: string, workspaceId: string, preservePreview = false) => {
    target(instanceId, workspaceId)
    const controller = begin(instanceId)
    const entry = target(instanceId, workspaceId)
    const sourceSessionId = entry.sourceSessionId
    const sessionTarget = entry.sessionTarget
    ports.replace({
      ...entry,
      activePreviewId: preservePreview ? entry.activePreviewId : null,
      browserMode: 'changed',
      changes: { ...entry.changes, status: 'loading', error: null },
    })
    try {
      const workspace = await directory.execute('workspace.get', { workspaceId }, { signal: controller.signal })
      if (!workspace || workspace.id !== workspaceId) throw new CommandError('NOT_FOUND', 'Workspace no longer exists')
      if (!matches(instanceId, workspaceId, sourceSessionId, sessionTarget, controller))
        throw new CommandError('CANCELLED', 'File changes request was superseded')
      let isRepository: boolean
      let cwd: string | null
      let root: string | null
      let branch: string | null
      let items: FileWorkspaceChangesState['items']
      let entryCount: number
      if (sessionTarget) {
        const status = await requireGit().execute(
          'sessionGit.status',
          { workspaceId, sessionId: sessionTarget.sessionId, expectedRevision: sessionTarget.expectedRevision },
          { signal: controller.signal },
        )
        if (
          status.target.workspaceId !== workspaceId ||
          status.target.sessionId !== sessionTarget.sessionId ||
          status.target.expectedRevision !== sessionTarget.expectedRevision
        )
          throw new CommandError('INVALID_OUTPUT', 'Session Git returned another execution target')
        isRepository = status.isRepository
        cwd = null
        root = null
        branch = status.branch
        items = sessionWorkspaceChanges(status)
        entryCount = status.entries.length
      } else {
        const status = await requireGit().execute('git.status', { cwd: workspace.path }, { signal: controller.signal })
        isRepository = Boolean(status.root)
        cwd = status.cwd
        root = status.root
        branch = status.branch
        items = workspaceChanges(status, status.cwd)
        entryCount = status.entries.length
      }
      if (!matches(instanceId, workspaceId, sourceSessionId, sessionTarget, controller))
        throw new CommandError('CANCELLED', 'File changes request was superseded')
      const latest = target(instanceId, workspaceId)
      const changes: FileWorkspaceChangesState = {
        ...latest.changes,
        status: 'ready',
        isRepository,
        cwd,
        root,
        branch,
        items,
        page: 0,
        limitReached: entryCount === 5000,
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
      if (matches(instanceId, workspaceId, sourceSessionId, sessionTarget, controller)) {
        const latest = target(instanceId, workspaceId)
        ports.replace({ ...latest, changes: { ...latest.changes, status: 'error', error: code(error) } })
      }
      throw error instanceof CommandError ? error : new CommandError(code(error), 'Could not read workspace changes')
    } finally {
      if (pending.get(instanceId) === controller) pending.delete(instanceId)
    }
  }

  const refresh = async (instanceId: string, workspaceId: string, previewId: string) => {
    const entry = target(instanceId, workspaceId)
    const preview = entry.previews.find((value) => value.id === previewId)
    if (preview?.kind !== 'diff') throw new CommandError('VERSION_CONFLICT', 'The original diff preview is closed')
    const key = diffKey(instanceId, previewId)
    if (pendingDiffs.has(key)) {
      ports.onPreviewOpened?.(instanceId)
      return entry
    }
    if (pendingDiffs.size >= 8) {
      ports.replace(
        replaceFilePreview(entry, { ...preview, diff: { ...preview.diff, status: 'error', error: 'BUSY' } }),
      )
      throw new CommandError('BUSY', 'Too many diff previews are loading')
    }
    const controller = new AbortController()
    pendingDiffs.set(key, controller)
    const previous = preview.diff
    ports.replace(replaceFilePreview(entry, { ...preview, diff: { ...previous, status: 'loading', error: null } }))
    ports.onPreviewOpened?.(instanceId)
    const current = () => {
      if (
        ports.isDisposed() ||
        pendingDiffs.get(key) !== controller ||
        ports.workspaceId(instanceId) !== workspaceId ||
        ports.sourceSessionId(instanceId) !== entry.sourceSessionId
      )
        return null
      const latest = ports.read(instanceId)
      if (
        latest?.workspaceId !== workspaceId ||
        latest.sourceSessionId !== entry.sourceSessionId ||
        !sameSessionFileTarget(latest.sessionTarget, entry.sessionTarget) ||
        !latest.previews.some((value) => value.id === previewId)
      )
        return null
      return latest
    }
    try {
      const paths = [preview.path, ...(preview.originalPath ? [preview.originalPath] : [])]
      let diffText: string
      let truncated: boolean
      if (entry.sessionTarget) {
        const result = await requireGit().execute(
          'sessionGit.diff',
          {
            workspaceId,
            sessionId: entry.sessionTarget.sessionId,
            expectedRevision: entry.sessionTarget.expectedRevision,
            cached: previous.cached,
            paths,
          },
          { signal: controller.signal },
        )
        if (
          result.target.workspaceId !== workspaceId ||
          result.target.sessionId !== entry.sessionTarget.sessionId ||
          result.target.expectedRevision !== entry.sessionTarget.expectedRevision ||
          result.cached !== previous.cached
        )
          throw new CommandError('INVALID_OUTPUT', 'Git returned another diff target')
        diffText = result.diff
        truncated = result.truncated
      } else {
        if (!preview.cwd) throw new CommandError('INVALID_OUTPUT', 'Project diff has no workspace target')
        const result = await requireGit().execute(
          'git.diff',
          { cwd: preview.cwd, cached: previous.cached, paths },
          { signal: controller.signal },
        )
        if (result.cached !== previous.cached || hostPath(result.cwd) !== hostPath(preview.cwd))
          throw new CommandError('INVALID_OUTPUT', 'Git returned another diff target')
        diffText = result.diff
        truncated = result.truncated
      }
      const latest = current()
      if (!latest) throw new CommandError('CANCELLED', 'File diff request was superseded')
      ports.replace(
        replaceFilePreview(latest, {
          ...preview,
          diff: { ...previous, status: 'ready', text: diffText, truncated, error: null },
        }),
      )
      return target(instanceId, workspaceId)
    } catch (error) {
      const latest = current()
      if (latest)
        ports.replace(
          replaceFilePreview(latest, { ...preview, diff: { ...previous, status: 'error', error: code(error) } }),
        )
      throw error instanceof CommandError
        ? error
        : new CommandError(code(error), 'Could not read the original file diff')
    } finally {
      if (pendingDiffs.get(key) === controller) pendingDiffs.delete(key)
    }
  }
  const open = async (instanceId: string, workspaceId: string, rawPath: string, selectedCached?: boolean) => {
    const entry = target(instanceId, workspaceId)
    const path = rawPath === '.' ? '.' : canonicalFilePath(rawPath)
    const change = entry.changes.items.find((item) => item.path === path)
    if (
      !change ||
      (!entry.sessionTarget && (!entry.changes.cwd || !entry.changes.root)) ||
      entry.changes.status !== 'ready'
    )
      throw new CommandError('VERSION_CONFLICT', 'Refresh the original changed-file list')
    if (change.index === '?' && change.worktree === '?') {
      cancelList(instanceId)
      await (change.directory ? ports.openFolder(instanceId, path) : ports.openFile(instanceId, path))
      return target(instanceId, workspaceId)
    }
    const cached = selectedCached ?? (change.worktree === ' ' && change.index !== ' ')
    const existing = entry.previews.find(
      (preview) => preview.kind === 'diff' && preview.path === path && preview.diff.cached === cached,
    )
    if (!existing && entry.previews.length >= MAX_FILE_PREVIEWS)
      throw new CommandError('BUSY', 'Close another file preview first')
    const preview: FileWorkspacePreviewState = existing ?? {
      id: crypto.randomUUID(),
      kind: 'diff',
      path,
      cwd: entry.changes.cwd,
      originalPath: change.originalPath ?? null,
      diff: { path, cached, status: 'loading', text: '', truncated: false, error: null },
    }
    ports.replace(projectFileEntry(replaceFilePreview({ ...entry, error: null }, preview, true)))
    return refresh(instanceId, workspaceId, preview.id)
  }
  return {
    load,
    open,
    refresh,
    cancel,
    cancelList,
    cancelDiff,
    dispose: () => {
      for (const controller of pending.values()) controller.abort()
      pending.clear()
      for (const controller of pendingDiffs.values()) controller.abort()
      pendingDiffs.clear()
    },
  }
}
