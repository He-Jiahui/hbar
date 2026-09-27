import type { MessageClipboardPort } from './message-copy'

/** Local clipboard budget in UTF-16 code units, independent of any displayed code window. */
export const MAX_CODE_BLOCK_COPY_CHARACTERS = 1_000_000

export interface CodeBlockCopyTarget {
  readonly sessionId: string
  readonly messageId: string
  readonly segmentId: string
  readonly occurrenceId: string
}

export interface CodeBlockCopyInput extends CodeBlockCopyTarget {
  /** Complete already-parsed code body, without renderer chrome or Markdown fences. */
  readonly text: string
}

export interface CodeBlockCopyResult extends CodeBlockCopyTarget {
  readonly status: 'copied' | 'empty' | 'unavailable' | 'failed' | 'too_large'
}

/**
 * Copy exactly the supplied parsed body and return its original source identity.
 * The caller owns parsing and whether a late receipt still belongs to its view;
 * this helper does not read active state, transform text, or retain a cache.
 */
export async function copyCodeBlockText(
  input: CodeBlockCopyInput,
  clipboard: MessageClipboardPort | null,
): Promise<CodeBlockCopyResult> {
  const target: CodeBlockCopyTarget = {
    sessionId: input.sessionId,
    messageId: input.messageId,
    segmentId: input.segmentId,
    occurrenceId: input.occurrenceId,
  }
  const text = input.text
  // Capacity precedes the scan and platform call; never allocate a truncated or
  // UTF-8-encoded substitute merely to decide whether this input is allowed.
  if (text.length > MAX_CODE_BLOCK_COPY_CHARACTERS) return { ...target, status: 'too_large' }
  if (!/\S/u.test(text)) return { ...target, status: 'empty' }
  if (!clipboard) return { ...target, status: 'unavailable' }
  try {
    await clipboard.writeText(text)
    return { ...target, status: 'copied' }
  } catch {
    return { ...target, status: 'failed' }
  }
}
