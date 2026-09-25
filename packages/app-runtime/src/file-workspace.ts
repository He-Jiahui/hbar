import { CommandError, createCommandClient, type CommandRegistry } from '@hbar/commands'
import { fileWorkspaceCommands } from '@hbar/contracts/commands/file-workspace'
import { fileCommands } from '@hbar/contracts/commands/files'
import { createState, type StateReader } from './state'
import { canonicalFilePath, fileDocumentKey, FileWorkspaceDocuments } from './file-workspace-documents'
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
  const documents = new FileWorkspaceDocuments(
    options.files,
    (key) =>
      Object.values(state.reader.getSnapshot().entries).some(
        (entry) =>
          entry.document &&
          fileDocumentKey(entry.workspaceId, entry.document.path) === key &&
          surfaces.getSnapshot().panels[entry.instanceId]?.workspaceId === entry.workspaceId,
      ),
    (key, document) => {
      if (isDisposed()) return
      const current = state.reader.getSnapshot()
      let changed = false
      const entries = Object.fromEntries(
        Object.entries(current.entries).map(([id, entry]) => {
          if (!entry.document || fileDocumentKey(entry.workspaceId, entry.document.path) !== key) return [id, entry]
          changed = true
          return [id, { ...entry, document, error: null, ...(document ? {} : { view: 'browser' as const }) }]
        }),
      )
      if (changed) state.replace({ entries })
    },
  )

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
  const matchesTarget = (instanceId: string, workspaceId: string, generation: number) =>
    !isDisposed() &&
    generations.get(instanceId) === generation &&
    surfaces.getSnapshot().panels[instanceId]?.workspaceId === workspaceId
  const documentTarget = (instanceId: string) => {
    const target = panel(instanceId)
    const entry = state.reader.getSnapshot().entries[instanceId]
    if (!entry?.document || entry.workspaceId !== target.workspaceId)
      throw new CommandError('RESULT_UNKNOWN', 'Refresh the file panel target')
    return { entry, workspaceId: target.workspaceId, path: entry.document.path }
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
      if (!matchesTarget(instanceId, target.workspaceId, generation))
        throw new CommandError('RESULT_UNKNOWN', 'File listing was superseded')
      const latest = state.reader.getSnapshot().entries[instanceId] ?? loading
      const ready = { ...latest, status: 'ready' as const, items: page.items, nextCursor: page.nextCursor ?? null }
      replace(ready)
      return summary(ready)
    } catch (reason) {
      if (!matchesTarget(instanceId, target.workspaceId, generation)) throw reason
      const latest = state.reader.getSnapshot().entries[instanceId] ?? loading
      const failed = { ...latest, status: 'error' as const, error: code(reason) }
      replace(failed)
      throw commandFailure(reason)
    }
  }
  const loadMore = async (instanceId: string) => {
    const entry = state.reader.getSnapshot().entries[instanceId]
    if (!entry) return load(instanceId)
    if (!entry.nextCursor) return summary(entry)
    const target = panel(instanceId)
    if (entry.workspaceId !== target.workspaceId) throw new CommandError('RESULT_UNKNOWN', 'Refresh panel target')
    const generation = generations.get(instanceId) ?? 0
    const page = await requireClient().execute('file.list', {
      workspaceId: target.workspaceId!,
      path: entry.path,
      after: entry.nextCursor,
      limit: PAGE_SIZE,
    })
    if (!matchesTarget(instanceId, target.workspaceId, generation))
      throw new CommandError('RESULT_UNKNOWN', 'File listing was superseded')
    const latest = state.reader.getSnapshot().entries[instanceId] ?? entry
    const merged = [...new Map([...entry.items, ...page.items].map((item) => [item.path, item])).values()].slice(
      0,
      MAX_ENTRIES,
    )
    const next = {
      ...latest,
      items: merged,
      nextCursor: merged.length >= MAX_ENTRIES ? null : (page.nextCursor ?? null),
    }
    replace(next)
    return summary(next)
  }
  const openEntry = async (instanceId: string, rawPath: string, directory: boolean) => {
    if (directory) return load(instanceId, rawPath)
    const path = canonicalFilePath(rawPath)
    const entry = state.reader.getSnapshot().entries[instanceId]
    const target = panel(instanceId)
    if (!entry || entry.workspaceId !== target.workspaceId)
      throw new CommandError('RESULT_UNKNOWN', 'Refresh panel target')
    const generation = (generations.get(instanceId) ?? 0) + 1
    generations.set(instanceId, generation)
    const reading = documents.open(target.workspaceId, path)
    const document = documents.get(target.workspaceId, path)
    if (document) replace({ ...entry, view: 'document', document, error: null })
    try {
      await reading
      if (!matchesTarget(instanceId, target.workspaceId, generation))
        throw new CommandError('RESULT_UNKNOWN', 'File read was superseded')
      return summary(state.reader.getSnapshot().entries[instanceId] ?? entry)
    } catch (reason) {
      if (matchesTarget(instanceId, target.workspaceId, generation)) {
        const latest = state.reader.getSnapshot().entries[instanceId] ?? entry
        replace({ ...latest, error: code(reason) })
      }
      throw commandFailure(reason)
    }
  }
  const showBrowser = (instanceId: string) => {
    const target = panel(instanceId)
    const entry = state.reader.getSnapshot().entries[instanceId]
    if (!entry || entry.workspaceId !== target.workspaceId)
      throw new CommandError('RESULT_UNKNOWN', 'Refresh the file panel')
    generations.set(instanceId, (generations.get(instanceId) ?? 0) + 1)
    const next = { ...entry, view: 'browser' as const }
    replace(next)
    return summary(next)
  }
  const setText = (instanceId: string, text: string) => {
    const { entry, workspaceId, path } = documentTarget(instanceId)
    const document = documents.edit(workspaceId, path, text)
    const next = { ...entry, document, error: null }
    replace(next)
    return summary(next)
  }
  const save = async (instanceId: string) => {
    const { entry, workspaceId, path } = documentTarget(instanceId)
    const document = await documents.save(workspaceId, path)
    return summary({ ...entry, document })
  }
  const reconcile = async (instanceId: string) => {
    const { entry, workspaceId, path } = documentTarget(instanceId)
    const document = await documents.reconcile(workspaceId, path)
    return summary({ ...entry, document })
  }

  const action = async <Value>(
    instanceId: string,
    operation: () => Value | Promise<Value>,
    expected?: { readonly workspaceId: string; readonly path: string },
  ) => {
    const before = state.reader.getSnapshot().entries[instanceId]
    try {
      return await operation()
    } catch (reason) {
      const latest = state.reader.getSnapshot().entries[instanceId]
      if (
        before &&
        latest &&
        (!expected ||
          (before.workspaceId === expected.workspaceId &&
            before.document?.path === canonicalFilePath(expected.path))) &&
        before.workspaceId === latest.workspaceId &&
        before.document?.path === latest.document?.path
      )
        replace({ ...latest, error: code(reason) })
      throw commandFailure(reason)
    }
  }

  local.register(fileWorkspaceCommands['fileWorkspace.refresh'], ({ instanceId }) => load(instanceId))
  local.register(fileWorkspaceCommands['fileWorkspace.loadMore'], ({ instanceId }) => loadMore(instanceId))
  local.register(fileWorkspaceCommands['fileWorkspace.openEntry'], ({ instanceId, path, directory }) =>
    openEntry(instanceId, path, directory),
  )
  local.register(fileWorkspaceCommands['fileWorkspace.showBrowser'], ({ instanceId }) => showBrowser(instanceId))
  local.register(fileWorkspaceCommands['fileWorkspace.setText'], ({ instanceId, text }) =>
    action(instanceId, () => setText(instanceId, text)),
  )
  local.register(fileWorkspaceCommands['fileWorkspace.save'], ({ instanceId }) =>
    action(instanceId, () => save(instanceId)),
  )
  local.register(fileWorkspaceCommands['fileWorkspace.reconcile'], ({ instanceId }) =>
    action(instanceId, () => reconcile(instanceId)),
  )
  local.register(fileWorkspaceCommands['fileWorkspace.discardAndReload'], (input) =>
    action(
      input.instanceId,
      async () => {
        const target = documentTarget(input.instanceId)
        if (
          target.workspaceId !== input.workspaceId ||
          canonicalFilePath(target.path) !== canonicalFilePath(input.path)
        )
          throw new CommandError('VERSION_CONFLICT', 'The discard confirmation belongs to another document')
        const document = await documents.discardAndReload(
          target.workspaceId,
          target.path,
          input.expectedDraft,
          input.expectedSha256,
        )
        return summary({ ...target.entry, document })
      },
      input,
    ),
  )
  return {
    reader: state.reader,
    parent,
    dispose: () => {
      documents.dispose()
      generations.clear()
      state.dispose()
    },
  }
}
