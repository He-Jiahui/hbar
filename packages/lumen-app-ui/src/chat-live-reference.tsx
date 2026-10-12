'use client'

import * as React from 'react'
import { Pin } from 'lucide-react'
import { LumenButton, LumenStatus, LumenText } from './primitives'
import type { LumenChatLiveContent, LumenChatProps } from './chat'
import type { LumenChatLiveReferenceLayout } from './chat/reference-content'
import './chat-live-reference.css'

export interface LumenChatLiveReferenceProps {
  readonly content: LumenChatLiveContent
  readonly layout: LumenChatLiveReferenceLayout
  readonly composer: React.ReactNode
  readonly onAction?: LumenChatProps['onAction'] | undefined
}

function uniqueById<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id || seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function LumenChatLiveReference({ content, layout, composer, onAction }: LumenChatLiveReferenceProps) {
  const flow = content.referenceFlow
  const followed = flow?.followed ?? false
  const messages = uniqueById(content.messages)

  function toggleFollow(): void {
    const nextFollowed = !followed
    if (flow?.onFollowChange) {
      flow.onFollowChange(nextFollowed)
      return
    }
    onAction?.({
      actionId: 'live:toggle-follow',
      value: JSON.stringify({ followed: nextFollowed, outcome: 'intent-only' }),
    })
  }

  return (
    <section className="lumen-chat-live-reference" aria-label={content.labels.title}>
      <header className="lumen-chat-live-reference-header">
        <div className="lumen-chat-live-reference-heading">
          <LumenText as="h2" variant="heading">
            {content.labels.title}
          </LumenText>
          <LumenText as="p" tone="muted" variant="supporting">
            {content.labels.detail}
          </LumenText>
        </div>
        <LumenButton
          variant={followed ? 'solid' : 'outlined'}
          aria-pressed={followed}
          data-hbar-app-ui-action="live:toggle-follow"
          onClick={toggleFollow}
        >
          {followed ? layout.labels.following : layout.labels.follow}
        </LumenButton>
      </header>

      <aside className="lumen-chat-live-reference-pinned">
        <Pin className="lumen-chat-live-reference-icon lumen-chat-live-reference-icon-sm" aria-hidden="true" />
        <LumenText as="p">
          <LumenText as="strong" variant="label">
            {content.labels.pinned}
          </LumenText>
          {layout.labels.pinnedSeparator}
          {content.pinnedNotice}
        </LumenText>
      </aside>

      <div
        className="lumen-chat-live-reference-messages"
        data-hbar-app-ui-list-strategy={content.listStrategy.kind}
        data-hbar-app-ui-region="live-messages"
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {messages.length ? (
          messages.map((message) => (
            <article className="lumen-chat-live-reference-message" key={message.id}>
              <span className="lumen-chat-avatar" aria-hidden="true">
                {message.initials}
              </span>
              <div className="lumen-chat-live-reference-message-copy">
                {message.role ? <LumenStatus value={message.role} /> : null}
                <LumenText as="strong" variant="label">
                  {message.author}
                </LumenText>
                <span className="lumen-chat-live-reference-message-separator" aria-hidden="true">
                  {layout.labels.messageSeparator}
                </span>
                <LumenText as="span" className="lumen-chat-live-reference-message-body">
                  {message.body}
                </LumenText>
              </div>
            </article>
          ))
        ) : (
          <LumenText as="p" tone="muted">
            {content.labels.emptyChat}
          </LumenText>
        )}
      </div>

      {composer}
    </section>
  )
}
