import { CommandError, createCommandClient, type CommandExecutor, type CommandRegistry } from '@hbar/commands'
import { fileWorkspaceCommands } from '@hbar/contracts/commands/file-workspace'
import { fileCommands } from '@hbar/contracts/commands/files'
import type { SessionFileTarget } from '@hbar/contracts/commands/files'
import { sessionLaunchTargetSchema } from '@hbar/contracts/commands/session-launch-target'
import { draftCommands } from '@hbar/contracts/commands/draft'
import { sessionSchema } from '@hbar/contracts/directory'
import { createState, type StateReader } from './state'
import {
  canonicalFilePath,
  assertResolvedFileTarget,
  fileDocumentKey,
  FileWorkspaceDocuments,
  sameSessionFileTarget,
} from './file-workspace-documents'
import { isWorkspaceRelativePath, validateMentions } from './composer-mentions'
import { captureFileWorkspaceContext } from './file-context-selection'
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
            (preview) =>
              preview.kind === 'document' &&
              fileDocumentKey(entry.workspaceId, preview.path, entry.sessionTarget) === key,
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
              (preview) =>
                preview.kind === 'document' &&
                fileDocumentKey(entry.workspaceId, preview.path, entry.sessionTarget) === key,
            )
          )
            return [id, entry]
          changed = true
          const previews = entry.previews.flatMap((preview): FileWorkspacePreviewState[] =>
            preview.kind === 'document' && fileDocumentKey(entry.workspaceId, preview.path, entry.sessionTarget) === key
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
  const sourceSessionId = (instanceId: string) => {
    const workbench = chatReference?.tabs
      .getSnapshot()
      .items.find((item) => item.kind === 'workbench' && item.panelInstanceId === instanceId)
    return workbench?.kind === 'workbench' ? workbench.sourceSessionId : panel(instanceId).sessionId
  }
  type ExpectedTarget = {
    readonly sourceSessionId?: string | null | undefined
    readonly sessionTarget?: SessionFileTarget | null | undefined
  }
  const assertSourceTarget = (instanceId: string, expected: ExpectedTarget, entry?: FileWorkspaceEntryState) => {
    const currentSourceSessionId = sourceSessionId(instanceId)
    if ((expected.sourceSessionId ?? null) !== currentSourceSessionId)
      throw new CommandError('TARGET_CHANGED', 'The original Files session changed')
    if (entry) {
      if (entry.sourceSessionId !== currentSourceSessionId)
        throw new CommandError('TARGET_CHANGED', 'The original Files session changed')
      assertResolvedFileTarget(entry.sourceSessionId, entry.sessionTarget, entry.error)
      if (!sameSessionFileTarget(expected.sessionTarget ?? null, entry.sessionTarget))
        throw new CommandError('TARGET_CHANGED', 'The original Files target changed')
    } else if (expected.sessionTarget && expected.sessionTarget.sessionId !== currentSourceSessionId) {
      throw new CommandError('TARGET_CHANGED', 'The file target belongs to another session')
    }
  }
  const resolveSessionTarget = async (
    instanceId: string,
    expectedSourceSessionId: string | null,
    signal: AbortSignal,
  ): Promise<SessionFileTarget | null> => {
    const targetPanel = panel(instanceId)
    const currentSourceSessionId = sourceSessionId(instanceId)
    if (expectedSourceSessionId !== currentSourceSessionId)
      throw new CommandError('TARGET_CHANGED', 'The original Files session changed')
    if (!currentSourceSessionId) return null
    if (!options.sessionLaunchTargets)
      throw new CommandError('CAPABILITY_UNAVAILABLE', 'Session file targets are unavailable')
    const response = await options.sessionLaunchTargets.read(currentSourceSessionId, { signal })
    signal.throwIfAborted()
    const parsed = sessionLaunchTargetSchema.safeParse(response)
    if (!parsed.success) throw new CommandError('INVALID_OUTPUT', 'Session file-target response is invalid')
    const launchTarget = parsed.data
    if (launchTarget.sessionId !== currentSourceSessionId || launchTarget.workspaceId !== targetPanel.workspaceId)
      throw new CommandError('STALE_TARGET', 'The session target belongs to another workspace')
    if (launchTarget.selection.mode === 'isolated-worktree' && !launchTarget.locked) {
      const failure = launchTarget.resolution
      if (failure.status === 'failed' || failure.status === 'cancelled' || failure.status === 'reconciling')
        throw new CommandError(failure.code, failure.message)
      throw new CommandError(
        'SESSION_LAUNCH_TARGET_UNRESOLVED',
        'Run this session once before opening its isolated files',
      )
    }
    return { sessionId: launchTarget.sessionId, expectedRevision: launchTarget.revision }
  }
  const requireClient = () => {
    if (!client) throw new CommandError('CAPABILITY_UNAVAILABLE', 'File commands are unavailable')
    return client
  }
  const matchesOwner = (instanceId: string, workspaceId: string, sourceId: string | null, generation: number) =>
    !isDisposed() &&
    generations.get(instanceId) === generation &&
    surfaces.getSnapshot().panels[instanceId]?.workspaceId === workspaceId &&
    sourceSessionId(instanceId) === sourceId
  const matchesTarget = (
    instanceId: string,
    workspaceId: string,
    sourceId: string | null,
    sessionTarget: SessionFileTarget | null,
    generation: number,
  ) => {
    const entry = state.reader.getSnapshot().entries[instanceId]
    return (
      matchesOwner(instanceId, workspaceId, sourceId, generation) &&
      entry?.workspaceId === workspaceId &&
      entry.sourceSessionId === sourceId &&
      sameSessionFileTarget(entry.sessionTarget, sessionTarget)
    )
  }
  type ExpectedPreview = ExpectedTarget & {
    readonly workspaceId?: string | undefined
    readonly previewId?: string | undefined
  }
  const assertPreview = (entry: FileWorkspaceEntryState, expected?: ExpectedPreview) => {
    if (expected) assertSourceTarget(entry.instanceId, expected, entry)
    if (
      (expected?.workspaceId && expected.workspaceId !== entry.workspaceId) ||
      (expected?.previewId && expected.previewId !== entry.activePreviewId)
    )
      throw new CommandError('VERSION_CONFLICT', 'File action belongs to another preview')
  }
  const documentTarget = (instanceId: string, expected?: ExpectedPreview) => {
    const target = panel(instanceId)
    const entry = state.reader.getSnapshot().entries[instanceId]
    if (!entry || entry.workspaceId !== target.workspaceId || entry.sourceSessionId !== sourceSessionId(instanceId))
      throw new CommandError('RESULT_UNKNOWN', 'Refresh the file panel target')
    assertPreview(entry, expected)
    if (!entry.document) throw new CommandError('RESULT_UNKNOWN', 'Refresh the file panel target')
    return {
      entry,
      workspaceId: target.workspaceId,
      path: entry.document.path,
      sessionTarget: entry.sessionTarget,
    }
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
  const load = async (
    instanceId: string,
    path?: string,
    preservePreview = false,
    expectedSourceSessionId?: string | null,
    signal?: AbortSignal,
  ) => {
    changes.cancelList(instanceId)
    tree.cancelAll(instanceId)
    const target = panel(instanceId)
    const ownerSessionId = sourceSessionId(instanceId)
    if ((expectedSourceSessionId ?? null) !== ownerSessionId)
      throw new CommandError('TARGET_CHANGED', 'The original Files session changed')
    const current = state.reader.getSnapshot().entries[instanceId]
    const sameOwner = current?.workspaceId === target.workspaceId && current.sourceSessionId === ownerSessionId
    const requestedPath = path ?? (sameOwner ? current.path : '.')
    const generation = (generations.get(instanceId) ?? 0) + 1
    generations.set(instanceId, generation)
    const loading: FileWorkspaceEntryState = {
      instanceId,
      workspaceId: target.workspaceId,
      sourceSessionId: ownerSessionId,
      sessionTarget: sameOwner ? current.sessionTarget : null,
      path: requestedPath,
      previews: sameOwner ? current.previews : [],
      activePreviewId: null,
      view: 'browser',
      browserMode: 'all',
      documentMode: sameOwner ? current.documentMode : 'preview',
      changes: sameOwner ? { ...current.changes, status: 'loading', error: null } : emptyFileChanges(),
      diff: null,
      tree: emptyFileTree(sameOwner && current.path === requestedPath ? current.tree.filter : ''),
      rootLimitReached: false,
      status: 'loading',
      items: [],
      nextCursor: null,
      document: null,
      error: null,
    }
    replace(loading)
    let sessionTarget: SessionFileTarget | null = null
    try {
      sessionTarget = await resolveSessionTarget(instanceId, ownerSessionId, signal ?? new AbortController().signal)
      signal?.throwIfAborted()
      if (!matchesOwner(instanceId, target.workspaceId, ownerSessionId, generation))
        throw new CommandError('TARGET_CHANGED', 'The original Files session changed')
      const sameTarget = Boolean(current && sameOwner && sameSessionFileTarget(current.sessionTarget, sessionTarget))
      if (!sameTarget) changes.cancel(instanceId)
      const previews =
        sameTarget && current
          ? current.previews.map((preview) =>
              preview.kind === 'document'
                ? {
                    ...preview,
                    document: documents.get(target.workspaceId, preview.path, sessionTarget) ?? preview.document,
                  }
                : preview,
            )
          : []
      const restored =
        sameTarget && current
          ? projectFileEntry({
              ...current,
              path: requestedPath,
              sourceSessionId: ownerSessionId,
              sessionTarget,
              previews,
            })
          : {
              ...loading,
              sessionTarget,
              previews: [],
              activePreviewId: null,
              view: 'browser' as const,
              browserMode: 'all' as const,
              documentMode: 'preview' as const,
              changes: emptyFileChanges(),
              diff: null,
              tree: emptyFileTree(),
              items: [],
              nextCursor: null,
              document: null,
            }
      const keepPreview = preservePreview && sameTarget && restored.view !== 'browser'
      const scopedLoading: FileWorkspaceEntryState = {
        ...restored,
        sourceSessionId: ownerSessionId,
        sessionTarget,
        path: requestedPath,
        activePreviewId: keepPreview ? restored.activePreviewId : null,
        view: keepPreview ? restored.view : 'browser',
        changes: sameTarget ? restored.changes : emptyFileChanges(),
        diff: keepPreview ? restored.diff : null,
        tree: sameTarget && current?.path === requestedPath ? emptyFileTree(restored.tree.filter) : emptyFileTree(),
        status: 'loading',
        items: [],
        nextCursor: null,
        document: null,
        error: null,
      }
      replace(scopedLoading)
      const page = await requireClient().execute(
        'file.list',
        {
          workspaceId: target.workspaceId,
          ...(sessionTarget ? { sessionTarget } : {}),
          path: requestedPath,
          limit: PAGE_SIZE,
        },
        signal ? { signal } : undefined,
      )
      if (!matchesTarget(instanceId, target.workspaceId, ownerSessionId, sessionTarget, generation))
        throw new CommandError('RESULT_UNKNOWN', 'File listing was superseded')
      const latest = state.reader.getSnapshot().entries[instanceId] ?? scopedLoading
      const ready = { ...latest, status: 'ready' as const, items: page.items, nextCursor: page.nextCursor ?? null }
      replace(ready)
      if (ready.tree.filter.trim()) tree.search(instanceId, target.workspaceId, ready.tree.filter)
      return summary(state.reader.getSnapshot().entries[instanceId] ?? ready)
    } catch (reason) {
      if (!matchesOwner(instanceId, target.workspaceId, ownerSessionId, generation)) throw reason
      const latest = state.reader.getSnapshot().entries[instanceId] ?? loading
      const failed = { ...latest, sessionTarget, status: 'error' as const, error: code(reason) }
      replace(failed)
      throw commandFailure(reason)
    }
  }
  const loadMore = async (instanceId: string, expected: ExpectedTarget = {}, signal?: AbortSignal) => {
    const entry = state.reader.getSnapshot().entries[instanceId]
    if (!entry) return load(instanceId, undefined, false, expected.sourceSessionId, signal)
    assertSourceTarget(instanceId, expected, entry)
    if (!entry.nextCursor) return summary(entry)
    const target = panel(instanceId)
    if (entry.workspaceId !== target.workspaceId || entry.sourceSessionId !== sourceSessionId(instanceId))
      throw new CommandError('RESULT_UNKNOWN', 'Refresh panel target')
    const generation = generations.get(instanceId) ?? 0
    const page = await requireClient().execute(
      'file.list',
      {
        workspaceId: target.workspaceId!,
        ...(entry.sessionTarget ? { sessionTarget: entry.sessionTarget } : {}),
        path: entry.path,
        after: entry.nextCursor,
        limit: PAGE_SIZE,
      },
      signal ? { signal } : undefined,
    )
    if (!matchesTarget(instanceId, target.workspaceId, entry.sourceSessionId, entry.sessionTarget, generation))
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
  const openEntry = async (
    instanceId: string,
    rawPath: string,
    directory: boolean,
    preservePreview = false,
    expected: ExpectedTarget = {},
    signal?: AbortSignal,
  ) => {
    if (directory) {
      const current = state.reader.getSnapshot().entries[instanceId]
      if (current) assertSourceTarget(instanceId, expected, current)
      return load(instanceId, rawPath, preservePreview, expected.sourceSessionId, signal)
    }
    const path = canonicalFilePath(rawPath)
    const entry = state.reader.getSnapshot().entries[instanceId]
    const target = panel(instanceId)
    if (!entry || entry.workspaceId !== target.workspaceId)
      throw new CommandError('RESULT_UNKNOWN', 'Refresh panel target')
    assertSourceTarget(instanceId, expected, entry)
    const existing = entry.previews.find((preview) => preview.kind === 'document' && preview.path === path)
    if (!existing && entry.previews.length >= MAX_FILE_PREVIEWS) {
      replace({ ...entry, error: 'BUSY' })
      throw new CommandError('BUSY', 'Close another file preview before opening one')
    }
    changes.cancelList(instanceId)
    const generation = (generations.get(instanceId) ?? 0) + 1
    generations.set(instanceId, generation)
    const reading = documents.open(target.workspaceId, path, false, entry.sessionTarget)
    const document = documents.get(target.workspaceId, path, entry.sessionTarget)
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
        !matchesTarget(instanceId, target.workspaceId, entry.sourceSessionId, entry.sessionTarget, generation) ||
        !state.reader.getSnapshot().entries[instanceId]?.previews.some((preview) => preview.id === previewId)
      )
        throw new CommandError('RESULT_UNKNOWN', 'File read was superseded')
      return summary(state.reader.getSnapshot().entries[instanceId] ?? entry)
    } catch (reason) {
      if (matchesTarget(instanceId, target.workspaceId, entry.sourceSessionId, entry.sessionTarget, generation)) {
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
    const { workspaceId, path, sessionTarget } = documentTarget(instanceId, expected)
    documents.edit(workspaceId, path, text, sessionTarget)
    const latest = documentTarget(instanceId, expected).entry
    replace({ ...latest, error: null })
    return summary(latest)
  }
  const save = async (instanceId: string, expected?: ExpectedPreview) => {
    const { entry, workspaceId, path, sessionTarget } = documentTarget(instanceId, expected)
    const document = await documents.save(workspaceId, path, sessionTarget)
    return summary({ ...entry, document })
  }
  const reconcile = async (instanceId: string, expected?: ExpectedPreview) => {
    const { entry, workspaceId, path, sessionTarget } = documentTarget(instanceId, expected)
    const document = await documents.reconcile(workspaceId, path, sessionTarget)
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
            (!expected.previewId || before.activePreviewId === expected.previewId) &&
            (expected.sourceSessionId ?? null) === before.sourceSessionId &&
            sameSessionFileTarget(expected.sessionTarget ?? null, before.sessionTarget))) &&
        before.workspaceId === latest.workspaceId &&
        before.sourceSessionId === latest.sourceSessionId &&
        sameSessionFileTarget(before.sessionTarget, latest.sessionTarget) &&
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
    sourceSessionId: (instanceId) => sourceSessionId(instanceId),
    openFile: (instanceId, path) => {
      const entry = state.reader.getSnapshot().entries[instanceId]
      if (!entry) throw new CommandError('RESULT_UNKNOWN', 'Refresh the file panel target')
      return openEntry(instanceId, path, false, false, {
        sourceSessionId: entry.sourceSessionId,
        sessionTarget: entry.sessionTarget,
      })
    },
    openFolder: (instanceId, path) => {
      const entry = state.reader.getSnapshot().entries[instanceId]
      if (!entry) throw new CommandError('RESULT_UNKNOWN', 'Refresh the file panel target')
      return openEntry(instanceId, path, true, false, {
        sourceSessionId: entry.sourceSessionId,
        sessionTarget: entry.sessionTarget,
      })
    },
    isDisposed,
    onPreviewOpened: chatReference?.onPreviewOpened,
  })
  const tree = createFileWorkspaceTree(options, {
    read: (instanceId) => state.reader.getSnapshot().entries[instanceId],
    replace,
    workspaceId: (instanceId) => surfaces.getSnapshot().panels[instanceId]?.workspaceId ?? null,
    sourceSessionId: (instanceId) => sourceSessionId(instanceId),
    isDisposed,
  })
  let previousPanels = surfaces.getSnapshot().panels
  const invalidateChangedTargets = () => {
    const current = surfaces.getSnapshot().panels
    for (const [instanceId, previous] of Object.entries(previousPanels)) {
      if (previous.panelId !== 'files') continue
      const entry = state.reader.getSnapshot().entries[instanceId]
      const nextPanel = current[instanceId]
      const sameOwner =
        nextPanel?.panelId === 'files' &&
        nextPanel.workspaceId === previous.workspaceId &&
        (!entry || entry.sourceSessionId === sourceSessionId(instanceId))
      if (sameOwner) continue
      generations.set(instanceId, (generations.get(instanceId) ?? 0) + 1)
      changes.cancel(instanceId)
      tree.cancelAll(instanceId)
      if (previous.sessionTool && !nextPanel) {
        // Only the session owner evicts these immutable targets, after checking public dirty/pending state.
        generations.delete(instanceId)
        const snapshot = state.reader.getSnapshot()
        state.replace({
          entries: Object.fromEntries(Object.entries(snapshot.entries).filter(([id]) => id !== instanceId)),
        })
        continue
      }
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
  }
  const unsubscribeSurfaces = surfaces.subscribe(invalidateChangedTargets)
  const unsubscribeTabs = chatReference?.tabs.subscribe(invalidateChangedTargets)
  const requireEntry = (instanceId: string, workspaceId: string, expected: ExpectedTarget = {}) => {
    const target = panel(instanceId)
    const entry = state.reader.getSnapshot().entries[instanceId]
    if (!entry || target.workspaceId !== workspaceId || entry.workspaceId !== workspaceId)
      throw new CommandError('VERSION_CONFLICT', 'File action belongs to another workspace')
    assertSourceTarget(instanceId, expected, entry)
    return entry
  }
  const selectPreview = async (
    instanceId: string,
    workspaceId: string,
    previewId: string,
    explicitRefresh = false,
    expected: ExpectedPreview = {},
  ) => {
    const entry = requireEntry(instanceId, workspaceId, expected)
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
    if (filePreviewCloseReason(preview)) return summary(requireEntry(instanceId, workspaceId, expected))
    await documents.open(workspaceId, preview.path, false, entry.sessionTarget)
    const latest = requireEntry(instanceId, workspaceId, expected)
    if (!latest.previews.some((value) => value.id === previewId))
      throw new CommandError('TARGET_CHANGED', 'The original file preview is closed')
    return summary(latest)
  }
  local.register(fileWorkspaceCommands['fileWorkspace.selectPreview'], (input) =>
    selectPreview(input.instanceId, input.workspaceId, input.previewId, false, input),
  )
  local.register(fileWorkspaceCommands['fileWorkspace.refreshPreview'], (input) =>
    selectPreview(input.instanceId, input.workspaceId, input.previewId, true, input),
  )
  local.register(fileWorkspaceCommands['fileWorkspace.closePreviews'], (input) => {
    const { instanceId, workspaceId, previewIds } = input
    const entry = requireEntry(instanceId, workspaceId, input)
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
      if (target.workspaceId !== input.workspaceId || sourceSessionId(input.instanceId) !== input.sourceSessionId)
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
      const entry = requireEntry(input.instanceId, input.workspaceId, input)
      if (input.context && !input.previewId)
        throw new CommandError('INVALID_INPUT', 'A source preview identity is required for a selected context')
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
      const document = documents.get(input.workspaceId, input.path, entry.sessionTarget)
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
      if (input.context) captureFileWorkspaceContext(entry, input.path, input.context)
      return { draft, entry }
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
    const { draft, entry } = assertTarget()
    if (input.context) {
      const result = draftCommands['draft.addWorkspaceContext'].output.parse(
        await local.execute(
          'draft.addWorkspaceContext',
          {
            sessionId: input.sourceSessionId,
            expectedRevision: input.expectedRevision,
            context: captureFileWorkspaceContext(entry, input.path, input.context),
          },
          { signal: execution.signal },
        ),
      )
      return {
        sessionId: input.sourceSessionId,
        sessionTitle: session.title,
        revision: result.revision,
        added: result.added,
      }
    }
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
  local.register(fileWorkspaceCommands['fileWorkspace.setBrowserMode'], async (input) => {
    const { instanceId, workspaceId, mode, preservePreview } = input
    requireEntry(instanceId, workspaceId, input)
    generations.set(instanceId, (generations.get(instanceId) ?? 0) + 1)
    if (mode === 'changed') {
      tree.cancelAll(instanceId)
      return summary(await changes.load(instanceId, workspaceId, preservePreview))
    }
    changes.cancelList(instanceId)
    tree.cancelAll(instanceId)
    const latest = requireEntry(instanceId, workspaceId, input)
    if (latest.status !== 'ready' || latest.tree.revalidateOnOpen)
      return load(instanceId, undefined, preservePreview, input.sourceSessionId)
    const next = {
      ...latest,
      activePreviewId: preservePreview ? latest.activePreviewId : null,
      browserMode: 'all' as const,
    }
    replace(next)
    if (next.tree.filter.trim()) tree.search(instanceId, workspaceId, next.tree.filter)
    return summary(next)
  })
  local.register(fileWorkspaceCommands['fileWorkspace.toggleTree'], async (input) => {
    requireEntry(input.instanceId, input.workspaceId, input)
    return summary(await tree.toggle(input.instanceId, input.workspaceId, input.path))
  })
  local.register(fileWorkspaceCommands['fileWorkspace.refreshTree'], async (input) => {
    requireEntry(input.instanceId, input.workspaceId, input)
    return summary(await tree.refresh(input.instanceId, input.workspaceId, input.path))
  })
  local.register(fileWorkspaceCommands['fileWorkspace.loadMoreTree'], async (input) => {
    requireEntry(input.instanceId, input.workspaceId, input)
    return summary(await tree.more(input.instanceId, input.workspaceId, input.path))
  })
  local.register(fileWorkspaceCommands['fileWorkspace.filterTree'], (input) => {
    const { instanceId, workspaceId, filter } = input
    requireEntry(instanceId, workspaceId, input)
    tree.search(instanceId, workspaceId, filter)
    return summary(requireEntry(instanceId, workspaceId, input))
  })
  local.register(fileWorkspaceCommands['fileWorkspace.refreshChanges'], async (input) => {
    requireEntry(input.instanceId, input.workspaceId, input)
    return summary(await changes.load(input.instanceId, input.workspaceId, input.preservePreview))
  })
  local.register(fileWorkspaceCommands['fileWorkspace.filterChanges'], (input) => {
    const { instanceId, workspaceId, filter } = input
    const entry = requireEntry(instanceId, workspaceId, input)
    const next = { ...entry, changes: { ...entry.changes, filter, page: 0 } }
    replace(next)
    return summary(next)
  })
  local.register(fileWorkspaceCommands['fileWorkspace.pageChanges'], (input) => {
    const { instanceId, workspaceId, page } = input
    const entry = requireEntry(instanceId, workspaceId, input)
    const last = Math.max(0, Math.ceil(filteredFileChanges(entry.changes).length / FILE_CHANGES_PAGE_SIZE) - 1)
    const next = { ...entry, changes: { ...entry.changes, page: Math.min(page, last) } }
    replace(next)
    return summary(next)
  })
  local.register(fileWorkspaceCommands['fileWorkspace.openChange'], async (input) => {
    const { instanceId, workspaceId, path, cached } = input
    const entry = requireEntry(instanceId, workspaceId, input)
    assertPreview(entry, input)
    return summary(await changes.open(instanceId, workspaceId, path, cached))
  })
  local.register(fileWorkspaceCommands['fileWorkspace.setDocumentMode'], (input) => {
    const { instanceId, workspaceId, path, mode } = input
    const entry = requireEntry(instanceId, workspaceId, input)
    assertPreview(entry, input)
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
  })
  local.register(fileWorkspaceCommands['fileWorkspace.refresh'], (input, execution) =>
    load(input.instanceId, undefined, input.preservePreview, input.sourceSessionId, execution.signal),
  )
  local.register(fileWorkspaceCommands['fileWorkspace.loadMore'], (input, execution) =>
    loadMore(input.instanceId, input, execution.signal),
  )
  local.register(fileWorkspaceCommands['fileWorkspace.openEntry'], (input, execution) => {
    if (input.workspaceId) requireEntry(input.instanceId, input.workspaceId, input)
    return openEntry(input.instanceId, input.path, input.directory, input.preservePreview, input, execution.signal)
  })
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
          target.sessionTarget,
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
      unsubscribeTabs?.()
      changes.dispose()
      tree.dispose()
      documents.dispose()
      generations.clear()
      state.dispose()
    },
  }
}
