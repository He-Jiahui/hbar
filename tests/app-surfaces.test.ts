import { expect, test } from 'bun:test'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import type { Session, Workspace } from '@hbar/contracts/directory'

const workspace: Workspace = { id: 'w1', name: 'one', path: 'D:/one', createdAt: 1 }
const sessions: Session[] = [
  { id: 's1', workspaceId: 'w1', title: 'one', archived: false, parentId: null, createdAt: 1, updatedAt: 1, seq: 1 },
  { id: 's2', workspaceId: 'w1', title: 'two', archived: false, parentId: null, createdAt: 1, updatedAt: 1, seq: 1 },
]
const directory: CommandExecutor = {
  execute(name, raw) {
    const input = raw as Record<string, unknown>
    if (name === 'workspace.get') return Promise.resolve(input.workspaceId === workspace.id ? workspace : null)
    if (name === 'session.get') return Promise.resolve(sessions.find((item) => item.id === input.sessionId) ?? null)
    if (name === 'session.list')
      return Promise.resolve({
        items: sessions.filter(
          (item) => item.workspaceId === input.workspaceId && (!input.title || item.title === input.title),
        ),
        nextCursor: null,
      })
    if (name === 'workspace.list') return Promise.resolve({ items: [workspace], nextCursor: null })
    return Promise.reject(new Error(`Unexpected query: ${name}`))
  },
}

test('logical panels are command-owned, idempotent and preserve follow versus pinned targets', async () => {
  const headless = createAppRuntime({ instanceId: 'headless', hostId: 'host', directory })
  await expect(headless.view.commands.execute('app.openPanel', { panelId: 'files' })).rejects.toMatchObject({
    code: 'CAPABILITY_UNAVAILABLE',
  })
  headless.dispose()

  const runtime = createAppRuntime({
    instanceId: 'gui',
    hostId: 'host',
    directory,
    surfaces: { canRender: (panelId) => ['files', 'status'].includes(panelId) },
  })
  await runtime.view.commands.execute('app.setSession', { sessionId: 's1' })
  const first = await runtime.view.commands.execute('app.openPanel', { panelId: 'files' })
  expect(first).toMatchObject({ instanceId: 'files', sessionId: 's1', binding: 'followActive' })
  expect(await runtime.view.commands.execute('app.openPanel', { panelId: 'files' })).toEqual(first)
  const pinned = await runtime.view.commands.execute('app.openPanel', {
    panelId: 'files',
    instanceId: 'pinned-files',
    sessionId: 's1',
    binding: 'pinned',
  })
  await runtime.view.commands.execute('app.setSession', { sessionId: 's2' })
  expect(runtime.view.state.surfaces.getSnapshot().panels[first.instanceId]?.sessionId).toBe('s2')
  expect(runtime.view.state.surfaces.getSnapshot().panels[pinned.instanceId]?.sessionId).toBe('s1')
  expect(Reflect.set(runtime.view.state.surfaces.getSnapshot().panels[first.instanceId]!, 'panelId', 'corrupt')).toBe(
    false,
  )
  expect(await runtime.view.commands.execute('app.closePanel', { instanceId: first.instanceId })).toEqual({
    instanceId: first.instanceId,
    closed: true,
  })
  expect(await runtime.view.commands.execute('app.closePanel', { instanceId: first.instanceId })).toEqual({
    instanceId: first.instanceId,
    closed: false,
  })
  runtime.dispose()
})

test('window commands publish state only after the platform succeeds and close exact IDs', async () => {
  const opened: string[] = []
  const closed: string[] = []
  const runtime = createAppRuntime({
    instanceId: 'gui',
    hostId: 'host',
    directory,
    platform: {
      async openWindow(window) {
        if (window.windowId === 'failed') throw new CommandError('CAPABILITY_UNAVAILABLE', 'blocked')
        opened.push(window.windowId)
      },
      async closeWindow(windowId) {
        closed.push(windowId)
      },
    },
  })
  await expect(
    runtime.view.commands.execute('app.openWindow', { windowId: 'failed', page: { kind: 'status', params: {} } }),
  ).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' })
  expect(runtime.view.state.surfaces.getSnapshot().windows).toEqual({})
  await runtime.view.commands.execute('app.openWindow', { windowId: 'status-1', page: { kind: 'status', params: {} } })
  await runtime.view.commands.execute('app.openWindow', { windowId: 'status-1', page: { kind: 'status', params: {} } })
  expect(opened).toEqual(['status-1', 'status-1'])
  expect(Object.keys(runtime.view.state.surfaces.getSnapshot().windows)).toEqual(['status-1'])
  expect(await runtime.view.commands.execute('app.closeWindow', { windowId: 'status-1' })).toEqual({
    windowId: 'status-1',
    closed: true,
  })
  expect(await runtime.view.commands.execute('app.closeWindow', { windowId: 'status-1' })).toEqual({
    windowId: 'status-1',
    closed: false,
  })
  expect(closed).toEqual(['status-1'])
  runtime.dispose()
})
