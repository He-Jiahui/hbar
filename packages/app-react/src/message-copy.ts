import type { SessionTimelineState } from '@hbar/app-runtime'

type MessageContent = SessionTimelineState['messages'][number]['content']

export interface MessageClipboardPort {
  writeText(text: string): Promise<void>
}

export interface MessageCopyInput {
  readonly sessionId: string
  readonly messageId: string
  readonly content: MessageContent
}

export interface MessageCopyResult {
  readonly sessionId: string
  readonly messageId: string
  readonly status: 'copied' | 'empty' | 'unavailable' | 'failed'
}

/** Copy the authored reply, never hidden reasoning, tool payloads or artifact metadata. */
export function messageCopyText(content: MessageContent): string {
  return content.flatMap((block) => (block.type === 'text' && block.text.trim() ? [block.text] : [])).join('\n\n')
}

/**
 * The caller supplies its platform clipboard and renders localized feedback next
 * to the originating message. A receipt is successful only after writeText
 * resolves, and always names the captured session/message rather than a later
 * active selection. Clipboard errors must not leak browser exception text into UI.
 */
export async function copyMessageText(
  input: MessageCopyInput,
  clipboard: MessageClipboardPort | null,
): Promise<MessageCopyResult> {
  const target = { sessionId: input.sessionId, messageId: input.messageId }
  const text = messageCopyText(input.content)
  if (!text.trim()) return { ...target, status: 'empty' }
  if (!clipboard) return { ...target, status: 'unavailable' }
  try {
    await clipboard.writeText(text)
    return { ...target, status: 'copied' }
  } catch {
    return { ...target, status: 'failed' }
  }
}
