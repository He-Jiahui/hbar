import { expect, test } from 'bun:test'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import { createAppRuntime, type ClientPersistencePort } from '@hbar/app-runtime'
import type { Session, Workspace } from '@hbar/contracts/directory'

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
function fixture(directoryOverride?: (name: string, input: unknown) => Promise<unknown>) {
  const sessions = new Map<string, Session>()
  const values = new Map<string, unknown>()
  const persistence: ClientPersistencePort = {
    read: (key) => Promise.resolve(values.get(key) ?? null),
    write: (key, value) => {
      values.set(key, value)
      return Promise.resolve()
    },
    remove: (key) => {
      values.delete(key)
      return Promise.resolve()
    },
  }
  const directory: CommandExecutor = {
    execute(name, input) {
      if (directoryOverride) return directoryOverride(name, input)
      const target = input as { sessionId?: string; workspaceId?: string }
      if (name === 'session.get') return Promise.resolve(sessions.get(target.sessionId ?? '') ?? null)
      if (name === 'workspace.get') return Promise.resolve(target.workspaceId === 'w' ? workspace : null)
      if (name === 'session.list') return Promise.resolve({ items: [], nextCursor: null })
      throw new Error(`Unexpected directory query: ${name}`)
    },
  }
  const create = () =>
    createAppRuntime({
      instanceId: crypto.randomUUID(),
      hostId: 'workbench-host',
      directory,
      persistence,
      surfaces: { canRender: (id) => id === 'files' },
    })
  return { sessions, values, directory, persistence, create }
}
async function openSession(runtime: ReturnType<ReturnType<typeof fixture>['create']>, id: string) {
  await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: id })
}
async function pinnedFiles(
  runtime: ReturnType<ReturnType<typeof fixture>['create']>,
  instanceId: string,
  source: string | null,
) {
  await runtime.view.commands.execute('app.openPanel', {
    panelId: 'files',
    instanceId,
    workspaceId: 'w',
    binding: 'pinned',
    ...(source ? { sessionId: source } : {}),
  })
}

test('expand uses one pinned Files instance, Back validates source, and detached selection persists only its source Session', async () => {
  const f = fixture()
  f.sessions.set('a', session('a'))
  f.sessions.set('b', session('b'))
  const runtime = f.create()
  await runtime.ready
  await openSession(runtime, 'a')
  await openSession(runtime, 'b')
  await pinnedFiles(runtime, 'files-a', 'a')
  const first = await runtime.view.commands.execute('workspaceTabs.openWorkbench', {
    panelInstanceId: 'files-a',
    sourceSessionId: 'a',
    workspaceId: 'w',
  })
  const same = await runtime.view.commands.execute('workspaceTabs.openWorkbench', {
    panelInstanceId: 'files-a',
    sourceSessionId: 'a',
    workspaceId: 'w',
  })
  expect(first).toEqual(same)
  const item = runtime.view.state.workspaceTabs.getSnapshot().items.find((entry) => entry.id === first.id)
  expect(item).toMatchObject({ kind: 'workbench', panelInstanceId: 'files-a', sourceSessionId: 'a', workspaceId: 'w' })
  expect(runtime.view.state.workspaceTabs.getSnapshot().activeId).toBe(first.id)
  expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe('b')
  expect(await runtime.view.commands.execute('workspaceTabs.capture', { ids: [first.id] })).toEqual([
    { id: first.id, instanceKey: item!.instanceKey, sessionId: null },
  ])
  await runtime.workspaceTabs.whenIdle()
  const persisted = f.values.get('hbar:workbench-host:preferences') as {
    value: { workspaceTabs: { items: unknown[]; activeId: string } }
  }
  expect(persisted.value.workspaceTabs.items).toHaveLength(2)
  expect(persisted.value.workspaceTabs.activeId).toBe('a')
  const result = await runtime.view.commands.execute('workspaceTabs.returnToSource', {
    id: first.id,
    instanceKey: item!.instanceKey,
  })
  expect(result.activeId).toBe('a')
  expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe('a')
  expect(runtime.view.state.workspaceTabs.getSnapshot().items.map((entry) => entry.kind)).toEqual([
    'session',
    'session',
  ])
  expect(runtime.view.state.surfaces.getSnapshot().panels['files-a']?.binding).toBe('pinned')
  runtime.dispose()
  const restored = f.create()
  await restored.ready
  expect(restored.view.state.workspaceTabs.getSnapshot().items.map((entry) => entry.kind)).toEqual([
    'session',
    'session',
  ])
  expect(restored.view.state.workspaceTabs.getSnapshot().activeId).toBe('a')
  restored.dispose()
})

test('workspace-scoped Files workbench has null run target and Back returns to its original empty workspace', async () => {
  const f = fixture()
  const runtime = f.create()
  await runtime.ready
  await runtime.view.commands.execute('app.setWorkspace', { workspaceId: 'w' })
  await pinnedFiles(runtime, 'files-workspace', null)
  const opened = await runtime.view.commands.execute('workspaceTabs.openWorkbench', {
    panelInstanceId: 'files-workspace',
    sourceSessionId: null,
    workspaceId: 'w',
  })
  const [target] = await runtime.view.commands.execute('workspaceTabs.capture', { ids: [opened.id] })
  expect(target?.sessionId).toBeNull()
  expect(runtime.view.state.workspaceTabs.getSnapshot().activeId).toBe(opened.id)
  await runtime.workspaceTabs.whenIdle()
  const persisted = f.values.get('hbar:workbench-host:preferences') as {
    value: { workspaceTabs: { activeId: string | null; activeWorkspaceId: string; items: unknown[] } }
  }
  expect(persisted.value.workspaceTabs).toMatchObject({ activeId: null, activeWorkspaceId: 'w', items: [] })
  const reload = f.create()
  await reload.ready
  expect(reload.view.state.navigation.getSnapshot()).toMatchObject({ workspaceId: 'w', sessionId: null })
  expect(reload.view.state.workspaceTabs.getSnapshot().items).toEqual([])
  reload.dispose()
  expect(
    await runtime.view.commands.execute('workspaceTabs.returnToSource', {
      id: opened.id,
      instanceKey: target!.instanceKey,
    }),
  ).toEqual({ activeId: null })
  expect(runtime.view.state.navigation.getSnapshot()).toMatchObject({ workspaceId: 'w', sessionId: null })
  expect(runtime.view.state.workspaceTabs.getSnapshot().items).toEqual([])
  runtime.dispose()
})

test('a missing or disconnected saved detached Workspace is never activated without Host verification', async () => {
  for (const result of ['missing', 'offline', 'malformed'] as const) {
    let unavailable = result === 'offline'
    const f = fixture((name, input) => {
      if (name === 'workspace.get') {
        if (unavailable) return Promise.reject(new CommandError('CONNECTION_CLOSED', 'Disconnected'))
        return Promise.resolve(
          result === 'missing' ? null : result === 'malformed' ? { ...workspace, id: 'wrong' } : workspace,
        )
      }
      throw new Error(`Unexpected query: ${name} ${JSON.stringify(input)}`)
    })
    f.values.set('hbar:workbench-host:preferences', {
      version: 1,
      revision: 1,
      value: { workspaceTabs: { version: 1, activeId: null, activeWorkspaceId: 'w', items: [] } },
    })
    const runtime = f.create()
    await runtime.ready
    expect(runtime.view.state.navigation.getSnapshot().workspaceId).toBeNull()
    if (result === 'offline') {
      expect(runtime.view.state.workspaceTabs.getSnapshot()).toMatchObject({
        restoreStatus: 'error',
        restoreError: 'CONNECTION_CLOSED',
      })
      unavailable = false
      expect(await runtime.view.commands.execute('workspaceTabs.retryRestore', {})).toEqual({
        status: 'ready',
        error: null,
      })
      expect(runtime.view.state.navigation.getSnapshot()).toMatchObject({ workspaceId: 'w', sessionId: null })
    } else if (result === 'malformed') {
      expect(runtime.view.state.workspaceTabs.getSnapshot()).toMatchObject({
        restoreStatus: 'error',
        restoreError: 'INVALID_OUTPUT',
      })
    } else {
      expect(runtime.view.state.workspaceTabs.getSnapshot().restoreStatus).toBe('ready')
      await runtime.workspaceTabs.whenIdle()
      const saved = f.values.get('hbar:workbench-host:preferences') as {
        value: { workspaceTabs: Record<string, unknown> }
      }
      expect(saved.value.workspaceTabs.activeWorkspaceId).toBeUndefined()
    }
    runtime.dispose()
  }
})

test('a delayed detached-Workspace validation never replaces a newer Session navigation', async () => {
  const f = fixture()
  f.sessions.set('a', session('a'))
  f.values.set('hbar:workbench-host:preferences', {
    version: 1,
    revision: 1,
    value: { workspaceTabs: { version: 1, activeId: null, activeWorkspaceId: 'w', items: [] } },
  })
  const pending = Promise.withResolvers<unknown>()
  const intercepted = Promise.withResolvers<void>()
  let workspaceReads = 0
  const directory: CommandExecutor = {
    execute(name, input, execution) {
      if (name === 'workspace.get' && ++workspaceReads === 1) {
        intercepted.resolve()
        return pending.promise
      }
      return f.directory.execute(name, input, execution)
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'late-workspace',
    hostId: 'workbench-host',
    directory,
    persistence: f.persistence,
  })
  await intercepted.promise
  await openSession(runtime, 'a')
  pending.resolve(workspace)
  await runtime.ready
  expect(runtime.view.state.navigation.getSnapshot()).toMatchObject({ workspaceId: 'w', sessionId: 'a' })
  expect(runtime.view.state.workspaceTabs.getSnapshot().items.map((item) => item.id)).toEqual(['a'])
  runtime.dispose()
})

test('X selects a valid neighbour while stale instance captures cannot close a reopened Workbench', async () => {
  const f = fixture()
  for (const id of ['a', 'b', 'c']) f.sessions.set(id, session(id))
  const runtime = f.create()
  await runtime.ready
  for (const id of ['a', 'b', 'c']) await openSession(runtime, id)
  await pinnedFiles(runtime, 'files-b', 'b')
  const { id } = await runtime.view.commands.execute('workspaceTabs.openWorkbench', {
    panelInstanceId: 'files-b',
    sourceSessionId: 'b',
    workspaceId: 'w',
  })
  await runtime.view.commands.execute('workspaceTabs.move', { id, beforeId: 'c' })
  const old = runtime.workspaceTabs.capture([id])
  await runtime.workspaceTabs.closeCaptured(old, new AbortController().signal)
  expect(runtime.view.state.workspaceTabs.getSnapshot().activeId).toBe('c')
  const { id: reopened } = await runtime.view.commands.execute('workspaceTabs.openWorkbench', {
    panelInstanceId: 'files-b',
    sourceSessionId: 'b',
    workspaceId: 'w',
  })
  expect(reopened).not.toBe(id)
  await runtime.workspaceTabs.closeCaptured(old, new AbortController().signal)
  expect(runtime.view.state.workspaceTabs.getSnapshot().activeId).toBe(reopened)
  runtime.dispose()
})

test('Workbench shares the 32-tab capacity with Sessions, without an eviction or Host creation write', async () => {
  const f = fixture()
  for (let i = 0; i < 31; i++) f.sessions.set(`s-${i}`, session(`s-${i}`))
  const runtime = f.create()
  await runtime.ready
  for (let i = 0; i < 31; i++) await openSession(runtime, `s-${i}`)
  await pinnedFiles(runtime, 'files-cap', 's-0')
  const opened = await runtime.view.commands.execute('workspaceTabs.openWorkbench', {
    panelInstanceId: 'files-cap',
    sourceSessionId: 's-0',
    workspaceId: 'w',
  })
  expect(runtime.view.state.workspaceTabs.getSnapshot().items).toHaveLength(32)
  expect(
    (
      await runtime.view.commands.execute('workspaceTabs.openWorkbench', {
        panelInstanceId: 'files-cap',
        sourceSessionId: 's-0',
        workspaceId: 'w',
      })
    ).id,
  ).toBe(opened.id)
  await pinnedFiles(runtime, 'files-other', 's-1')
  await expect(
    runtime.view.commands.execute('workspaceTabs.openWorkbench', {
      panelInstanceId: 'files-other',
      sourceSessionId: 's-1',
      workspaceId: 'w',
    }),
  ).rejects.toMatchObject({ code: 'TAB_LIMIT' })
  expect(runtime.view.state.workspaceTabs.getSnapshot().items).toHaveLength(32)
  runtime.dispose()
})

test('Back skips an archived or closed source, but a connection failure retains the Workbench for retry', async () => {
  const f = fixture()
  f.sessions.set('a', session('a'))
  f.sessions.set('b', session('b'))
  const runtime = f.create()
  await runtime.ready
  await openSession(runtime, 'a')
  await openSession(runtime, 'b')
  await pinnedFiles(runtime, 'files-b', 'b')
  const { id } = await runtime.view.commands.execute('workspaceTabs.openWorkbench', {
    panelInstanceId: 'files-b',
    sourceSessionId: 'b',
    workspaceId: 'w',
  })
  const [target] = runtime.workspaceTabs.capture([id])
  f.sessions.set('b', session('b', true))
  expect(
    await runtime.view.commands.execute('workspaceTabs.returnToSource', {
      id,
      instanceKey: target!.instanceKey,
    }),
  ).toEqual({ activeId: 'a' })
  expect(runtime.view.state.workspaceTabs.getSnapshot().items.map((entry) => entry.id)).toEqual(['a', 'b'])
  runtime.dispose()

  let disconnected = false
  const other = fixture((name, input) => {
    const target = input as { sessionId?: string; workspaceId?: string }
    if (name === 'session.get' && disconnected) return Promise.reject(new CommandError('CONNECTION_CLOSED', 'Offline'))
    if (name === 'session.get') return Promise.resolve(session(target.sessionId!))
    if (name === 'workspace.get') return Promise.resolve(workspace)
    throw new Error(`Unexpected directory query ${name}`)
  })
  const retry = other.create()
  await retry.ready
  await openSession(retry, 'a')
  await openSession(retry, 'b')
  await pinnedFiles(retry, 'files-retry', 'b')
  const opened = await retry.view.commands.execute('workspaceTabs.openWorkbench', {
    panelInstanceId: 'files-retry',
    sourceSessionId: 'b',
    workspaceId: 'w',
  })
  const capture = retry.workspaceTabs.capture([opened.id])
  disconnected = true
  await expect(
    retry.view.commands.execute('workspaceTabs.returnToSource', {
      id: opened.id,
      instanceKey: capture[0]!.instanceKey,
    }),
  ).rejects.toMatchObject({ code: 'CONNECTION_CLOSED' })
  expect(retry.workspaceTabs.capture([opened.id])).toEqual(capture)
  expect(retry.view.state.workspaceTabs.getSnapshot().activeId).toBe(opened.id)
  disconnected = false
  await retry.view.commands.execute('workspaceTabs.returnToSource', {
    id: opened.id,
    instanceKey: capture[0]!.instanceKey,
  })
  expect(retry.view.state.workspaceTabs.getSnapshot().activeId).toBe('b')
  retry.dispose()
})

test('closing the source Session view under a detached Workbench does not resurrect it on Back', async () => {
  const f = fixture()
  f.sessions.set('a', session('a'))
  f.sessions.set('b', session('b'))
  const runtime = f.create()
  await runtime.ready
  await openSession(runtime, 'a')
  await openSession(runtime, 'b')
  await pinnedFiles(runtime, 'files-b', 'b')
  const { id } = await runtime.view.commands.execute('workspaceTabs.openWorkbench', {
    panelInstanceId: 'files-b',
    sourceSessionId: 'b',
    workspaceId: 'w',
  })
  const workbench = runtime.workspaceTabs.capture([id])[0]!
  await runtime.workspaceTabs.closeCaptured(runtime.workspaceTabs.capture(['b']), new AbortController().signal)
  expect(runtime.view.state.workspaceTabs.getSnapshot().activeId).toBe(id)
  expect(runtime.view.state.workspaceTabs.getSnapshot().items.map((item) => item.id)).toEqual(['a', id])
  expect(
    await runtime.view.commands.execute('workspaceTabs.returnToSource', {
      id,
      instanceKey: workbench.instanceKey,
    }),
  ).toEqual({ activeId: 'a' })
  expect(runtime.view.state.workspaceTabs.getSnapshot().items.map((item) => item.id)).toEqual(['a'])
  runtime.dispose()
})

test('a pending Back cannot be closed early or remove its Workbench after newer navigation wins', async () => {
  const f = fixture()
  f.sessions.set('a', session('a'))
  f.sessions.set('b', session('b'))
  const deferred = Promise.withResolvers<unknown>()
  let intercept = false
  const directory: CommandExecutor = {
    execute(name, input, execution) {
      if (intercept && name === 'session.get' && (input as { sessionId: string }).sessionId === 'b')
        return deferred.promise
      return f.directory.execute(name, input, execution)
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'late-back',
    hostId: 'workbench-host',
    directory,
    surfaces: { canRender: (id) => id === 'files' },
  })
  await runtime.ready
  await openSession(runtime, 'a')
  await openSession(runtime, 'b')
  await pinnedFiles(runtime, 'files-b', 'b')
  const { id } = await runtime.view.commands.execute('workspaceTabs.openWorkbench', {
    panelInstanceId: 'files-b',
    sourceSessionId: 'b',
    workspaceId: 'w',
  })
  const capture = runtime.workspaceTabs.capture([id])
  intercept = true
  const back = runtime.view.commands.execute('workspaceTabs.returnToSource', {
    id,
    instanceKey: capture[0]!.instanceKey,
  })
  await expect(runtime.workspaceTabs.closeCaptured(capture, new AbortController().signal)).rejects.toMatchObject({
    code: 'BUSY',
  })
  intercept = false
  await openSession(runtime, 'a')
  deferred.resolve(f.sessions.get('b'))
  await expect(back).rejects.toMatchObject({ code: 'NAVIGATION_SUPERSEDED' })
  expect(runtime.workspaceTabs.capture([id])).toEqual(capture)
  expect(runtime.view.state.workspaceTabs.getSnapshot().activeId).toBe('a')
  runtime.dispose()
})

test('mixed close captures only their original instances and removing the Files surface prunes orphaned Workbenches', async () => {
  const f = fixture()
  f.sessions.set('a', session('a'))
  f.sessions.set('b', session('b'))
  const runtime = f.create()
  await runtime.ready
  await openSession(runtime, 'a')
  await openSession(runtime, 'b')
  await pinnedFiles(runtime, 'files-b', 'b')
  const { id } = await runtime.view.commands.execute('workspaceTabs.openWorkbench', {
    panelInstanceId: 'files-b',
    sourceSessionId: 'b',
    workspaceId: 'w',
  })
  const capture = runtime.workspaceTabs.capture(['a', id])
  expect(capture.map((target) => target.sessionId)).toEqual(['a', null])
  await runtime.workspaceTabs.closeCaptured(capture, new AbortController().signal)
  expect(runtime.view.state.workspaceTabs.getSnapshot().items.map((item) => item.id)).toEqual(['b'])
  expect(runtime.view.state.workspaceTabs.getSnapshot().activeId).toBe('b')
  const again = await runtime.view.commands.execute('workspaceTabs.openWorkbench', {
    panelInstanceId: 'files-b',
    sourceSessionId: 'b',
    workspaceId: 'w',
  })
  await runtime.view.commands.execute('app.closePanel', { instanceId: 'files-b' })
  expect(runtime.view.state.workspaceTabs.getSnapshot().items.some((entry) => entry.id === again.id)).toBe(false)
  expect(runtime.view.state.workspaceTabs.getSnapshot().activeId).toBe('b')
  runtime.dispose()
})

test('a re-bound panel removes its old detached tab and cannot be selected or reopened as the old source', async () => {
  const f = fixture()
  f.sessions.set('a', session('a'))
  f.sessions.set('b', session('b'))
  const runtime = f.create()
  await runtime.ready
  await openSession(runtime, 'a')
  await openSession(runtime, 'b')
  await pinnedFiles(runtime, 'files-shared', 'a')
  const { id } = await runtime.view.commands.execute('workspaceTabs.openWorkbench', {
    panelInstanceId: 'files-shared',
    sourceSessionId: 'a',
    workspaceId: 'w',
  })
  const old = runtime.workspaceTabs.capture([id])
  await pinnedFiles(runtime, 'files-shared', 'b')
  expect(runtime.view.state.workspaceTabs.getSnapshot().items.some((item) => item.id === id)).toBe(false)
  await expect(runtime.view.commands.execute('workspaceTabs.select', { id })).rejects.toMatchObject({
    code: 'TAB_NOT_FOUND',
  })
  await expect(
    runtime.view.commands.execute('workspaceTabs.openWorkbench', {
      panelInstanceId: 'files-shared',
      sourceSessionId: 'a',
      workspaceId: 'w',
    }),
  ).rejects.toMatchObject({ code: 'TARGET_CHANGED' })
  const { id: next } = await runtime.view.commands.execute('workspaceTabs.openWorkbench', {
    panelInstanceId: 'files-shared',
    sourceSessionId: 'b',
    workspaceId: 'w',
  })
  await runtime.workspaceTabs.closeCaptured(old, new AbortController().signal)
  expect(runtime.view.state.workspaceTabs.getSnapshot().activeId).toBe(next)
  runtime.dispose()
})
