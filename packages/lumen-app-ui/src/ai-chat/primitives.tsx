'use client'

import * as React from 'react'
import { ArrowUp, Check, ChevronDown, Copy, FileText, Paperclip, RotateCcw, Sparkles, X } from 'lucide-react'
import LumenSurface from '../LumenSurface'
import type { LumenAiChatAction } from '../ai-chat'
import type {
  LumenAiChatReferenceBaseContent,
  LumenAiChatReferenceChoice,
  LumenAiChatReferenceComposer,
  LumenAiChatReferenceDisclosure,
  LumenAiChatReferenceFrameProps,
  LumenAiChatReferenceViewModel,
} from './reference-content'
import './primitives.css'

export function uniqueReferenceItems<Item extends { readonly id: string }>(items: readonly Item[]): Item[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id.trim() || seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}
export function ReferenceFrame({ content, variantId, className, children }: LumenAiChatReferenceFrameProps) {
  return (
    <LumenSurface
      as="section"
      boundary="horizontal"
      className="lumen-ai-chat-reference-surface"
      contentClassName={`lumen-ai-chat-reference ${className ?? ''}`}
      data-hbar-app-ui-component={variantId}
      data-lumen-component="ai-chat"
      data-lumen-variant={content.variant}
      data-hbar-app-ui-region="chat"
      data-hbar-app-ui-list-strategy={content.listStrategy.kind}
      data-list-strategy={content.listStrategy.kind}
    >
      {children}
      {content.notice ? (
        <p role="status" className="lumen-ai-chat-reference-notice">
          {content.notice}
        </p>
      ) : null}
    </LumenSurface>
  )
}
function Disclosure({ item }: { readonly item: LumenAiChatReferenceDisclosure }) {
  const [expanded, setExpanded] = React.useState(false)
  const id = React.useId()
  return (
    <div className="lumen-ai-chat-reference-disclosure">
      <button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>
        <ChevronDown aria-hidden="true" className="lumen-ai-chat-reference-icon" />
        <span>{item.label}</span>
        {item.status ? <small>{item.status}</small> : null}
      </button>
      {expanded ? <p id={id}>{item.body}</p> : null}
    </div>
  )
}
export function ReferenceMessages({
  content,
  onAction,
  onSourceSelect,
  assistantGlyph = false,
}: {
  readonly content: LumenAiChatReferenceBaseContent
  readonly onAction?: ((event: LumenAiChatAction) => void) | undefined
  readonly onSourceSelect?: ((id: string) => void) | undefined
  readonly assistantGlyph?: boolean | undefined
}) {
  const messages = uniqueReferenceItems(content.messages)
  return (
    <div className="lumen-ai-chat-reference-messages" data-hbar-app-ui-region="messages">
      {messages.length === 0 ? (
        <p>{content.labels.empty}</p>
      ) : (
        messages.map((message) => (
          <article
            key={message.id}
            data-side={message.side}
            data-message-id={message.id}
            className="lumen-ai-chat-reference-message"
          >
            {assistantGlyph && message.side === 'assistant' ? (
              <Sparkles aria-hidden="true" className="lumen-ai-chat-reference-icon" />
            ) : null}
            <div className="lumen-ai-chat-reference-message-body">
              {message.author ? <strong className="lumen-ai-chat-reference-author">{message.author}</strong> : null}
              {uniqueReferenceItems(message.disclosures ?? []).map((item) => (
                <Disclosure key={item.id} item={item} />
              ))}
              <p>
                {message.parts.map((part, index) =>
                  part.kind === 'text' ? (
                    <React.Fragment key={index}>{part.text}</React.Fragment>
                  ) : (
                    <button
                      key={`${part.sourceId}-${index}`}
                      type="button"
                      className="lumen-ai-chat-reference-citation"
                      onClick={() => {
                        onSourceSelect?.(part.sourceId)
                        onAction?.({ actionId: 'source-select', value: part.sourceId })
                      }}
                    >
                      {part.label}
                    </button>
                  ),
                )}
              </p>
              {message.sourceTags?.length ? (
                <p className="lumen-ai-chat-reference-source-tags">
                  <span>{content.labels.sources}</span>
                  {message.sourceTags.map((tag, index) => (
                    <span key={index}>{tag}</span>
                  ))}
                </p>
              ) : null}
              {message.artifact ? (
                <button
                  type="button"
                  className="lumen-ai-chat-reference-artifact-link"
                  onClick={() => onAction?.({ actionId: 'artifact-open', value: message.artifact?.id })}
                >
                  <FileText aria-hidden="true" className="lumen-ai-chat-reference-icon" />
                  <span>
                    {message.artifact.label}
                    <small>{content.labels.openArtifact}</small>
                  </span>
                </button>
              ) : null}
              {message.regenerate || message.copy ? (
                <div className="lumen-ai-chat-reference-reply-actions">
                  {message.regenerate ? (
                    <button type="button" onClick={() => onAction?.({ actionId: 'regenerate', value: message.id })}>
                      <RotateCcw aria-hidden="true" className="lumen-ai-chat-reference-icon" />
                      {content.labels.regenerate}
                    </button>
                  ) : null}
                  {message.copy ? (
                    <button
                      type="button"
                      aria-label={content.labels.copy}
                      title={content.labels.copy}
                      onClick={() => onAction?.({ actionId: 'copy-reply', value: message.id })}
                    >
                      <Copy aria-hidden="true" className="lumen-ai-chat-reference-icon" />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </article>
        ))
      )}
    </div>
  )
}
export function ReferenceComposer({
  composer,
  onDraftChange,
  onRemoveAttachment,
  onAction,
  children,
}: {
  readonly composer: LumenAiChatReferenceComposer
  readonly onDraftChange?: LumenAiChatReferenceViewModel['onDraftChange'] | undefined
  readonly onRemoveAttachment?: LumenAiChatReferenceViewModel['onRemoveAttachment'] | undefined
  readonly onAction?: ((event: LumenAiChatAction) => void) | undefined
  readonly children?: React.ReactNode
}) {
  return (
    <form
      className="lumen-ai-chat-reference-composer"
      data-hbar-app-ui-region="composer"
      onSubmit={(event) => {
        event.preventDefault()
        if (composer.draft.trim()) {
          onAction?.({ actionId: 'send', value: composer.draft })
        }
      }}
    >
      {composer.attachments.length ? (
        <div className="lumen-ai-chat-reference-attachments">
          {uniqueReferenceItems(composer.attachments).map((item) => (
            <span key={item.id}>
              <Paperclip aria-hidden="true" className="lumen-ai-chat-reference-icon" />
              {item.label}
              <button
                type="button"
                aria-label={composer.labels.remove(item.label)}
                onClick={() => onRemoveAttachment?.(item.id)}
              >
                <X aria-hidden="true" className="lumen-ai-chat-reference-icon" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <textarea
        rows={2}
        value={composer.draft}
        aria-label={composer.labels.input}
        placeholder={composer.labels.placeholder}
        readOnly={!onDraftChange}
        onChange={(event) => onDraftChange?.(event.currentTarget.value)}
      />
      <div className="lumen-ai-chat-reference-composer-actions">
        {children}
        {composer.labels.attach ? (
          <button
            type="button"
            aria-label={composer.labels.attach}
            title={composer.labels.attach}
            onClick={() => onAction?.({ actionId: 'attach-request' })}
          >
            <Paperclip aria-hidden="true" className="lumen-ai-chat-reference-icon" />
          </button>
        ) : null}
        <button
          type="submit"
          className="lumen-ai-chat-reference-send"
          disabled={!composer.draft.trim()}
          aria-label={composer.labels.send}
          title={composer.labels.send}
        >
          <ArrowUp aria-hidden="true" className="lumen-ai-chat-reference-icon" />
        </button>
      </div>
    </form>
  )
}
export function ReferenceModelMenu({
  choices,
  selectedId,
  label,
  onSelect,
  anchor,
}: {
  readonly choices: readonly LumenAiChatReferenceChoice[]
  readonly selectedId: string
  readonly label: string
  readonly onSelect?: ((id: string) => void) | undefined
  readonly anchor: 'above' | 'below'
}) {
  const [open, setOpen] = React.useState(false)
  const trigger = React.useRef<HTMLButtonElement>(null)
  const menu = React.useRef<HTMLDivElement>(null)
  const id = React.useId()
  const items = uniqueReferenceItems(choices)
  const selected = items.find((item) => item.id === selectedId) ?? items[0]
  React.useEffect(() => {
    if (open) {
      const target =
        menu.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]') ??
        menu.current?.querySelector<HTMLButtonElement>('button')
      target?.focus()
    }
  }, [open])
  // Keyboard events bubble from the native trigger/options to their owning group.
  const anchorEvents: React.HTMLAttributes<HTMLDivElement> = {
    onBlur: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        setOpen(false)
      }
    },
    onKeyDown: (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
      if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        const options = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])
        const current = options.findIndex((item) => item === event.target)
        let index = (current + (event.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length
        if (event.key === 'Home') {
          index = 0
        }
        if (event.key === 'End') {
          index = options.length - 1
        }
        options[index]?.focus()
      }
    },
  }
  return (
    <div className="lumen-ai-chat-reference-model-anchor" {...anchorEvents}>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        disabled={!items.length}
        onClick={() => setOpen(!open)}
      >
        {selected?.label ?? label}
        <ChevronDown aria-hidden="true" className="lumen-ai-chat-reference-icon" />
      </button>
      {open ? (
        <div
          id={id}
          ref={menu}
          role="listbox"
          aria-label={label}
          className="lumen-ai-chat-reference-model-menu"
          data-anchor={anchor}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={item.id === selected?.id}
              onClick={() => {
                onSelect?.(item.id)
                setOpen(false)
                trigger.current?.focus()
              }}
            >
              <span>
                {item.label}
                {item.badge ? <small>{item.badge}</small> : null}
                {item.detail ? <small>{item.detail}</small> : null}
              </span>
              {item.id === selected?.id ? <Check aria-hidden="true" className="lumen-ai-chat-reference-icon" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
