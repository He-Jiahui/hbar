import { CommandError, createCommandClient, type CommandRegistry } from '@hbar/commands'
import { fileWorkspaceCommands } from '@hbar/contracts/commands/file-workspace'
import { fileCommands } from '@hbar/contracts/commands/files'
import { createState, type StateReader } from './state'
import type { FileWorkspaceEntryState, FileWorkspaceState, RuntimeOptions, SurfaceState } from './types'

const PAGE_SIZE = 200
const MAX_ENTRIES = 500
const MAX_PANELS = 8

function code(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}
function commandFailure(reason: unknown): CommandError {
  if (reason instanceof CommandError) return reason
  const message = reason instanceof Error ? reason.message : 'File operation failed'
  return new CommandError(code(reason), message)
}
function parent(path: string): string {
  const normalized = path.replaceAll('\\', '/').replace(/\/+$/, '')
  const index = normalized.lastIndexOf('/')
  return index <= 0 ? '.' : normalized.slice(0, index)
}

export function createFileWorkspace(
  local: CommandRegistry,
  options: RuntimeOptions,
  surfaces: StateReader<SurfaceState>,
  onSubscriberError: (error: unknown) => void,
  isDisposed: () => boolean,
) {
  const state = createState<FileWorkspaceState>({ entries: {} }, onSubscriberError)
  const client = options.files ? createCommandClient(fileCommands, options.files) : null
  const generations = new Map<string, number>()

  const panel = (instanceId: string) => {
    const value = surfaces.getSnapshot().panels[instanceId]
    if (!value || value.panelId !== 'files') throw new CommandError('COMMAND_NOT_FOUND', 'File panel is not open')
    if (!value.workspaceId) throw new CommandError('INVALID_INPUT', 'File panel requires a workspace target')
    return { ...value, workspaceId: value.workspaceId }
  }
  const requireClient = () => {
    if (!client) throw new CommandError('CAPABILITY_UNAVAILABLE', 'File commands are unavailable')
    return client
  }
  const replace = (entry: FileWorkspaceEntryState) => {
    const current = state.reader.getSnapshot()
    const entries = { ...current.entries, [entry.instanceId]: entry }
    const ids = Object.keys(entries)
    if (ids.length > MAX_PANELS)
      for (const id of ids) {
        if (id !== entry.instanceId && !surfaces.getSnapshot().panels[id]) {
          delete entries[id]
          break
        }
      }
    state.replace({ entries })
  }
  const summary = (entry: FileWorkspaceEntryState) => ({
    instanceId: entry.instanceId,
    workspaceId: entry.workspaceId,
    path: entry.path,
    view: entry.view,
    selectedPath: entry.view === 'document' ? (entry.document?.path ?? null) : null,
    status: entry.status,
    documentStatus: entry.document?.status ?? 'idle',
    dirty: Boolean(entry.document && entry.document.draft !== entry.document.baseline),
    error: (entry.view === 'document' ? entry.document?.error : null) ?? entry.error,
  })
  const load = async (instanceId: string, path?: string) => {
    const target = panel(instanceId)
    const current = state.reader.getSnapshot().entries[instanceId]
    const requestedPath = path ?? (current?.workspaceId === target.workspaceId ? current.path : '.')
    const generation = (generations.get(instanceId) ?? 0) + 1
    generations.set(instanceId, generation)
    const loading: FileWorkspaceEntryState = {
      instanceId,
      workspaceId: target.workspaceId,
      path: requestedPath,
      view: 'browser',
      status: 'loading',
      items: current?.workspaceId === target.workspaceId && current.path === requestedPath ? current.items : [],
      nextCursor: null,
      document: current?.workspaceId === target.workspaceId ? current.document : null,
      error: null,
    }
    replace(loading)
    try {
      const page = await requireClient().execute('file.list', {
        workspaceId: target.workspaceId,
        path: requestedPath,
        limit: PAGE_SIZE,
      })
      if (isDisposed() || generations.get(instanceId) !== generation)
        throw new CommandError('RESULT_UNKNOWN', 'File listing was superseded')
      const ready = { ...loading, status: 'ready' as const, items: page.items, nextCursor: page.nextCursor ?? null }
      replace(ready)
      return summary(ready)
    } catch (reason) {
      if (isDisposed() || generations.get(instanceId) !== generation) throw reason
      const failed = { ...loading, status: 'error' as const, error: code(reason) }
      replace(failed)
      throw commandFailure(reason)
    }
  }
  const loadMore = async (instanceId: string) => {
    const entry = state.reader.getSnapshot().entries[instanceId]
    if (!entry) return load(instanceId)
    if (!entry.nextCursor) return summary(entry)
    const target = panel(instanceId)
    const page = await requireClient().execute('file.list', {
      workspaceId: target.workspaceId!,
      path: entry.path,
      after: entry.nextCursor,
      limit: PAGE_SIZE,
    })
    const merged = [...new Map([...entry.items, ...page.items].map((item) => [item.path, item])).values()].slice(
      0,
      MAX_ENTRIES,
    )
    const next = {
      ...entry,
      items: merged,
      nextCursor: merged.length >= MAX_ENTRIES ? null : (page.nextCursor ?? null),
    }
    replace(next)
    return summary(next)
  }
  const openEntry = async (instanceId: string, path: string, directory: boolean) => {
    if (directory) return load(instanceId, path)
    const entry = state.reader.getSnapshot().entries[instanceId]
    const target = panel(instanceId)
    if (!entry || entry.workspaceId !== target.workspaceId)
      throw new CommandError('RESULT_UNKNOWN', 'Refresh panel target')
    const generation = (generations.get(instanceId) ?? 0) + 1
    generations.set(instanceId, generation)
    const loading = {
      ...entry,
      view: 'document' as const,
      document: {
        path,
        status: 'loading' as const,
        baseline: '',
        draft: '',
        sha256: null,
        pendingText: null,
        error: null,
      },
    }
    replace(loading)
    try {
      const file = await requireClient().execute('file.read', { workspaceId: target.workspaceId, path })
      if (isDisposed() || generations.get(instanceId) !== generation)
        throw new CommandError('RESULT_UNKNOWN', 'File read was superseded')
      const ready = {
        ...loading,
        document: {
          path,
          status: 'ready' as const,
          baseline: file.text,
          draft: file.text,
          sha256: file.sha256,
          pendingText: null,
          error: null,
        },
      }
      replace(ready)
      return summary(ready)
    } catch (reason) {
      if (isDisposed() || generations.get(instanceId) !== generation) throw reason
      const failed = { ...loading, document: { ...loading.document, status: 'failed' as const, error: code(reason) } }
      replace(failed)
      throw commandFailure(reason)
    }
  }
  const showBrowser = (instanceId: string) => {
    panel(instanceId)
    const entry = state.reader.getSnapshot().entries[instanceId]
    if (!entry) throw new CommandError('RESULT_UNKNOWN', 'Refresh the file panel')
    generations.set(instanceId, (generations.get(instanceId) ?? 0) + 1)
    const next = { ...entry, view: 'browser' as const }
    replace(next)
    return summary(next)
  }
  const setText = (instanceId: string, text: string) => {
    const entry = state.reader.getSnapshot().entries[instanceId]
    if (!entry?.document || entry.document.status === 'unknown')
      throw new CommandError('BUSY', 'File document is not editable')
    const next = {
      ...entry,
      document: {
        ...entry.document,
        draft: text,
        status: entry.document.status === 'submitting' ? ('submitting' as const) : ('ready' as const),
        error: null,
      },
    }
    replace(next)
    return summary(next)
  }
  const save = async (instanceId: string) => {
    const entry = state.reader.getSnapshot().entries[instanceId]
    const target = panel(instanceId)
    if (!entry?.document || entry.document.status === 'submitting' || entry.document.status === 'unknown')
      throw new CommandError('BUSY', 'File document is not ready to save')
    const submitted = entry.document.draft
    const submitting = {
      ...entry,
      document: { ...entry.document, status: 'submitting' as const, pendingText: submitted },
    }
    replace(submitting)
    try {
      const receipt = await requireClient().execute('file.write', {
        workspaceId: target.workspaceId!,
        path: entry.document.path,
        text: submitted,
        expectedSha256: entry.document.sha256,
      })
      const latest = state.reader.getSnapshot().entries[instanceId] ?? submitting
      const succeeded = {
        ...latest,
        document: {
          ...latest.document!,
          status: 'succeeded' as const,
          baseline: submitted,
          sha256: receipt.afterSha256,
          pendingText: null,
          error: null,
        },
      }
      replace(succeeded)
      return summary(succeeded)
    } catch (reason) {
      const latest = state.reader.getSnapshot().entries[instanceId] ?? submitting
      const error = code(reason)
      const failed = {
        ...latest,
        document: {
          ...latest.document!,
          status:
            error === 'RESULT_UNKNOWN' || error === 'DISCONNECTED' || error === 'TIMEOUT'
              ? ('unknown' as const)
              : ('failed' as const),
          error,
        },
      }
      replace(failed)
      throw commandFailure(reason)
    }
  }
  const reconcile = async (instanceId: string) => {
    const entry = state.reader.getSnapshot().entries[instanceId]
    if (!entry?.document || entry.document.status !== 'unknown' || entry.document.pendingText === null)
      throw new CommandError('INVALID_INPUT', 'File save does not require reconciliation')
    const file = await requireClient().execute('file.read', {
      workspaceId: entry.workspaceId,
      path: entry.document.path,
    })
    const succeeded = file.text === entry.document.pendingText
    const next = {
      ...entry,
      document: {
        ...entry.document,
        status: succeeded ? ('succeeded' as const) : ('failed' as const),
        baseline: succeeded ? file.text : entry.document.baseline,
        sha256: file.sha256,
        pendingText: null,
        error: succeeded ? null : 'FILE_CONFLICT',
      },
    }
    replace(next)
    return summary(next)
  }

  local.register(fileWorkspaceCommands['fileWorkspace.refresh'], ({ instanceId }) => load(instanceId))
  local.register(fileWorkspaceCommands['fileWorkspace.loadMore'], ({ instanceId }) => loadMore(instanceId))
  local.register(fileWorkspaceCommands['fileWorkspace.openEntry'], ({ instanceId, path, directory }) =>
    openEntry(instanceId, path, directory),
  )
  local.register(fileWorkspaceCommands['fileWorkspace.showBrowser'], ({ instanceId }) => showBrowser(instanceId))
  local.register(fileWorkspaceCommands['fileWorkspace.setText'], ({ instanceId, text }) => setText(instanceId, text))
  local.register(fileWorkspaceCommands['fileWorkspace.save'], ({ instanceId }) => save(instanceId))
  local.register(fileWorkspaceCommands['fileWorkspace.reconcile'], ({ instanceId }) => reconcile(instanceId))
  return { reader: state.reader, parent, dispose: () => state.dispose() }
}
