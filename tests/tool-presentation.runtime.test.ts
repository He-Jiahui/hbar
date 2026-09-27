import { expect, test } from 'bun:test'
import { createAppRuntime, type SessionTimelineUpdate } from '@hbar/app-runtime'
import type { ContentBlock, SessionSnapshot } from '@hbar/contracts'
import { projectSessionMessages } from '../packages/app-react/src/session-message-model'

const workspace = { id: 'presentation-workspace', path: 'D:/fixture-only', name: 'Fixture', createdAt: 1 }
const session = {
  id: 'presentation-session',
  workspaceId: workspace.id,
  title: 'Fixture',
  archived: false,
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  seq: 0,
}
const call = (callId: string): Extract<ContentBlock, { type: 'tool_call' }> => ({
  type: 'tool_call',
  callId,
  name: 'same_name',
  args: { requestedPath: `目录/${callId}.txt`, other: 42 },
  presentation: { version: 1, kind: 'file-read', pathField: 'requestedPath' },
})
const emptySnapshot = (): SessionSnapshot => ({
  session,
  messages: [],
  runs: [],
  approvals: [],
  userInputs: [],
  streams: [],
  hasOlder: false,
  cursor: 0,
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
})
async function ready(check: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (check()) return
    await Bun.sleep(1)
  }
  throw new Error('Presentation fixture state did not settle')
}

for (const count of [0, 1, 60, 61, 100, 101, 1_000, 1_001]) {
  test(`live presentation metadata remains intact within existing 1000-message capacity: ${count}`, async () => {
    let onUpdate: ((update: SessionTimelineUpdate) => void) | undefined
    let snapshots = 0
    const runtime = createAppRuntime({
      instanceId: `presentation-${count}`,
      hostId: 'fixture',
      directory: {
        async execute(name) {
          if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
          if (name === 'workspace.get') return workspace
          if (name === 'session.list') return { items: [session], nextCursor: null }
          if (name === 'session.get') return session
          throw new Error(`Unexpected fixture query ${name}`)
        },
      },
      timeline: {
        async snapshot() {
          snapshots++
          return emptySnapshot()
        },
        async plan() {
          return null
        },
        async watch(_sessionId, _cursor, update) {
          onUpdate = update
          return () => {
            onUpdate = undefined
          }
        },
      },
    })
    try {
      await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
      await ready(() => runtime.view.state.timeline.getSnapshot().status === 'ready' && !!onUpdate)
      for (let index = 1; index <= count; index++) {
        const update: SessionTimelineUpdate = {
          kind: 'event',
          event: {
            eventId: `event-${index}`,
            sessionId: session.id,
            seq: index,
            runId: 'run',
            stepId: null,
            type: 'message.committed',
            data: { id: `message-${index}`, role: 'assistant', content: [call(`call-${index}`)] },
            time: index,
            version: 1,
          },
        }
        onUpdate!(update)
        onUpdate!(update)
      }
      const timeline = runtime.view.state.timeline.getSnapshot()
      expect(timeline.messages).toHaveLength(Math.min(count, 1_000))
      expect(new Set(timeline.messages.map((message) => message.id)).size).toBe(timeline.messages.length)
      for (const message of timeline.messages) expect(message.content).toEqual([call(`call-${message.seq}`)])
      if (count > 1_000) expect(timeline.messages[0]?.seq).toBe(2)
      expect(snapshots).toBe(1)
      expect(timeline.cursor).toBe(count)
    } finally {
      runtime.dispose()
    }
  })
}

test('paged orphan identity is enriched only by its exact original session, run, call and tool name', () => {
  const result: ContentBlock = {
    type: 'tool_result',
    callId: 'shared',
    name: 'same_name',
    text: 'raw result',
    isError: false,
  }
  const message = (id: string, seq: number, runId: string, content: ContentBlock[], sessionId = session.id) => ({
    id,
    sessionId,
    seq,
    runId,
    role: 'assistant' as const,
    content,
    createdAt: seq,
  })
  const orphan = message('result', 3, 'run-one', [result])
  expect(projectSessionMessages([orphan])[0]?.results).toEqual([])
  expect(projectSessionMessages([orphan])[0]?.blocks).toEqual([result])
  const wrongRun = message('wrong-run', 1, 'run-other', [call('shared')])
  const wrongSession = message('wrong-session', 1, 'run-one', [call('shared')], 'another-session')
  const wrongName = message('wrong-name', 1, 'run-one', [{ ...call('shared'), name: 'different_name' }])
  for (const wrong of [wrongRun, wrongSession, wrongName]) {
    const projection = projectSessionMessages([wrong, orphan])
    expect(projection.find((item) => item.message.id === 'result')?.blocks).toEqual([result])
    expect(projection.find((item) => item.message.id === wrong.id)?.results).toEqual([])
  }
  const exact = message('exact-call', 2, 'run-one', [call('shared')])
  const matched = projectSessionMessages([wrongRun, exact, orphan])
  expect(matched.find((item) => item.message.id === exact.id)?.blocks).toEqual([call('shared')])
  expect(matched.find((item) => item.message.id === exact.id)?.results).toEqual([result])
  expect(matched.some((item) => item.message.id === orphan.id)).toBe(false)
})
