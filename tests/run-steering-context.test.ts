import { expect, test } from 'bun:test'
import type { ContentBlock, Message } from '@hbar/contracts'
import { buildSteeringContext, type SteeringDelivery } from '../packages/kernel/src/run-steering-context'

const runId = 'run-active'
const sessionId = 'session-steering'

function message(
  id: string,
  seq: number,
  role: Message['role'],
  content: ContentBlock[],
  messageRunId = runId,
): Message {
  return { id, sessionId, runId: messageRunId, role, content, seq, createdAt: seq }
}

function text(textValue: string): ContentBlock {
  return { type: 'text', text: textValue }
}

function delivery(messageValue: Message, insertionAfterSeq: number): SteeringDelivery {
  return { message: messageValue, insertionAfterSeq }
}

test('places a consumed guide after the completed assistant response even when its canonical seq is earlier', () => {
  const initial = message('initial', 1, 'user', [text('Initial task')])
  const guide = message('guide', 2, 'user', [text('Continue with the changed task')])
  const answer = message('answer', 3, 'assistant', [text('Answer')])

  const result = buildSteeringContext([initial, guide, answer], {
    runId,
    initialUserMessageId: initial.id,
    deliveries: [delivery(guide, answer.seq)],
  })

  expect(result.map((item) => item.id)).toEqual(['initial', 'answer', 'guide'])
  expect(result.at(-1)).toBe(guide)
})

test('keeps multiple delivery batches at their captured boundaries and preserves batch order', () => {
  const initial = message('initial', 1, 'user', [text('Initial task')])
  const firstAnswer = message('answer-1', 2, 'assistant', [text('First answer')])
  const firstGuide = message('guide-1', 3, 'user', [text('First follow-up')])
  const secondAnswer = message('answer-2', 4, 'assistant', [text('Second answer')])
  const secondGuide = message('guide-2', 5, 'user', [text('Second follow-up')])

  const result = buildSteeringContext([initial, firstAnswer, firstGuide, secondAnswer, secondGuide], {
    runId,
    initialUserMessageId: initial.id,
    deliveries: [delivery(firstGuide, firstAnswer.seq), delivery(secondGuide, secondAnswer.seq)],
  })

  expect(result.map((item) => item.id)).toEqual(['initial', 'answer-1', 'guide-1', 'answer-2', 'guide-2'])
})

test('retains attachment blocks from a delivered guide and does not duplicate its canonical row', () => {
  const initial = message('initial', 1, 'user', [text('Initial task')])
  const artifact = { id: 'a'.repeat(64), name: 'notes.txt', mime: 'text/plain', size: 12 }
  const guide = message('guide', 2, 'user', [text('Review this file'), { type: 'file', artifact }])
  const answer = message('answer', 3, 'assistant', [text('Answer')])

  const result = buildSteeringContext([initial, guide, answer, guide], {
    runId,
    initialUserMessageId: initial.id,
    deliveries: [delivery(guide, answer.seq)],
  })

  expect(result.filter((item) => item.id === guide.id)).toHaveLength(1)
  expect(result.at(-1)?.content).toEqual([text('Review this file'), { type: 'file', artifact }])
})

test('does not include an unconsumed current-run guide', () => {
  const initial = message('initial', 1, 'user', [text('Initial task')])
  const unconsumed = message('pending-guide', 2, 'user', [text('Still queued')])
  const answer = message('answer', 3, 'assistant', [text('Answer')])

  const result = buildSteeringContext([initial, unconsumed, answer], {
    runId,
    initialUserMessageId: initial.id,
    deliveries: [],
  })

  expect(result.map((item) => item.id)).toEqual(['initial', 'answer'])
})

test('ignores malformed deliveries from another session or Run', () => {
  const initial = message('initial', 1, 'user', [text('Initial task')])
  const answer = message('answer', 2, 'assistant', [text('Answer')])
  const foreignSession = {
    ...message('foreign-session', 3, 'user', [text('Do not inject')]),
    sessionId: 'session-other',
  }
  const foreignRun = message('foreign-run', 4, 'user', [text('Do not inject')], 'run-other')

  const result = buildSteeringContext([initial, answer], {
    runId,
    initialUserMessageId: initial.id,
    deliveries: [delivery(foreignSession, answer.seq), delivery(foreignRun, answer.seq)],
  })

  expect(result.map((item) => item.id)).toEqual(['initial', 'answer'])
})

test('keeps assistant tool calls adjacent to all matching tool results', () => {
  const initial = message('initial', 1, 'user', [text('Initial task')])
  const assistant = message('assistant-tools', 2, 'assistant', [
    { type: 'tool_call', callId: 'call-1', name: 'read', args: {} },
    { type: 'tool_call', callId: 'call-2', name: 'read', args: {} },
  ])
  const firstResult = message('tool-1', 3, 'tool', [
    { type: 'tool_result', callId: 'call-1', name: 'read', text: 'one', isError: false },
  ])
  const secondResult = message('tool-2', 4, 'tool', [
    { type: 'tool_result', callId: 'call-2', name: 'read', text: 'two', isError: false },
  ])
  const guide = message('guide', 5, 'user', [text('Use those results')])
  const answer = message('answer', 6, 'assistant', [text('Next answer')])

  const result = buildSteeringContext([initial, assistant, firstResult, secondResult, guide, answer], {
    runId,
    initialUserMessageId: initial.id,
    deliveries: [delivery(guide, assistant.seq)],
  })

  expect(result.map((item) => item.id)).toEqual(['initial', 'assistant-tools', 'tool-1', 'tool-2', 'guide', 'answer'])
})

test('reinserts a delivered guide when older context was compacted', () => {
  const initial = message('initial', 1, 'user', [text('Initial task')])
  const answer = message('answer', 8, 'assistant', [text('Current answer')])
  const guide = message('guide', 4, 'user', [text('Continue after compaction')])

  const result = buildSteeringContext([initial, answer], {
    runId,
    initialUserMessageId: initial.id,
    deliveries: [delivery(guide, 7)],
  })

  expect(result.map((item) => item.id)).toEqual(['initial', 'guide', 'answer'])
  expect(result.find((item) => item.id === guide.id)?.seq).toBe(guide.seq)
})
