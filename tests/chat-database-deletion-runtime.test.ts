import { afterEach, expect, test } from 'bun:test'
import { createAppRuntime, type SessionTimelinePort, type SessionTimelineUpdate } from '@hbar/app-runtime'
import { directoryCommands } from '@hbar/contracts/commands'
import type { ChatDatabaseDeletedEvent } from '@hbar/contracts/commands/chat-database'
import type { SessionSnapshot } from '@hbar/contracts'
import type { CommandExecutor } from '@hbar/commands'

const disposers: Array<() => void> = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})
const workspace = { id: 'workspace', path: 'D:/fixture', name: 'Workspace', createdAt: 1 }
const one = {
  id: 'one',
  workspaceId: workspace.id,
  title: 'One',
  archived: false,
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  seq: 1,
}
const two = { ...one, id: 'two', title: 'Two' }
const wait = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (condition()) return
    await new Promise<void>((resolve) => setTimeout(resolve, 1))
  }
  throw new Error('Deletion projection did not settle')
}
function fixture(hook?: (id: string, input: unknown) => Promise<unknown>) {
  const sessions = new Map([
    [one.id, one],
    [two.id, two],
  ])
  const notifications = new Set<(event: ChatDatabaseDeletedEvent) => void>()
  const connections = new Set<(value: boolean) => void>()
  const watches = new Map<string, (value: SessionTimelineUpdate) => void>()
  const directory: CommandExecutor = {
    async execute(id, input) {
      const handled = await hook?.(id, input)
      if (handled !== undefined) return handled
      if (id === 'workspace.get') return workspace
      if (id === 'workspace.list') return { items: [workspace], nextCursor: null }
      if (id === 'session.get')
        return sessions.get(directoryCommands['session.get'].input.parse(input).sessionId) ?? null
      if (id === 'session.list') return { items: [...sessions.values()], nextCursor: null }
      throw new Error(`Unexpected directory test read ${id}`)
    },
  }
  const timeline: SessionTimelinePort = {
    async snapshot(id): Promise<SessionSnapshot> {
      const session = sessions.get(id)
      if (!session) throw new Error('Session missing')
      return {
        session,
        messages: [
          {
            id: `message-${id}`,
            sessionId: id,
            runId: 'run',
            role: 'user',
            content: [{ type: 'text', text: `history-${id}` }],
            createdAt: 1,
            seq: 1,
          },
        ],
        runs: [],
        approvals: [],
        userInputs: [],
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: 0 },
        cursor: 1,
        hasOlder: false,
        streams: [],
      }
    },
    async watch(id, _cursor, listener) {
      watches.set(id, listener)
      return () => {
        watches.delete(id)
      }
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'delete-runtime',
    hostId: 'host',
    directory,
    timeline,
    chatDatabaseEvents: {
      subscribe(listener) {
        notifications.add(listener)
        return () => {
          notifications.delete(listener)
        }
      },
      onConnection(listener) {
        connections.add(listener)
        return () => {
          connections.delete(listener)
        }
      },
    },
  })
  disposers.push(runtime.dispose)
  const emit = (ids: string[]) => {
    for (const id of ids) sessions.delete(id)
    for (const listener of notifications) listener({ schemaVersion: 1, sessionIds: ids, revision: 2 })
  }
  const connected = (value: boolean) => {
    for (const listener of connections) listener(value)
  }
  return { runtime, sessions, watches, notifications, connections, emit, connected }
}

test('deletion clears only the target timeline and facts, preserving authored draft, tabs and other surface focus', async () => {
  const f = fixture()
  await f.runtime.view.commands.execute('app.setSession', { workspaceId: workspace.id, sessionId: 'two' })
  await f.runtime.view.commands.execute('app.setSession', { workspaceId: workspace.id, sessionId: 'one' })
  await wait(() => f.runtime.view.state.timeline.getSnapshot().status === 'ready')
  await f.runtime.view.commands.execute('draft.setText', { sessionId: 'one', text: 'unsent original draft' })
  const surfaces = f.runtime.view.state.surfaces.getSnapshot()
  const tabs = f.runtime.view.state.workspaceTabs.getSnapshot().items
  f.emit(['one'])
  expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBe('one')
  expect(f.runtime.view.state.timeline.getSnapshot()).toMatchObject({ messages: [], error: 'SESSION_DELETED' })
  expect(f.runtime.view.state.directory.getSnapshot().sessions.one).toBeUndefined()
  expect(f.runtime.view.state.drafts.getSnapshot().one?.text).toBe('unsent original draft')
  expect(f.runtime.view.state.surfaces.getSnapshot()).toBe(surfaces)
  expect(f.runtime.view.state.workspaceTabs.getSnapshot().items).toEqual(tabs)
  expect(f.watches.has('one')).toBe(false)
  await f.runtime.view.commands.execute('workspaceTabs.select', { id: 'two' })
  await wait(
    () =>
      f.runtime.view.state.timeline.getSnapshot().sessionId === 'two' &&
      f.runtime.view.state.timeline.getSnapshot().status === 'ready',
  )
  expect(f.runtime.view.state.timeline.getSnapshot().messages[0]?.sessionId).toBe('two')
  await f.runtime.view.commands.execute('workspaceTabs.select', { id: 'one' })
  expect(f.runtime.view.state.sessionExecutionAccess.getSnapshot()).toMatchObject({
    kind: 'unverified',
    reason: 'deleted',
  })
  expect(f.runtime.view.state.timeline.getSnapshot().error).toBe('SESSION_DELETED')
})

test('a late session read cannot resurrect a deleted fact or redirect another selected conversation', async () => {
  let finish: ((value: unknown) => void) | undefined
  let delayed = false
  const f = fixture(async (id, input) => {
    if (delayed && id === 'session.get' && directoryCommands['session.get'].input.parse(input).sessionId === 'one')
      return new Promise<unknown>((resolve) => {
        finish = resolve
      })
    return undefined
  })
  await f.runtime.view.commands.execute('app.setSession', { workspaceId: workspace.id, sessionId: 'two' })
  delayed = true
  const original = f.runtime.view.commands.execute('session.get', { sessionId: 'one' })
  await wait(() => finish !== undefined)
  f.emit(['one'])
  finish?.(one)
  await expect(original).rejects.toMatchObject({ code: 'QUERY_SUPERSEDED' })
  expect(f.runtime.view.state.directory.getSnapshot().sessions.one).toBeUndefined()
  expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBe('two')
})

test('a concurrent point read for another conversation survives an unrelated deletion', async () => {
  let finish: ((value: unknown) => void) | undefined
  let delayed = false
  const f = fixture(async (id, input) => {
    if (delayed && id === 'session.get' && directoryCommands['session.get'].input.parse(input).sessionId === 'two')
      return new Promise<unknown>((resolve) => {
        finish = resolve
      })
    return undefined
  })
  await f.runtime.view.commands.execute('app.setSession', { workspaceId: workspace.id, sessionId: 'one' })
  delayed = true
  const original = f.runtime.view.commands.execute('session.get', { sessionId: 'two' })
  await wait(() => finish !== undefined)
  f.emit(['one'])
  finish?.(two)
  expect(await original).toEqual(two)
  expect(f.runtime.view.state.directory.getSnapshot().sessions.two).toEqual(two)
  expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBe('one')
})

test('failed reconnect observations do not fabricate deletion or clear an existing timeline', async () => {
  let failed = false
  const f = fixture(async (id) => {
    if (failed && id === 'session.get') throw new Error('Disconnected during observation')
    return undefined
  })
  await f.runtime.view.commands.execute('app.setSession', { workspaceId: workspace.id, sessionId: 'one' })
  await wait(() => f.runtime.view.state.timeline.getSnapshot().status === 'ready')
  failed = true
  f.connected(true)
  await new Promise<void>((resolve) => setTimeout(resolve, 10))
  expect(f.runtime.view.state.directory.getSnapshot().deletedSessions?.one).toBeUndefined()
  expect(f.runtime.view.state.timeline.getSnapshot().messages[0]?.sessionId).toBe('one')
})

test('reconnect verifies open targets and recovers missed deletion without clearing its retained draft', async () => {
  const f = fixture()
  await f.runtime.view.commands.execute('app.setSession', { workspaceId: workspace.id, sessionId: 'one' })
  await f.runtime.view.commands.execute('draft.setText', { sessionId: 'one', text: 'offline draft' })
  f.connected(false)
  f.sessions.delete('one')
  f.connected(true)
  await wait(() => Boolean(f.runtime.view.state.directory.getSnapshot().deletedSessions?.one))
  expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBe('one')
  expect(f.runtime.view.state.timeline.getSnapshot().error).toBe('SESSION_DELETED')
  expect(f.runtime.view.state.drafts.getSnapshot().one?.text).toBe('offline draft')
  f.runtime.dispose()
  expect(f.notifications.size).toBe(0)
  expect(f.connections.size).toBe(0)
})
