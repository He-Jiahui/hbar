import { expect, test } from 'bun:test'
import { createAppRuntime, type SessionTimelinePort } from '@hbar/app-runtime'
import type { Message, SessionSnapshot } from '@hbar/contracts'
import { directoryCommands } from '@hbar/contracts/commands'
import type { CommandExecutor } from '@hbar/commands'

const session = {
  id: 'history-session',
  workspaceId: 'workspace-1',
  title: 'History',
  archived: false,
  parentId: null,
  createdAt: 1,
  updatedAt: 6,
  seq: 6,
} as const
const otherSession = { ...session, id: 'other-session', title: 'Other', seq: 1, updatedAt: 1 } as const

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function message(sessionId: string, id: string, seq: number): Message {
  return {
    id,
    sessionId,
    runId: `run-${seq}`,
    role: 'user',
    content: [{ type: 'text', text: id }],
    seq,
    createdAt: seq,
  }
}

function snapshot(messages: readonly Message[], hasOlder: boolean): SessionSnapshot {
  const cursor = messages.at(-1)?.seq ?? 0
  const sessionId = messages[0]?.sessionId ?? session.id
  const selected = sessionId === otherSession.id ? otherSession : session
  return {
    session: { ...selected, seq: cursor, updatedAt: cursor },
    messages: [...messages],
    runs: [],
    approvals: [],
    userInputs: [],
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    cursor,
    hasOlder,
    streams: [],
  }
}

function directory(): CommandExecutor {
  return {
    async execute(name, input) {
      if (name === 'workspace.list') {
        directoryCommands['workspace.list'].input.parse(input)
        return {
          items: [{ id: session.workspaceId, path: 'D:/workspace', name: 'Workspace', createdAt: 1 }],
          nextCursor: null,
        }
      }
      if (name === 'workspace.get') {
        directoryCommands['workspace.get'].input.parse(input)
        return { id: session.workspaceId, path: 'D:/workspace', name: 'Workspace', createdAt: 1 }
      }
      if (name === 'session.list') {
        const parsed = directoryCommands['session.list'].input.parse(input)
        const workspaceId = 'workspaceId' in parsed ? parsed.workspaceId : session.workspaceId
        return { items: [session, otherSession].filter((item) => item.workspaceId === workspaceId), nextCursor: null }
      }
      if (name === 'session.get') {
        const parsed = directoryCommands['session.get'].input.parse(input)
        return parsed.sessionId === otherSession.id ? otherSession : session
      }
      throw new Error(`Unsupported directory query: ${name} ${JSON.stringify(input)}`)
    },
  }
}

async function waitForReady(runtime: ReturnType<typeof createAppRuntime>) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (runtime.view.state.timeline.getSnapshot().status === 'ready') return
    await Bun.sleep(1)
  }
  throw new Error('timeline did not become ready')
}

test('ignores an older history page after the Host connection is replaced', async () => {
  const pending = deferred<SessionSnapshot>()
  const oldTimeline: SessionTimelinePort = {
    async snapshot(_sessionId, before) {
      if (before !== undefined) return pending.promise
      return snapshot([message(session.id, 'old-message-5', 5), message(session.id, 'old-message-6', 6)], true)
    },
    async watch() {
      return () => undefined
    },
  }
  const oldRuntime = createAppRuntime({
    instanceId: 'history-old-connection',
    hostId: 'old-host',
    directory: directory(),
    timeline: oldTimeline,
  })
  await oldRuntime.view.commands.execute('app.setSession', { sessionId: session.id })
  await waitForReady(oldRuntime)
  const staleRequest = oldRuntime.view.commands.execute('timeline.loadOlder', { sessionId: session.id })
  oldRuntime.dispose()

  const newTimeline: SessionTimelinePort = {
    async snapshot(_sessionId, before) {
      if (before !== undefined) throw new Error('new Host must not load the old connection page')
      return snapshot([message(session.id, 'fresh-message', 7)], false)
    },
    async watch() {
      return () => undefined
    },
  }
  const newRuntime = createAppRuntime({
    instanceId: 'history-new-connection',
    hostId: 'new-host',
    directory: directory(),
    timeline: newTimeline,
  })
  try {
    await newRuntime.view.commands.execute('app.setSession', { sessionId: session.id })
    await waitForReady(newRuntime)
    expect(newRuntime.view.state.timeline.getSnapshot().messages.map((item) => item.id)).toEqual(['fresh-message'])

    pending.resolve(
      snapshot([message(session.id, 'stale-message-1', 1), message(session.id, 'stale-message-2', 2)], false),
    )
    await expect(staleRequest).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(newRuntime.view.state.timeline.getSnapshot()).toMatchObject({ sessionId: session.id, cursor: 7 })
    expect(newRuntime.view.state.timeline.getSnapshot().messages.map((item) => item.id)).toEqual(['fresh-message'])
  } finally {
    newRuntime.dispose()
  }
})

test('rejects concurrent older history requests through the public timeline command', async () => {
  const pending = deferred<SessionSnapshot>()
  let calls = 0
  const timeline: SessionTimelinePort = {
    async snapshot(_sessionId, before) {
      if (before === undefined)
        return snapshot([message(session.id, 'message-5', 5), message(session.id, 'message-6', 6)], true)
      calls += 1
      return pending.promise
    },
    async watch() {
      return () => undefined
    },
  }
  const runtime = createAppRuntime({ instanceId: 'history-dedupe', hostId: 'host', directory: directory(), timeline })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    await waitForReady(runtime)
    const first = runtime.view.commands.execute('timeline.loadOlder', { sessionId: session.id })
    await expect(runtime.view.commands.execute('timeline.loadOlder', { sessionId: session.id })).rejects.toMatchObject({
      code: 'BUSY',
    })
    expect(calls).toBe(1)
    pending.resolve(snapshot([message(session.id, 'message-1', 1), message(session.id, 'message-2', 2)], false))
    await first
    expect(runtime.view.state.timeline.getSnapshot().messages.map((item) => item.id)).toEqual([
      'message-1',
      'message-2',
      'message-5',
      'message-6',
    ])
  } finally {
    runtime.dispose()
  }
})
