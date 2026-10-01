import { expect, test } from 'bun:test'
import {
  CONVERSATION_READING_MAX_ANCHORS,
  CONVERSATION_READING_MAX_ID_LENGTH,
  CONVERSATION_READING_MAX_MESSAGE_OFFSET,
  createConversationReading,
  type ConversationReadingTarget,
} from '../packages/app-runtime/src/conversation-reading'

const target = (index: number, instance = 'tab-a'): ConversationReadingTarget => ({
  workspaceId: 'workspace',
  sessionId: `session-${index}`,
  sourceTabInstanceKey: instance,
})

test('keeps anchors scoped to the exact workspace, session and source tab instance', () => {
  const reading = createConversationReading(() => undefined)
  const first = target(1)
  const sameSessionNewTab = target(1, 'tab-b')
  const otherRuntime = createConversationReading(() => undefined)
  try {
    reading.remember(first, { messageId: 'message-1', messageOffset: 24.5, atEnd: false })
    expect(reading.read(first)).toEqual({ messageId: 'message-1', messageOffset: 24.5, atEnd: false })
    expect(reading.read(sameSessionNewTab)).toBeNull()
    expect(otherRuntime.read(first)).toBeNull()
  } finally {
    reading.dispose()
    otherRuntime.dispose()
  }
})

test('publishes dirty geometry but suppresses an identical remember write', () => {
  const reading = createConversationReading(() => undefined)
  const targetValue = target(2)
  const notifications: number[] = []
  const unsubscribe = reading.reader.subscribe(() => notifications.push(reading.reader.getSnapshot().anchors.length))
  try {
    reading.remember(targetValue, { messageId: 'message-1', messageOffset: 10, atEnd: false })
    reading.remember(targetValue, { messageId: 'message-1', messageOffset: 10, atEnd: false })
    reading.remember(targetValue, { messageId: 'message-1', messageOffset: 11, atEnd: false })
    expect(notifications).toEqual([1, 1])
    expect(reading.read(targetValue)).toEqual({ messageId: 'message-1', messageOffset: 11, atEnd: false })
    expect(notifications).toEqual([1, 1])
  } finally {
    unsubscribe()
    reading.dispose()
  }
})

test('same-value remember is silent even when another target became most recent', () => {
  const reading = createConversationReading(() => undefined)
  const first = target(20)
  const second = target(21)
  const notifications: number[] = []
  const unsubscribe = reading.reader.subscribe(() => notifications.push(1))
  try {
    reading.remember(first, { messageId: 'first', messageOffset: 0, atEnd: false })
    reading.remember(second, { messageId: 'second', messageOffset: 0, atEnd: false })
    notifications.length = 0
    reading.remember(first, { messageId: 'first', messageOffset: 0, atEnd: false })
    expect(notifications).toEqual([])
  } finally {
    unsubscribe()
    reading.dispose()
  }
})

test('evicts the oldest remembered anchor at capacity while reads stay pure', () => {
  const reading = createConversationReading(() => undefined)
  try {
    for (let index = 0; index < CONVERSATION_READING_MAX_ANCHORS; index += 1)
      reading.remember(target(index), { messageId: `message-${index}`, messageOffset: index, atEnd: false })
    const oldest = target(0)
    const retained = target(1)
    expect(reading.read(oldest)?.messageId).toBe('message-0')
    reading.remember(target(CONVERSATION_READING_MAX_ANCHORS), {
      messageId: 'message-new',
      messageOffset: 0,
      atEnd: true,
    })
    expect(reading.read(retained)?.messageId).toBe('message-1')
    expect(reading.read(oldest)).toBeNull()
    expect(reading.reader.getSnapshot().anchors).toHaveLength(CONVERSATION_READING_MAX_ANCHORS)
  } finally {
    reading.dispose()
  }
})

test('retains only exact open-tab targets and supports empty retention', () => {
  const reading = createConversationReading(() => undefined)
  try {
    const open = target(3)
    const otherTab = target(3, 'tab-b')
    reading.remember(open, { messageId: 'open', messageOffset: 0, atEnd: false })
    reading.remember(otherTab, { messageId: 'other', messageOffset: 0, atEnd: false })
    reading.retainTargets([open])
    expect(reading.read(open)).not.toBeNull()
    expect(reading.read(otherTab)).toBeNull()
    reading.retainTargets([])
    expect(reading.reader.getSnapshot().anchors).toHaveLength(0)
  } finally {
    reading.dispose()
  }
})

test('rejects empty or oversized identities and invalid geometry', () => {
  const reading = createConversationReading(() => undefined)
  const valid = target(4)
  try {
    expect(() =>
      reading.remember({ ...valid, sessionId: '' }, { messageId: null, messageOffset: 0, atEnd: true }),
    ).toThrow()
    expect(() =>
      reading.remember(
        { ...valid, sessionId: 'x'.repeat(CONVERSATION_READING_MAX_ID_LENGTH + 1) },
        { messageId: null, messageOffset: 0, atEnd: true },
      ),
    ).toThrow()
    expect(() => reading.remember(valid, { messageId: null, messageOffset: Number.NaN, atEnd: true })).toThrow()
    expect(() =>
      reading.remember(valid, { messageId: null, messageOffset: Number.POSITIVE_INFINITY, atEnd: true }),
    ).toThrow()
    expect(() =>
      reading.remember(valid, {
        messageId: null,
        messageOffset: CONVERSATION_READING_MAX_MESSAGE_OFFSET + 1,
        atEnd: true,
      }),
    ).toThrow()
  } finally {
    reading.dispose()
  }
})

test('dispose clears the cache and ignores late writes', () => {
  const reading = createConversationReading(() => undefined)
  const value = target(5)
  reading.remember(value, { messageId: 'before-dispose', messageOffset: 1, atEnd: false })
  reading.dispose()
  reading.remember(value, { messageId: 'late', messageOffset: 2, atEnd: true })
  reading.retainTargets([value])
  expect(reading.read(value)).toBeNull()
  expect(reading.reader.getSnapshot().anchors).toHaveLength(0)
  reading.dispose()
})
