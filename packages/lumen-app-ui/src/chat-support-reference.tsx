'use client'

import * as React from 'react'
import { LumenButton, LumenText } from './primitives'
import type { LumenChatProps, LumenChatSupportContent } from './chat'
import type { LumenChatSupportReferenceLayout } from './chat/reference-content'
import './chat-support-reference.css'

export interface LumenChatSupportReferenceProps {
  readonly content: LumenChatSupportContent
  readonly layout: LumenChatSupportReferenceLayout
  readonly composer?: React.ReactNode | undefined
  readonly onAction?: LumenChatProps['onAction'] | undefined
}

function uniqueMessages<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

function VoteIcon({ helpful }: { readonly helpful: boolean }) {
  return (
    <svg className="lumen-chat-glyph lumen-chat-glyph-sm" viewBox="0 0 16 16" aria-hidden="true">
      {helpful ? (
        <path d="M5.2 7.2 8 2.3c.4-.8 1.3-.6 1.3.3v3h3.4c1 0 1.5.8 1.3 1.7l-.9 5a1.4 1.4 0 0 1-1.4 1.2H5.2Zm-3.4 0h2.2v6H1.8z" />
      ) : (
        <path d="m5.2 8.8 2.8 4.9c.4.8 1.3.6 1.3-.3v-3h3.4c1 0 1.5-.8 1.3-1.7l-.9-5a1.4 1.4 0 0 0-1.4-1.2H5.2ZM1.8 2.8H4v6H1.8z" />
      )}
    </svg>
  )
}

export function LumenChatSupportReference({ content, layout, composer, onAction }: LumenChatSupportReferenceProps) {
  const flow = content.referenceFlow
  const [minimized, setMinimized] = React.useState(false)
  const ratingValue = flow?.rating ?? content.initialRating
  const rating = Math.max(0, Math.min(2, Math.floor(ratingValue)))
  const messages = uniqueMessages(flow?.messages ?? layout.messages)
  const headingId = React.useId()

  function selectRating(value: number): void {
    if (flow) {
      flow.onRatingChange(value)
      return
    }
    onAction?.({ actionId: 'rate', value: String(value) })
  }

  return (
    <section className="lumen-chat-support-reference" aria-labelledby={headingId}>
      <header className="lumen-chat-support-reference-header">
        <span className="lumen-chat-avatar" aria-hidden="true">
          {content.assistant.initials}
        </span>
        <div className="lumen-chat-support-reference-heading">
          <LumenText as="strong" id={headingId} variant="label">
            {content.assistant.author}
          </LumenText>
          <LumenText as="small" tone="muted" variant="supporting">
            {content.assistant.meta}
          </LumenText>
        </div>
        <LumenButton
          variant="text"
          aria-label={minimized ? layout.labels.restore : layout.labels.minimize}
          aria-expanded={!minimized}
          data-hbar-app-ui-action={minimized ? 'restore-support' : 'minimize-support'}
          onClick={() => setMinimized((value) => !value)}
        >
          <svg className="lumen-chat-glyph lumen-chat-glyph-sm" viewBox="0 0 16 16" aria-hidden="true">
            <path d={minimized ? 'm3 10 5-5 5 5' : 'm3 6 5 5 5-5'} />
          </svg>
        </LumenButton>
      </header>
      {!minimized ? (
        <React.Fragment>
          <LumenText as="p" className="lumen-chat-support-reference-started" tone="muted" variant="supporting">
            {layout.labels.started}
          </LumenText>
          <div
            className="lumen-chat-support-reference-messages"
            data-hbar-app-ui-list-strategy={layout.listStrategy.kind}
            data-hbar-app-ui-region="support-messages"
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {messages.map((message) => (
              <article
                key={message.id}
                className={
                  message.outgoing
                    ? 'lumen-chat-support-reference-message is-outgoing'
                    : 'lumen-chat-support-reference-message'
                }
              >
                <LumenText as="strong" variant="label">
                  {message.author}
                </LumenText>
                <LumenText as="p">{message.body}</LumenText>
                {message.attachment ? (
                  <span className="lumen-chat-attachment">
                    <svg className="lumen-chat-glyph lumen-chat-glyph-xs" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="m5 8 4.5-4.5a2 2 0 0 1 3 3l-5.5 5.5a3 3 0 0 1-4-4l5-5" />
                    </svg>
                    {message.attachment}
                  </span>
                ) : null}
                <LumenText as="small" tone="muted" variant="supporting">
                  {message.meta}
                </LumenText>
              </article>
            ))}
          </div>
          <div
            className="lumen-chat-support-reference-quick-replies"
            role="group"
            aria-label={content.labels.quickReplies}
          >
            {content.quickReplies.map((item) => (
              <LumenButton
                key={item.id}
                variant="outlined"
                disabled={item.disabled}
                data-hbar-app-ui-action="quick-reply"
                onClick={() => {
                  if (flow) {
                    flow.onQuickReply(item.id)
                  } else {
                    onAction?.({ actionId: 'quick-reply', value: item.id })
                  }
                }}
              >
                {item.label}
              </LumenButton>
            ))}
          </div>
          <div className="lumen-chat-support-reference-rating">
            <LumenText as="span" id={`${headingId}-rating`} variant="supporting">
              {content.labels.rating}
            </LumenText>
            <div className="lumen-chat-support-reference-votes" role="group" aria-labelledby={`${headingId}-rating`}>
              <LumenButton
                variant={rating === 1 ? 'solid' : 'text'}
                aria-label={layout.labels.helpful}
                aria-pressed={rating === 1}
                data-hbar-app-ui-action="rate-helpful"
                onClick={() => selectRating(1)}
              >
                <VoteIcon helpful />
              </LumenButton>
              <LumenButton
                variant={rating === 2 ? 'solid' : 'text'}
                aria-label={layout.labels.notHelpful}
                aria-pressed={rating === 2}
                data-hbar-app-ui-action="rate-not-helpful"
                onClick={() => selectRating(2)}
              >
                <VoteIcon helpful={false} />
              </LumenButton>
            </div>
          </div>
          {composer}
          <LumenText as="p" className="lumen-chat-support-reference-summary" tone="muted" variant="supporting">
            {layout.labels.ratingSummary}
          </LumenText>
        </React.Fragment>
      ) : null}
    </section>
  )
}
