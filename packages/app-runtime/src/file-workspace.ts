import { CommandError, createCommandClient, type CommandExecutor, type CommandRegistry } from '@hbar/commands'
import { fileWorkspaceCommands } from '@hbar/contracts/commands/file-workspace'
import { fileCommands } from '@hbar/contracts/commands/files'
import { draftCommands } from '@hbar/contracts/commands/draft'
import { sessionSchema } from '@hbar/contracts/directory'
import { createState, type StateReader } from './state'
import { canonicalFilePath, fileDocumentKey, FileWorkspaceDocuments } from './file-workspace-documents'
import { isWorkspaceRelativePath, validateMentions } from './composer-mentions'
import {
  createFileWorkspaceChanges,
  emptyFileChanges,
  filteredFileChanges,
  FILE_CHANGES_PAGE_SIZE,
} from './file-workspace-changes'
import { createFileWorkspaceTree, emptyFileTree } from './file-workspace-tree'
import {
  assertFileDiffBudget,
  closeFilePreviews,
  filePreviewCloseReason,
  MAX_FILE_PREVIEWS,
  projectFileEntry,
  replaceFilePreview,
} from './file-workspace-previews'
import type {
  DraftsState,
  FileWorkspaceEntryState,
  FileWorkspacePreviewState,
  FileWorkspaceState,
  RuntimeOptions,
  SurfaceState,
} from './types'
import type { WorkspaceTabsState } from './workspace-tabs-runtime'

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
  chatReference?: {
    readonly tabs: StateReader<WorkspaceTabsState>
    readonly drafts: StateReader<DraftsState>
    readonly sessions: CommandExecutor
    readonly onPreviewOpened?: ((instanceId: string) => void) | undefined
  },
) {
  const state = createState<FileWorkspaceState>({ entries: {} }, onSubscriberError)
  const client = options.files ? createCommandClient(fileCommands, options.files) : null
  const generations = new Map<string, number>()
  const documents = new FileWorkspaceDocuments(
    options.files,
    (key) =>
      Object.values(state.reader.getSnapshot().entries).some(
        (entry) =>
          entry.previews.some(
            (preview) => preview.kind === 'document' && fileDocumentKey(entry.workspaceId, preview.path) === key,
          ) && surfaces.getSnapshot().panels[entry.instanceId]?.workspaceId === entry.workspaceId,
      ),
    (key, document) => {
      if (isDisposed()) return
      const current = state.reader.getSnapshot()
      let changed = false
      const entries = Object.fromEntries(
        Object.entries(current.entries).map(([id, entry]) => {
          if (
            !entry.previews.some(
              (preview) => preview.kind === 'document' && fileDocumentKey(entry.workspaceId, preview.path) === key,
            )
          )
            return [id, entry]
          changed = true
          const previews = entry.previews.flatMap((preview): FileWorkspacePreviewState[] =>
            preview.kind === 'document' && fileDocumentKey(entry.workspaceId, preview.path) === key
              ? document
                ? [{ ...preview, document }]
                : []
              : [preview],
          )
          return [id, projectFileEntry({ ...entry, previews })]
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
  type ExpectedPreview = { readonly workspaceId?: string | undefined; readonly previewId?: string | undefined }
  const assertPreview = (entry: FileWorkspaceEntryState, expected?: ExpectedPreview) => {
    if (
      (expected?.workspaceId && expected.workspaceId !== entry.workspaceId) ||
      (expected?.previewId && expected.previewId !== entry.activePreviewId)
    )
      throw new CommandError('VERSION_CONFLICT', 'File action belongs to another preview')
  }
  const documentTarget = (instanceId: string, expected?: ExpectedPreview) => {
    const target = panel(instanceId)
    const entry = state.reader.getSnapshot().entries[instanceId]
    if (!entry?.document || entry.workspaceId !== target.workspaceId)
      throw new CommandError('RESULT_UNKNOWN', 'Refresh the file panel target')
    assertPreview(entry, expected)
    return { entry, workspaceId: target.workspaceId, path: entry.document.path }
  }
  const replace = (entry: FileWorkspaceEntryState) => {
    const current = state.reader.getSnapshot()
    const entries = { ...current.entries, [entry.instanceId]: projectFileEntry(entry) }
    const ids = Object.keys(entries)
    if (ids.length > MAX_PANELS)
      for (const id of ids) {
        if (id !== entry.instanceId && !surfaces.getSnapshot().panels[id]) {
          delete entries[id]
          break
        }
      }
    assertFileDiffBudget(entries)
    state.replace({ entries })
  }
  const summary = (entry: FileWorkspaceEntryState) => ({
    instanceId: entry.instanceId,
    workspaceId: entry.workspaceId,
    path: entry.path,
    view: entry.view,
    selectedPath:
      entry.view === 'document'
        ? (entry.document?.path ?? null)
        : entry.view === 'diff'
          ? (entry.diff?.path ?? null)
          : null,
    status:
      entry.view === 'diff'
        ? (entry.diff?.status ?? 'error')
        : entry.view === 'browser' && entry.browserMode === 'changed'
          ? entry.changes.status === 'idle'
            ? 'ready'
            : entry.changes.status
          : entry.status,
    documentStatus: entry.document?.status ?? 'idle',
    dirty: Boolean(entry.document && entry.document.draft !== entry.document.baseline),
    error:
      entry.view === 'diff'
        ? (entry.diff?.error ?? null)
        : entry.view === 'browser' && entry.browserMode === 'changed'
          ? entry.changes.error
          : ((entry.view === 'document' ? entry.document?.error : null) ?? entry.error),
  })
  const load = async (instanceId: string, path?: string, preservePreview = false) => {
    changes.cancelList(instanceId)
    tree.cancelAll(instanceId)
    const target = panel(instanceId)
    const current = state.reader.getSnapshot().entries[instanceId]
    const requestedPath = path ?? (current?.workspaceId === target.workspaceId ? current.path : '.')
    const keepPreview = preservePreview && current?.workspaceId === target.workspaceId && current.view !== 'browser'
    const generation = (generations.get(instanceId) ?? 0) + 1
    generations.set(instanceId, generation)
    const loading: FileWorkspaceEntryState = {
      instanceId,
      workspaceId: target.workspaceId,
      path: requestedPath,
      previews: current?.workspaceId === target.workspaceId ? current.previews : [],
      activePreviewId: keepPreview ? current.activePreviewId : null,
      view: keepPreview ? current.view : 'browser',
      browserMode: 'all',
      documentMode: current?.workspaceId === target.workspaceId ? current.documentMode : 'preview',
      changes: current?.workspaceId === target.workspaceId ? current.changes : emptyFileChanges(),
      diff: keepPreview ? current.diff : null,
      tree:
        current?.workspaceId === target.workspaceId && current.path === requestedPath
          ? emptyFileTree(current.tree.filter)
          : emptyFileTree(),
      rootLimitReached: false,
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
      if (ready.tree.filter.trim()) tree.search(instanceId, target.workspaceId, ready.tree.filter)
      return summary(state.reader.getSnapshot().entries[instanceId] ?? ready)
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
    const all = [...new Map([...entry.items, ...page.items].map((item) => [item.path, item])).values()]
    const merged = all.slice(0, MAX_ENTRIES)
    const next = {
      ...latest,
      items: merged,
      nextCursor: merged.length >= MAX_ENTRIES ? null : (page.nextCursor ?? null),
      rootLimitReached: all.length > MAX_ENTRIES || (merged.length >= MAX_ENTRIES && Boolean(page.nextCursor)),
    }
    replace(next)
    return summary(next)
  }
  const openEntry = async (instanceId: string, rawPath: string, directory: boolean, preservePreview = false) => {
    if (directory) return load(instanceId, rawPath, preservePreview)
    const path = canonicalFilePath(rawPath)
    const entry = state.reader.getSnapshot().entries[instanceId]
    const target = panel(instanceId)
    if (!entry || entry.workspaceId !== target.workspaceId)
      throw new CommandError('RESULT_UNKNOWN', 'Refresh panel target')
    const existing = entry.previews.find((preview) => preview.kind === 'document' && preview.path === path)
    if (!existing && entry.previews.length >= MAX_FILE_PREVIEWS) {
      replace({ ...entry, error: 'BUSY' })
      throw new CommandError('BUSY', 'Close another file preview before opening one')
    }
    changes.cancelList(instanceId)
    const generation = (generations.get(instanceId) ?? 0) + 1
    generations.set(instanceId, generation)
    const reading = documents.open(target.workspaceId, path)
    const document = documents.get(target.workspaceId, path)
    const previewId = existing?.id ?? crypto.randomUUID()
    if (document) {
      const latest = state.reader.getSnapshot().entries[instanceId] ?? entry
      replace(
        replaceFilePreview(
          { ...latest, error: null },
          {
            id: previewId,
            kind: 'document',
            path,
            documentMode: existing?.kind === 'document' ? existing.documentMode : 'preview',
            document,
          },
          true,
        ),
      )
      chatReference?.onPreviewOpened?.(instanceId)
    }
    try {
      await reading
      if (
        !matchesTarget(instanceId, target.workspaceId, generation) ||
        !state.reader.getSnapshot().entries[instanceId]?.previews.some((preview) => preview.id === previewId)
      )
        throw new CommandError('RESULT_UNKNOWN', 'File read was superseded')
      return summary(state.reader.getSnapshot().entries[instanceId] ?? entry)
    } catch (reason) {
      if (matchesTarget(instanceId, target.workspaceId, generation)) {
        const latest = state.reader.getSnapshot().entries[instanceId] ?? entry
        if (!document || latest.activePreviewId === previewId) replace({ ...latest, error: code(reason) })
      }
      throw commandFailure(reason)
    }
  }
  const showBrowser = (instanceId: string, expected?: ExpectedPreview) => {
    const target = panel(instanceId)
    const entry = state.reader.getSnapshot().entries[instanceId]
    if (!entry || entry.workspaceId !== target.workspaceId)
      throw new CommandError('RESULT_UNKNOWN', 'Refresh the file panel')
    assertPreview(entry, expected)
    changes.cancelList(instanceId)
    generations.set(instanceId, (generations.get(instanceId) ?? 0) + 1)
    const latest = state.reader.getSnapshot().entries[instanceId] ?? entry
    const next = projectFileEntry({ ...latest, activePreviewId: null, error: null })
    replace(next)
    return summary(next)
  }
  const setText = (instanceId: string, text: string, expected?: ExpectedPreview) => {
    const { workspaceId, path } = documentTarget(instanceId, expected)
    documents.edit(workspaceId, path, text)
    const latest = documentTarget(instanceId, expected).entry
    replace({ ...latest, error: null })
    return summary(latest)
  }
  const save = async (instanceId: string, expected?: ExpectedPreview) => {
    const { entry, workspaceId, path } = documentTarget(instanceId, expected)
    const document = await documents.save(workspaceId, path)
    return summary({ ...entry, document })
  }
  const reconcile = async (instanceId: string, expected?: ExpectedPreview) => {
    const { entry, workspaceId, path } = documentTarget(instanceId, expected)
    const document = await documents.reconcile(workspaceId, path)
    return summary({ ...entry, document })
  }

  const action = async <Value>(
    instanceId: string,
    operation: () => Value | Promise<Value>,
    expected?: ExpectedPreview & { readonly path?: string | undefined },
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
          ((!expected.workspaceId || before.workspaceId === expected.workspaceId) &&
            (!expected.path || before.document?.path === canonicalFilePath(expected.path)) &&
            (!expected.previewId || before.activePreviewId === expected.previewId))) &&
        before.workspaceId === latest.workspaceId &&
        before.activePreviewId === latest.activePreviewId
      )
        replace({ ...latest, error: code(reason) })
      throw commandFailure(reason)
    }
  }

  const changes = createFileWorkspaceChanges(options, {
    read: (instanceId) => state.reader.getSnapshot().entries[instanceId],
    replace,
    workspaceId: (instanceId) => surfaces.getSnapshot().panels[instanceId]?.workspaceId ?? null,
    openFile: (instanceId, path) => openEntry(instanceId, path, false),
    openFolder: (instanceId, path) => openEntry(instanceId, path, true),
    isDisposed,
    onPreviewOpened: chatReference?.onPreviewOpened,
  })
  const tree = createFileWorkspaceTree(options, {
    read: (instanceId) => state.reader.getSnapshot().entries[instanceId],
    replace,
    workspaceId: (instanceId) => surfaces.getSnapshot().panels[instanceId]?.workspaceId ?? null,
    isDisposed,
  })
  let previousPanels = surfaces.getSnapshot().panels
  const unsubscribeSurfaces = surfaces.subscribe(() => {
    const current = surfaces.getSnapshot().panels
    for (const [instanceId, previous] of Object.entries(previousPanels)) {
      if (previous.panelId !== 'files' || current[instanceId]?.workspaceId === previous.workspaceId) continue
      generations.set(instanceId, (generations.get(instanceId) ?? 0) + 1)
      changes.cancel(instanceId)
      tree.cancelAll(instanceId)
      if (previous.sessionTool && !current[instanceId]) {
        // Only the session owner evicts these immutable targets, after checking public dirty/pending state.
        generations.delete(instanceId)
        const snapshot = state.reader.getSnapshot()
        state.replace({
          entries: Object.fromEntries(Object.entries(snapshot.entries).filter(([id]) => id !== instanceId)),
        })
        continue
      }
      const entry = state.reader.getSnapshot().entries[instanceId]
      if (entry)
        replace({
          ...entry,
          previews: entry.previews.filter((preview) => preview.kind === 'document'),
          activePreviewId: null,
          changes: { ...entry.changes, status: 'idle', error: null },
          tree: emptyFileTree(entry.tree.filter, true),
          ...(entry.status === 'loading' ? { status: 'error' as const, error: 'CANCELLED' } : {}),
        })
    }
    previousPanels = current
  })
  const requireEntry = (instanceId: string, workspaceId: string) => {
    const target = panel(instanceId)
    const entry = state.reader.getSnapshot().entries[instanceId]
    if (!entry || target.workspaceId !== workspaceId || entry.workspaceId !== workspaceId)
      throw new CommandError('VERSION_CONFLICT', 'File action belongs to another workspace')
    return entry
  }
  const selectPreview = async (instanceId: string, workspaceId: string, previewId: string, explicitRefresh = false) => {
    const entry = requireEntry(instanceId, workspaceId)
    const preview = entry.previews.find((value) => value.id === previewId)
    if (!preview) throw new CommandError('VERSION_CONFLICT', 'The original file preview is closed')
    if (explicitRefresh && filePreviewCloseReason(preview))
      throw new CommandError('FILE_DRAFT_PENDING', 'Save, discard or reconcile the original document first')
    replace({ ...entry, activePreviewId: previewId, error: null })
    if (preview.kind === 'diff') {
      const reading = changes.refresh(instanceId, workspaceId, previewId)
      return summary(await reading)
    }
    chatReference?.onPreviewOpened?.(instanceId)
    // Shared canonical writes keep their original ownership. Selecting is not a receipt read.
    if (filePreviewCloseReason(preview)) return summary(requireEntry(instanceId, workspaceId))
    await documents.open(workspaceId, preview.path)
    const latest = requireEntry(instanceId, workspaceId)
    if (!latest.previews.some((value) => value.id === previewId))
      throw new CommandError('TARGET_CHANGED', 'The original file preview is closed')
    return summary(latest)
  }
  local.register(fileWorkspaceCommands['fileWorkspace.selectPreview'], ({ instanceId, workspaceId, previewId }) =>
    selectPreview(instanceId, workspaceId, previewId),
  )
  local.register(fileWorkspaceCommands['fileWorkspace.refreshPreview'], ({ instanceId, workspaceId, previewId }) =>
    selectPreview(instanceId, workspaceId, previewId, true),
  )
  local.register(fileWorkspaceCommands['fileWorkspace.closePreviews'], ({ instanceId, workspaceId, previewIds }) => {
    const entry = requireEntry(instanceId, workspaceId)
    const result = closeFilePreviews(entry, previewIds)
    if (result.blocked.length || result.closed.length === 0) return { closed: result.closed, blocked: result.blocked }
    // Remove the UUIDs before invalidating their reads, so cancellation cannot recreate a ref.
    replace(result.entry)
    for (const previewId of result.closed) changes.cancelDiff(instanceId, previewId)
    return { closed: result.closed, blocked: result.blocked }
  })
  local.register(fileWorkspaceCommands['fileWorkspace.addToComposer'], async (input, execution) => {
    if (!chatReference) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Composer references are unavailable')
    const assertTarget = () => {
      if (isDisposed()) throw new CommandError('DISPOSED', 'The Files panel is closed')
      const target = panel(input.instanceId)
      if (target.workspaceId !== input.workspaceId || target.sessionId !== input.sourceSessionId)
        throw new CommandError('TARGET_CHANGED', 'The Files panel source changed')
      const tabs = chatReference.tabs.getSnapshot()
      const source = tabs.items.find((item) => item.kind === 'session' && item.id === input.sourceSessionId)
      if (
        !source ||
        source.kind !== 'session' ||
        source.workspaceId !== input.workspaceId ||
        source.instanceKey !== input.sourceTabInstanceKey
      )
        throw new CommandError('TAB_NOT_FOUND', 'The original Session tab changed')
      if (input.workbenchTabId || input.workbenchTabInstanceKey) {
        const workbench = tabs.items.find((item) => item.id === input.workbenchTabId)
        if (
          !input.workbenchTabId ||
          !input.workbenchTabInstanceKey ||
          tabs.activeId !== input.workbenchTabId ||
          !workbench ||
          workbench.kind !== 'workbench' ||
          workbench.instanceKey !== input.workbenchTabInstanceKey ||
          workbench.panelInstanceId !== input.instanceId ||
          workbench.sourceSessionId !== input.sourceSessionId ||
          workbench.workspaceId !== input.workspaceId
        )
          throw new CommandError('TARGET_CHANGED', 'The Files workbench tab changed')
      } else if (
        tabs.items.some(
          (item) => item.kind === 'workbench' && item.id === tabs.activeId && item.panelInstanceId === input.instanceId,
        )
      ) {
        throw new CommandError('TARGET_CHANGED', 'The Files workbench tab changed')
      }
      const entry = requireEntry(input.instanceId, input.workspaceId)
      if (input.previewId && entry.activePreviewId !== input.previewId)
        throw new CommandError('TARGET_CHANGED', 'The original file preview changed')
      if (!isWorkspaceRelativePath(input.path) || canonicalFilePath(input.path) !== input.path)
        throw new CommandError('INVALID_INPUT', 'A workspace-relative file path is required')
      if (
        (entry.view === 'document' && entry.document?.path !== input.path) ||
        (entry.view === 'diff' && (entry.diff?.path !== input.path || entry.diff.status !== 'ready')) ||
        (entry.view !== 'document' && entry.view !== 'diff')
      )
        throw new CommandError('TARGET_CHANGED', 'The selected file changed')
      const document = documents.get(input.workspaceId, input.path)
      if (
        document &&
        (document.draft !== document.baseline ||
          document.status === 'unknown' ||
          document.status === 'submitting' ||
          document.status === 'loading')
      )
        throw new CommandError('FILE_DRAFT_PENDING', 'Resolve the unsaved file draft before referencing its path')
      const draft = chatReference.drafts.getSnapshot()[input.sourceSessionId]
      if ((draft?.revision ?? 0) !== input.expectedRevision)
        throw new CommandError('VERSION_CONFLICT', 'The original composer draft changed')
      if (draft?.status === 'submitting' || draft?.status === 'unknown')
        throw new CommandError('BUSY', 'The original composer has a pending submission')
      return draft
    }
    assertTarget()
    // A cached directory entry is not proof that the source still exists. Fail closed offline.
    const session = sessionSchema
      .nullable()
      .parse(
        await chatReference.sessions.execute(
          'session.get',
          { sessionId: input.sourceSessionId },
          { signal: execution.signal },
        ),
      )
    if (!session || session.archived || session.workspaceId !== input.workspaceId)
      throw new CommandError('SESSION_NOT_FOUND', 'The original Session is unavailable')
    const draft = assertTarget()
    const existing = draft?.mentions.find(
      (mention) => mention.workspaceId === input.workspaceId && mention.path === input.path,
    )
    if (existing)
      return {
        sessionId: input.sourceSessionId,
        sessionTitle: session.title,
        revision: input.expectedRevision,
        added: false,
      }
    if ((draft?.mentions.length ?? 0) >= 40)
      throw new CommandError('BUSY', 'The original composer has reached its mention limit')
    const label = input.path.split('/').at(-1)!.slice(0, 1024)
    const previous = draft?.text ?? ''
    const separator = previous && !/\s$/.test(previous) ? ' ' : ''
    const token = `@${label}`
    const start = previous.length + separator.length
    const text = previous + separator + token
    if (text.length > 200_000) throw new CommandError('INPUT_TOO_LARGE', 'The original composer is full')
    const mentions = [
      ...(draft?.mentions ?? []),
      { start, end: start + token.length, label, path: input.path, workspaceId: input.workspaceId, directory: false },
    ]
    validateMentions(text, mentions, input.workspaceId)
    const result = draftCommands['draft.setContent'].output.parse(
      await local.execute(
        'draft.setContent',
        {
          sessionId: input.sourceSessionId,
          text,
          mentions,
          expectedRevision: input.expectedRevision,
        },
        { signal: execution.signal },
      ),
    )
    return { sessionId: input.sourceSessionId, sessionTitle: session.title, revision: result.revision, added: true }
  })
  local.register(
    fileWorkspaceCommands['fileWorkspace.setBrowserMode'],
    async ({ instanceId, workspaceId, mode, preservePreview }) => {
      requireEntry(instanceId, workspaceId)
      generations.set(instanceId, (generations.get(instanceId) ?? 0) + 1)
      if (mode === 'changed') {
        tree.cancelAll(instanceId)
        return summary(await changes.load(instanceId, workspaceId, preservePreview))
      }
      changes.cancelList(instanceId)
      tree.cancelAll(instanceId)
      const latest = requireEntry(instanceId, workspaceId)
      if (latest.status !== 'ready' || latest.tree.revalidateOnOpen) return load(instanceId, undefined, preservePreview)
      const next = {
        ...latest,
        activePreviewId: preservePreview ? latest.activePreviewId : null,
        browserMode: 'all' as const,
      }
      replace(next)
      if (next.tree.filter.trim()) tree.search(instanceId, workspaceId, next.tree.filter)
      return summary(next)
    },
  )
  local.register(fileWorkspaceCommands['fileWorkspace.toggleTree'], async ({ instanceId, workspaceId, path }) =>
    summary(await tree.toggle(instanceId, workspaceId, path)),
  )
  local.register(fileWorkspaceCommands['fileWorkspace.refreshTree'], async ({ instanceId, workspaceId, path }) =>
    summary(await tree.refresh(instanceId, workspaceId, path)),
  )
  local.register(fileWorkspaceCommands['fileWorkspace.loadMoreTree'], async ({ instanceId, workspaceId, path }) =>
    summary(await tree.more(instanceId, workspaceId, path)),
  )
  local.register(fileWorkspaceCommands['fileWorkspace.filterTree'], ({ instanceId, workspaceId, filter }) => {
    requireEntry(instanceId, workspaceId)
    tree.search(instanceId, workspaceId, filter)
    return summary(requireEntry(instanceId, workspaceId))
  })
  local.register(
    fileWorkspaceCommands['fileWorkspace.refreshChanges'],
    async ({ instanceId, workspaceId, preservePreview }) =>
      summary(await changes.load(instanceId, workspaceId, preservePreview)),
  )
  local.register(fileWorkspaceCommands['fileWorkspace.filterChanges'], ({ instanceId, workspaceId, filter }) => {
    const entry = requireEntry(instanceId, workspaceId)
    const next = { ...entry, changes: { ...entry.changes, filter, page: 0 } }
    replace(next)
    return summary(next)
  })
  local.register(fileWorkspaceCommands['fileWorkspace.pageChanges'], ({ instanceId, workspaceId, page }) => {
    const entry = requireEntry(instanceId, workspaceId)
    const last = Math.max(0, Math.ceil(filteredFileChanges(entry.changes).length / FILE_CHANGES_PAGE_SIZE) - 1)
    const next = { ...entry, changes: { ...entry.changes, page: Math.min(page, last) } }
    replace(next)
    return summary(next)
  })
  local.register(
    fileWorkspaceCommands['fileWorkspace.openChange'],
    async ({ instanceId, workspaceId, previewId, path, cached }) => {
      const entry = requireEntry(instanceId, workspaceId)
      assertPreview(entry, { previewId })
      return summary(await changes.open(instanceId, workspaceId, path, cached))
    },
  )
  local.register(
    fileWorkspaceCommands['fileWorkspace.setDocumentMode'],
    ({ instanceId, workspaceId, previewId, path, mode }) => {
      const entry = requireEntry(instanceId, workspaceId)
      assertPreview(entry, { previewId })
      if (entry.view !== 'document' || entry.document?.path !== canonicalFilePath(path))
        throw new CommandError('VERSION_CONFLICT', 'File view belongs to another document')
      const next = projectFileEntry({
        ...entry,
        previews: entry.previews.map((preview) =>
          preview.id === entry.activePreviewId && preview.kind === 'document'
            ? { ...preview, documentMode: mode }
            : preview,
        ),
      })
      replace(next)
      return summary(next)
    },
  )
  local.register(fileWorkspaceCommands['fileWorkspace.refresh'], ({ instanceId, preservePreview }) =>
    load(instanceId, undefined, preservePreview),
  )
  local.register(fileWorkspaceCommands['fileWorkspace.loadMore'], ({ instanceId }) => loadMore(instanceId))
  local.register(
    fileWorkspaceCommands['fileWorkspace.openEntry'],
    ({ instanceId, workspaceId, path, directory, preservePreview }) => {
      if (workspaceId) requireEntry(instanceId, workspaceId)
      return openEntry(instanceId, path, directory, preservePreview)
    },
  )
  local.register(fileWorkspaceCommands['fileWorkspace.showBrowser'], (input) => showBrowser(input.instanceId, input))
  local.register(fileWorkspaceCommands['fileWorkspace.setText'], (input) =>
    action(input.instanceId, () => setText(input.instanceId, input.text, input), input),
  )
  local.register(fileWorkspaceCommands['fileWorkspace.save'], (input) =>
    action(input.instanceId, () => save(input.instanceId, input), input),
  )
  local.register(fileWorkspaceCommands['fileWorkspace.reconcile'], (input) =>
    action(input.instanceId, () => reconcile(input.instanceId, input), input),
  )
  local.register(fileWorkspaceCommands['fileWorkspace.discardAndReload'], (input) =>
    action(
      input.instanceId,
      async () => {
        const target = documentTarget(input.instanceId, input)
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
      unsubscribeSurfaces()
      changes.dispose()
      tree.dispose()
      documents.dispose()
      generations.clear()
      state.dispose()
    },
  }
}
