import type { SessionTimelineState } from '@hbar/app-runtime'
import type { GoalLifecycleRow } from './goal-lifecycle-model'
import { MAX_CONTEXT_COMPACTION_MARKERS, type ContextCompactionMarker } from '@hbar/contracts/context-history'

export type SessionMessage = SessionTimelineState['messages'][number]
export type SessionMessageBlock = SessionMessage['content'][number]
export type SessionToolCall = Extract<SessionMessageBlock, { type: 'tool_call' }>
export type SessionToolResult = Extract<SessionMessageBlock, { type: 'tool_result' }>

export interface SessionToolRow {
  readonly kind: 'tool'
  readonly id: string
  readonly name: string
  readonly call?: SessionToolCall
  readonly result?: SessionToolResult
}

export type SessionMessageRow =
  | SessionToolRow
  | { readonly kind: 'thinking'; readonly id: string; readonly text: string }
  | { readonly kind: 'text'; readonly id: string; readonly text: string }
  | {
      readonly kind: 'attachment'
      readonly id: string
      readonly block: Extract<SessionMessageBlock, { type: 'image' | 'file' }>
    }

export interface SessionMessageProjection {
  readonly message: SessionMessage
  readonly blocks: readonly SessionMessageBlock[]
  readonly results: readonly SessionToolResult[]
}

export interface GoalContinuationBoundary {
  readonly id: string
  readonly sessionId: string
  readonly runId: string
  readonly status: SessionTimelineState['runs'][number]['status']
  readonly createdAt: number
  /** Placement evidence, never a guessed Goal lifecycle event or continuation number. */
  readonly anchor:
    | { readonly kind: 'message'; readonly messageId: string; readonly seq: number }
    | { readonly kind: 'stream'; readonly streamId: string }
    | { readonly kind: 'run'; readonly createdAt: number }
}

export type SessionTimelineSequenceItem =
  | { readonly kind: 'message'; readonly projection: SessionMessageProjection }
  | { readonly kind: 'stream'; readonly stream: SessionTimelineState['streams'][string] }
  | { readonly kind: 'goalContinuation'; readonly continuation: GoalContinuationBoundary }
  | { readonly kind: 'goalLifecycle'; readonly row: GoalLifecycleRow }
  | { readonly kind: 'contextCompaction'; readonly marker: ContextCompactionMarker }

/**
 * Reuse the paged message projection and persistent continuation identity to mark
 * automatic Goal turns once. An initial Goal kickoff can share source=goal but
 * is not a continuation. Empty input envelopes supply an exact seq anchor but remain
 * hidden. A Run without a message uses its first stream, or its persisted
 * creation time amongst the loaded messages; no current Goal state is consulted.
 * Missing paged-out Runs do not acquire markers and no extra history is fetched.
 */
export function projectSessionTimelineSequence(
  timeline: Pick<SessionTimelineState, 'sessionId' | 'messages' | 'runs' | 'streams' | 'contextCompactions'>,
  goalRows: readonly GoalLifecycleRow[] = [],
): readonly SessionTimelineSequenceItem[] {
  const sessionId = timeline.sessionId
  if (!sessionId) return []
  const uniqueMessages = new Map<string, SessionMessage>()
  for (const message of timeline.messages)
    if (message.sessionId === sessionId && !uniqueMessages.has(message.id)) uniqueMessages.set(message.id, message)
  const rawMessages = [...uniqueMessages.values()].sort((left, right) => left.seq - right.seq)
  const projections = projectSessionMessages(rawMessages)
  const streams = Object.values(timeline.streams).filter((stream) => stream.sessionId === sessionId)
  const firstMessageByRun = new Map<string, SessionMessage>()
  for (const message of rawMessages)
    if (!firstMessageByRun.has(message.runId)) firstMessageByRun.set(message.runId, message)
  const firstStreamByRun = new Map<string, number>()
  for (const [index, stream] of streams.entries())
    if (!firstStreamByRun.has(stream.runId)) firstStreamByRun.set(stream.runId, index)
  const buckets = new Map<number, GoalContinuationBoundary[]>()
  const seenRuns = new Set<string>()
  for (const run of timeline.runs) {
    if (run.sessionId !== sessionId || seenRuns.has(run.id)) continue
    seenRuns.add(run.id)
    if (run.input.source !== 'goal' || !run.input.continuation) continue
    const message = firstMessageByRun.get(run.id)
    const streamIndex = firstStreamByRun.get(run.id)
    const stream = streamIndex === undefined ? undefined : streams[streamIndex]
    const anchor: GoalContinuationBoundary['anchor'] = message
      ? { kind: 'message', messageId: message.id, seq: message.seq }
      : stream
        ? { kind: 'stream', streamId: stream.id }
        : { kind: 'run', createdAt: run.createdAt }
    const following = message
      ? projections.findIndex((item) => item.message.seq >= message.seq)
      : streamIndex === undefined
        ? projections.findIndex((item) => item.message.createdAt > run.createdAt)
        : -1
    const index = following >= 0 ? following : projections.length + (streamIndex ?? 0)
    const boundary: GoalContinuationBoundary = {
      id: `goal-continuation:${JSON.stringify([sessionId, run.id])}`,
      sessionId,
      runId: run.id,
      status: run.status,
      createdAt: run.createdAt,
      anchor,
    }
    buckets.set(index, [...(buckets.get(index) ?? []), boundary])
  }
  const source: SessionTimelineSequenceItem[] = [
    ...projections.map((projection): SessionTimelineSequenceItem => ({ kind: 'message', projection })),
    ...streams.map((stream): SessionTimelineSequenceItem => ({ kind: 'stream', stream })),
  ]
  const result: SessionTimelineSequenceItem[] = []
  for (let index = 0; index <= source.length; index += 1) {
    const boundaries = buckets.get(index) ?? []
    boundaries.sort((left, right) => {
      if (left.anchor.kind === 'message' && right.anchor.kind === 'message')
        return left.anchor.seq - right.anchor.seq || left.runId.localeCompare(right.runId)
      return left.createdAt - right.createdAt || left.runId.localeCompare(right.runId)
    })
    result.push(
      ...boundaries.map((continuation): SessionTimelineSequenceItem => ({ kind: 'goalContinuation', continuation })),
    )
    const item = source[index]
    if (item) result.push(item)
  }
  // Goal lifecycle has canonical session seq, unlike uncommitted streams. Keep
  // its exact order against messages and empty-envelope continuation anchors.
  // Unanchored Run markers retain their existing placement; they cannot invent
  // a Goal sequence or lifecycle event. Remaining committed facts precede streams.
  const compactions = new Map<string, ContextCompactionMarker>()
  for (const marker of timeline.contextCompactions ?? [])
    if (marker.sessionId === sessionId && !compactions.has(marker.id)) compactions.set(marker.id, marker)
  const pending = [
    ...goalRows
      .filter((row) => row.sessionId === sessionId)
      .map((row) => ({
        seq: row.seq,
        time: row.time,
        item: { kind: 'goalLifecycle', row } satisfies SessionTimelineSequenceItem,
      })),
    ...[...compactions.values()]
      .sort((a, b) => a.seq - b.seq)
      .slice(-MAX_CONTEXT_COMPACTION_MARKERS)
      .map((marker) => ({
        seq: marker.seq,
        time: marker.time,
        item: { kind: 'contextCompaction', marker } satisfies SessionTimelineSequenceItem,
      })),
  ].sort((a, b) => a.seq - b.seq)
  const merged: SessionTimelineSequenceItem[] = []
  let goalIndex = 0
  const emitThrough = (seq: number) => {
    while (goalIndex < pending.length && pending[goalIndex]!.seq <= seq) merged.push(pending[goalIndex++]!.item)
  }
  for (const [index, item] of result.entries()) {
    if (item.kind === 'message') emitThrough(item.projection.message.seq)
    else if (item.kind === 'goalContinuation' && item.continuation.anchor.kind === 'message')
      emitThrough(item.continuation.anchor.seq)
    else if (item.kind === 'stream' || (item.kind === 'goalContinuation' && item.continuation.anchor.kind === 'stream'))
      emitThrough(Infinity)
    else if (item.kind === 'goalContinuation' && item.continuation.anchor.kind === 'run') {
      const following = result
        .slice(index + 1)
        .find(
          (next) =>
            next.kind === 'message' ||
            (next.kind === 'goalContinuation' && next.continuation.anchor.kind === 'message'),
        )
      const ceiling =
        following?.kind === 'message'
          ? following.projection.message.seq
          : following?.kind === 'goalContinuation' && following.continuation.anchor.kind === 'message'
            ? following.continuation.anchor.seq
            : Infinity
      // Only the unanchored Run's existing time fallback uses time. Goal facts
      // remain in canonical seq order and cannot cross the next message anchor.
      while (
        goalIndex < pending.length &&
        pending[goalIndex]!.seq < ceiling &&
        pending[goalIndex]!.time <= item.continuation.createdAt
      )
        merged.push(pending[goalIndex++]!.item)
    }
    merged.push(item)
  }
  emitThrough(Infinity)
  return merged
}

function toolKey(block: SessionToolCall | SessionToolResult): string {
  return JSON.stringify([block.callId, block.name])
}

/** Results match the call ID AND name; orphan results remain readable. First duplicates win. */
export function buildMessageRows(
  blocks: readonly SessionMessageBlock[],
  suppliedResults: readonly SessionToolResult[] = [],
): readonly SessionMessageRow[] {
  const results = new Map<string, SessionToolResult>()
  const calls = new Set<string>()
  for (const block of blocks) if (block.type === 'tool_call') calls.add(toolKey(block))
  for (const block of [...blocks, ...suppliedResults]) {
    if (block.type === 'tool_result' && !results.has(toolKey(block))) results.set(toolKey(block), block)
  }
  const emitted = new Set<string>()
  return blocks.flatMap((block, index): SessionMessageRow[] => {
    if (block.type === 'text' || block.type === 'thinking') {
      return block.text.trim() ? [{ kind: block.type, id: `${block.type}:${index}`, text: block.text }] : []
    }
    if (block.type === 'file' || block.type === 'image') {
      return [{ kind: 'attachment', id: `${block.type}:${index}`, block }]
    }
    const key = toolKey(block)
    if (emitted.has(key) || (block.type === 'tool_result' && calls.has(key))) return []
    emitted.add(key)
    const result = results.get(key)
    return [
      {
        kind: 'tool',
        id: key,
        name: block.name,
        ...(block.type === 'tool_call' ? { call: block } : {}),
        ...(result ? { result } : {}),
      },
    ]
  })
}

/**
 * Project the already paged timeline in O(blocks), without retaining a second
 * history. Cross-message results only join calls in the same session AND run.
 * A page with an absent call keeps its orphan result; loading older messages may
 * then move that result under its call. Unrelated text is never removed.
 */
export function projectSessionMessages(messages: readonly SessionMessage[]): readonly SessionMessageProjection[] {
  const unique = new Map<string, SessionMessage>()
  for (const message of messages) {
    const key = JSON.stringify([message.sessionId, message.id])
    if (!unique.has(key)) unique.set(key, message)
  }
  const calls = new Map<string, string>()
  const results = new Map<string, SessionToolResult>()
  const scoped = (message: SessionMessage, block: SessionToolCall | SessionToolResult) =>
    JSON.stringify([message.sessionId, message.runId, block.callId, block.name])
  for (const message of unique.values()) {
    for (const block of message.content) {
      if (block.type === 'tool_call' && !calls.has(scoped(message, block)))
        calls.set(scoped(message, block), message.id)
      if (block.type === 'tool_result' && !results.has(scoped(message, block)))
        results.set(scoped(message, block), block)
    }
  }
  return [...unique.values()].flatMap((message) => {
    const blocks = message.content.filter(
      (block) =>
        block.type !== 'tool_result' ||
        !calls.has(scoped(message, block)) ||
        calls.get(scoped(message, block)) === message.id,
    )
    // An empty Goal-continuation envelope is a Run fact, not a blank human message.
    if (
      !blocks.some((block) => (block.type === 'text' || block.type === 'thinking' ? Boolean(block.text.trim()) : true))
    )
      return []
    const paired = blocks.flatMap((block) => {
      if (block.type !== 'tool_call') return []
      const result = results.get(scoped(message, block))
      return result ? [result] : []
    })
    return [{ message, blocks, results: paired }]
  })
}

export function thinkingPreview(text: string, streaming: boolean): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^(?:#{1,6}|[-*+>]|\d+\.)\s+/, ''))
    .filter(Boolean)
  const preview = (streaming ? lines.at(-1) : lines[0]) ?? ''
  return preview
}

/** Unknown tools keep a safe text fallback; cyclic/non-JSON inputs never crash the transcript. */
export function toolInputText(input: unknown, unavailable: string): string {
  try {
    return JSON.stringify(input, null, 2) ?? unavailable
  } catch {
    return unavailable
  }
}
