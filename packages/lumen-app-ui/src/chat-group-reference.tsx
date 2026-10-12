'use client'

import { LumenButton, LumenText } from './primitives'
import type { LumenChatGroupContent, LumenChatProps } from './chat'
import type {
  LumenChatGroupReaction,
  LumenChatGroupReferenceAttachment,
  LumenChatGroupReferenceLayout,
} from './chat/reference-content'
import './chat-group-reference.css'

export interface LumenChatGroupReferenceProps {
  readonly content: LumenChatGroupContent
  readonly layout: LumenChatGroupReferenceLayout
  readonly onAction?: LumenChatProps['onAction'] | undefined
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

function Glyph({ kind }: { readonly kind: 'image' | 'document' | 'download' | 'plus' }) {
  const paths = {
    image: 'M2 3h12v10H2Zm2 8 3-3 2 2 2-3 3 4M5 6h.01',
    document: 'M4 1.5h5l3 3v10H4zm5 0v3h3m-6 3h4m-4 2h4',
    download: 'M8 2v8m-3-3 3 3 3-3M3 12v2h10v-2',
    plus: 'M8 3v10m-5-5h10',
  } as const
  return (
    <svg className="lumen-chat-glyph lumen-chat-glyph-sm" viewBox="0 0 16 16" aria-hidden="true">
      <path d={paths[kind]} />
    </svg>
  )
}

function AttachmentCard({
  attachment,
  onDownload,
  label,
}: {
  readonly attachment: LumenChatGroupReferenceAttachment
  readonly onDownload: (id: string) => void
  readonly label: string
}) {
  return attachment.kind === 'image' ? (
    <figure className="lumen-chat-group-reference-attachment is-image">
      <div className="lumen-chat-group-reference-image-placeholder" aria-hidden="true">
        <Glyph kind="image" />
      </div>
      <figcaption>
        <span>
          <LumenText as="strong" variant="label">
            {attachment.name}
          </LumenText>
          <LumenText as="small" tone="muted" variant="supporting">
            {attachment.detail}
          </LumenText>
        </span>
        <LumenButton
          variant="text"
          aria-label={label}
          data-hbar-app-ui-action="download-attachment"
          onClick={() => onDownload(attachment.id)}
        >
          <Glyph kind="download" />
        </LumenButton>
      </figcaption>
    </figure>
  ) : (
    <div className="lumen-chat-group-reference-attachment is-document">
      <Glyph kind="document" />
      <span>
        <LumenText as="strong" variant="label">
          {attachment.name}
        </LumenText>
        <LumenText as="small" tone="muted" variant="supporting">
          {attachment.detail}
        </LumenText>
      </span>
      <LumenButton
        variant="text"
        aria-label={label}
        data-hbar-app-ui-action="download-attachment"
        onClick={() => onDownload(attachment.id)}
      >
        <Glyph kind="download" />
      </LumenButton>
    </div>
  )
}

function reactionCount(reaction: LumenChatGroupReaction, selected: boolean): number {
  return Math.max(0, reaction.count + Number(selected) - Number(reaction.selected))
}

export function LumenChatGroupReference({ content, layout, onAction }: LumenChatGroupReferenceProps) {
  const flow = content.referenceFlow
  const messages = uniqueById(content.messages)
  const messageIds = new Set(messages.map(({ id }) => id))
  const attachments = uniqueById(layout.attachments).filter((attachment) => messageIds.has(attachment.messageId))
  const reactions = uniqueById(layout.reactions).filter((reaction) => messageIds.has(reaction.messageId))
  const selectedIds = new Set(
    flow?.selectedReactionIds ?? layout.reactions.filter((reaction) => reaction.selected).map(({ id }) => id),
  )

  function download(attachmentId: string): void {
    onAction?.({
      actionId: 'download',
      value: JSON.stringify({ fileId: attachmentId, verification: 'unverified' }),
    })
  }

  function toggleReaction(reactionId: string, messageId: string): void {
    if (flow?.onToggleReaction) {
      flow.onToggleReaction(reactionId)
      return
    }
    onAction?.({
      actionId: 'react',
      value: JSON.stringify({ reactionId, messageId, verification: 'unverified' }),
    })
  }

  function openReplies(messageId: string, count: number): void {
    onAction?.({
      actionId: 'open-replies',
      value: JSON.stringify({ messageId, count, verification: 'unverified' }),
    })
  }

  return (
    <section className="lumen-chat-group-reference" aria-label={content.labels.title}>
      <LumenText as="p" className="lumen-chat-group-reference-day" variant="supporting">
        {layout.labels.day}
      </LumenText>
      <div
        className="lumen-chat-group-reference-messages"
        data-hbar-app-ui-region="group-messages"
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {messages.map((message) => {
          const messageAttachments = attachments.filter((attachment) => attachment.messageId === message.id)
          const messageReactions = reactions.filter((reaction) => reaction.messageId === message.id)
          return (
            <article className="lumen-chat-group-reference-message" key={message.id}>
              <span className="lumen-chat-avatar" aria-hidden="true">
                {message.initials}
              </span>
              <div className="lumen-chat-group-reference-message-content">
                <header>
                  <LumenText as="strong" variant="label">
                    {message.author}
                  </LumenText>
                  <LumenText as="small" tone="muted" variant="supporting">
                    {message.meta}
                  </LumenText>
                </header>
                {message.body ? <LumenText as="p">{message.body}</LumenText> : null}
                {messageAttachments.length ? (
                  <div className="lumen-chat-group-reference-attachments">
                    {messageAttachments.map((attachment) => (
                      <AttachmentCard
                        key={attachment.id}
                        attachment={attachment}
                        label={layout.labels.download(attachment.name)}
                        onDownload={download}
                      />
                    ))}
                  </div>
                ) : null}
                {messageReactions.length || typeof message.replyCount === 'number' ? (
                  <div className="lumen-chat-group-reference-message-actions">
                    {messageReactions.length ? (
                      <div
                        className="lumen-chat-group-reference-reactions"
                        role="group"
                        aria-label={content.labels.reaction(message.author)}
                      >
                        {messageReactions.map((reaction) => {
                          const selected = selectedIds.has(reaction.id)
                          const count = reactionCount(reaction, selected)
                          return (
                            <LumenButton
                              key={reaction.id}
                              variant={selected ? 'solid' : 'text'}
                              aria-label={layout.labels.reaction(reaction.symbol, count)}
                              aria-pressed={selected}
                              data-hbar-app-ui-action="toggle-reaction"
                              onClick={() => toggleReaction(reaction.id, message.id)}
                            >
                              <span aria-hidden="true">{reaction.symbol}</span>
                              {count}
                            </LumenButton>
                          )
                        })}
                        <LumenButton
                          variant="text"
                          aria-label={layout.labels.addReaction}
                          data-hbar-app-ui-action="add-reaction"
                          onClick={() =>
                            onAction?.({
                              actionId: 'add-reaction',
                              value: JSON.stringify({
                                messageId: message.id,
                                verification: 'unverified',
                              }),
                            })
                          }
                        >
                          <Glyph kind="plus" />
                        </LumenButton>
                      </div>
                    ) : null}
                    {typeof message.replyCount === 'number' ? (
                      <LumenButton
                        className="lumen-chat-group-reference-reply-count"
                        variant="text"
                        data-hbar-app-ui-action="open-replies"
                        onClick={() => openReplies(message.id, message.replyCount ?? 0)}
                      >
                        {content.labels.replies(message.replyCount)}
                      </LumenButton>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>
      <LumenText as="p" className="lumen-chat-group-reference-typing" role="status" aria-live="polite">
        {layout.labels.typing}
      </LumenText>
    </section>
  )
}
