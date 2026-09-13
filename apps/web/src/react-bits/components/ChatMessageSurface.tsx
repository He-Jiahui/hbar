import { useState, type ReactNode } from 'react'
import { Check, Copy, FileCode2 } from 'lucide-react'
import type { ContentBlock, Message } from '@hbar/contracts'
import SpotlightCard from '../SpotlightCard'
import GlassSurface from '../GlassSurface'
import { referenceAttributes } from '../production'
import ToolCallSurface, { type ToolCallSurfaceLabels } from './ToolCallSurface'
import ToolResultSurface, { type ToolResultSurfaceLabels } from './ToolResultSurface'

export interface ChatMessageSurfaceLabels extends ToolCallSurfaceLabels, ToolResultSurfaceLabels {
  readonly thinking: string
  readonly you: string
  readonly copyMessage: string
}

export interface ChatMessageSurfaceProps {
  readonly message: Message
  readonly labels: ChatMessageSurfaceLabels
  artifactUrl(id: string): string
  renderMarkdown(text: string): ReactNode
  renderThinking?: ((text: string) => ReactNode) | undefined
  renderCode?: ((value: string) => ReactNode) | undefined
  onCopy?(text: string): void | Promise<void>
}

function MessageBlock({
  block,
  labels,
  artifactUrl,
  renderMarkdown,
  renderThinking,
  renderCode,
}: {
  block: ContentBlock
  labels: ChatMessageSurfaceLabels
  artifactUrl(id: string): string
  renderMarkdown(text: string): ReactNode
  renderThinking?: ((text: string) => ReactNode) | undefined
  renderCode?: ((value: string) => ReactNode) | undefined
}) {
  if (block.type === 'text') return renderMarkdown(block.text)
  if (block.type === 'thinking') {
    return (
      <details className="thinking rb-thinking-surface">
        <GlassSurface className="thinking-glass" width="100%" height="100%" aria-hidden="true" />
        <summary>{labels.thinking}</summary>
        {renderThinking ? renderThinking(block.text) : renderMarkdown(block.text)}
      </details>
    )
  }
  if (block.type === 'image') {
    const url = artifactUrl(block.artifact.id)
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img className="attachment-image" src={url} alt={block.artifact.name} loading="lazy" />
      </a>
    )
  }
  if (block.type === 'file') {
    const url = artifactUrl(block.artifact.id)
    return (
      <a className="attachment-file" href={url} target="_blank" rel="noreferrer">
        <FileCode2 size={15} />
        <span>{block.artifact.name}</span>
      </a>
    )
  }
  if (block.type === 'tool_call') return <ToolCallSurface block={block} labels={labels} />
  return <ToolResultSurface block={block} labels={labels} renderCode={renderCode} />
}

/**
 * ReactBits AI Chat message surface. The adapter supplies complete ordered
 * ContentBlock data and render slots, so text/thinking/media/tool blocks are
 * never flattened or replaced with demo content.
 *
 * Reference: https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-1
 */
export default function ChatMessageSurface({
  message,
  labels,
  artifactUrl,
  renderMarkdown,
  renderThinking,
  renderCode,
  onCopy,
}: ChatMessageSurfaceProps) {
  const [copied, setCopied] = useState(false)
  const text = message.content
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
  const copy = () => {
    if (!onCopy || !text) return
    void Promise.resolve(onCopy(text)).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    })
  }
  return (
    <article
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-1', 'session-chat')}
      className={`message message-${message.role} rb-chat-message-surface`}
      data-message-id={message.id}
    >
      {message.role !== 'tool' && (
        <div className="message-heading">
          <span className={`avatar ${message.role === 'user' ? 'avatar-user' : ''}`}>
            {message.role === 'user' ? 'U' : 'h'}
          </span>
          <span>{message.role === 'user' ? labels.you : 'hbar'}</span>
          <time>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
        </div>
      )}
      {message.role === 'user' ? (
        <SpotlightCard
          className="message-body rb-message-user-surface"
          spotlightColor="color-mix(in srgb, var(--rb-accent) 24%, transparent)"
        >
          {message.content.map((block, index) => (
            <MessageBlock
              key={`${message.id}:${index}`}
              block={block}
              labels={labels}
              artifactUrl={artifactUrl}
              renderMarkdown={renderMarkdown}
              renderThinking={renderThinking}
              renderCode={renderCode}
            />
          ))}
        </SpotlightCard>
      ) : (
        <div className="message-body">
          {message.content.map((block, index) => (
            <MessageBlock
              key={`${message.id}:${index}`}
              block={block}
              labels={labels}
              artifactUrl={artifactUrl}
              renderMarkdown={renderMarkdown}
              renderThinking={renderThinking}
              renderCode={renderCode}
            />
          ))}
        </div>
      )}
      {text && message.role !== 'tool' && (
        <div className="message-actions">
          <button type="button" title={labels.copyMessage} aria-label={labels.copyMessage} onClick={copy}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </div>
      )}
    </article>
  )
}
