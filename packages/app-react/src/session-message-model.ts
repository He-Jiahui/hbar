import type { SessionTimelineState } from '@hbar/app-runtime'

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
  return preview.length > 160 ? `${preview.slice(0, 160)}…` : preview
}

/** Unknown tools keep a safe text fallback; cyclic/non-JSON inputs never crash the transcript. */
export function toolInputText(input: unknown, unavailable: string): string {
  try {
    return JSON.stringify(input, null, 2) ?? unavailable
  } catch {
    return unavailable
  }
}
