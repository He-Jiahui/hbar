import { expect, test } from 'bun:test'
import { createHistoryPageTrigger, type HistoryPageEdge } from '../packages/app-react/src/session-history-scroll-model'

const edge = (update: Partial<HistoryPageEdge> = {}): HistoryPageEdge => ({
  eligible: true,
  firstMessageId: 'original-121',
  scrollTop: 0,
  threshold: 32,
  ...update,
})

test('opening a conversation, restoring a reader and geometry corrections never page by themselves', () => {
  const trigger = createHistoryPageTrigger()
  expect(trigger.take(edge())).toBe(false)
  expect(trigger.take(edge({ firstMessageId: 'original-61' }))).toBe(false)
  trigger.arm(true)
  trigger.disarm()
  expect(trigger.take(edge())).toBe(false)
})

test('upward intent waits for the top threshold and requests exactly one page', () => {
  const trigger = createHistoryPageTrigger()
  trigger.arm(true)
  expect(trigger.take(edge({ scrollTop: 200 }))).toBe(false)
  expect(trigger.take(edge({ scrollTop: 33 }))).toBe(false)
  expect(trigger.take(edge({ scrollTop: 32 }))).toBe(true)
  expect(trigger.take(edge())).toBe(false)
  trigger.arm(true)
  expect(trigger.take(edge({ firstMessageId: 'original-61' }))).toBe(false)
  trigger.settle()
  expect(trigger.take(edge({ firstMessageId: 'original-61' }))).toBe(false)
  trigger.arm(true)
  expect(trigger.take(edge({ firstMessageId: 'original-61' }))).toBe(true)
})

test('empty or duplicate pages cannot spin at the same cursor after settlement', () => {
  const trigger = createHistoryPageTrigger()
  trigger.arm(true)
  expect(trigger.take(edge())).toBe(true)
  trigger.settle()
  trigger.arm(true)
  expect(trigger.take(edge())).toBe(false)
  expect(trigger.take(edge({ firstMessageId: 'earlier' }))).toBe(true)
})

test('offline, busy, failed, limited, hidden and replaced targets disarm the pending gesture', () => {
  const trigger = createHistoryPageTrigger()
  trigger.arm(true)
  expect(trigger.take(edge({ eligible: false }))).toBe(false)
  expect(trigger.take(edge())).toBe(false)
  trigger.arm(false)
  expect(trigger.take(edge())).toBe(false)
  trigger.arm(true)
  expect(trigger.take(edge())).toBe(true)
})

for (const update of [
  { firstMessageId: null },
  { scrollTop: Number.NaN },
  { scrollTop: Number.POSITIVE_INFINITY },
  { threshold: Number.NaN },
  { threshold: -1 },
] satisfies Partial<HistoryPageEdge>[])
  test(`invalid/empty geometry does not load history: ${JSON.stringify(update)}`, () => {
    const trigger = createHistoryPageTrigger()
    trigger.arm(true)
    expect(trigger.take(edge(update))).toBe(false)
    expect(trigger.take(edge())).toBe(true)
  })

test('late completion on an old reader cannot arm or release a new reader request', () => {
  const previous = createHistoryPageTrigger()
  const current = createHistoryPageTrigger()
  previous.arm(true)
  expect(previous.take(edge())).toBe(true)
  expect(current.take(edge())).toBe(false)
  current.arm(true)
  expect(current.take(edge())).toBe(true)
  previous.settle()
  current.arm(true)
  expect(current.take(edge({ firstMessageId: 'earlier' }))).toBe(false)
  current.settle()
  current.arm(true)
  expect(current.take(edge({ firstMessageId: 'earlier' }))).toBe(true)
})
