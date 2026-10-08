import { expect, test } from 'bun:test'
import { createAppRuntime, type SessionTimelinePort, type SessionTimelineUpdate } from '@hbar/app-runtime'
import { CommandError } from '@hbar/commands'
import type { SessionSnapshot } from '@hbar/contracts'
import { z } from 'zod'

const workspace = { id: 'workspace', path: 'D:/history-fixture', name: 'History fixture', createdAt: 1 }
const session = {
  id: 'session',
  workspaceId: workspace.id,
  title: 'History',
  archived: false,
  parentId: null,
  createdAt: 1,
  updatedAt: 6,
  seq: 6,
}

function snapshot(sequences: readonly number[], hasOlder = true): SessionSnapshot {
  return {
    session,
    messages: sequences.map((seq) => ({
      id: `message-${seq}`,
      sessionId: session.id,
      runId: `run-${seq}`,
      role: 'user',
      content: [{ type: 'text', text: `History ${seq}` }],
      seq,
      createdAt: seq,
    })),
    runs: [],
    approvals: [],
    userInputs: [],
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    cursor: 6,
    hasOlder,
    streams: [],
  }
}

function fixture() {
  const pending = Promise.withResolvers<SessionSnapshot>()
  const calls: { sessionId: string; before: number; limit: number | undefined }[] = []
  let onUpdate: ((update: SessionTimelineUpdate) => void) | undefined
  let closed = 0
  let watches = 0
  const port: SessionTimelinePort = {
    async snapshot(sessionId, before, limit) {
      if (before === undefined) return snapshot([5, 6])
      calls.push({ sessionId, before, limit })
      return pending.promise
    },
    async watch(_sessionId, _cursor, update) {
      onUpdate = update
      watches += 1
      return () => {
        closed += 1
      }
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'history-requests',
    hostId: 'history-host',
    timeline: port,
    directory: {
      async execute(name, input) {
        if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
        if (name === 'workspace.get') return workspace
        if (name === 'session.list') return { items: [session], nextCursor: null }
        if (name === 'session.get') {
          const target = z.object({ sessionId: z.string() }).parse(input)
          return target.sessionId === session.id ? session : null
        }
        throw new Error(`Unexpected directory query: ${name}`)
      },
    },
  })
  const settle = async () => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (runtime.view.state.timeline.getSnapshot().status === 'ready' && onUpdate) return
      await Bun.sleep(1)
    }
    throw new Error('Timeline fixture did not settle')
  }
  return {
    runtime,
    pending,
    calls,
    settle,
    reset() {
      if (!onUpdate) throw new Error('Timeline follow was not installed')
      onUpdate({ kind: 'reset' })
    },
    get closed() {
      return closed
    },
    get watches() {
      return watches
    },
  }
}

test('a follow reset supersedes an older history response without changing the original selected content', async () => {
  const f = fixture()
  try {
    await f.runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    await f.settle()
    const older = f.runtime.view.commands.execute('timeline.loadOlder', { sessionId: session.id })
    expect(f.runtime.view.state.timeline.getSnapshot().olderStatus).toBe('loading')
    f.reset()
    await f.settle()
    expect(f.closed).toBe(1)
    expect(f.watches).toBe(2)
    f.pending.resolve(snapshot([1, 2], false))
    expect(await older).toMatchObject({ loaded: 0 })
    expect(f.runtime.view.state.timeline.getSnapshot().messages.map((message) => message.id)).toEqual([
      'message-5',
      'message-6',
    ])
    expect(f.runtime.view.state.timeline.getSnapshot().hasOlder).toBe(true)
  } finally {
    f.pending.resolve(snapshot([], false))
    f.runtime.dispose()
  }
  expect(f.closed).toBe(2)
})

test('concurrent older history requests keep one cursor in flight and merge its original page once', async () => {
  const f = fixture()
  try {
    await f.runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    await f.settle()
    const first = f.runtime.view.commands.execute('timeline.loadOlder', { sessionId: session.id })
    const second = f.runtime.view.commands.execute('timeline.loadOlder', { sessionId: session.id })
    await expect(second).rejects.toMatchObject(new CommandError('BUSY', 'Older timeline history is already loading'))
    expect(f.calls).toEqual([{ sessionId: session.id, before: 5, limit: 60 }])
    f.pending.resolve(snapshot([1, 2], false))
    expect(await first).toMatchObject({ loaded: 2, hasOlder: false })
    expect(f.runtime.view.state.timeline.getSnapshot().messages.map((message) => message.id)).toEqual([
      'message-1',
      'message-2',
      'message-5',
      'message-6',
    ])
    expect(f.runtime.view.state.timeline.getSnapshot().olderStatus).toBe('idle')
    await expect(
      f.runtime.view.commands.execute('timeline.loadOlder', { sessionId: session.id }),
    ).resolves.toMatchObject({
      loaded: 0,
      hasOlder: false,
    })
    expect(f.calls).toHaveLength(1)
  } finally {
    f.pending.resolve(snapshot([], false))
    f.runtime.dispose()
  }
  expect(f.closed).toBe(1)
})
