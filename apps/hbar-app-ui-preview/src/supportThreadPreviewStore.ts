import { createStore } from 'zustand/vanilla'

export type SupportThreadPreviewOutcome = 'confirmed' | 'failed'
export type SupportThreadPreviewFailureCode = 'unavailable' | 'limit-reached'

export interface SupportThreadPreviewReply {
  readonly id: string
  readonly body: string
}

export interface SupportThreadReplyPreviewRequest {
  readonly requestId: string
  readonly threadId: string
  readonly outcome: 'preview-only'
  readonly confirmation: 'unverified'
  readonly reply: string
}

export interface SupportThreadResolutionPreviewRequest {
  readonly requestId: string
  readonly threadId: string
  readonly outcome: 'preview-only'
  readonly confirmation: 'unverified'
  readonly resolved: boolean
}

export interface SupportThreadPreviewState {
  readonly threadId: string
  readonly reply: string
  readonly replyPhase: 'idle' | 'pending' | 'confirmed' | 'failed'
  readonly replyErrorCode: SupportThreadPreviewFailureCode | null
  readonly confirmedReplies: readonly SupportThreadPreviewReply[]
  readonly maximumAdditionalMessages: number
  readonly resolved: boolean
  readonly resolvePhase: 'idle' | 'pending' | 'confirmed' | 'failed'
  readonly resolveErrorCode: 'unavailable' | null
  readonly pendingReplyRequest: SupportThreadReplyPreviewRequest | null
  readonly pendingResolutionRequest: SupportThreadResolutionPreviewRequest | null
  readonly setReply: (reply: string) => void
  readonly setMaximumAdditionalMessages: (maximum: number) => void
  readonly startReply: () => SupportThreadReplyPreviewRequest | null
  readonly completeReply: (requestId: string, outcome: SupportThreadPreviewOutcome) => boolean
  readonly startResolution: (resolved: boolean) => SupportThreadResolutionPreviewRequest | null
  readonly completeResolution: (requestId: string, outcome: SupportThreadPreviewOutcome) => boolean
  readonly cancelPending: () => boolean
}

function boundedMaximum(maximum: number): number {
  return Number.isFinite(maximum) ? Math.max(0, Math.min(20, Math.floor(maximum))) : 0
}

function recentReplies(
  messages: readonly SupportThreadPreviewReply[],
  maximum: number,
): readonly SupportThreadPreviewReply[] {
  return maximum === 0 ? [] : messages.slice(-maximum)
}

let nextOwner = 0

export function createSupportThreadPreviewStore(threadId: string, maximumAdditionalMessages: number) {
  const ownerId = ++nextOwner
  let sequence = 0

  return createStore<SupportThreadPreviewState>((set, get) => ({
    threadId,
    reply: '',
    replyPhase: 'idle',
    replyErrorCode: null,
    confirmedReplies: [],
    maximumAdditionalMessages: boundedMaximum(maximumAdditionalMessages),
    resolved: false,
    resolvePhase: 'idle',
    resolveErrorCode: null,
    pendingReplyRequest: null,
    pendingResolutionRequest: null,
    setReply: (reply) => {
      const current = get()
      if (current.replyPhase === 'pending' || current.reply === reply) return
      set({ reply, replyPhase: 'idle', replyErrorCode: null })
    },
    setMaximumAdditionalMessages: (maximum) => {
      const nextMaximum = boundedMaximum(maximum)
      const current = get()
      const confirmedReplies = recentReplies(current.confirmedReplies, nextMaximum)
      const capacityReached = confirmedReplies.length >= nextMaximum
      set({
        maximumAdditionalMessages: nextMaximum,
        confirmedReplies,
        ...(capacityReached && current.pendingReplyRequest
          ? { replyPhase: 'idle' as const, replyErrorCode: null, pendingReplyRequest: null }
          : {}),
      })
    },
    startReply: () => {
      const current = get()
      if (
        current.replyPhase === 'pending' ||
        current.pendingReplyRequest ||
        current.pendingResolutionRequest ||
        current.resolved ||
        !current.reply.trim() ||
        current.confirmedReplies.length >= current.maximumAdditionalMessages
      ) {
        return null
      }
      const request: SupportThreadReplyPreviewRequest = {
        requestId: `support-thread:${ownerId}:${++sequence}`,
        threadId,
        outcome: 'preview-only',
        confirmation: 'unverified',
        reply: current.reply.trim(),
      }
      set({ replyPhase: 'pending', replyErrorCode: null, pendingReplyRequest: request })
      return request
    },
    completeReply: (requestId, outcome) => {
      const current = get()
      const request = current.pendingReplyRequest
      if (current.replyPhase !== 'pending' || request?.requestId !== requestId || request.threadId !== threadId) {
        return false
      }
      if (outcome === 'failed') {
        set({ replyPhase: 'failed', replyErrorCode: 'unavailable', pendingReplyRequest: null })
        return true
      }
      if (current.confirmedReplies.length >= current.maximumAdditionalMessages) {
        set({ replyPhase: 'failed', replyErrorCode: 'limit-reached', pendingReplyRequest: null })
        return true
      }
      set({
        reply: '',
        replyPhase: 'confirmed',
        replyErrorCode: null,
        pendingReplyRequest: null,
        confirmedReplies: recentReplies(
          [...current.confirmedReplies, { id: request.requestId, body: request.reply }],
          current.maximumAdditionalMessages,
        ),
      })
      return true
    },
    startResolution: (resolved) => {
      const current = get()
      if (
        current.resolvePhase === 'pending' ||
        current.pendingResolutionRequest ||
        current.pendingReplyRequest ||
        current.resolved === resolved
      ) {
        return null
      }
      const request: SupportThreadResolutionPreviewRequest = {
        requestId: `support-thread:${ownerId}:${++sequence}`,
        threadId,
        outcome: 'preview-only',
        confirmation: 'unverified',
        resolved,
      }
      set({ resolvePhase: 'pending', resolveErrorCode: null, pendingResolutionRequest: request })
      return request
    },
    completeResolution: (requestId, outcome) => {
      const current = get()
      const request = current.pendingResolutionRequest
      if (current.resolvePhase !== 'pending' || request?.requestId !== requestId || request.threadId !== threadId) {
        return false
      }
      set({
        ...(outcome === 'confirmed' ? { resolved: request.resolved } : {}),
        resolvePhase: outcome,
        resolveErrorCode: outcome === 'failed' ? 'unavailable' : null,
        pendingResolutionRequest: null,
      })
      return true
    },
    cancelPending: () => {
      const current = get()
      const cancelledReply = Boolean(current.pendingReplyRequest)
      const cancelledResolution = Boolean(current.pendingResolutionRequest)
      if (!cancelledReply && !cancelledResolution) return false
      set({
        ...(cancelledReply ? { replyPhase: 'idle' as const, replyErrorCode: null, pendingReplyRequest: null } : {}),
        ...(cancelledResolution
          ? { resolvePhase: 'idle' as const, resolveErrorCode: null, pendingResolutionRequest: null }
          : {}),
      })
      return true
    },
  }))
}
