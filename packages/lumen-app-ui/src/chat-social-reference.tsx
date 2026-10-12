'use client'

import * as React from 'react'
import { Heart, MessageCircle, Repeat2, Share2, Sparkles } from 'lucide-react'
import { LumenButton, LumenText } from './primitives'
import type { LumenChatMessage, LumenChatProps, LumenChatSocialContent } from './chat'
import type { LumenChatSocialNestedReply, LumenChatSocialReferenceLayout } from './chat/reference-content'
import './chat-social-reference.css'

export interface LumenChatSocialReferenceProps {
  readonly content: LumenChatSocialContent
  readonly layout: LumenChatSocialReferenceLayout
  readonly composer: React.ReactNode
  readonly onAction?: LumenChatProps['onAction'] | undefined
}

function report(onAction: LumenChatSocialReferenceProps['onAction'], actionId: string, value?: string) {
  onAction?.(value === undefined ? { actionId } : { actionId, value })
}

function uniqueById<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

function Avatar({ initials }: { readonly initials: string }) {
  return (
    <span className="lumen-chat-social-avatar" aria-hidden="true">
      {initials}
    </span>
  )
}

function Author({ message }: { readonly message: LumenChatMessage }) {
  return (
    <header className="lumen-chat-social-author">
      <LumenText as="strong" variant="label">
        {message.author}
      </LumenText>
      <LumenText as="small" tone="muted" variant="supporting">
        {message.meta}
      </LumenText>
    </header>
  )
}

function LikeButton({
  message,
  liked,
  count,
  label,
  onToggle,
}: {
  readonly message: LumenChatMessage
  readonly liked: boolean
  readonly count: number
  readonly label: string
  readonly onToggle: (id: string) => void
}) {
  return (
    <LumenButton
      className="lumen-chat-social-metric"
      variant="text"
      aria-label={label}
      aria-pressed={liked}
      data-hbar-app-ui-action="social:toggle-like"
      onClick={() => onToggle(message.id)}
    >
      <Heart className="lumen-chat-social-icon lumen-chat-social-icon-xs" aria-hidden="true" />
      {count}
    </LumenButton>
  )
}

export function LumenChatSocialReference({ content, layout, composer, onAction }: LumenChatSocialReferenceProps) {
  const flow = content.referenceFlow
  const initialLikedIds = new Set(layout.initialLikedIds)
  const likedIds = flow?.likedIds ? new Set(flow.likedIds) : initialLikedIds
  const sortOrder = flow?.sortOrder ?? 'relevant'
  const replies = uniqueById(content.replies)
  const visibleReplies = sortOrder === 'recent' ? [...replies].reverse() : replies
  const nestedReplies = uniqueById(layout.nestedReplies)
  const visibleNestedReplies = nestedReplies.filter((reply) =>
    visibleReplies.some((message) => message.id === reply.parentId),
  )
  const remainingReplies = Math.max(0, layout.replyCount - visibleReplies.length - visibleNestedReplies.length)

  const likeState = (message: LumenChatMessage) => {
    const initiallyLiked = initialLikedIds.has(message.id)
    const liked = likedIds.has(message.id)
    const count = Math.max(0, (message.reactionCount ?? 0) + Number(liked) - Number(initiallyLiked))
    return { liked, count }
  }

  const toggleLike = (id: string) => {
    if (flow?.onToggleLike) {
      flow.onToggleLike(id)
    } else {
      report(onAction, 'social:toggle-like', id)
    }
  }

  const changeSort = () => {
    const nextOrder = sortOrder === 'relevant' ? 'recent' : 'relevant'
    if (flow?.onSortChange) {
      flow.onSortChange(nextOrder)
    } else {
      report(onAction, 'social:sort', nextOrder)
    }
  }

  const renderLikeButton = (message: LumenChatMessage) => {
    const state = likeState(message)
    return (
      <LikeButton
        key={message.id}
        message={message}
        liked={state.liked}
        count={state.count}
        label={layout.labels.likes(message.author, state.count)}
        onToggle={toggleLike}
      />
    )
  }

  const renderNestedReply = (message: LumenChatSocialNestedReply) => (
    <li key={message.id}>
      <article className="lumen-chat-social-nested-reply">
        <Avatar initials={message.initials} />
        <div className="lumen-chat-social-message-copy">
          <Author message={message} />
          <LumenText as="p">{message.body}</LumenText>
          <footer className="lumen-chat-social-actions">{renderLikeButton(message)}</footer>
        </div>
      </article>
    </li>
  )

  const renderReply = (message: LumenChatMessage) => {
    const nested = visibleNestedReplies
      .filter((reply) => reply.parentId === message.id)
      .sort((left, right) =>
        sortOrder === 'recent'
          ? nestedReplies.indexOf(right) - nestedReplies.indexOf(left)
          : nestedReplies.indexOf(left) - nestedReplies.indexOf(right),
      )
    return (
      <li key={message.id}>
        <article className="lumen-chat-social-reply">
          <Avatar initials={message.initials} />
          <div className="lumen-chat-social-message-copy">
            <Author message={message} />
            <LumenText as="p">{message.body}</LumenText>
            <footer className="lumen-chat-social-actions">
              {renderLikeButton(message)}
              <LumenButton
                className="lumen-chat-social-reply-action"
                variant="text"
                aria-label={layout.labels.replyTo(message.author)}
                data-hbar-app-ui-action="social:reply-to"
                onClick={() => report(onAction, 'social:reply-to', message.id)}
              >
                {content.labels.send}
              </LumenButton>
            </footer>
            {nested.length ? <ul className="lumen-chat-social-nested-list">{nested.map(renderNestedReply)}</ul> : null}
          </div>
        </article>
      </li>
    )
  }

  return (
    <div
      className="lumen-chat-social-reference"
      data-hbar-app-ui-region="social-thread"
      data-hbar-app-ui-list-strategy={content.listStrategy.kind}
    >
      <article className="lumen-chat-social-post" data-hbar-app-ui-region="post">
        <Avatar initials={content.post.initials} />
        <div className="lumen-chat-social-message-copy">
          <Author message={content.post} />
          <LumenText as="p">{content.post.body}</LumenText>
          <div className="lumen-chat-social-post-actions">
            <div className="lumen-chat-social-metrics">
              <LumenButton
                className="lumen-chat-social-metric"
                variant="text"
                aria-label={layout.labels.replies(layout.replyCount)}
                data-hbar-app-ui-action="social:replies"
                onClick={() => report(onAction, 'social:replies', content.post.id)}
              >
                <MessageCircle className="lumen-chat-social-icon lumen-chat-social-icon-sm" aria-hidden="true" />
                {layout.replyCount}
              </LumenButton>
              <LumenButton
                className="lumen-chat-social-metric"
                variant="text"
                aria-label={layout.labels.reposts(layout.repostCount)}
                data-hbar-app-ui-action="social:reposts"
                onClick={() => report(onAction, 'social:reposts', content.post.id)}
              >
                <Repeat2 className="lumen-chat-social-icon lumen-chat-social-icon-sm" aria-hidden="true" />
                {layout.repostCount}
              </LumenButton>
              {renderLikeButton(content.post)}
            </div>
            <LumenButton
              className="lumen-chat-social-share"
              variant="text"
              aria-label={layout.labels.share}
              data-hbar-app-ui-action="social:share"
              onClick={() => report(onAction, 'social:share', content.post.id)}
            >
              <Share2 className="lumen-chat-social-icon lumen-chat-social-icon-sm" aria-hidden="true" />
            </LumenButton>
          </div>
        </div>
      </article>

      <section className="lumen-chat-social-composer" data-hbar-app-ui-region="composer">
        <Avatar initials={layout.composerInitials} />
        <div className="lumen-chat-social-composer-content">
          {composer}
          <LumenText as="p" tone="muted" variant="supporting">
            {layout.labels.visibility}
          </LumenText>
        </div>
      </section>

      <section className="lumen-chat-social-replies" aria-label={content.labels.replies}>
        <header className="lumen-chat-social-sortbar">
          <div className="lumen-chat-social-sort-status">
            <Sparkles className="lumen-chat-social-icon lumen-chat-social-icon-xs" aria-hidden="true" />
            <LumenText as="span" tone="muted">
              {sortOrder === 'recent' ? layout.labels.recent : layout.labels.relevant}
            </LumenText>
          </div>
          <LumenButton
            variant="text"
            aria-label={layout.labels.sortToggle}
            aria-pressed={sortOrder === 'recent'}
            data-hbar-app-ui-action="social:sort"
            onClick={changeSort}
          >
            {sortOrder === 'recent' ? layout.labels.relevant : layout.labels.recent}
          </LumenButton>
        </header>
        {visibleReplies.length ? (
          <ul
            className="lumen-chat-social-reply-list"
            data-hbar-app-ui-region="reply-list"
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          >
            {visibleReplies.map(renderReply)}
          </ul>
        ) : (
          <LumenText as="p" className="lumen-chat-social-empty" tone="muted">
            {content.labels.empty}
          </LumenText>
        )}
        {remainingReplies > 0 ? (
          <LumenButton
            className="lumen-chat-social-show-more"
            variant="text"
            data-hbar-app-ui-action="social:show-more"
            onClick={() => report(onAction, 'social:show-more', content.post.id)}
          >
            {layout.labels.showMore}
          </LumenButton>
        ) : null}
      </section>
    </div>
  )
}
