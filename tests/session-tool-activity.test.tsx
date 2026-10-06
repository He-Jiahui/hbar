import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SessionEvent, Run, Message } from '@hbar/contracts'
import { HbarMessageBlocks } from '@hbar/app-react'
import { getShellCopy } from '../apps/web/src/shell-copy'
import {
  activityCounts,
  projectToolActivities,
  rowToolActivity,
  toolActivityKey,
  toolElapsed,
} from '../packages/app-react/src/session-tool-activity-model'
import { buildMessageRows } from '../packages/app-react/src/session-message-model'

const call = { type: 'tool_call' as const, callId: 'read', name: 'read_file', args: { path: 'source.ts' } }
const messages: Message[] = [
  { id: 'message', sessionId: 'session', runId: 'run', role: 'assistant', content: [call], seq: 1, createdAt: 1 },
]
const run: Run = {
  id: 'run',
  sessionId: 'session',
  requestId: 'request',
  input: { text: 'read', images: [] },
  modelId: 'fixture',
  status: 'running',
  createdAt: 1,
  startedAt: 1,
  endedAt: null,
  error: null,
}
function event(seq: number, overrides: Partial<SessionEvent> = {}): SessionEvent {
  return {
    eventId: `event-${seq}`,
    sessionId: 'session',
    runId: 'run',
    seq,
    stepId: null,
    type: 'tool.execution',
    time: 50_000,
    version: 1,
    data: { callId: 'read', name: 'read_file', execution: { startedAt: 49_000, elapsedMs: 1000 } },
    ...overrides,
  }
}
function timeline(events: SessionEvent[] = [event(2)]) {
  return {
    sessionId: 'session',
    messages,
    runs: [run],
    toolEvents: events,
    toolClock: { hostTime: 51_000, receivedAt: 1_000_000 },
  }
}
function toolRow() {
  const row = buildMessageRows([call])[0]
  if (row?.kind !== 'tool') throw new Error('Missing row')
  return row
}

test('remote clock skew cannot inflate elapsed time; only Host timing plus local observed interval is used', () => {
  const activity = projectToolActivities(timeline(), true).get('run')?.get(toolActivityKey('read', 'read_file'))
  if (!activity) throw new Error('Missing activity')
  expect(activity.active).toBe(true)
  expect(toolElapsed(activity, 1_000_500)).toBe(2500)
  expect(toolElapsed(activity, 999_000)).toBe(2000)
})
test('scope, malformed payloads and out-of-order duplicate facts never leak across identities', () => {
  const events = [
    event(4, {
      data: { callId: 'read', name: 'read_file', execution: { startedAt: 49_000, endedAt: 50_000, elapsedMs: 777 } },
    }),
    event(2),
    event(9, { sessionId: 'other' }),
    event(10, { data: { callId: 'read', name: 'read_file', execution: { startedAt: 49_000, elapsedMs: -1 } } }),
    event(11, { runId: 'other-run' }),
  ]
  const values = projectToolActivities(timeline(events), true)
  const value = values.get('run')?.get(toolActivityKey('read', 'read_file'))
  expect(value?.execution?.elapsedMs).toBe(777)
  expect(value?.active).toBe(false)
  expect(values.get('other-run')?.get(toolActivityKey('read', 'read_file'))?.active).toBe(false)
})
test('disconnect and terminal Runs stop live clocks; absent execution stays pending only in a live Run', () => {
  const offline = projectToolActivities(timeline(), false).get('run')
  const row = toolRow()
  expect(rowToolActivity(row, offline)?.active).toBe(false)
  expect(activityCounts([row], offline)).toMatchObject({ running: 0, pending: 0, unknown: 1 })
  const pending = projectToolActivities(timeline([]), true).get('run')
  expect(activityCounts([row], pending)).toMatchObject({ running: 0, pending: 1, unknown: 0 })
  const terminal = projectToolActivities(
    { ...timeline(), runs: [{ ...run, status: 'cancelled', endedAt: 52_000 }] },
    true,
  ).get('run')
  expect(rowToolActivity(row, terminal)?.active).toBe(false)
})
test('final results freeze measured time, survive paged history and override obsolete live events', () => {
  const row = {
    ...toolRow(),
    result: {
      type: 'tool_result' as const,
      callId: 'read',
      name: 'read_file',
      text: 'proof',
      isError: false,
      execution: { startedAt: 49_000, endedAt: 50_000, elapsedMs: 987 },
    },
  }
  const activity = rowToolActivity(row, projectToolActivities(timeline(), true).get('run'))
  if (!activity) throw new Error('Missing final metadata')
  expect(toolElapsed(activity, 9_999_999)).toBe(987)
  expect(toolElapsed(activity, 99_999_999)).toBe(987)
  expect(rowToolActivity({ ...row, result: { ...row.result, execution: undefined } })?.execution).toBeUndefined()
})
for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`localized compact UI renders real percentage, duration and batch counts; no legacy time invented (${locale})`, () => {
    const labels = getShellCopy(locale).session.messageBlocks
    const final = {
      type: 'tool_result' as const,
      callId: 'read',
      name: 'read_file',
      text: 'proof',
      isError: false,
      execution: { startedAt: 49_000, endedAt: 50_000, elapsedMs: 1400, progress: { completed: 2, total: 4 } },
      batch: { total: 3, settled: 1, running: 1, pending: 1, skipped: 0, unknown: 0 },
    }
    const html = renderToStaticMarkup(
      <HbarMessageBlocks sessionId="session" messageId="message" blocks={[call, final]} labels={labels} />,
    )
    expect(html).toContain('50%')
    expect(html).toContain(locale === 'zh-CN' ? '耗时 1 秒' : 'Took 1 s')
    expect(html).toContain(locale === 'zh-CN' ? '已结束 1' : '1 settled')
    const legacy = renderToStaticMarkup(
      <HbarMessageBlocks
        sessionId="session"
        messageId="message"
        blocks={[call, { ...final, execution: undefined, batch: undefined }]}
        labels={labels}
      />,
    )
    expect(legacy).not.toContain('data-tool-elapsed')
    expect(legacy).not.toContain('progressbar')
  })
}
