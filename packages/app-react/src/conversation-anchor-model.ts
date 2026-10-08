import type { ConversationReadingPosition, SessionTimelineState } from '@hbar/app-runtime'

/** The timeline owns its 1,000-message bound; the rail renders one short page. */
export const CONVERSATION_ANCHOR_PAGE_SIZE = 24
export const CONVERSATION_ANCHOR_MAX_MESSAGES = 1_000
const MAX_PREVIEW_SOURCE = 2_048
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

export interface ConversationAnchor {
  readonly messageId: string
  readonly seq: number
  readonly title: string
  readonly preview: string
  readonly attachments: number
}

/** Bounded plain text, preserving Chinese and whole emoji clusters. Never renders markup. */
export function conversationAnchorText(value: string, limit: number): string {
  const text = value.slice(0, MAX_PREVIEW_SOURCE).replace(/\s+/gu, ' ').trim()
  let result = ''
  let count = 0
  for (const { segment, index } of segmenter.segment(text)) {
    // A source cap can fall inside a grapheme. Omit its last cluster rather
    // than displaying a broken surrogate or half of a joined emoji.
    if (value.length > MAX_PREVIEW_SOURCE && index + segment.length === text.length) return `${result}…`
    if (count++ >= limit) return `${result}…`
    result += segment
  }
  return value.length > MAX_PREVIEW_SOURCE ? `${result}…` : result
}

function messageText(message: SessionTimelineState['messages'][number]): string {
  let text = ''
  for (const block of message.content) {
    if (block.type !== 'text') continue
    text += `${text ? ' ' : ''}${block.text.slice(0, MAX_PREVIEW_SOURCE + 1 - text.length)}`
    if (text.length > MAX_PREVIEW_SOURCE) break
  }
  return text
}

export function projectConversationAnchors(
  timeline: Pick<SessionTimelineState, 'sessionId' | 'messages' | 'runs'>,
): readonly ConversationAnchor[] {
  if (!timeline.sessionId) return []
  const runs = new Map(timeline.runs.filter((run) => run.sessionId === timeline.sessionId).map((run) => [run.id, run]))
  const unique = new Map<string, SessionTimelineState['messages'][number]>()
  for (const message of timeline.messages)
    if (message.sessionId === timeline.sessionId && !unique.has(message.id)) unique.set(message.id, message)
  const messages = [...unique.values()]
    .sort((left, right) => left.seq - right.seq)
    .slice(-CONVERSATION_ANCHOR_MAX_MESSAGES)
  const anchors: ConversationAnchor[] = []
  for (const message of messages) {
    if (message.role === 'user') {
      const run = runs.get(message.runId)
      const attachments = message.content.filter((block) => block.type === 'image' || block.type === 'file')
      const title = conversationAnchorText(messageText(message), 160)
      if (!title && !attachments.length) continue
      // A human guide is committed under the active Run, including Goal Runs.
      // Exclude that Run's generated envelope, rather than every later user message.
      const envelope = message.content.length === 1 ? message.content[0] : undefined
      if (
        run?.input.source &&
        run.input.source !== 'user' &&
        envelope?.type === 'text' &&
        envelope.text === run.input.text
      )
        continue
      anchors.push({ messageId: message.id, seq: message.seq, title, preview: '', attachments: attachments.length })
    } else if (message.role === 'assistant') {
      const previous = anchors.at(-1)
      const preview = conversationAnchorText(messageText(message), 280)
      // The last authored answer is useful even when intermediate tool/commentary turns exist.
      if (previous && preview) anchors[anchors.length - 1] = { ...previous, preview }
    }
  }
  return anchors
}

export function currentConversationAnchor(
  anchors: readonly ConversationAnchor[],
  messages: SessionTimelineState['messages'],
  position: ConversationReadingPosition | null,
): string | null {
  if (!anchors.length) return null
  if (!position || position.atEnd) return anchors.at(-1)?.messageId ?? null
  const seq = messages.find((message) => message.id === position.messageId)?.seq
  if (seq === undefined) return null
  return anchors.findLast((anchor) => anchor.seq <= seq)?.messageId ?? null
}

export function conversationAnchorPage(
  anchors: readonly ConversationAnchor[],
  activeId: string | null,
  firstId: string | null = null,
) {
  const requested = firstId ? anchors.findIndex((anchor) => anchor.messageId === firstId) : -1
  const active = anchors.findIndex((anchor) => anchor.messageId === activeId)
  const start =
    requested >= 0
      ? requested
      : Math.floor(Math.max(0, active) / CONVERSATION_ANCHOR_PAGE_SIZE) * CONVERSATION_ANCHOR_PAGE_SIZE
  return {
    start,
    items: anchors.slice(start, start + CONVERSATION_ANCHOR_PAGE_SIZE),
    previousId: anchors[Math.max(0, start - CONVERSATION_ANCHOR_PAGE_SIZE)]?.messageId ?? null,
    hasPrevious: start > 0,
    nextId: anchors[start + CONVERSATION_ANCHOR_PAGE_SIZE]?.messageId ?? null,
  }
}
