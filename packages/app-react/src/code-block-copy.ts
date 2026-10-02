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
  readonly status: CodeTextCopyStatus
}

export type CodeTextCopyStatus = 'copied' | 'empty' | 'unavailable' | 'failed' | 'too_large'

/** Shared local write policy; callers own their message or file lifetime. */
export async function copyCodeText(text: string, clipboard: MessageClipboardPort | null): Promise<CodeTextCopyStatus> {
  if (text.length > MAX_CODE_BLOCK_COPY_CHARACTERS) return 'too_large'
  if (!/\S/u.test(text)) return 'empty'
  if (!clipboard) return 'unavailable'
  try {
    await clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
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
  return { ...target, status: await copyCodeText(input.text, clipboard) }
}
