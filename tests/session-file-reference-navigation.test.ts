import { describe, expect, test } from 'bun:test'
import { CommandRegistry } from '@hbar/commands'
import { fileWorkspaceCommands } from '@hbar/contracts/commands/file-workspace'
import { createSessionFileReferenceNavigation } from '../packages/app-runtime/src/session-file-reference-navigation'
import { sessionToolCommands } from '../packages/app-runtime/src/session-tools'
import { createState } from '../packages/app-runtime/src/state'
import type {
  FileWorkspaceEntryState,
  FileWorkspaceState,
  NavigationState,
  PresentationState,
  SessionTimelineState,
  SurfaceState,
} from '../packages/app-runtime/src/types'
import type { WorkspaceTabsState } from '../packages/app-runtime/src/workspace-tabs-runtime'

const key = '00000000-0000-4000-8000-000000000001'
const summary = (instanceId: string, workspaceId: string, path: string) => ({
  instanceId,
  workspaceId,
  path,
  view: 'document' as const,
  selectedPath: path,
  status: 'ready' as const,
  documentStatus: 'ready' as const,
  dirty: false,
  error: null,
})

function fixture(readGate?: Promise<void>) {
  const navigation = createState<NavigationState>(
    { workspaceId: 'w', sessionId: 's', status: 'idle', error: null },
    () => {},
  )
  const tabs = createState<WorkspaceTabsState>(
    {
      items: [{ kind: 'session', id: 's', sessionId: 's', workspaceId: 'w', instanceKey: key }],
      activeId: 's',
      revision: 0,
      restoreStatus: 'ready',
      restoreError: null,
      persistError: null,
    },
    () => {},
  )
  const presentation = createState<PresentationState>(
    { page: { kind: 'session' }, toolInstanceId: null, modalInstanceId: null, returnContext: null, sidebarOpen: true },
    () => {},
  )
  const surfaces = createState<SurfaceState>(
    { panels: {}, windows: {}, focusedPanelId: null, focusedWindowId: null },
    () => {},
  )
  const files = createState<FileWorkspaceState>({ entries: {} }, () => {})
  const timeline = createState<SessionTimelineState>(
    {
      sessionId: 's',
      status: 'ready',
      olderStatus: 'idle',
      olderError: null,
      messages: [{ id: 'm', sessionId: 's', runId: 'r', role: 'assistant', content: [], seq: 1, createdAt: 1 }],
      runs: [],
      approvals: [],
      userInputs: [],
      plan: null,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
      streams: {},
      events: [],
      cursor: 1,
      hasOlder: false,
      error: null,
    } as unknown as SessionTimelineState,
    () => {},
  )
  const local = new CommandRegistry({ execution: 'client' })
  const entry = (path = '.'): FileWorkspaceEntryState => ({
    instanceId: 'files',
    workspaceId: 'w',
    sourceSessionId: 's',
    sessionTarget: { sessionId: 's', expectedRevision: 1 },
    path,
    previews: [],
    activePreviewId: null,
    view: 'browser',
    browserMode: 'all',
    documentMode: 'preview',
    changes: {
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
    },
    diff: null,
    tree: {
      filter: '',
      search: { status: 'idle', paths: [], truncated: false, error: null },
      nodes: {},
      revalidateOnOpen: false,
      error: null,
    },
    rootLimitReached: false,
    status: 'ready',
    items: [],
    nextCursor: null,
    document: null,
    error: null,
  })
  local.register(sessionToolCommands['sessionTools.open'], () => {
    surfaces.replace({
      ...surfaces.reader.getSnapshot(),
      panels: {
        files: {
          instanceId: 'files',
          panelId: 'files',
          workspaceId: 'w',
          sessionId: 's',
          binding: 'pinned',
          sessionTool: true,
          params: {},
        },
      },
      focusedPanelId: 'files',
    })
    presentation.replace({ ...presentation.reader.getSnapshot(), toolInstanceId: 'files' })
    return { instanceId: 'files', visible: true }
  })
  local.register(fileWorkspaceCommands['fileWorkspace.refresh'], () => {
    files.replace({ entries: { files: entry() } })
    return summary('files', 'w', '.')
  })
  type PreviewId = FileWorkspaceEntryState['previews'][number]['id']
  let previewId = crypto.randomUUID() as PreviewId
  local.register(fileWorkspaceCommands['fileWorkspace.openEntry'], async (input) => {
    const current = files.reader.getSnapshot().entries.files ?? entry()
    const path = input.path.replaceAll('\\', '/')
    const existing = current.previews.find((preview) => preview.kind === 'document' && preview.path === path)
    previewId = existing?.id ?? previewId
    const reveal = input.reveal
      ? {
          requestId: 'request',
          line: input.reveal.line,
          ...(input.reveal.column === undefined ? {} : { column: input.reveal.column }),
        }
      : undefined
    const preview = {
      id: previewId,
      kind: 'document' as const,
      path,
      documentMode: 'preview' as const,
      document: {
        path,
        status: 'ready' as const,
        baseline: 'content',
        draft: 'content',
        sha256: 'hash',
        pendingText: null,
        error: null,
      },
      ...(reveal ? { reveal } : {}),
    }
    files.replace({
      entries: {
        files: {
          ...current,
          path,
          view: 'document',
          activePreviewId: previewId,
          document: preview.document,
          previews: [preview],
        },
      },
    })
    if (readGate) await readGate
    return summary('files', 'w', path)
  })
  const navigationModule = createSessionFileReferenceNavigation(local, {
    navigation: navigation.reader,
    tabs: tabs.reader,
    timeline: timeline.reader,
    surfaces: surfaces.reader,
    presentation: presentation.reader,
    files: files.reader,
    isDisposed: () => false,
    onSubscriberError: () => {},
  })
  const execute = (input: unknown) => local.execute('messageFiles.open', input)
  return {
    navigation,
    tabs,
    presentation,
    surfaces,
    files,
    timeline,
    local,
    execute,
    dispose: () => {
      navigationModule.dispose()
      local.dispose()
    },
  }
}

describe('message file reference navigation', () => {
  test('opens and returns the active preview for a verified message', async () => {
    const f = fixture()
    const result = await f.execute({
      workspaceId: 'w',
      sessionId: 's',
      sourceTabInstanceKey: key,
      messageId: 'm',
      path: 'src/a.ts',
      line: 2,
    })
    expect(result).toMatchObject({ instanceId: 'files', path: 'src/a.ts' })
    f.dispose()
  })

  test('rejects a missing message before opening a panel', async () => {
    const f = fixture()
    await expect(
      f.execute({ workspaceId: 'w', sessionId: 's', sourceTabInstanceKey: key, messageId: 'missing', path: 'a.ts' }),
    ).rejects.toMatchObject({ code: 'SOURCE_CHANGED' })
    expect(f.surfaces.reader.getSnapshot().panels).toEqual({})
    f.dispose()
  })

  test('a newer intent cancels an older observation', async () => {
    const f = fixture()
    const first = f.execute({
      workspaceId: 'w',
      sessionId: 's',
      sourceTabInstanceKey: key,
      messageId: 'm',
      path: 'a.ts',
    })
    const second = f.execute({
      workspaceId: 'w',
      sessionId: 's',
      sourceTabInstanceKey: key,
      messageId: 'm',
      path: 'b.ts',
    })
    await expect(first).rejects.toMatchObject({ code: 'SOURCE_CHANGED' })
    await expect(second).resolves.toMatchObject({ path: 'b.ts' })
    f.dispose()
  })
  test('closing the dock cancels observation immediately even when the read cannot be interrupted', async () => {
    const gate = Promise.withResolvers<void>()
    const f = fixture(gate.promise)
    try {
      const opening = f.execute({
        workspaceId: 'w',
        sessionId: 's',
        sourceTabInstanceKey: key,
        messageId: 'm',
        path: 'a.ts',
      })
      await Bun.sleep(0)
      f.presentation.replace({ ...f.presentation.reader.getSnapshot(), toolInstanceId: null })
      await expect(opening).rejects.toMatchObject({ code: 'TARGET_CHANGED' })
      gate.resolve()
      await Bun.sleep(0)
      expect(f.presentation.reader.getSnapshot().toolInstanceId).toBeNull()
    } finally {
      gate.resolve()
      f.dispose()
    }
  })
  test('unsafe paths do not open a panel or replace a valid source target', async () => {
    const f = fixture()
    try {
      for (const path of ['../a.ts', 'src/../a.ts', 'javascript:a.ts', 'file://a.ts', '~/.env'])
        await expect(
          f.execute({ workspaceId: 'w', sessionId: 's', sourceTabInstanceKey: key, messageId: 'm', path }),
        ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
      expect(f.surfaces.reader.getSnapshot().panels).toEqual({})
    } finally {
      f.dispose()
    }
  })

  test('allows an archived reading target without a live source tab', async () => {
    const f = fixture()
    f.tabs.replace({ ...f.tabs.reader.getSnapshot(), items: [], activeId: null })
    await expect(
      f.execute({
        workspaceId: 'w',
        sessionId: 's',
        sourceTabInstanceKey: null,
        messageId: 'm',
        path: 'archived.md',
        line: 4,
      }),
    ).resolves.toMatchObject({ path: 'archived.md' })
    f.dispose()
  })
})
