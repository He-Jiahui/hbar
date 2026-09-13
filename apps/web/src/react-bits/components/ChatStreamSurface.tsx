import { LoaderCircle } from 'lucide-react'
import type { LiveStream } from '@hbar/contracts'
import GlassSurface from '../GlassSurface'
import { referenceAttributes } from '../production'
import type { ReactNode } from 'react'

export interface ChatStreamSurfaceProps {
  readonly stream: LiveStream
  readonly thinkingLabel: string
  renderMarkdown(text: string): ReactNode
}

/**
 * Streaming assistant surface from the AI Chat reference. The stream is a
 * live protocol snapshot supplied by the host; this component only handles
 * the visual pending state and thinking disclosure.
 *
 * Reference: https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-1
 */
export default function ChatStreamSurface({ stream, thinkingLabel, renderMarkdown }: ChatStreamSurfaceProps) {
  return (
    <article
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-1', 'session-chat')}
      className="message message-assistant rb-chat-stream-surface"
      data-stream-id={stream.id}
    >
      <div className="message-heading">
        <span className="avatar">h</span>
        <span>hbar</span>
        <LoaderCircle size={13} className="spinning" />
      </div>
      <div className="message-body">
        {stream.thinking && (
          <details className="thinking rb-thinking-surface">
            <GlassSurface className="thinking-glass" width="100%" height="100%" aria-hidden="true" />
            <summary>{thinkingLabel}</summary>
            {renderMarkdown(stream.thinking)}
          </details>
        )}
        {renderMarkdown(stream.text)}
      </div>
    </article>
  )
}
