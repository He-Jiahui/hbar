'use client'

import * as React from 'react'
import { LumenTextarea } from './forms'
import type { LumenCommentsAction, LumenCommentsListStrategy, LumenCommentsMessage } from './comments'
import type { LumenCommentsComposerMention } from './comments-composer-model'
import './comments-composer-reference.css'

export interface LumenCommentsComposerAttachment {
  readonly id: string
  readonly name: string
}
export interface LumenCommentsComposerReferenceContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly placeholder: string
    readonly bold: string
    readonly italic: string
    readonly link: string
    readonly mention: string
    readonly attach: string
    readonly comment: string
    readonly helper: string
    readonly suggestions: string
    readonly earlier: string
    readonly emptyMessages: string
    readonly removeAttachment: (name: string) => string
  }
  readonly initials: string
  readonly draft: string
  readonly attachments: readonly LumenCommentsComposerAttachment[]
  readonly suggestions: readonly LumenCommentsComposerMention[]
  readonly messages: readonly LumenCommentsMessage[]
  readonly attachmentStrategy: LumenCommentsListStrategy
  readonly suggestionStrategy: LumenCommentsListStrategy
  readonly messageStrategy: LumenCommentsListStrategy
  readonly onDraftChange?: ((draft: string) => void) | undefined
  readonly onMentionSelect?: ((id: string) => void) | undefined
  readonly onAttachmentRemove?: ((id: string) => void) | undefined
}

function uniqueItems<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}
function ComposerIcon({ kind }: { readonly kind: 'bold' | 'italic' | 'link' | 'mention' | 'attach' | 'remove' }) {
  const paths = {
    bold: 'M4 2.5h5a2.75 2.75 0 0 1 0 5.5H4m0 0h5.5a2.75 2.75 0 0 1 0 5.5H4V2.5',
    italic: 'M7 2.5h6M3 13.5h6M10 2.5l-4 11',
    link: 'M6 5H4a3 3 0 0 0 0 6h2m4-6h2a3 3 0 0 1 0 6h-2M5.5 8h5',
    mention: 'M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm0-2.5v4a1.5 1.5 0 0 0 3 0V8a5.5 5.5 0 1 0-2.5 4.6',
    attach: 'm6 10 5.3-5.3a1.5 1.5 0 0 0-2.1-2.1L3.9 7.9a3 3 0 0 0 4.2 4.2l5.3-5.3a4.5 4.5 0 0 0-6.3-6.3L1.8 5.8',
    remove: 'm5 5 6 6M11 5l-6 6',
  }
  return (
    <svg className="lumen-comments-composer-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d={paths[kind]} />
    </svg>
  )
}
export function LumenCommentsComposerReference({
  content,
  onAction,
}: {
  readonly content: LumenCommentsComposerReferenceContent
  readonly onAction: ((event: LumenCommentsAction) => void) | undefined
}) {
  const id = React.useId()
  const input = React.useRef<HTMLTextAreaElement>(null)
  const menu = React.useRef<HTMLDivElement>(null)
  const [selection, setSelection] = React.useState({ draft: content.draft, id: '' })
  const suggestions = uniqueItems(content.suggestions)
  const attachments = uniqueItems(content.attachments)
  const messages = uniqueItems(content.messages)
  const activeIndex =
    selection.draft === content.draft
      ? Math.max(
          0,
          suggestions.findIndex((person) => person.id === selection.id),
        )
      : 0
  const selectMention = (person: LumenCommentsComposerMention) => {
    content.onMentionSelect?.(person.id)
    onAction?.({ actionId: 'mention-select', value: person.id })
    input.current?.focus()
  }
  return (
    <div className="lumen-comments-composer-layout">
      <header>
        <h2>{content.labels.title}</h2>
        <p>{content.labels.detail}</p>
      </header>
      <div className="lumen-comments-composer-box">
        <div className="lumen-comments-composer-input-row">
          <span className="lumen-comments-composer-avatar is-editor" aria-hidden="true">
            {content.initials}
          </span>
          <div className="lumen-comments-composer-editor">
            <label className="lumen-comments-composer-label" htmlFor={id}>
              {content.labels.placeholder}
            </label>
            <LumenTextarea
              variant="plain"
              ref={input}
              id={id}
              rows={2}
              value={content.draft}
              placeholder={content.labels.placeholder}
              aria-controls={suggestions.length ? `${id}-suggestions` : undefined}
              aria-activedescendant={suggestions.length ? `${id}-option-${activeIndex}` : undefined}
              onChange={(event) => {
                const draft = event.currentTarget.value
                setSelection({ draft, id: '' })
                content.onDraftChange?.(draft)
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) {
                  return
                }
                if (suggestions.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                  event.preventDefault()
                  const nextIndex =
                    (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length
                  const next = suggestions[nextIndex]
                  if (next) {
                    setSelection({ draft: content.draft, id: next.id })
                    menu.current?.children[nextIndex]?.scrollIntoView({ block: 'nearest' })
                  }
                } else if (suggestions.length && event.key === 'Enter' && !event.shiftKey) {
                  const selected = suggestions[activeIndex]
                  if (selected) {
                    event.preventDefault()
                    selectMention(selected)
                  }
                }
              }}
            />
            {attachments.length ? (
              <div
                className="lumen-comments-composer-attachments"
                data-hbar-app-ui-list-strategy={content.attachmentStrategy.kind}
              >
                {attachments.map((attachment) => (
                  <span className="lumen-comments-composer-attachment" key={attachment.id}>
                    <ComposerIcon kind="attach" />
                    <span>{attachment.name}</span>
                    <button
                      type="button"
                      aria-label={content.labels.removeAttachment(attachment.name)}
                      onClick={() => {
                        content.onAttachmentRemove?.(attachment.id)
                        onAction?.({ actionId: 'attachment-remove', value: attachment.id })
                      }}
                    >
                      <ComposerIcon kind="remove" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="lumen-comments-composer-toolbar">
          <div className="lumen-comments-composer-tools">
            {(['bold', 'italic', 'link', 'mention', 'attach'] as const).map((kind) => (
              <button
                type="button"
                key={kind}
                aria-label={content.labels[kind]}
                onClick={() => onAction?.({ actionId: kind })}
              >
                <ComposerIcon kind={kind} />
              </button>
            ))}
          </div>
          <div className="lumen-comments-composer-submit">
            <span>{content.labels.helper}</span>
            <button
              type="button"
              disabled={!content.draft.trim()}
              onClick={() => onAction?.({ actionId: 'comment', value: content.draft })}
            >
              {content.labels.comment}
            </button>
          </div>
        </div>
        {suggestions.length ? (
          <div
            ref={menu}
            id={`${id}-suggestions`}
            className="lumen-comments-composer-mention-menu"
            role="listbox"
            aria-label={content.labels.suggestions}
            data-hbar-app-ui-list-strategy={content.suggestionStrategy.kind}
          >
            {suggestions.map((person, index) => (
              <button
                type="button"
                role="option"
                id={`${id}-option-${index}`}
                key={person.id}
                aria-selected={index === activeIndex}
                onMouseEnter={() => setSelection({ draft: content.draft, id: person.id })}
                onClick={() => selectMention(person)}
              >
                <span className="lumen-comments-composer-avatar is-option" aria-hidden="true">
                  {person.initials}
                </span>
                <span className="lumen-comments-composer-option-text">
                  <span>{person.name}</span>
                  <span>{person.detail}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <section className="lumen-comments-composer-history">
        <p>{content.labels.earlier}</p>
        <div className="lumen-comments-composer-message-frame">
          <div
            className="lumen-comments-composer-messages"
            data-hbar-app-ui-list-strategy={content.messageStrategy.kind}
          >
            {messages.length === 0 ? (
              <p>{content.labels.emptyMessages}</p>
            ) : (
              messages.map((message) => (
                <article key={message.id}>
                  <span className="lumen-comments-composer-avatar" aria-hidden="true">
                    {message.initials}
                  </span>
                  <div>
                    <p className="lumen-comments-composer-byline">
                      {message.author}
                      <span>{message.meta}</span>
                    </p>
                    <p>{message.body}</p>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
