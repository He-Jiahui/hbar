import type { SessionMessageBlock } from './session-message-model'

export interface ConversationSelectionSubmission {
  readonly sessionId: string
  readonly messageId: string
  readonly expectedText: string
  readonly quote: string
  readonly expectedRevision: number
}

export type ConversationSelectionQuoteProblem = 'EMPTY_SELECTION' | 'INPUT_TOO_LARGE'

export interface ConversationSelectionRect {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

export interface ConversationSelectionMenuPosition {
  readonly left: number
  readonly top: number
}

export function intersectConversationSelectionRects(
  rect: ConversationSelectionRect,
  clip: ConversationSelectionRect,
): ConversationSelectionRect | null {
  const intersection = {
    left: Math.max(rect.left, clip.left),
    top: Math.max(rect.top, clip.top),
    right: Math.min(rect.right, clip.right),
    bottom: Math.min(rect.bottom, clip.bottom),
  }
  return intersection.right > intersection.left && intersection.bottom > intersection.top ? intersection : null
}

/** Place only inside the visible transcript pane; a too-small pane gets no menu. */
export function conversationSelectionMenuPosition(
  anchor: ConversationSelectionRect,
  bounds: ConversationSelectionRect,
  menu: { readonly width: number; readonly height: number },
): ConversationSelectionMenuPosition | null {
  const boundsWidth = bounds.right - bounds.left
  const boundsHeight = bounds.bottom - bounds.top
  if (
    menu.width <= 0 ||
    menu.height <= 0 ||
    boundsWidth <= 0 ||
    boundsHeight <= 0 ||
    menu.width > boundsWidth ||
    menu.height > boundsHeight
  )
    return null

  const margin = Math.min(8, (boundsWidth - menu.width) / 2, (boundsHeight - menu.height) / 2)
  const minLeft = bounds.left + margin
  const maxLeft = bounds.right - menu.width - margin
  const minTop = bounds.top + margin
  const maxTop = bounds.bottom - menu.height - margin
  const below = anchor.bottom + 10
  const above = anchor.top - 10 - menu.height
  const preferredTop = below <= maxTop ? below : above >= minTop ? above : below

  return {
    left: Math.max(minLeft, Math.min(anchor.left, maxLeft)),
    top: Math.max(minTop, Math.min(preferredTop, maxTop)),
  }
}

/** Keep the exact canonical authored-text snapshot used by Runtime stale-message validation. */
export function conversationMessageExpectedText(blocks: readonly SessionMessageBlock[]): string {
  return blocks
    .filter((block): block is Extract<SessionMessageBlock, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('\n\n')
}

export function conversationSelectionQuoteProblem(
  quote: string,
  maxLength: number,
): ConversationSelectionQuoteProblem | null {
  const trimmed = quote.trim()
  if (!trimmed) return 'EMPTY_SELECTION'
  if (trimmed.length > maxLength) return 'INPUT_TOO_LARGE'
  return null
}

/** Build only the typed draft action payload; this is not a second draft or message store. */
export function conversationSelectionSubmission(input: {
  readonly sessionId: string
  readonly messageId: string
  readonly expectedText: string
  readonly quote: string
  readonly expectedRevision: number
  readonly maxQuoteLength: number
}): ConversationSelectionSubmission | null {
  const quote = input.quote.trim()
  if (
    !input.sessionId ||
    !input.messageId ||
    !input.expectedText.trim() ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    conversationSelectionQuoteProblem(quote, input.maxQuoteLength)
  )
    return null
  return {
    sessionId: input.sessionId,
    messageId: input.messageId,
    expectedText: input.expectedText,
    quote,
    expectedRevision: input.expectedRevision,
  }
}

export function isConversationSelectionKeyboardKey(input: {
  readonly key: string
  readonly shiftKey: boolean
  readonly isComposing: boolean
  readonly editing: boolean
}): boolean {
  return (
    input.shiftKey &&
    !input.isComposing &&
    !input.editing &&
    ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(input.key)
  )
}
