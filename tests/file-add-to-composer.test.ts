import { createHash } from 'node:crypto'
import { expect, test } from 'bun:test'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import type { Session, Workspace } from '@hbar/contracts/directory'
import { serializeMentions } from '../packages/app-runtime/src/composer-mentions'

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
    surfaces: { canRender: (id) => id === 'files' },
    files: {
      execute(name, raw) {
        const input = raw as { workspaceId: string; path: string }
        if (name === 'file.list')
          return Promise.resolve({ items: [{ name: 'spec doc.md', path: 'src/spec doc.md', directory: false }] })
        if (name === 'file.read') {
          const text = 'disk content'
          return Promise.resolve({
            workspaceId: input.workspaceId,
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
  })
  await runtime.ready
  const execute = runtime.view.commands.execute
  await execute('app.setSession', { sessionId: 'a', workspaceId: 'w' })
  await execute('app.setSession', { sessionId: 'b', workspaceId: 'w' })
  await execute('app.openPanel', {
    panelId: 'files',
    instanceId: 'files-a',
    workspaceId: 'w',
    sessionId: 'a',
    binding: 'pinned',
  })
  await execute('fileWorkspace.refresh', { instanceId: 'files-a' })
  await execute('fileWorkspace.openEntry', {
    instanceId: 'files-a',
    workspaceId: 'w',
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
  const target = {
    instanceId: 'files-a',
    workspaceId: 'w',
    path: 'src/spec doc.md',
    sourceSessionId: 'a',
    sourceTabInstanceKey: source.instanceKey,
    workbenchTabId: workbench.id,
    workbenchTabInstanceKey: workbench.instanceKey,
    expectedRevision: 0,
  }
  return {
    runtime,
    execute,
    target,
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
    expect(f.runtime.view.state.drafts.getSnapshot().b).toBeUndefined()
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
    expect(archived.runtime.view.state.drafts.getSnapshot().a).toBeUndefined()
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
      instanceId: 'files-a',
      workspaceId: 'w',
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
    expect(f.runtime.view.state.drafts.getSnapshot().a).toBeUndefined()
  } finally {
    gate.resolve(session('a'))
    f.runtime.dispose()
  }
})

test('an unsaved file edit blocks a disk-path reference and preserves the edit', async () => {
  const f = await fixture()
  try {
    await f.execute('fileWorkspace.setText', { instanceId: 'files-a', text: 'uncommitted' })
    try {
      await f.execute('fileWorkspace.addToComposer', f.target)
      throw new Error('expected unsaved file rejection')
    } catch (error) {
      expect(error).toMatchObject({ code: 'FILE_DRAFT_PENDING' })
    }
    expect(f.runtime.view.state.files.getSnapshot().entries['files-a']?.document?.draft).toBe('uncommitted')
    expect(f.runtime.view.state.drafts.getSnapshot().a).toBeUndefined()
  } finally {
    f.runtime.dispose()
  }
})

test('an unknown file save cannot be represented as the saved on-disk path', async () => {
  const f = await fixture()
  try {
    await f.execute('fileWorkspace.setText', { instanceId: 'files-a', text: 'possibly saved' })
    f.loseFileWrite()
    try {
      await f.execute('fileWorkspace.save', { instanceId: 'files-a' })
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
    expect(f.runtime.view.state.drafts.getSnapshot().a).toBeUndefined()
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
    expect(f.runtime.view.state.drafts.getSnapshot().a).toBeUndefined()
  } finally {
    gate.resolve(session('a'))
    f.runtime.dispose()
  }
})
