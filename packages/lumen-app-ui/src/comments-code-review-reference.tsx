'use client'

import * as React from 'react'
import { LumenInput } from './forms'
import type { LumenCommentsAction, LumenCommentsListStrategy } from './comments'
import './comments-code-review-reference.css'

export interface LumenCommentsReviewLine {
  readonly id: string
  readonly number: string
  readonly marker: string
  readonly value: string
  readonly tone: 'neutral' | 'added' | 'removed'
}
export interface LumenCommentsReviewMessage {
  readonly id: string
  readonly initials: string
  readonly author: string
  readonly meta: string
  readonly body: string
  readonly suggestion?: string | undefined
}
export interface LumenCommentsCodeReviewReferenceContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly resolve: string
    readonly resolved: string
    readonly replyPlaceholder: string
    readonly reply: string
    readonly suggestedChange: string
    readonly emptyCode: string
    readonly emptyComments: string
  }
  readonly lines: readonly LumenCommentsReviewLine[]
  readonly messages: readonly LumenCommentsReviewMessage[]
  readonly codeStrategy: LumenCommentsListStrategy
  readonly messageStrategy: LumenCommentsListStrategy
  readonly resolved: boolean
  readonly draft: string
  readonly onResolvedChange?: ((resolved: boolean) => void) | undefined
  readonly onDraftChange?: ((draft: string) => void) | undefined
}

function uniqueReviewItems<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}
function ReviewIcon({ kind }: { readonly kind: 'branch' | 'check' | 'reply' }) {
  const paths = {
    branch: 'M4 4v9M12 12V9c0-3-8-1-8-5M6 3a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm8 11a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
    check: 'm3 8 3 3 7-7',
    reply: 'm6 3-4 4 4 4M2 7h7c3 0 5 2 5 6',
  }
  return (
    <svg className="lumen-comments-code-review-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d={paths[kind]} />
    </svg>
  )
}
export function LumenCommentsCodeReviewReference({
  content,
  onAction,
}: {
  readonly content: LumenCommentsCodeReviewReferenceContent
  readonly onAction: ((event: LumenCommentsAction) => void) | undefined
}) {
  const inputId = React.useId()
  const lines = uniqueReviewItems(content.lines)
  const messages = uniqueReviewItems(content.messages)
  return (
    <div className="lumen-comments-code-review">
      <header data-hbar-app-ui-region="review-header">
        <div>
          <h2>
            <ReviewIcon kind="branch" />
            {content.labels.title}
          </h2>
          <p>{content.labels.detail}</p>
        </div>
        <button
          type="button"
          aria-pressed={content.resolved}
          data-hbar-app-ui-action="resolve-thread"
          onClick={() => {
            content.onResolvedChange?.(!content.resolved)
            onAction?.({ actionId: 'resolve-thread', value: String(!content.resolved) })
          }}
        >
          <ReviewIcon kind="check" />
          {content.resolved ? content.labels.resolved : content.labels.resolve}
        </button>
      </header>
      <div className="lumen-comments-code-review-frame">
        <div
          className="lumen-comments-code-review-diff"
          data-hbar-app-ui-region="code-diff"
          data-hbar-app-ui-list-strategy={content.codeStrategy.kind}
        >
          {lines.length === 0 ? (
            <p>{content.labels.emptyCode}</p>
          ) : (
            <pre>
              {lines.map((line) => (
                <div className="lumen-comments-code-review-line" data-tone={line.tone} key={line.id}>
                  <span className="lumen-comments-code-review-number">{line.number}</span>
                  <span className="lumen-comments-code-review-marker" aria-hidden="true">
                    {line.marker}
                  </span>
                  <span>{line.value}</span>
                </div>
              ))}
            </pre>
          )}
        </div>
        <div
          className="lumen-comments-code-review-messages"
          data-hbar-app-ui-region="review-comments"
          data-hbar-app-ui-list-strategy={content.messageStrategy.kind}
        >
          {messages.length === 0 ? (
            <p>{content.labels.emptyComments}</p>
          ) : (
            messages.map((message) => (
              <article key={message.id}>
                <span className="lumen-comments-code-review-avatar" aria-hidden="true">
                  {message.initials}
                </span>
                <div className="lumen-comments-code-review-message-body">
                  <p className="lumen-comments-code-review-byline">
                    {message.author}
                    <span>{message.meta}</span>
                  </p>
                  <p className="lumen-comments-code-review-message-text">{message.body}</p>
                  {message.suggestion !== undefined ? (
                    <div className="lumen-comments-code-review-suggestion">
                      <p>{content.labels.suggestedChange}</p>
                      <pre>{message.suggestion}</pre>
                    </div>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      </div>
      <div className="lumen-comments-code-review-reply" data-hbar-app-ui-region="review-reply">
        <div>
          <label className="lumen-comments-code-review-label" htmlFor={inputId}>
            {content.labels.replyPlaceholder}
          </label>
          <LumenInput
            variant="plain"
            id={inputId}
            value={content.draft}
            placeholder={content.labels.replyPlaceholder}
            data-hbar-app-ui-action="reply-draft"
            onChange={(event) => content.onDraftChange?.(event.currentTarget.value)}
          />
        </div>
        <button
          type="button"
          disabled={!content.draft.trim()}
          data-hbar-app-ui-action="reply"
          onClick={() => onAction?.({ actionId: 'reply', value: content.draft })}
        >
          <ReviewIcon kind="reply" />
          {content.labels.reply}
        </button>
      </div>
    </div>
  )
}
