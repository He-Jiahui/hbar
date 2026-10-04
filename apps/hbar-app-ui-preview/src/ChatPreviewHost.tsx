import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { HbarAppUiChatProvider, type HbarAppUiChatContent } from 'hbar-app-ui/chat'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { createChatPreviewCopy, type ChatPreviewLocale } from './chatPreviewCopy'
import {
  createChatPreviewSeed,
  createChatPreviewStore,
  type ChatPreviewMessageDraft,
  type ChatPreviewStoreApi,
} from './chatPreviewStore'

const SEND_PREVIEW_DELAY_MS = 650

export interface ChatPreviewHostProps extends HbarAppUiVariantProps {
  readonly content: HbarAppUiChatContent
  readonly locale?: ChatPreviewLocale | undefined
  readonly submitPreviewOutcome?: 'confirmed' | 'failed' | undefined
  readonly children: ReactNode
}

function isPreviewChat(spec: HbarAppUiVariantProps['spec']): boolean {
  return spec.category === 'chat' && spec.variant >= 1 && spec.variant <= 6
}

/** Non-chat variants pass through; locale/callback-only changes keep the same in-memory owner. */
export function ChatPreviewHost(props: ChatPreviewHostProps) {
  if (!isPreviewChat(props.spec)) return props.children
  return <ChatPreviewOwner key={`${props.spec.id}:${props.spec.variant}`} {...props} />
}

function localMessage(draft: ChatPreviewMessageDraft, copy: ReturnType<typeof createChatPreviewCopy>) {
  return {
    id: draft.id,
    author: copy.localAuthor,
    initials: copy.localInitials,
    body: draft.body,
    meta: copy.messageMeta,
    outgoing: true,
    status: copy.notDelivered,
  } as const
}

function appendTeamMessages(
  base: NonNullable<HbarAppUiChatContent['team']>['messages'],
  conversations: ReturnType<ChatPreviewStoreApi['getState']>['conversations'],
  copy: ReturnType<typeof createChatPreviewCopy>,
) {
  return [
    ...base,
    ...conversations.flatMap((conversation) =>
      conversation.messages.map((draft) => ({ ...localMessage(draft, copy), channelId: conversation.targetId })),
    ),
  ]
}

function appendDirectMessages(
  base: NonNullable<HbarAppUiChatContent['direct']>['messages'],
  conversations: ReturnType<ChatPreviewStoreApi['getState']>['conversations'],
  copy: ReturnType<typeof createChatPreviewCopy>,
) {
  return [
    ...base,
    ...conversations.flatMap((conversation) =>
      conversation.messages.map((draft) => ({ ...localMessage(draft, copy), contactId: conversation.targetId })),
    ),
  ]
}

function appendMessages<Message extends { readonly id: string }>(
  base: readonly Message[],
  drafts: readonly ChatPreviewMessageDraft[],
  copy: ReturnType<typeof createChatPreviewCopy>,
): readonly (Message | ReturnType<typeof localMessage>)[] {
  return [...base, ...drafts.map((draft) => localMessage(draft, copy))]
}

function serializeIntent(fields: Readonly<Record<string, string>>): string {
  return JSON.stringify(fields)
}

function ChatPreviewOwner({
  content,
  spec,
  onAction,
  locale = 'en',
  submitPreviewOutcome = 'confirmed',
  children,
}: ChatPreviewHostProps) {
  const seed = useMemo(() => createChatPreviewSeed(spec, content), [content, spec])
  const [store] = useState(() => createChatPreviewStore(seed))
  const activeOwnerRef = useRef(false)
  const latestActionRef = useRef(onAction)
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  latestActionRef.current = onAction

  const activeTargetId = useStore(store, (state) => state.activeTargetId)
  const conversations = useStore(store, (state) => state.conversations)
  const pendingSends = useStore(store, (state) => state.pendingSends)
  const rating = useStore(store, (state) => state.rating)
  const selectedQuickReplyId = useStore(store, (state) => state.selectedQuickReplyId)
  const directQuery = useStore(store, (state) => state.directQuery)
  const socialSortOrder = useStore(store, (state) => state.socialSortOrder)
  const likedIds = useStore(store, (state) => state.likedIds)
  const selectedReactionIds = useStore(store, (state) => state.selectedReactionIds)
  const followed = useStore(store, (state) => state.followed)
  const copy = createChatPreviewCopy(locale)

  useLayoutEffect(() => {
    activeOwnerRef.current = true
    const timers = timersRef.current
    return () => {
      activeOwnerRef.current = false
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
      store.getState().clearOwner()
    }
  }, [store])

  useLayoutEffect(() => {
    store.getState().reconcileSeed(seed)
  }, [seed, store])

  function notify(actionId: string, value?: string): void {
    if (!activeOwnerRef.current) return
    latestActionRef.current?.({
      variantId: spec.id,
      actionId,
      ...(value === undefined ? {} : { value }),
    })
  }

  useEffect(() => {
    const timers = timersRef.current
    const pendingIds = new Set(pendingSends.map(({ requestId }) => requestId))
    for (const [requestId, timer] of timers) {
      if (pendingIds.has(requestId)) continue
      clearTimeout(timer)
      timers.delete(requestId)
    }
    for (const ticket of pendingSends) {
      if (timers.has(ticket.requestId)) continue
      const timer = setTimeout(() => {
        timers.delete(ticket.requestId)
        if (!activeOwnerRef.current || !store.getState().completeSend(ticket.requestId)) return
        const outcome = store.getState().getConversation(ticket.targetId)?.outcome
        latestActionRef.current?.({
          variantId: ticket.variantId,
          actionId: 'send-preview-result',
          value: serializeIntent({
            requestId: ticket.requestId,
            targetId: ticket.targetId,
            outcome: outcome === 'confirmed' ? 'local-preview-only' : 'local-preview-failure',
          }),
        })
      }, SEND_PREVIEW_DELAY_MS)
      timers.set(ticket.requestId, timer)
    }
    return () => {
      for (const ticket of pendingSends) {
        const timer = timers.get(ticket.requestId)
        if (timer === undefined) continue
        clearTimeout(timer)
        timers.delete(ticket.requestId)
      }
    }
  }, [pendingSends, store])

  function submit(targetId: string): void {
    if (!activeOwnerRef.current || !store.getState().setActiveTarget(targetId)) return
    const ticket = store.getState().startSend(targetId, submitPreviewOutcome)
    if (!ticket) return
    notify(
      'send-preview',
      serializeIntent({ requestId: ticket.requestId, targetId: ticket.targetId, outcome: 'local-preview-pending' }),
    )
  }

  function composer(targetId: string) {
    const conversation = conversations.find((candidate) => candidate.targetId === targetId)
    const pending = pendingSends.some((ticket) => ticket.targetId === targetId)
    const quickReplyLabel =
      spec.variant === 4 && selectedQuickReplyId
        ? content.support?.quickReplies.find((reply) => reply.id === selectedQuickReplyId)?.label
        : undefined
    const supportFeedback =
      spec.variant === 4
        ? quickReplyLabel
          ? copy.quickReplySelected(quickReplyLabel)
          : rating > 0
            ? copy.ratingSelected(rating, content.support?.maximumRating ?? 0)
            : null
        : null
    const error = !pending && conversation?.outcome === 'failed' ? copy.error : null
    const feedback = pending
      ? copy.pending
      : error
        ? null
        : conversation?.outcome === 'confirmed'
          ? copy.confirmed
          : supportFeedback

    return {
      draft: conversation?.draft ?? '',
      pending,
      error,
      feedback,
      onDraftChange: (draft: string) => {
        if (activeOwnerRef.current) store.getState().setDraft(targetId, draft)
      },
      onSubmit: () => submit(targetId),
    }
  }

  const activeComposerTarget = activeTargetId ?? ''
  const socialLocalMessages =
    content.social && spec.variant === 3
      ? (conversations.find((conversation) => conversation.targetId === content.social?.post.id)?.messages ?? [])
      : []
  const supportSourceMessages = content.support
    ? (content.support.referenceLayout?.messages ??
      content.support.referenceFlow?.messages ?? [content.support.assistant])
    : []
  const groupLocalMessages =
    content.group && spec.variant === 5
      ? (conversations.find((conversation) => conversation.targetId === spec.id)?.messages ?? [])
      : []
  const liveLocalMessages =
    content.live && spec.variant === 6
      ? (conversations.find((conversation) => conversation.targetId === content.live?.chatTabId)?.messages ?? [])
      : []
  const projectedContent: HbarAppUiChatContent = {
    ...content,
    team:
      content.team && spec.variant === 1
        ? {
            ...content.team,
            messages: appendTeamMessages(content.team.messages, conversations, copy),
            referenceFlow: {
              channelId: activeComposerTarget,
              onChannelChange: (channelId) => {
                if (activeOwnerRef.current) store.getState().setActiveTarget(channelId)
              },
              composer: composer(activeComposerTarget),
            },
          }
        : content.team,
    direct:
      content.direct && spec.variant === 2
        ? {
            ...content.direct,
            messages: appendDirectMessages(content.direct.messages, conversations, copy),
            referenceFlow: {
              ...(content.direct.referenceFlow ?? {}),
              contactId: activeComposerTarget,
              onContactChange: (contactId) => {
                if (activeOwnerRef.current) store.getState().setActiveTarget(contactId)
              },
              composer: composer(activeComposerTarget),
              query: directQuery,
              onQueryChange: (query) => {
                if (activeOwnerRef.current) store.getState().setDirectQuery(query)
              },
            },
          }
        : content.direct,
    social:
      content.social && spec.variant === 3
        ? {
            ...content.social,
            replies: appendMessages(content.social.replies, socialLocalMessages, copy),
            ...(content.social.referenceLayout
              ? {
                  referenceLayout: {
                    ...content.social.referenceLayout,
                    replyCount: content.social.referenceLayout.replyCount + socialLocalMessages.length,
                  },
                }
              : {}),
            referenceFlow: {
              ...(content.social.referenceFlow ?? {}),
              composer: composer(content.social.post.id),
              sortOrder: socialSortOrder,
              likedIds,
              onSortChange: (order) => {
                if (!activeOwnerRef.current) return
                store.getState().setSocialSortOrder(order)
                notify(
                  'social-sort',
                  serializeIntent({
                    targetId: content.social?.post.id ?? '',
                    sortOrder: order,
                    outcome: 'intent-only',
                  }),
                )
              },
              onToggleLike: (messageId) => {
                if (!activeOwnerRef.current || !store.getState().toggleSocialLike(messageId)) return
                notify(
                  'social-toggle-like',
                  serializeIntent({ targetId: content.social?.post.id ?? '', messageId, outcome: 'intent-only' }),
                )
              },
            },
          }
        : content.social,
    support:
      content.support && spec.variant === 4
        ? {
            ...content.support,
            referenceFlow: {
              ...(content.support.referenceFlow ?? {}),
              composer: composer(content.support.assistant.id),
              messages: appendMessages(
                supportSourceMessages,
                conversations.find((conversation) => conversation.targetId === content.support?.assistant.id)
                  ?.messages ?? [],
                copy,
              ),
              rating,
              onRatingChange: (value) => {
                if (!activeOwnerRef.current || !store.getState().setRating(value)) return
                notify(
                  'select-rating',
                  serializeIntent({
                    targetId: content.support?.assistant.id ?? '',
                    rating: String(value),
                    outcome: 'intent-only',
                  }),
                )
              },
              onQuickReply: (id) => {
                if (!activeOwnerRef.current || !store.getState().selectQuickReply(id)) return
                notify(
                  'select-quick-reply',
                  serializeIntent({
                    targetId: content.support?.assistant.id ?? '',
                    quickReplyId: id,
                    outcome: 'intent-only',
                  }),
                )
              },
            },
          }
        : content.support,
    group:
      content.group && spec.variant === 5
        ? {
            ...content.group,
            messages: appendMessages(content.group.messages, groupLocalMessages, copy),
            referenceFlow: {
              ...(content.group.referenceFlow ?? {}),
              composer: composer(spec.id),
              selectedReactionIds,
              onToggleReaction: (reactionId) => {
                if (!activeOwnerRef.current || !store.getState().toggleGroupReaction(reactionId)) return
                notify(
                  'group-toggle-reaction',
                  serializeIntent({ targetId: spec.id, reactionId, outcome: 'intent-only' }),
                )
              },
            },
          }
        : content.group,
    live:
      content.live && spec.variant === 6
        ? {
            ...content.live,
            messages: appendMessages(content.live.messages, liveLocalMessages, copy),
            referenceFlow: {
              ...(content.live.referenceFlow ?? {}),
              tabId: activeComposerTarget,
              onTabChange: (tabId) => {
                if (activeOwnerRef.current) store.getState().setActiveTarget(tabId)
              },
              composer: composer(activeComposerTarget),
              followed,
              onFollowChange: (nextFollowed) => {
                if (!activeOwnerRef.current || !store.getState().setFollowed(nextFollowed)) return
                notify(
                  'live-follow',
                  serializeIntent({
                    targetId: content.live?.chatTabId ?? '',
                    followed: String(nextFollowed),
                    outcome: 'intent-only',
                  }),
                )
              },
            },
          }
        : content.live,
  }

  return <HbarAppUiChatProvider content={projectedContent}>{children}</HbarAppUiChatProvider>
}
