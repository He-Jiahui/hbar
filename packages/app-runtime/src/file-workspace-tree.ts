import { CommandError, createCommandClient } from '@hbar/commands'
import { fileCommands } from '@hbar/contracts/commands/files'
import type { SessionFileTarget } from '@hbar/contracts/commands/files'
import { assertResolvedFileTarget, canonicalFilePath, sameSessionFileTarget } from './file-workspace-documents'
import type {
  FileWorkspaceEntryState,
  FileWorkspaceTreeDirectoryState,
  FileWorkspaceTreeState,
  RuntimeOptions,
} from './types'

const PAGE_SIZE = 200
const MAX_DIRECTORY_ENTRIES = 500
const MAX_TREE_DIRECTORIES = 64
const MAX_VISIBLE_ENTRIES = 1000
const MAX_CONCURRENT_LOADS = 8
const SEARCH_LIMIT = 100
const SEARCH_DELAY_MS = 250

export const emptyFileTree = (filter = '', revalidateOnOpen = false): FileWorkspaceTreeState => ({
  filter,
  search: { status: 'idle', paths: [], truncated: false, error: null },
  nodes: {},
  revalidateOnOpen,
  error: null,
})

function code(error: unknown) {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'EXECUTION_FAILED'
}

function parent(path: string): string {
  const separator = path.lastIndexOf('/')
  return separator < 0 ? '.' : path.slice(0, separator)
}

interface TreePorts {
  readonly read: (instanceId: string) => FileWorkspaceEntryState | undefined
  readonly replace: (entry: FileWorkspaceEntryState) => void
  readonly workspaceId: (instanceId: string) => string | null
  readonly sourceSessionId: (instanceId: string) => string | null
  readonly isDisposed: () => boolean
}

/** Lazy, bounded directory projection; document drafts remain in FileWorkspaceDocuments. */
export function createFileWorkspaceTree(options: RuntimeOptions, ports: TreePorts) {
  const files = options.files ? createCommandClient(fileCommands, options.files) : null
  const pending = new Map<string, AbortController>()
  const searches = new Map<string, { controller: AbortController; timer: ReturnType<typeof setTimeout> | null }>()
  const key = (instanceId: string, path: string) => `${instanceId}\0${path}`
  const target = (instanceId: string, workspaceId: string) => {
    const entry = ports.read(instanceId)
    if (
      !entry ||
      entry.workspaceId !== workspaceId ||
      ports.workspaceId(instanceId) !== workspaceId ||
      entry.sourceSessionId !== ports.sourceSessionId(instanceId)
    )
      throw new CommandError('VERSION_CONFLICT', 'Directory belongs to another file panel target')
    assertResolvedFileTarget(entry.sourceSessionId, entry.sessionTarget, entry.error)
    return entry
  }
  const directory = (entry: FileWorkspaceEntryState, rawPath: string) => {
    const path = canonicalFilePath(rawPath)
    const holder = parent(path)
    const items = holder === entry.path ? entry.items : entry.tree.nodes[holder]?.items
    if (!items?.some((item) => item.directory && item.path === path))
      throw new CommandError('VERSION_CONFLICT', 'Folder is not in the loaded tree')
    return path
  }
  const scopeMatches = (
    instanceId: string,
    workspaceId: string,
    sourceSessionId: string | null,
    sessionTarget: SessionFileTarget | null,
  ) => {
    const entry = ports.read(instanceId)
    return (
      !ports.isDisposed() &&
      ports.workspaceId(instanceId) === workspaceId &&
      ports.sourceSessionId(instanceId) === sourceSessionId &&
      entry?.sourceSessionId === sourceSessionId &&
      sameSessionFileTarget(entry.sessionTarget, sessionTarget)
    )
  }
  const matches = (
    instanceId: string,
    workspaceId: string,
    sourceSessionId: string | null,
    sessionTarget: SessionFileTarget | null,
    path: string,
    controller: AbortController,
  ) =>
    pending.get(key(instanceId, path)) === controller &&
    scopeMatches(instanceId, workspaceId, sourceSessionId, sessionTarget)
  const cancelSubtree = (instanceId: string, path?: string) => {
    for (const [requestKey, controller] of pending) {
      if (!requestKey.startsWith(`${instanceId}\0`)) continue
      const requestedPath = requestKey.slice(instanceId.length + 1)
      if (path && requestedPath !== path && !requestedPath.startsWith(`${path}/`)) continue
      controller.abort()
      pending.delete(requestKey)
    }
  }
  const cancelSearch = (instanceId: string) => {
    const active = searches.get(instanceId)
    if (!active) return
    if (active.timer) clearTimeout(active.timer)
    active.controller.abort()
    searches.delete(instanceId)
  }
  const search = (instanceId: string, workspaceId: string, filter: string, delay = SEARCH_DELAY_MS) => {
    cancelSearch(instanceId)
    const query = filter.trim()
    const entry = target(instanceId, workspaceId)
    if (!query) {
      ports.replace({ ...entry, tree: { ...entry.tree, filter, search: emptyFileTree().search } })
      return
    }
    const controller = new AbortController()
    const active: { controller: AbortController; timer: ReturnType<typeof setTimeout> | null } = {
      controller,
      timer: null,
    }
    const sourceSessionId = entry.sourceSessionId
    const sessionTarget = entry.sessionTarget
    searches.set(instanceId, active)
    ports.replace({
      ...entry,
      tree: { ...entry.tree, filter, search: { status: 'loading', paths: [], truncated: false, error: null } },
    })
    const run = async () => {
      active.timer = null
      try {
        if (!files) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Files are unavailable')
        const result = await files.execute(
          'file.find',
          {
            workspaceId,
            ...(sessionTarget ? { sessionTarget } : {}),
            query,
            path: '.',
            limit: SEARCH_LIMIT,
          },
          { signal: controller.signal },
        )
        if (
          searches.get(instanceId) !== active ||
          !scopeMatches(instanceId, workspaceId, sourceSessionId, sessionTarget)
        )
          return
        const latest = target(instanceId, workspaceId)
        if (latest.tree.filter !== filter) return
        if (result.paths.length > SEARCH_LIMIT || result.paths.some((path) => canonicalFilePath(path) !== path))
          throw new CommandError('INVALID_OUTPUT', 'Invalid file search results')
        const paths = [...new Set(result.paths)]
        ports.replace({
          ...latest,
          tree: { ...latest.tree, search: { status: 'ready', paths, truncated: result.truncated, error: null } },
        })
      } catch (error) {
        if (
          searches.get(instanceId) !== active ||
          !scopeMatches(instanceId, workspaceId, sourceSessionId, sessionTarget)
        )
          return
        const latest = target(instanceId, workspaceId)
        if (latest.tree.filter !== filter) return
        ports.replace({
          ...latest,
          tree: { ...latest.tree, search: { status: 'error', paths: [], truncated: false, error: code(error) } },
        })
      } finally {
        if (searches.get(instanceId) === active) searches.delete(instanceId)
      }
    }
    active.timer = setTimeout(() => void run(), delay)
  }
  const replaceNode = (entry: FileWorkspaceEntryState, path: string, node: FileWorkspaceTreeDirectoryState) =>
    ports.replace({ ...entry, tree: { ...entry.tree, nodes: { ...entry.tree.nodes, [path]: node } } })
  const capacity = (entry: FileWorkspaceEntryState, path: string) => {
    const rootCount = entry.items.length
    const others = Object.entries(entry.tree.nodes)
      .filter(([id]) => id !== path)
      .reduce((total, [, node]) => total + node.items.length, 0)
    return Math.min(MAX_DIRECTORY_ENTRIES, MAX_VISIBLE_ENTRIES - rootCount - others)
  }
  const load = async (instanceId: string, workspaceId: string, rawPath: string, more = false) => {
    let entry = target(instanceId, workspaceId)
    const path = directory(entry, rawPath)
    const current = entry.tree.nodes[path]
    if (!current?.expanded) throw new CommandError('VERSION_CONFLICT', 'Folder is not expanded')
    const requestKey = key(instanceId, path)
    if (pending.has(requestKey)) throw new CommandError('BUSY', 'Folder already loading')
    if (pending.size >= MAX_CONCURRENT_LOADS) {
      replaceNode(entry, path, { ...current, status: 'error', error: 'BUSY' })
      throw new CommandError('BUSY', 'Too many folders loading')
    }
    const existing = more ? current.items : []
    const remaining = Math.min(PAGE_SIZE, capacity(entry, path) - existing.length)
    if (remaining < 1) {
      replaceNode(entry, path, { ...current, status: 'error', error: 'BUSY' })
      throw new CommandError('BUSY', 'Collapse another folder to continue')
    }
    const controller = new AbortController()
    const sourceSessionId = entry.sourceSessionId
    const sessionTarget = entry.sessionTarget
    pending.set(requestKey, controller)
    replaceNode(entry, path, { ...current, status: 'loading', error: null })
    try {
      if (!files) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Files are unavailable')
      const page = await files.execute(
        'file.list',
        {
          workspaceId,
          ...(sessionTarget ? { sessionTarget } : {}),
          path,
          ...(more && current.nextCursor ? { after: current.nextCursor } : {}),
          limit: remaining,
        },
        { signal: controller.signal },
      )
      if (!matches(instanceId, workspaceId, sourceSessionId, sessionTarget, path, controller))
        throw new CommandError('CANCELLED', 'Folder request was superseded')
      entry = target(instanceId, workspaceId)
      if (entry.tree.nodes[path]?.expanded !== true) throw new CommandError('CANCELLED', 'Folder was collapsed')
      if (page.items.length > remaining || page.items.some((item) => parent(canonicalFilePath(item.path)) !== path))
        throw new CommandError('INVALID_OUTPUT', 'Folder returned entries outside its path or limit')
      const merged = [...new Map([...existing, ...page.items].map((item) => [item.path, item])).values()]
      if (more && page.nextCursor && page.nextCursor === current.nextCursor)
        throw new CommandError('INVALID_OUTPUT', 'Folder cursor did not advance')
      if (merged.length > MAX_DIRECTORY_ENTRIES)
        throw new CommandError('INVALID_OUTPUT', 'Folder exceeded its entry limit')
      replaceNode(entry, path, {
        expanded: true,
        status: 'ready',
        items: merged,
        nextCursor: page.nextCursor ?? null,
        error: null,
      })
      return target(instanceId, workspaceId)
    } catch (error) {
      if (matches(instanceId, workspaceId, sourceSessionId, sessionTarget, path, controller)) {
        entry = target(instanceId, workspaceId)
        const latest = entry.tree.nodes[path]
        if (latest) replaceNode(entry, path, { ...latest, status: 'error', error: code(error) })
      }
      throw error instanceof CommandError ? error : new CommandError(code(error), 'Could not load folder')
    } finally {
      if (pending.get(requestKey) === controller) pending.delete(requestKey)
    }
  }
  const toggle = async (instanceId: string, workspaceId: string, rawPath: string) => {
    const entry = target(instanceId, workspaceId)
    const path = directory(entry, rawPath)
    const current = entry.tree.nodes[path]
    if (current?.expanded) {
      cancelSubtree(instanceId, path)
      const nodes = Object.fromEntries(
        Object.entries(entry.tree.nodes).filter(([id]) => id !== path && !id.startsWith(`${path}/`)),
      )
      ports.replace({ ...entry, tree: { ...entry.tree, nodes, error: null } })
      return target(instanceId, workspaceId)
    }
    if (Object.keys(entry.tree.nodes).length >= MAX_TREE_DIRECTORIES) {
      ports.replace({ ...entry, tree: { ...entry.tree, error: 'BUSY' } })
      throw new CommandError('BUSY', 'Too many folders are expanded')
    }
    replaceNode(entry, path, { expanded: true, status: 'loading', items: [], nextCursor: null, error: null })
    return load(instanceId, workspaceId, path)
  }
  const refresh = (instanceId: string, workspaceId: string, path: string) => load(instanceId, workspaceId, path)
  const more = (instanceId: string, workspaceId: string, rawPath: string) => {
    const entry = target(instanceId, workspaceId)
    const path = directory(entry, rawPath)
    const node = entry.tree.nodes[path]
    if (!node?.nextCursor) throw new CommandError('VERSION_CONFLICT', 'No next folder page')
    return load(instanceId, workspaceId, path, true)
  }
  return {
    toggle,
    refresh,
    more,
    search,
    cancelAll: (instanceId: string) => {
      cancelSubtree(instanceId)
      cancelSearch(instanceId)
    },
    dispose: () => {
      for (const controller of pending.values()) controller.abort()
      pending.clear()
      for (const instanceId of searches.keys()) cancelSearch(instanceId)
    },
  }
}
