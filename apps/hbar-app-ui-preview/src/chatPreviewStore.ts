import { createStore, type StoreApi } from 'zustand/vanilla'
import type { HbarAppUiVariantSpec } from 'hbar-app-ui/catalog'
import type { HbarAppUiChatContent } from 'hbar-app-ui/chat'

const MAX_LOCAL_PREVIEW_MESSAGES = 20
const SUPPORT_PREVIEW_MESSAGE_LIMIT = 12

export type ChatPreviewSubmitOutcome = 'confirmed' | 'failed'
export type ChatPreviewConversationOutcome = 'idle' | 'confirmed' | 'failed'

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
  readonly conversations: readonly ChatPreviewConversationState[]
  readonly pendingSends: readonly ChatPreviewSendTicket[]
  readonly rating: number
  readonly selectedQuickReplyId: string | null
  readonly reconcileSeed: (seed: ChatPreviewSeed) => boolean
  readonly setActiveTarget: (targetId: string) => boolean
  readonly setDraft: (targetId: string, draft: string) => boolean
  readonly startSend: (targetId: string, outcome?: ChatPreviewSubmitOutcome) => ChatPreviewSendTicket | null
  readonly completeSend: (requestId: string) => boolean
  readonly cancelSend: (requestId: string) => boolean
  readonly setRating: (rating: number) => boolean
  readonly selectQuickReply: (id: string) => boolean
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

  if (spec.variant === 1 && content.team) {
    const channels = uniqueIds(content.team.channels.map(({ id }) => id))
    const baseCounts = new Map<string, number>()
    for (const message of content.team.messages)
      baseCounts.set(message.channelId, (baseCounts.get(message.channelId) ?? 0) + 1)
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
    for (const message of content.direct.messages)
      baseCounts.set(message.contactId, (baseCounts.get(message.contactId) ?? 0) + 1)
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
  } else if (spec.variant === 3 && content.social) {
    const postId = content.social.post.id
    targetSeeds = [
      {
        id: postId,
        maxLocalMessages: strategyLimit(content.social.listStrategy.expectedMaximum, content.social.replies.length),
        sendable: true,
        initialDraft: content.social.referenceFlow?.composer.draft ?? '',
      },
    ]
    preferredTarget = postId
  } else if (spec.variant === 4 && content.support) {
    const assistantId = content.support.assistant.id
    const sourceMessages = content.support.referenceFlow?.messages ?? [content.support.assistant]
    targetSeeds = [
      {
        id: assistantId,
        maxLocalMessages: messageLimit(SUPPORT_PREVIEW_MESSAGE_LIMIT, sourceMessages.length),
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
    targetSeeds = [
      {
        id: roomId,
        maxLocalMessages: strategyLimit(content.group.listStrategy.expectedMaximum, content.group.messages.length),
        sendable: true,
        initialDraft: content.group.referenceFlow?.composer.draft ?? '',
      },
    ]
    preferredTarget = roomId
  } else if (spec.variant === 6 && content.live) {
    const live = content.live
    const tabs = uniqueIds(live.tabs.map(({ id }) => id))
    targetSeeds = tabs.map((id) => ({
      id,
      maxLocalMessages:
        id === live.chatTabId ? strategyLimit(live.listStrategy.expectedMaximum, live.messages.length) : 0,
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
  const normalizedSeed: ChatPreviewSeed = {
    ...seed,
    targets,
    quickReplyIds,
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
    conversations: targets.map(initialConversation),
    pendingSends: [],
    rating: normalizedSeed.initialRating,
    selectedQuickReplyId: null,
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
      const unchanged =
        state.variantId === nextSeed.variantId &&
        state.variant === nextSeed.variant &&
        state.initialTargetId === nextInitialTargetId &&
        targetsUnchanged &&
        conversationsUnchanged &&
        pendingUnchanged &&
        quickRepliesUnchanged &&
        state.activeTargetId === activeTargetId &&
        state.maximumRating === maximumRating &&
        state.initialRating === clampedRating(nextSeed.initialRating, maximumRating) &&
        state.rating === rating &&
        state.selectedQuickReplyId === selectedQuickReplyId
      if (unchanged) return false
      set({
        variantId: nextSeed.variantId,
        variant: nextSeed.variant,
        initialTargetId: nextInitialTargetId,
        targets: targetsUnchanged ? state.targets : nextTargets,
        conversations: conversationsUnchanged ? state.conversations : nextConversations,
        pendingSends: pendingUnchanged ? state.pendingSends : nextPending,
        quickReplyIds: quickRepliesUnchanged ? state.quickReplyIds : nextQuickReplyIds,
        activeTargetId,
        initialRating: clampedRating(nextSeed.initialRating, maximumRating),
        maximumRating,
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
      }
      set({ pendingSends, conversations })
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
    getConversation: (targetId) => get().conversations.find((conversation) => conversation.targetId === targetId),
    clearOwner: () => {
      const state = get()
      if (state.pendingSends.length > 0) set({ pendingSends: [] })
    },
  }))
}
