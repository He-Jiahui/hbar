import type { MessageClipboardPort } from './message-copy'

/** Local clipboard budget in UTF-16 code units, not a Host payload or display-window limit. */
export const MAX_TOOL_RESULT_COPY_CHARACTERS = 1_000_000

export interface ToolResultCopyTarget {
  readonly sessionId: string
  readonly messageId: string
  readonly callId: string
  readonly toolName: string
}

export interface ToolResultCopyInput extends ToolResultCopyTarget {
  /** The complete already-loaded output, never a displayed preview or placeholder. */
  readonly text: string
}

export interface ToolResultCopyResult extends ToolResultCopyTarget {
  readonly status: 'copied' | 'empty' | 'unavailable' | 'failed' | 'too_large'
}

/**
 * Capture the original tool/output before awaiting the platform clipboard. This
 * helper neither reads other blocks nor retains a cache, and never transforms
 * whitespace, line endings, errors, or long output into a different payload.
 * The view owns whether a returned receipt still belongs to its rendered text.
 */
export async function copyToolResultText(
  input: ToolResultCopyInput,
  clipboard: MessageClipboardPort | null,
): Promise<ToolResultCopyResult> {
  const target: ToolResultCopyTarget = {
    sessionId: input.sessionId,
    messageId: input.messageId,
    callId: input.callId,
    toolName: input.toolName,
  }
  const text = input.text
  // Reject oversized sources before scanning or copying; no UTF-8 allocation,
  // truncation, or fallback clipboard write is needed to determine this bound.
  if (text.length > MAX_TOOL_RESULT_COPY_CHARACTERS) return { ...target, status: 'too_large' }
  if (!/\S/u.test(text)) return { ...target, status: 'empty' }
  if (!clipboard) return { ...target, status: 'unavailable' }
  try {
    await clipboard.writeText(text)
    return { ...target, status: 'copied' }
  } catch {
    return { ...target, status: 'failed' }
  }
}
