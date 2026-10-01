import type { Message } from '@hbar/contracts'

/**
 * A steering message that has been acknowledged by the driver.
 *
 * `insertionAfterSeq` is captured when the driver receives the message. It is
 * deliberately independent from the message's own canonical sequence: a
 * queued message may be committed while an assistant response is still in
 * flight, so its canonical sequence can precede that response.
 */
export interface SteeringDelivery {
  readonly message: Message
  readonly insertionAfterSeq: number
}

export interface RunSteeringContext {
  readonly runId: string
  readonly initialUserMessageId: string
  readonly deliveries: readonly SteeringDelivery[]
}

interface DeliveryEntry {
  readonly message: Message
  readonly insertionAfterSeq: number
  readonly order: number
}

interface ToolPairRange {
  readonly start: number
  /** Exclusive end of the assistant/tool-result causal group. */
  readonly end: number
}

/**
 * Builds the provider-visible history for a Run with live steering.
 *
 * Canonical history is the source of truth, but a consumed steering message
 * can have a lower journal sequence than the assistant/tool group that was in
 * flight when it was accepted. The delivery boundary therefore controls its
 * provider position. Current-Run user messages other than the initial prompt
 * are steering candidates; only acknowledged candidates are included.
 *
 * The function is pure: it does not mutate the canonical messages, delivery
 * records, or any Message object. A delivery record also makes a message
 * survive context compaction when its canonical row is no longer present.
 */
export function buildSteeringContext(messages: readonly Message[], options: RunSteeringContext): Message[] {
  const canonical = [...messages].sort((left, right) => left.seq - right.seq)
  const steeringCandidateIds = new Set(
    canonical
      .filter(
        (message) =>
          message.runId === options.runId && message.role === 'user' && message.id !== options.initialUserMessageId,
      )
      .map((message) => message.id),
  )

  // Exclude every candidate from the canonical sequence first. This prevents
  // an unconsumed guide from leaking into the next provider request and also
  // prevents a consumed guide from being emitted twice when it is reinserted.
  const base = canonical.filter((message) => !steeringCandidateIds.has(message.id))
  const canonicalById = new Map(canonical.map((message) => [message.id, message]))
  // Compaction may remove the initial row from a caller-owned snapshot. Any
  // remaining canonical row still identifies the Session for delivery checks.
  const expectedSessionId =
    canonical.find((message) => message.id === options.initialUserMessageId)?.sessionId ?? canonical[0]?.sessionId
  const deliveries = collectDeliveries(options, canonicalById, expectedSessionId)
  if (deliveries.length === 0) return base

  const initialIndex = base.findIndex((message) => message.id === options.initialUserMessageId)
  const minimumIndex = initialIndex >= 0 ? initialIndex + 1 : 0
  const pairRanges = findToolPairRanges(base)
  const buckets = new Map<number, Message[]>()

  for (const delivery of deliveries) {
    const candidateIndex = insertionIndexAfterSeq(base, delivery.insertionAfterSeq)
    const safeIndex = safeInsertionIndex(base, Math.max(candidateIndex, minimumIndex), pairRanges)
    const bucket = buckets.get(safeIndex)
    if (bucket) bucket.push(delivery.message)
    else buckets.set(safeIndex, [delivery.message])
  }

  const result: Message[] = []
  for (let index = 0; index <= base.length; index++) {
    const inserted = buckets.get(index)
    if (inserted) result.push(...inserted)
    const message = base[index]
    if (message) result.push(message)
  }
  return result
}

function collectDeliveries(
  options: RunSteeringContext,
  canonicalById: ReadonlyMap<string, Message>,
  expectedSessionId: string | undefined,
): DeliveryEntry[] {
  const seen = new Set<string>()
  const deliveries: DeliveryEntry[] = []
  for (const [order, delivery] of options.deliveries.entries()) {
    const message = canonicalById.get(delivery.message.id) ?? delivery.message
    if (
      seen.has(message.id) ||
      (expectedSessionId !== undefined && message.sessionId !== expectedSessionId) ||
      message.runId !== options.runId ||
      message.role !== 'user' ||
      message.id === options.initialUserMessageId ||
      !Number.isFinite(delivery.insertionAfterSeq)
    )
      continue
    seen.add(message.id)
    deliveries.push({ message, insertionAfterSeq: delivery.insertionAfterSeq, order })
  }
  deliveries.sort(
    (left, right) =>
      left.insertionAfterSeq - right.insertionAfterSeq ||
      left.message.seq - right.message.seq ||
      left.order - right.order,
  )
  return deliveries
}

function insertionIndexAfterSeq(messages: readonly Message[], afterSeq: number): number {
  let index = 0
  while (index < messages.length && (messages[index]?.seq ?? 0) <= afterSeq) index++
  return index
}

function safeInsertionIndex(
  messages: readonly Message[],
  requestedIndex: number,
  pairRanges: readonly ToolPairRange[],
): number {
  let index = requestedIndex
  for (const range of pairRanges) {
    if (range.start < index && index < range.end) index = range.end
  }
  return Math.min(index, messages.length)
}

function findToolPairRanges(messages: readonly Message[]): ToolPairRange[] {
  const ranges: ToolPairRange[] = []
  for (let start = 0; start < messages.length; start++) {
    const assistant = messages[start]
    if (assistant?.role !== 'assistant') continue
    const callIds = new Set(assistant.content.flatMap((block) => (block.type === 'tool_call' ? [block.callId] : [])))
    if (callIds.size === 0) continue

    let end = start + 1
    while (end < messages.length) {
      const next = messages[end]
      if (next?.role !== 'tool') break
      const belongsToAssistant = next.content.some((block) => block.type === 'tool_result' && callIds.has(block.callId))
      if (!belongsToAssistant) break
      end++
    }
    if (end > start + 1) ranges.push({ start, end })
  }
  return ranges
}
