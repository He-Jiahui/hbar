import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SessionTimelineState } from '@hbar/app-runtime'
import { HbarGoalContinuation } from '../packages/app-react/src/goal-continuation'
import {
  projectSessionTimelineSequence,
  type GoalContinuationBoundary,
  type SessionTimelineSequenceItem,
} from '../packages/app-react/src/session-message-model'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { sessionMessage } from './session-message.fixtures'

type Timeline = Pick<SessionTimelineState, 'sessionId' | 'messages' | 'runs' | 'streams'>
type Run = SessionTimelineState['runs'][number]

function run(id: string, overrides: Partial<Run> = {}): Run {
  return {
    id,
    sessionId: 'session',
    requestId: `request-${id}`,
    modelId: 'fixture',
    input: {
      text: '',
      images: [],
      source: 'goal',
      continuation: { goalId: 'original-goal', intentId: `intent-${id}` },
    },
    status: 'completed',
    createdAt: 10,
    startedAt: 10,
    endedAt: 11,
    error: null,
    ...overrides,
  }
}

function timeline(overrides: Partial<Timeline> = {}): Timeline {
  return { sessionId: 'session', messages: [], runs: [], streams: {}, ...overrides }
}

function markers(items: readonly SessionTimelineSequenceItem[]): readonly GoalContinuationBoundary[] {
  return items.flatMap((item) => (item.kind === 'goalContinuation' ? [item.continuation] : []))
}

function identities(items: readonly SessionTimelineSequenceItem[]) {
  return items.map((item) =>
    item.kind === 'message'
      ? `message:${item.projection.message.id}`
      : item.kind === 'stream'
        ? `stream:${item.stream.id}`
        : item.kind === 'goalContinuation'
          ? `continuation:${item.continuation.runId}`
          : `goal:${item.row.eventId}`,
  )
}

test('persistent Goal Run marks the hidden input boundary once, before all its visible output', () => {
  const result = projectSessionTimelineSequence(
    timeline({
      runs: [run('continuation')],
      messages: [
        sessionMessage([{ type: 'text', text: 'Initial response' }], { id: 'initial', runId: 'initial-run', seq: 1 }),
        sessionMessage([{ type: 'text', text: '' }], {
          id: 'empty-input',
          runId: 'continuation',
          role: 'user',
          seq: 2,
        }),
        sessionMessage([{ type: 'thinking', text: 'Reviewing' }], { id: 'thinking', runId: 'continuation', seq: 3 }),
        sessionMessage([{ type: 'text', text: 'Continued response' }], { id: 'reply', runId: 'continuation', seq: 4 }),
      ],
    }),
  )
  expect(identities(result)).toEqual([
    'message:initial',
    'continuation:continuation',
    'message:thinking',
    'message:reply',
  ])
  expect(markers(result)).toMatchObject([
    { runId: 'continuation', anchor: { kind: 'message', messageId: 'empty-input', seq: 2 } },
  ])
  expect(markers(result)[0]?.id).toBe('goal-continuation:["session","continuation"]')
})

test('only a persistent automatic Goal continuation qualifies, not kickoff, text, fields or current Goal', () => {
  const result = projectSessionTimelineSequence(
    timeline({
      runs: [
        run('user', {
          input: { text: 'Goal continuing', images: [], source: 'user', continuation: { goalId: 'g', intentId: 'i' } },
        }),
        run('legacy', { input: { text: '', images: [] } }),
        run('kickoff', { input: { text: '', images: [], source: 'goal' } }),
      ],
      messages: [sessionMessage([{ type: 'text', text: 'Goal continuing' }], { id: 'text', runId: 'user' })],
    }),
  )
  expect(markers(result)).toEqual([])
  expect(identities(result)).toEqual(['message:text'])
  expect(projectSessionTimelineSequence(timeline({ sessionId: null, runs: [run('wrong')] }))).toEqual([])
})

test('stale sessions and duplicate Run/message IDs cannot attach or multiply markers', () => {
  const original = sessionMessage([{ type: 'text', text: 'original' }], { id: 'same', runId: 'goal', seq: 2 })
  const result = projectSessionTimelineSequence(
    timeline({
      runs: [run('goal', { sessionId: 'other' }), run('goal'), run('goal', { status: 'failed' })],
      messages: [
        sessionMessage([{ type: 'text', text: 'foreign' }], { id: 'same', sessionId: 'other' }),
        original,
        { ...original, seq: 99, content: [{ type: 'text', text: 'duplicate' }] },
      ],
      streams: {
        foreign: {
          id: 'foreign',
          sessionId: 'other',
          runId: 'goal',
          text: 'foreign',
          thinking: '',
          offset: 7,
          version: 1,
        },
      },
    }),
  )
  expect(markers(result)).toHaveLength(1)
  expect(markers(result)[0]?.status).toBe('completed')
  expect(identities(result)).toEqual(['continuation:goal', 'message:same'])
  expect(result.find((item) => item.kind === 'message')).toMatchObject({ projection: { message: original } })
})

test('live streams use one marker and hand over to the persisted message without duplication', () => {
  const stream = {
    id: 'stream',
    sessionId: 'session',
    runId: 'goal',
    text: 'Live',
    thinking: '',
    offset: 4,
    version: 1,
  }
  const live = projectSessionTimelineSequence(
    timeline({ runs: [run('goal', { status: 'running' })], streams: { stream } }),
  )
  expect(identities(live)).toEqual(['continuation:goal', 'stream:stream'])
  expect(markers(live)[0]?.anchor).toEqual({ kind: 'stream', streamId: 'stream' })
  const partial = projectSessionTimelineSequence(
    timeline({
      runs: [run('goal', { status: 'running' })],
      streams: { stream },
      messages: [sessionMessage([{ type: 'text', text: 'Earlier segment' }], { id: 'segment', runId: 'goal' })],
    }),
  )
  expect(identities(partial)).toEqual(['continuation:goal', 'message:segment', 'stream:stream'])
  const settled = projectSessionTimelineSequence(
    timeline({
      runs: [run('goal')],
      messages: [sessionMessage([{ type: 'text', text: 'Final' }], { id: 'final', runId: 'goal' })],
    }),
  )
  expect(markers(settled)[0]?.id).toBe(markers(live)[0]?.id)
  expect(identities(settled)).toEqual(['continuation:goal', 'message:final'])
})

test('failed/cancelled or accepted no-output Goal turns retain a real sequence boundary', () => {
  const result = projectSessionTimelineSequence(
    timeline({
      runs: [run('failed', { status: 'failed' }), run('cancelled', { status: 'cancelled' })],
      messages: [
        sessionMessage([{ type: 'text', text: 'Before' }], { id: 'before', runId: 'user', seq: 1 }),
        sessionMessage([], { id: 'failed-input', runId: 'failed', role: 'user', seq: 2 }),
        sessionMessage([], { id: 'cancelled-input', runId: 'cancelled', role: 'user', seq: 3 }),
        sessionMessage([{ type: 'text', text: 'After' }], { id: 'after', runId: 'user2', seq: 4 }),
      ],
    }),
  )
  expect(identities(result)).toEqual([
    'message:before',
    'continuation:failed',
    'continuation:cancelled',
    'message:after',
  ])
  expect(markers(result).map((item) => item.status)).toEqual(['failed', 'cancelled'])
  const pending = projectSessionTimelineSequence(timeline({ runs: [run('queued', { status: 'queued' })] }))
  expect(identities(pending)).toEqual(['continuation:queued'])
})

test('unanchored Runs use persisted creation time, not an arbitrary top-of-history insertion', () => {
  const result = projectSessionTimelineSequence(
    timeline({
      runs: [run('later', { createdAt: 30 }), run('between', { createdAt: 15 })],
      messages: [
        sessionMessage([{ type: 'text', text: 'Before' }], { id: 'before', seq: 1, createdAt: 10 }),
        sessionMessage([{ type: 'text', text: 'After' }], { id: 'after', seq: 2, createdAt: 20 }),
      ],
    }),
  )
  expect(identities(result)).toEqual(['message:before', 'continuation:between', 'message:after', 'continuation:later'])
  expect(markers(result)[0]?.anchor).toEqual({ kind: 'run', createdAt: 15 })
})

test('paging/cross-message tool joins retain their source order and bounded window without guessed markers', () => {
  const resultBlock = { type: 'tool_result' as const, callId: 'call', name: 'inspect', text: 'Result', isError: false }
  const resultMessage = sessionMessage([resultBlock], { id: 'result', role: 'tool', runId: 'goal', seq: 3 })
  const runs = [run('goal')]
  const page = projectSessionTimelineSequence(timeline({ runs, messages: [resultMessage] }))
  expect(identities(page)).toEqual(['continuation:goal', 'message:result'])
  const earlier = projectSessionTimelineSequence(
    timeline({
      runs,
      messages: [
        sessionMessage([], { id: 'input', role: 'user', runId: 'goal', seq: 1 }),
        sessionMessage([{ type: 'tool_call', callId: 'call', name: 'inspect', args: {} }], {
          id: 'call',
          runId: 'goal',
          seq: 2,
        }),
        resultMessage,
      ],
    }),
  )
  expect(identities(earlier)).toEqual(['continuation:goal', 'message:call'])
  expect(earlier.find((item) => item.kind === 'message')).toMatchObject({ projection: { results: [resultBlock] } })
  expect(markers(projectSessionTimelineSequence(timeline({ messages: [resultMessage] })))).toEqual([])
  for (const count of [0, 1, 80, 81, 1000]) {
    const result = projectSessionTimelineSequence(
      timeline({
        runs: [run('goal')],
        messages: Array.from({ length: count }, (_, index) =>
          sessionMessage([{ type: 'text', text: `message-${index}` }], {
            id: `m-${index}`,
            runId: 'goal',
            seq: index + 1,
          }),
        ),
      }),
    )
    expect(result.filter((item) => item.kind === 'message')).toHaveLength(count)
    expect(markers(result)).toHaveLength(1)
  }
})

test('localized read-only separator reports actual Run state without controls or invented Goal detail', () => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const labels = getShellCopy(locale).session.goalContinuation
    for (const status of [
      'queued',
      'running',
      'waiting_approval',
      'completed',
      'cancelled',
      'failed',
      'interrupted',
    ] as const) {
      const continuation = markers(projectSessionTimelineSequence(timeline({ runs: [run('goal', { status })] })))[0]
      if (!continuation) throw new Error('Expected persisted continuation')
      const html = renderToStaticMarkup(<HbarGoalContinuation continuation={continuation} labels={labels} />)
      expect(html).toContain('role="separator"')
      expect(html).toContain(labels.title)
      expect(html).toContain(labels.statuses[status])
      expect(html).toContain('data-goal-continuation-run="goal"')
      expect(html).not.toContain('<button')
      expect(html).not.toContain('original-goal')
      expect(html).not.toContain('tabindex')
    }
  }
})
