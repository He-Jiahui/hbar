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
import { ToolBatchFeedback, ToolProgressFeedback } from '../packages/app-react/src/session-tool-feedback'
import { toolFeedbackLabels } from '../apps/web/src/session-tool-feedback-copy'

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
  test(`localized compact UI renders batch progress below the tool, with measured duration and accessible counts (${locale})`, () => {
    const labels = getShellCopy(locale).session.messageBlocks
    const final = {
      type: 'tool_result' as const,
      callId: 'read',
      name: 'read_file',
      text: 'proof',
      isError: false,
      execution: { startedAt: 49_000, endedAt: 50_000, elapsedMs: 1400, progress: { completed: 2, total: 4 } },
      batch: {
        total: 3,
        settled: 1,
        running: 1,
        pending: 1,
        skipped: 0,
        unknown: 0,
        outcomes: { succeeded: 1, failed: 0 },
      },
    }
    const html = renderToStaticMarkup(
      <HbarMessageBlocks sessionId="session" messageId="message" blocks={[call, final]} labels={labels} />,
    )
    expect(html).toContain('data-tool-progress="33.3"')
    expect(html).not.toContain('>33.3%<')
    expect(html).not.toContain('hbar-tool-batch-counts')
    expect(html).toContain('data-progress-state="succeeded"')
    expect(html).toContain('data-progress-state="running"')
    expect(html).toContain('data-progress-state="pending"')
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

  test(`four proportional states preserve Host labels without adding visible progress text (${locale})`, () => {
    const labels = toolFeedbackLabels(locale)
    const counts = {
      total: 4,
      settled: 2,
      running: 1,
      pending: 1,
      skipped: 0,
      unknown: 0,
      outcomes: { succeeded: 1, failed: 1 },
    }
    const html = renderToStaticMarkup(<ToolBatchFeedback counts={counts} labels={labels} />)
    expect(html).toContain('aria-valuenow="2"')
    expect(html).toContain('aria-valuemax="4"')
    expect(html).toContain(`aria-label="${labels.progressAccessible(2, 4)}"`)
    expect(html).toContain(`aria-valuetext="50% · ${labels.counts(counts)}"`)
    for (const state of ['succeeded', 'failed', 'running', 'pending'])
      expect(html).toContain(`data-progress-state="${state}" aria-hidden="true" style="flex-grow:1"`)
    expect(html).not.toContain('>50%<')
  })

  test(`a tool's actual work progress changes color with its outcome and freezes when disconnected (${locale})`, () => {
    const labels = toolFeedbackLabels(locale)
    const progress = { completed: 1, total: 4 }
    for (const [outcome, active, state] of [
      ['pending', true, 'running'],
      ['failed', false, 'failed'],
      ['succeeded', false, 'succeeded'],
    ] as const) {
      const html = renderToStaticMarkup(
        <ToolProgressFeedback progress={progress} outcome={outcome} active={active} labels={labels} />,
      )
      expect(html).toContain('data-tool-progress="25"')
      expect(html).toContain(`data-progress-state="${state}" aria-hidden="true" style="flex-grow:1"`)
      expect(html).toContain('data-progress-state="pending" aria-hidden="true" style="flex-grow:3"')
    }
    const offline = renderToStaticMarkup(
      <ToolProgressFeedback progress={progress} outcome="pending" active={false} labels={labels} />,
    )
    expect(offline).not.toContain('data-progress-state="running"')
    expect(offline).toContain('data-progress-state="pending" aria-hidden="true" style="flex-grow:4"')
  })
}

test('batch colors distinguish canonical failures and preserve cancelled, interrupted and unknown results', () => {
  const rows = (['succeeded', 'failed', 'cancelled', 'interrupted', 'unknown', 'denied'] as const).map(
    (kind, index) => ({
      ...toolRow(),
      id: String(index),
      result: {
        type: 'tool_result' as const,
        callId: String(index),
        name: 'read_file',
        text: 'proof',
        isError: kind !== 'succeeded',
        outcome: {
          kind,
          executionStarted: true,
        },
      },
    }),
  )
  expect(activityCounts(rows)).toMatchObject({
    total: 6,
    settled: 6,
    outcomes: { succeeded: 1, failed: 1 },
  })
})

test('empty feedback is omitted; unclassified legacy batches keep their real progress without claiming success', () => {
  const labels = toolFeedbackLabels('zh-CN')
  const empty = { total: 0, settled: 0, running: 0, pending: 0, skipped: 0, unknown: 0 }
  expect(renderToStaticMarkup(<ToolBatchFeedback counts={empty} labels={labels} />)).toBe('')
  const legacy = renderToStaticMarkup(<ToolBatchFeedback counts={{ ...empty, total: 3, settled: 3 }} labels={labels} />)
  expect(legacy).toContain('data-tool-progress="100"')
  expect(legacy).not.toContain('data-progress-state="succeeded"')
  expect(legacy).toContain('data-progress-state="pending"')
})
