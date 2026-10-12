import { createHash } from 'node:crypto'
import { expect, test } from 'bun:test'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import type { Session, Workspace } from '@hbar/contracts/directory'
import { serializeMentions } from '../packages/app-runtime/src/composer-mentions'
import { projectWorkspaceDiffRows, selectWorkspaceDiffRange } from '../packages/app-runtime/src/file-context-selection'

const workspace: Workspace = { id: 'w', name: 'Workspace', path: 'D:/workspace', createdAt: 1 }
const session = (id: string, archived = false): Session => ({
  id,
  workspaceId: 'w',
  title: id,
  archived,
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  seq: 1,
})
const sha = (text: string) => createHash('sha256').update(text).digest('hex')
const sourceText = 'disk content\nsecond line\nthird line'
const diffText = '@@ -1,3 +1,4 @@\n disk content\n-old line\n+second line\n+extra line\n third line'

async function fixture() {
  const sessions = new Map([
    ['a', session('a')],
    ['b', session('b')],
  ])
  let unavailable = false
  let unknownWrite = false
  let pendingRead: Promise<Session | null> | null = null
  let reads = 0
  const directory: CommandExecutor = {
    execute(name, value) {
      const input = value as { sessionId?: string; workspaceId?: string }
      if (name === 'workspace.get') return Promise.resolve(input.workspaceId === 'w' ? workspace : null)
      if (name === 'session.get') {
        reads++
        if (unavailable) return Promise.reject(new CommandError('CONNECTION_CLOSED', 'Host offline'))
        if (input.sessionId === 'a' && pendingRead) return pendingRead
        return Promise.resolve(sessions.get(input.sessionId ?? '') ?? null)
      }
      if (name === 'session.list') return Promise.resolve({ items: [], nextCursor: null })
      throw new Error(`Unexpected directory call: ${name}`)
    },
  }
  const runtime = createAppRuntime({
    instanceId: crypto.randomUUID(),
    hostId: 'file-chat-host',
    directory,
    sessionLaunchTargets: {
      async read(sessionId) {
        return {
          sessionId,
          workspaceId: 'w',
          revision: 0,
          selection: { mode: 'shared-current' },
          locked: true,
          resolution: { status: 'ready', branch: null },
          updatedAt: 1,
        }
      },
    },
    surfaces: { canRender: (id) => id === 'files' },
    files: {
      execute(name, raw) {
        const input = raw as {
          workspaceId: string
          path: string
          sessionTarget?: { sessionId: string; expectedRevision: number }
        }
        if (name === 'file.list')
          return Promise.resolve({ items: [{ name: 'spec doc.md', path: 'src/spec doc.md', directory: false }] })
        if (name === 'file.read') {
          const text = sourceText
          return Promise.resolve({
            workspaceId: input.workspaceId,
            ...(input.sessionTarget ? { sessionTarget: input.sessionTarget } : {}),
            path: input.path,
            text,
            size: text.length,
            sha256: sha(text),
          })
        }
        if (name === 'file.write' && unknownWrite)
          return Promise.reject(new CommandError('RESULT_UNKNOWN', 'Host accepted the write but lost its result'))
        throw new Error(`Unexpected Files call: ${name}`)
      },
    },
    git: {
      async execute(name, raw) {
        const target = raw as { workspaceId: string; sessionId: string; expectedRevision: number }
        if (name === 'sessionGit.status')
          return {
            target: {
              workspaceId: target.workspaceId,
              sessionId: target.sessionId,
              expectedRevision: target.expectedRevision,
            },
            branch: 'main',
            head: null,
            upstream: null,
            ahead: 0,
            behind: 0,
            dirty: true,
            isRepository: true,
            repositoryDirty: true,
            entries: [{ kind: 'path', path: 'src/spec doc.md', index: ' ', worktree: 'M' }],
          }
        if (name === 'sessionGit.diff')
          return {
            target: {
              workspaceId: target.workspaceId,
              sessionId: target.sessionId,
              expectedRevision: target.expectedRevision,
            },
            cached: false,
            truncated: false,
            diff: diffText,
          }
        throw new Error(name)
      },
    },
  })
  await runtime.ready
  const execute = runtime.view.commands.execute
  const fileTarget = {
    instanceId: 'files-a',
    workspaceId: 'w',
    sourceSessionId: 'a',
    sessionTarget: { sessionId: 'a', expectedRevision: 0 },
  }
  await execute('app.setSession', { sessionId: 'a', workspaceId: 'w' })
  await execute('app.setSession', { sessionId: 'b', workspaceId: 'w' })
  await execute('app.openPanel', {
    panelId: 'files',
    instanceId: 'files-a',
    workspaceId: 'w',
    sessionId: 'a',
    binding: 'pinned',
  })
  await execute('fileWorkspace.refresh', {
    instanceId: fileTarget.instanceId,
    sourceSessionId: 'a',
    sessionTarget: fileTarget.sessionTarget,
  })
  await execute('fileWorkspace.openEntry', {
    ...fileTarget,
    path: 'src/spec doc.md',
    directory: false,
  })
  const opened = await execute('workspaceTabs.openWorkbench', {
    panelInstanceId: 'files-a',
    workspaceId: 'w',
    sourceSessionId: 'a',
  })
  const tabs = runtime.view.state.workspaceTabs.getSnapshot()
  const source = tabs.items.find((item) => item.kind === 'session' && item.id === 'a')!
  const workbench = tabs.items.find((item) => item.id === opened.id)!
  const initialDrafts = runtime.view.state.drafts.getSnapshot()
  const target = {
    instanceId: 'files-a',
    workspaceId: 'w',
    path: 'src/spec doc.md',
    sourceSessionId: 'a',
    sourceTabInstanceKey: source.instanceKey,
    workbenchTabId: workbench.id,
    workbenchTabInstanceKey: workbench.instanceKey,
    expectedRevision: 0,
    sessionTarget: fileTarget.sessionTarget,
  }
  return {
    runtime,
    execute,
    target,
    fileTarget,
    initialDrafts,
    sessions,
    reads: () => reads,
    offline: () => {
      unavailable = true
    },
    loseFileWrite: () => {
      unknownWrite = true
    },
    hold: (promise: Promise<Session | null> | null) => {
      pendingRead = promise
    },
  }
}

test('a Files workbench adds a structured path to its original Session without navigating or losing draft content', async () => {
  const f = await fixture()
  try {
    await f.execute('draft.setContent', {
      sessionId: 'a',
      text: 'Review @spec doc.md',
      mentions: [],
      expectedRevision: 0,
    })
    const result = await f.execute('fileWorkspace.addToComposer', { ...f.target, expectedRevision: 1 })
    expect(result).toEqual({ sessionId: 'a', sessionTitle: 'a', revision: 2, added: true })
    const draft = f.runtime.view.state.drafts.getSnapshot().a!
    expect(draft.text).toBe('Review @spec doc.md @spec doc.md')
    expect(draft.mentions).toEqual([
      {
        start: 20,
        end: 32,
        label: 'spec doc.md',
        path: 'src/spec doc.md',
        workspaceId: 'w',
        directory: false,
      },
    ])
    expect(serializeMentions(draft.text, draft.mentions, 'w')).toBe('Review @spec doc.md @"src/spec doc.md"')
    expect(f.runtime.view.state.drafts.getSnapshot().b).toEqual(f.initialDrafts.b)
    expect(f.runtime.view.state.workspaceTabs.getSnapshot().activeId).toBe(f.target.workbenchTabId)
    expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBe('b')
    expect(await f.execute('fileWorkspace.addToComposer', { ...f.target, expectedRevision: 2 })).toEqual({
      sessionId: 'a',
      sessionTitle: 'a',
      revision: 2,
      added: false,
    })
    expect(f.reads()).toBeGreaterThan(2)
  } finally {
    f.runtime.dispose()
  }
})

test('source selection adds a deduplicated snapshot to its owning composer without changing text, mentions or materials', async () => {
  const f = await fixture()
  try {
    await f.execute('draft.setContent', {
      sessionId: 'a',
      text: 'Review @existing.md',
      expectedRevision: 0,
      mentions: [{ start: 7, end: 19, label: 'existing.md', workspaceId: 'w', path: 'existing.md', directory: false }],
    })
    const attachments = [
      { kind: 'file' as const, artifact: { id: 'a'.repeat(64), name: 'notes.txt', mime: 'text/plain', size: 4 } },
    ]
    await f.execute('draft.setAttachments', { sessionId: 'a', attachments })
    const input = {
      ...f.target,
      previewId: f.runtime.view.state.files.getSnapshot().entries['files-a']!.activePreviewId!,
      expectedRevision: 2,
      context: { kind: 'source-selection' as const, sha256: sha(sourceText), startOffset: 2, endOffset: 19 },
    }
    expect(await f.execute('fileWorkspace.addToComposer', input)).toMatchObject({ added: true, revision: 3 })
    const draft = f.runtime.view.state.drafts.getSnapshot().a!
    expect(draft.text).toBe('Review @existing.md')
    expect(draft.mentions).toHaveLength(1)
    expect(draft.attachments).toEqual(attachments)
    expect(draft.workspaceContexts).toMatchObject([
      {
        kind: 'source-selection',
        workspaceId: 'w',
        path: 'src/spec doc.md',
        lineStart: 1,
        lineEnd: 2,
        quote: 'disk content\nsecond line',
      },
    ])
    expect(await f.execute('fileWorkspace.addToComposer', { ...input, expectedRevision: 3 })).toMatchObject({
      added: false,
      revision: 3,
    })
    await expect(
      f.execute('fileWorkspace.addToComposer', {
        ...input,
        expectedRevision: 3,
        context: { ...input.context, sha256: 'f'.repeat(64) },
      }),
    ).rejects.toMatchObject({ code: 'TARGET_CHANGED' })
    expect(f.runtime.view.state.drafts.getSnapshot().a).toEqual(draft)
    expect(f.runtime.view.state.drafts.getSnapshot().b).toEqual(f.initialDrafts.b)
    expect(f.runtime.view.state.workspaceTabs.getSnapshot().activeId).toBe(f.target.workbenchTabId)
  } finally {
    f.runtime.dispose()
  }
})

test('a same-side diff comment captures numbered code and note from the current snapshot, not raw patch headers', async () => {
  const f = await fixture()
  try {
    await f.execute('fileWorkspace.setBrowserMode', { ...f.fileTarget, mode: 'changed' })
    await f.execute('fileWorkspace.openChange', { ...f.fileTarget, path: f.target.path })
    const rows = projectWorkspaceDiffRows(diffText)
    const range = selectWorkspaceDiffRange(rows, 3, 4)!
    expect(range).toMatchObject({ diffSide: 'new', lineStart: 2, lineEnd: 3, quote: 'second line\nextra line' })
    expect(selectWorkspaceDiffRange(rows, 2, 3)).toBeNull()
    await f.execute('fileWorkspace.addToComposer', {
      ...f.target,
      previewId: f.runtime.view.state.files.getSnapshot().entries['files-a']!.activePreviewId!,
      context: {
        kind: 'diff-comment',
        cached: false,
        expectedText: diffText,
        rowStart: 3,
        rowEnd: 4,
        diffSide: 'new',
        note: 'Keep the clearer wording',
      },
    })
    expect(f.runtime.view.state.drafts.getSnapshot().a?.workspaceContexts).toMatchObject([
      {
        kind: 'diff-comment',
        workspaceId: 'w',
        path: f.target.path,
        diffSide: 'new',
        lineStart: 2,
        lineEnd: 3,
        quote: 'second line\nextra line',
        note: 'Keep the clearer wording',
      },
    ])
    expect(f.runtime.view.state.drafts.getSnapshot().a?.text).toBe('')
  } finally {
    f.runtime.dispose()
  }
})

test('a changed source draft, offline Host, or archived source fails closed without changing either draft', async () => {
  const f = await fixture()
  try {
    await f.execute('draft.setText', { sessionId: 'a', text: 'newer source' })
    const before = f.runtime.view.state.drafts.getSnapshot().a
    try {
      await f.execute('fileWorkspace.addToComposer', f.target)
      throw new Error('expected draft revision conflict')
    } catch (error) {
      expect(error).toMatchObject({ code: 'VERSION_CONFLICT' })
    }
    f.offline()
    try {
      await f.execute('fileWorkspace.addToComposer', { ...f.target, expectedRevision: 1 })
      throw new Error('expected Host offline failure')
    } catch (error) {
      expect(error).toMatchObject({ code: 'CONNECTION_CLOSED' })
    }
    expect(f.runtime.view.state.drafts.getSnapshot().a).toEqual(before)
  } finally {
    f.runtime.dispose()
  }
  const archived = await fixture()
  try {
    archived.sessions.set('a', session('a', true))
    try {
      await archived.execute('fileWorkspace.addToComposer', archived.target)
      throw new Error('expected archived source rejection')
    } catch (error) {
      expect(error).toMatchObject({ code: 'SESSION_NOT_FOUND' })
    }
    expect(archived.runtime.view.state.drafts.getSnapshot().a).toEqual(archived.initialDrafts.a)
  } finally {
    archived.runtime.dispose()
  }
})

test('a late Host read never writes after the selected file changes', async () => {
  const f = await fixture()
  const gate = Promise.withResolvers<Session | null>()
  try {
    f.hold(gate.promise)
    const pending = f.execute('fileWorkspace.addToComposer', f.target)
    await Bun.sleep(0)
    await f.execute('fileWorkspace.openEntry', {
      ...f.fileTarget,
      path: 'src/other.md',
      directory: false,
    })
    gate.resolve(session('a'))
    try {
      await pending
      throw new Error('expected target change')
    } catch (error) {
      expect(error).toMatchObject({ code: 'TARGET_CHANGED' })
    }
    expect(f.runtime.view.state.drafts.getSnapshot().a).toEqual(f.initialDrafts.a)
  } finally {
    gate.resolve(session('a'))
    f.runtime.dispose()
  }
})

test('an unsaved file edit blocks a disk-path reference and preserves the edit', async () => {
  const f = await fixture()
  try {
    await f.execute('fileWorkspace.setText', { ...f.fileTarget, text: 'uncommitted' })
    try {
      await f.execute('fileWorkspace.addToComposer', f.target)
      throw new Error('expected unsaved file rejection')
    } catch (error) {
      expect(error).toMatchObject({ code: 'FILE_DRAFT_PENDING' })
    }
    expect(f.runtime.view.state.files.getSnapshot().entries['files-a']?.document?.draft).toBe('uncommitted')
    expect(f.runtime.view.state.drafts.getSnapshot().a).toEqual(f.initialDrafts.a)
  } finally {
    f.runtime.dispose()
  }
})

test('an unknown file save cannot be represented as the saved on-disk path', async () => {
  const f = await fixture()
  try {
    await f.execute('fileWorkspace.setText', { ...f.fileTarget, text: 'possibly saved' })
    f.loseFileWrite()
    try {
      await f.execute('fileWorkspace.save', f.fileTarget)
      throw new Error('expected unknown file write')
    } catch (error) {
      expect(error).toMatchObject({ code: 'RESULT_UNKNOWN' })
    }
    expect(f.runtime.view.state.files.getSnapshot().entries['files-a']?.document?.status).toBe('unknown')
    try {
      await f.execute('fileWorkspace.addToComposer', f.target)
      throw new Error('expected unconfirmed file rejection')
    } catch (error) {
      expect(error).toMatchObject({ code: 'FILE_DRAFT_PENDING' })
    }
    expect(f.runtime.view.state.drafts.getSnapshot().a).toEqual(f.initialDrafts.a)
  } finally {
    f.runtime.dispose()
  }
})

test('a replaced source tab instance or a switched active workbench cannot receive a late reference', async () => {
  const f = await fixture()
  const gate = Promise.withResolvers<Session | null>()
  try {
    try {
      await f.execute('fileWorkspace.addToComposer', { ...f.target, sourceTabInstanceKey: crypto.randomUUID() })
      throw new Error('expected source instance rejection')
    } catch (error) {
      expect(error).toMatchObject({ code: 'TAB_NOT_FOUND' })
    }
    f.hold(gate.promise)
    const pending = f.execute('fileWorkspace.addToComposer', f.target)
    await Bun.sleep(0)
    await f.execute('workspaceTabs.select', { id: 'b' })
    gate.resolve(session('a'))
    try {
      await pending
      throw new Error('expected active workbench change')
    } catch (error) {
      expect(error).toMatchObject({ code: 'TARGET_CHANGED' })
    }
    expect(f.runtime.view.state.drafts.getSnapshot().a).toEqual(f.initialDrafts.a)
  } finally {
    gate.resolve(session('a'))
    f.runtime.dispose()
  }
})
