import { createStore, type StoreApi } from 'zustand/vanilla'
import type { HbarAppUiVariantSpec } from 'hbar-app-ui/catalog'
import type { HbarAppUiChatContent } from 'hbar-app-ui/chat'

const MAX_LOCAL_PREVIEW_MESSAGES = 20
const SUPPORT_PREVIEW_MESSAGE_LIMIT = 12

export type ChatPreviewSubmitOutcome = 'confirmed' | 'failed'
export type ChatPreviewConversationOutcome = 'idle' | 'confirmed' | 'failed'
export type ChatPreviewSocialSortOrder = 'relevant' | 'recent'

export interface ChatPreviewTargetSeed {
  readonly id: string
  readonly maxLocalMessages: number
  readonly sendable: boolean
  readonly initialDraft: string
}

export interface ChatPreviewSeed {
  readonly variantId: string
  readonly variant: number
  readonly initialTargetId: string | null
  readonly targets: readonly ChatPreviewTargetSeed[]
  readonly quickReplyIds: readonly string[]
  readonly initialRating: number
  readonly maximumRating: number
  readonly initialDirectQuery: string
  readonly initialSocialSortOrder: ChatPreviewSocialSortOrder
  readonly socialMessageIds: readonly string[]
  readonly initialLikedIds: readonly string[]
  readonly groupReactionIds: readonly string[]
  readonly initialSelectedReactionIds: readonly string[]
  readonly initialFollowed: boolean
}

/** Stored preview data is domain-only; visible author, status and metadata come from current copy. */
export interface ChatPreviewMessageDraft {
  readonly id: string
  readonly targetId: string
  readonly body: string
}

export interface ChatPreviewConversationState {
  readonly targetId: string
  readonly draft: string
  readonly messages: readonly ChatPreviewMessageDraft[]
  readonly outcome: ChatPreviewConversationOutcome
}

export interface ChatPreviewSendTicket {
  readonly requestId: string
  readonly variantId: string
  readonly targetId: string
  readonly draftAtSubmit: string
  readonly body: string
  readonly previewOutcome: ChatPreviewSubmitOutcome
}

export interface ChatPreviewStoreState extends ChatPreviewSeed {
  readonly activeTargetId: string | null
  readonly directQuery: string
  readonly socialSortOrder: ChatPreviewSocialSortOrder
  readonly conversations: readonly ChatPreviewConversationState[]
  readonly pendingSends: readonly ChatPreviewSendTicket[]
  readonly rating: number
  readonly selectedQuickReplyId: string | null
  readonly likedIds: readonly string[]
  readonly selectedReactionIds: readonly string[]
  readonly followed: boolean
  readonly reconcileSeed: (seed: ChatPreviewSeed) => boolean
  readonly setActiveTarget: (targetId: string) => boolean
  readonly setDraft: (targetId: string, draft: string) => boolean
  readonly startSend: (targetId: string, outcome?: ChatPreviewSubmitOutcome) => ChatPreviewSendTicket | null
  readonly completeSend: (requestId: string) => boolean
  readonly cancelSend: (requestId: string) => boolean
  readonly setRating: (rating: number) => boolean
  readonly selectQuickReply: (id: string) => boolean
  readonly setDirectQuery: (query: string) => void
  readonly setSocialSortOrder: (order: ChatPreviewSocialSortOrder) => void
  readonly toggleSocialLike: (messageId: string) => boolean
  readonly toggleGroupReaction: (reactionId: string) => boolean
  readonly setFollowed: (followed: boolean) => boolean
  readonly getConversation: (targetId: string) => ChatPreviewConversationState | undefined
  /** Reusable StrictMode cleanup cancels tickets but leaves user drafts and selection intact. */
  readonly clearOwner: () => void
}

export type ChatPreviewStoreApi = StoreApi<ChatPreviewStoreState>

let nextStoreSequence = 0

function uniqueIds(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of ids) {
    const id = value.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

function uniqueTargets(targets: readonly ChatPreviewTargetSeed[]): ChatPreviewTargetSeed[] {
  const seen = new Set<string>()
  const result: ChatPreviewTargetSeed[] = []
  for (const target of targets) {
    const id = target.id.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push({
      id,
      maxLocalMessages: Number.isFinite(target.maxLocalMessages) ? Math.max(0, Math.floor(target.maxLocalMessages)) : 0,
      sendable: target.sendable,
      initialDraft: target.initialDraft,
    })
  }
  return result
}

function messageLimit(expectedMaximum: number, sourceCount: number): number {
  const expected = Number.isFinite(expectedMaximum) ? Math.max(0, Math.floor(expectedMaximum)) : 0
  const available = Math.max(0, expected - Math.max(0, sourceCount))
  return Math.min(MAX_LOCAL_PREVIEW_MESSAGES, available)
}

function strategyLimit(expectedMaximum: number, sourceCount: number): number {
  return messageLimit(expectedMaximum, sourceCount)
}

function clampedRating(value: number, maximum: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(maximum, Math.floor(value)))
}

function firstTargetId(ids: readonly string[], preferred: string | undefined): string | null {
  return (preferred && ids.includes(preferred) ? preferred : ids[0]) ?? null
}

function sameTargets(left: readonly ChatPreviewTargetSeed[], right: readonly ChatPreviewTargetSeed[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      (target, index) =>
        target.id === right[index]?.id &&
        target.maxLocalMessages === right[index]?.maxLocalMessages &&
        target.sendable === right[index]?.sendable &&
        target.initialDraft === right[index]?.initialDraft,
    )
  )
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

export function createChatPreviewSeed(
  spec: Pick<HbarAppUiVariantSpec, 'id' | 'variant'>,
  content: HbarAppUiChatContent,
): ChatPreviewSeed {
  let targetSeeds: ChatPreviewTargetSeed[] = []
  let preferredTarget: string | undefined
  let quickReplyIds: string[] = []
  let initialRating = 0
  let maximumRating = 0
  let directQuery = ''
  let socialSortOrder: ChatPreviewSocialSortOrder = 'relevant'
  let socialMessageIds: string[] = []
  let initialLikedIds: string[] = []
  let groupReactionIds: string[] = []
  let initialSelectedReactionIds: string[] = []
  let initialFollowed = false

  if (spec.variant === 1 && content.team) {
    const channels = uniqueIds(content.team.channels.map(({ id }) => id))
    const baseCounts = new Map<string, number>()
    const counted = new Set<string>()
    for (const message of content.team.messages) {
      const key = `${message.channelId}\u0000${message.id}`
      if (counted.has(key)) continue
      counted.add(key)
      baseCounts.set(message.channelId, (baseCounts.get(message.channelId) ?? 0) + 1)
    }
    const team = content.team
    targetSeeds = channels.map((id) => ({
      id,
      maxLocalMessages: strategyLimit(team.listStrategy.expectedMaximum, baseCounts.get(id) ?? 0),
      sendable: true,
      initialDraft:
        id === (team.referenceFlow?.channelId ?? team.initialChannelId)
          ? (team.referenceFlow?.composer.draft ?? '')
          : '',
    }))
    preferredTarget = team.referenceFlow?.channelId ?? team.initialChannelId
  } else if (spec.variant === 2 && content.direct) {
    const contacts = uniqueIds(content.direct.contacts.map(({ id }) => id))
    const baseCounts = new Map<string, number>()
    const counted = new Set<string>()
    for (const message of content.direct.messages) {
      const key = `${message.contactId}\u0000${message.id}`
      if (counted.has(key)) continue
      counted.add(key)
      baseCounts.set(message.contactId, (baseCounts.get(message.contactId) ?? 0) + 1)
    }
    const direct = content.direct
    targetSeeds = contacts.map((id) => ({
      id,
      maxLocalMessages: strategyLimit(direct.listStrategy.expectedMaximum, baseCounts.get(id) ?? 0),
      sendable: true,
      initialDraft:
        id === (direct.referenceFlow?.contactId ?? direct.initialContactId)
          ? (direct.referenceFlow?.composer.draft ?? '')
          : '',
    }))
    preferredTarget = direct.referenceFlow?.contactId ?? direct.initialContactId
    directQuery = direct.referenceFlow?.query ?? ''
  } else if (spec.variant === 3 && content.social) {
    const postId = content.social.post.id
    const layout = content.social.referenceLayout
    socialMessageIds = uniqueIds([
      postId,
      ...content.social.replies.map(({ id }) => id),
      ...(layout?.nestedReplies.map(({ id }) => id) ?? []),
    ])
    socialSortOrder = content.social.referenceFlow?.sortOrder ?? 'relevant'
    const sourceLikedIds = content.social.referenceFlow?.likedIds ?? layout?.initialLikedIds ?? []
    initialLikedIds = uniqueIds(sourceLikedIds).filter((id) => socialMessageIds.includes(id))
    targetSeeds = [
      {
        id: postId,
        maxLocalMessages: strategyLimit(
          content.social.listStrategy.expectedMaximum,
          uniqueIds([
            ...content.social.replies.map(({ id }) => id),
            ...(layout?.nestedReplies.map(({ id }) => id) ?? []),
          ]).length,
        ),
        sendable: true,
        initialDraft: content.social.referenceFlow?.composer.draft ?? '',
      },
    ]
    preferredTarget = postId
  } else if (spec.variant === 4 && content.support) {
    const assistantId = content.support.assistant.id
    const sourceMessages = content.support.referenceLayout?.messages ??
      content.support.referenceFlow?.messages ?? [content.support.assistant]
    const messageMaximum =
      content.support.referenceLayout?.listStrategy.expectedMaximum ?? SUPPORT_PREVIEW_MESSAGE_LIMIT
    targetSeeds = [
      {
        id: assistantId,
        maxLocalMessages: messageLimit(messageMaximum, uniqueIds(sourceMessages.map(({ id }) => id)).length),
        sendable: true,
        initialDraft: content.support.referenceFlow?.composer.draft ?? '',
      },
    ]
    preferredTarget = assistantId
    quickReplyIds = uniqueIds(content.support.quickReplies.map(({ id }) => id))
    maximumRating = Number.isFinite(content.support.maximumRating)
      ? Math.max(0, Math.floor(content.support.maximumRating))
      : 0
    initialRating = clampedRating(content.support.referenceFlow?.rating ?? content.support.initialRating, maximumRating)
  } else if (spec.variant === 5 && content.group) {
    const roomId = spec.id
    const reactionRows = content.group.referenceLayout?.reactions ?? []
    groupReactionIds = uniqueIds(reactionRows.map(({ id }) => id))
    const sourceSelectedReactionIds =
      content.group.referenceFlow?.selectedReactionIds ??
      reactionRows.filter(({ selected }) => selected).map(({ id }) => id)
    initialSelectedReactionIds = uniqueIds(sourceSelectedReactionIds).filter((id) => groupReactionIds.includes(id))
    targetSeeds = [
      {
        id: roomId,
        maxLocalMessages: strategyLimit(
          content.group.listStrategy.expectedMaximum,
          uniqueIds(content.group.messages.map(({ id }) => id)).length,
        ),
        sendable: true,
        initialDraft: content.group.referenceFlow?.composer.draft ?? '',
      },
    ]
    preferredTarget = roomId
  } else if (spec.variant === 6 && content.live) {
    const live = content.live
    initialFollowed = live.referenceFlow?.followed ?? false
    const tabs = uniqueIds(live.tabs.map(({ id }) => id))
    targetSeeds = tabs.map((id) => ({
      id,
      maxLocalMessages:
        id === live.chatTabId
          ? strategyLimit(live.listStrategy.expectedMaximum, uniqueIds(live.messages.map(({ id }) => id)).length)
          : 0,
      sendable: id === live.chatTabId,
      initialDraft:
        id === (live.referenceFlow?.tabId ?? live.initialTabId) ? (live.referenceFlow?.composer.draft ?? '') : '',
    }))
    preferredTarget = live.referenceFlow?.tabId ?? live.initialTabId
  }

  const targets = uniqueTargets(targetSeeds)
  const targetIds = targets.map(({ id }) => id)
  return {
    variantId: spec.id,
    variant: spec.variant,
    initialTargetId: firstTargetId(targetIds, preferredTarget),
    targets,
    quickReplyIds,
    initialRating,
    maximumRating,
    initialDirectQuery: directQuery,
    initialSocialSortOrder: socialSortOrder,
    socialMessageIds,
    initialLikedIds,
    groupReactionIds,
    initialSelectedReactionIds,
    initialFollowed,
  }
}

function initialConversation(target: ChatPreviewTargetSeed): ChatPreviewConversationState {
  return { targetId: target.id, draft: target.initialDraft, messages: [], outcome: 'idle' }
}

function sameConversationList(
  left: readonly ChatPreviewConversationState[],
  right: readonly ChatPreviewConversationState[],
): boolean {
  return left.length === right.length && left.every((conversation, index) => conversation === right[index])
}

/** Isolated, non-persistent state for preview drafts and local-only send acknowledgements. */
export function createChatPreviewStore(seed: ChatPreviewSeed): ChatPreviewStoreApi {
  const storeSequence = ++nextStoreSequence
  let requestSequence = 0
  const targets = uniqueTargets(seed.targets)
  const quickReplyIds = uniqueIds(seed.quickReplyIds)
  const socialMessageIds = uniqueIds(seed.socialMessageIds)
  const initialLikedIds = uniqueIds(seed.initialLikedIds).filter((id) => socialMessageIds.includes(id))
  const groupReactionIds = uniqueIds(seed.groupReactionIds)
  const initialSelectedReactionIds = uniqueIds(seed.initialSelectedReactionIds).filter((id) =>
    groupReactionIds.includes(id),
  )
  const normalizedSeed: ChatPreviewSeed = {
    ...seed,
    targets,
    quickReplyIds,
    socialMessageIds,
    initialLikedIds,
    groupReactionIds,
    initialSelectedReactionIds,
    initialDirectQuery: seed.initialDirectQuery,
    initialSocialSortOrder: seed.initialSocialSortOrder === 'recent' ? 'recent' : 'relevant',
    initialFollowed: seed.initialFollowed,
    initialTargetId: firstTargetId(
      targets.map(({ id }) => id),
      seed.initialTargetId ?? undefined,
    ),
    initialRating: clampedRating(seed.initialRating, seed.maximumRating),
    maximumRating: Math.max(0, Math.floor(seed.maximumRating)),
  }

  return createStore<ChatPreviewStoreState>((set, get) => ({
    ...normalizedSeed,
    activeTargetId: normalizedSeed.initialTargetId,
    directQuery: normalizedSeed.initialDirectQuery,
    socialSortOrder: normalizedSeed.initialSocialSortOrder,
    conversations: targets.map(initialConversation),
    pendingSends: [],
    rating: normalizedSeed.initialRating,
    selectedQuickReplyId: null,
    likedIds: initialLikedIds,
    selectedReactionIds: initialSelectedReactionIds,
    followed: normalizedSeed.initialFollowed,
    reconcileSeed: (nextSeed) => {
      const state = get()
      const nextTargets = uniqueTargets(nextSeed.targets)
      const nextTargetIds = nextTargets.map(({ id }) => id)
      const targetMap = new Map(nextTargets.map((target) => [target.id, target]))
      const conversationMap = new Map(state.conversations.map((conversation) => [conversation.targetId, conversation]))
      const nextConversations = nextTargets.map((target) => {
        const current = conversationMap.get(target.id)
        if (!current) return initialConversation(target)
        const boundedMessages = target.maxLocalMessages > 0 ? current.messages.slice(-target.maxLocalMessages) : []
        return boundedMessages.length === current.messages.length ? current : { ...current, messages: boundedMessages }
      })
      const nextPending = state.pendingSends.filter((request) => {
        const target = targetMap.get(request.targetId)
        return target?.sendable
      })
      const nextQuickReplyIds = uniqueIds(nextSeed.quickReplyIds)
      const retainedLocalSocialIds =
        nextSeed.variant === 3
          ? nextConversations.flatMap((conversation) => conversation.messages.map(({ id }) => id))
          : []
      const nextSocialMessageIds = uniqueIds([...nextSeed.socialMessageIds, ...retainedLocalSocialIds])
      const nextInitialLikedIds = uniqueIds(nextSeed.initialLikedIds).filter((id) => nextSocialMessageIds.includes(id))
      const nextLikedIds = uniqueIds(state.likedIds).filter((id) => nextSocialMessageIds.includes(id))
      const nextGroupReactionIds = uniqueIds(nextSeed.groupReactionIds)
      const nextSelectedReactionIds = uniqueIds(state.selectedReactionIds).filter((id) =>
        nextGroupReactionIds.includes(id),
      )
      const nextInitialSelectedReactionIds = uniqueIds(nextSeed.initialSelectedReactionIds).filter((id) =>
        nextGroupReactionIds.includes(id),
      )
      const nextInitialTargetId = firstTargetId(nextTargetIds, nextSeed.initialTargetId ?? undefined)
      const activeTargetId =
        state.activeTargetId && nextTargetIds.includes(state.activeTargetId)
          ? state.activeTargetId
          : nextInitialTargetId
      const maximumRating = Number.isFinite(nextSeed.maximumRating)
        ? Math.max(0, Math.floor(nextSeed.maximumRating))
        : 0
      const rating = clampedRating(state.rating, maximumRating)
      const selectedQuickReplyId =
        state.selectedQuickReplyId && nextQuickReplyIds.includes(state.selectedQuickReplyId)
          ? state.selectedQuickReplyId
          : null
      const targetsUnchanged = sameTargets(state.targets, nextTargets)
      const conversationsUnchanged = sameConversationList(state.conversations, nextConversations)
      const pendingUnchanged =
        state.pendingSends.length === nextPending.length &&
        state.pendingSends.every((request, index) => request.requestId === nextPending[index]?.requestId)
      const quickRepliesUnchanged = sameIds(state.quickReplyIds, nextQuickReplyIds)
      const socialMessagesUnchanged = sameIds(state.socialMessageIds, nextSocialMessageIds)
      const initialLikesUnchanged = sameIds(state.initialLikedIds, nextInitialLikedIds)
      const likesUnchanged = sameIds(state.likedIds, nextLikedIds)
      const groupReactionsUnchanged = sameIds(state.groupReactionIds, nextGroupReactionIds)
      const selectedReactionsUnchanged = sameIds(state.selectedReactionIds, nextSelectedReactionIds)
      const initialSelectedReactionsUnchanged = sameIds(
        state.initialSelectedReactionIds,
        nextInitialSelectedReactionIds,
      )
      const unchanged =
        state.variantId === nextSeed.variantId &&
        state.variant === nextSeed.variant &&
        state.initialTargetId === nextInitialTargetId &&
        targetsUnchanged &&
        conversationsUnchanged &&
        pendingUnchanged &&
        quickRepliesUnchanged &&
        socialMessagesUnchanged &&
        initialLikesUnchanged &&
        likesUnchanged &&
        groupReactionsUnchanged &&
        selectedReactionsUnchanged &&
        initialSelectedReactionsUnchanged &&
        state.activeTargetId === activeTargetId &&
        state.maximumRating === maximumRating &&
        state.initialRating === clampedRating(nextSeed.initialRating, maximumRating) &&
        state.rating === rating &&
        state.selectedQuickReplyId === selectedQuickReplyId &&
        state.initialDirectQuery === nextSeed.initialDirectQuery &&
        state.initialSocialSortOrder === nextSeed.initialSocialSortOrder &&
        state.initialFollowed === nextSeed.initialFollowed
      if (unchanged) return false
      set({
        variantId: nextSeed.variantId,
        variant: nextSeed.variant,
        initialTargetId: nextInitialTargetId,
        targets: targetsUnchanged ? state.targets : nextTargets,
        conversations: conversationsUnchanged ? state.conversations : nextConversations,
        pendingSends: pendingUnchanged ? state.pendingSends : nextPending,
        quickReplyIds: quickRepliesUnchanged ? state.quickReplyIds : nextQuickReplyIds,
        socialMessageIds: socialMessagesUnchanged ? state.socialMessageIds : nextSocialMessageIds,
        initialLikedIds: initialLikesUnchanged ? state.initialLikedIds : nextInitialLikedIds,
        groupReactionIds: groupReactionsUnchanged ? state.groupReactionIds : nextGroupReactionIds,
        initialSelectedReactionIds: initialSelectedReactionsUnchanged
          ? state.initialSelectedReactionIds
          : nextInitialSelectedReactionIds,
        likedIds: likesUnchanged ? state.likedIds : nextLikedIds,
        selectedReactionIds: selectedReactionsUnchanged ? state.selectedReactionIds : nextSelectedReactionIds,
        activeTargetId,
        initialRating: clampedRating(nextSeed.initialRating, maximumRating),
        maximumRating,
        initialDirectQuery: nextSeed.initialDirectQuery,
        initialSocialSortOrder: nextSeed.initialSocialSortOrder === 'recent' ? 'recent' : 'relevant',
        initialFollowed: nextSeed.initialFollowed,
        // Current local likes, reactions, query and follow state survive a copy/seed refresh for still-current IDs.
        followed: state.followed,
        rating,
        selectedQuickReplyId,
      })
      return true
    },
    setActiveTarget: (targetId) => {
      if (!get().targets.some((target) => target.id === targetId)) return false
      if (get().activeTargetId !== targetId) set({ activeTargetId: targetId })
      return true
    },
    setDraft: (targetId, draft) => {
      const state = get()
      const conversationIndex = state.conversations.findIndex((conversation) => conversation.targetId === targetId)
      if (conversationIndex < 0) return false
      const current = state.conversations[conversationIndex]
      if (!current || current.draft === draft) return true
      const conversations = [...state.conversations]
      conversations[conversationIndex] = { ...current, draft }
      set({ conversations })
      return true
    },
    startSend: (targetId, outcome = 'confirmed') => {
      const state = get()
      const target = state.targets.find((candidate) => candidate.id === targetId)
      const conversation = state.conversations.find((candidate) => candidate.targetId === targetId)
      if (!target?.sendable || !conversation || !conversation.draft.trim()) return null
      if (state.pendingSends.some((request) => request.targetId === targetId)) return null
      requestSequence += 1
      const request: ChatPreviewSendTicket = {
        requestId: `chat-preview:${storeSequence}:${requestSequence}`,
        variantId: state.variantId,
        targetId,
        draftAtSubmit: conversation.draft,
        body: conversation.draft.trim(),
        // At capacity, resolve as an explicit local failure so the draft stays editable.
        previewOutcome: target.maxLocalMessages > 0 ? outcome : 'failed',
      }
      set({ pendingSends: [...state.pendingSends, request] })
      return request
    },
    completeSend: (requestId) => {
      const state = get()
      const request = state.pendingSends.find((candidate) => candidate.requestId === requestId)
      if (!request) return false
      const conversationIndex = state.conversations.findIndex(
        (conversation) => conversation.targetId === request.targetId,
      )
      const conversation = state.conversations[conversationIndex]
      if (!conversation) return false
      const pendingSends = state.pendingSends.filter((candidate) => candidate.requestId !== requestId)
      const target = state.targets.find((candidate) => candidate.id === request.targetId)
      const conversations = [...state.conversations]
      let socialMessageIds = state.socialMessageIds
      let likedIds = state.likedIds
      if (request.previewOutcome === 'failed' || !target || target.maxLocalMessages <= 0) {
        conversations[conversationIndex] = { ...conversation, outcome: 'failed' }
      } else {
        const maxLocalMessages = target?.maxLocalMessages ?? 0
        const message: ChatPreviewMessageDraft = {
          id: request.requestId,
          targetId: request.targetId,
          body: request.body,
        }
        const messages =
          maxLocalMessages > 0 ? [...conversation.messages, message].slice(-maxLocalMessages) : conversation.messages
        conversations[conversationIndex] = {
          ...conversation,
          draft: conversation.draft === request.draftAtSubmit ? '' : conversation.draft,
          messages,
          outcome: 'confirmed',
        }
        if (state.variant === 3) {
          const previousLocalIds = new Set(state.conversations.flatMap((item) => item.messages.map(({ id }) => id)))
          const retainedLocalIds = uniqueIds(conversations.flatMap((item) => item.messages.map(({ id }) => id)))
          const sourceIds = state.socialMessageIds.filter((id) => !previousLocalIds.has(id))
          socialMessageIds = uniqueIds([...sourceIds, ...retainedLocalIds])
          likedIds = state.likedIds.filter((id) => socialMessageIds.includes(id))
        }
      }
      set({ pendingSends, conversations, socialMessageIds, likedIds })
      return true
    },
    cancelSend: (requestId) => {
      const state = get()
      if (!state.pendingSends.some((request) => request.requestId === requestId)) return false
      set({ pendingSends: state.pendingSends.filter((request) => request.requestId !== requestId) })
      return true
    },
    setRating: (rating) => {
      const state = get()
      const nextRating = clampedRating(rating, state.maximumRating)
      if (!Number.isFinite(rating)) return false
      if (nextRating !== state.rating) set({ rating: nextRating })
      return true
    },
    selectQuickReply: (id) => {
      if (!get().quickReplyIds.includes(id)) return false
      set({ selectedQuickReplyId: id })
      return true
    },
    setDirectQuery: (directQuery) => {
      if (directQuery !== get().directQuery) set({ directQuery })
    },
    setSocialSortOrder: (socialSortOrder) => {
      if (socialSortOrder !== 'relevant' && socialSortOrder !== 'recent') return
      if (socialSortOrder !== get().socialSortOrder) set({ socialSortOrder })
    },
    toggleSocialLike: (messageId) => {
      const state = get()
      if (!state.socialMessageIds.includes(messageId)) return false
      const likedIds = state.likedIds.includes(messageId)
        ? state.likedIds.filter((id) => id !== messageId)
        : [...state.likedIds, messageId]
      set({ likedIds })
      return true
    },
    toggleGroupReaction: (reactionId) => {
      const state = get()
      if (!state.groupReactionIds.includes(reactionId)) return false
      const selectedReactionIds = state.selectedReactionIds.includes(reactionId)
        ? state.selectedReactionIds.filter((id) => id !== reactionId)
        : [...state.selectedReactionIds, reactionId]
      set({ selectedReactionIds })
      return true
    },
    setFollowed: (followed) => {
      if (get().followed !== followed) set({ followed })
      return true
    },
    getConversation: (targetId) => get().conversations.find((conversation) => conversation.targetId === targetId),
    clearOwner: () => {
      const state = get()
      if (state.pendingSends.length > 0) set({ pendingSends: [] })
    },
  }))
}
