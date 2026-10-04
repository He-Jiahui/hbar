import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { HbarAppUiSupportProvider, type HbarAppUiSupportContent, type HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { createSupportThreadPreviewStore, type SupportThreadPreviewOutcome } from './supportThreadPreviewStore'
import type { SupportThreadPreviewCopy } from './supportThreadPreviewCopy'

type Thread = NonNullable<HbarAppUiSupportContent['thread']>
type ThreadMessage = Thread['messages'][number]
type FlowLabels = NonNullable<Thread['referenceFlow']>['labels']

type SupportThreadPreviewHostProps = Pick<HbarAppUiVariantProps, 'onAction' | 'spec'> & {
  readonly content: HbarAppUiSupportContent
  readonly labels: SupportThreadPreviewCopy
  readonly threadId?: string | undefined
  readonly replyPreviewOutcome?: SupportThreadPreviewOutcome | undefined
  readonly resolvePreviewOutcome?: SupportThreadPreviewOutcome | undefined
  readonly showResolutionControl?: boolean | undefined
  readonly children: ReactNode
}

export function SupportThreadPreviewHost(props: SupportThreadPreviewHostProps) {
  const thread = props.content.thread
  if (props.spec.category !== 'support' || props.spec.variant !== 3 || !thread) {
    return props.children
  }

  const threadId = props.threadId ?? props.spec.id
  const sourceMessageCount = new Set(thread.messages.map(({ id }) => id)).size
  const maximumAdditionalMessages = Math.max(0, Math.min(20, thread.listStrategy.expectedMaximum - sourceMessageCount))
  return (
    <SupportThreadPreviewOwner
      key={JSON.stringify([props.spec.id, threadId])}
      {...props}
      thread={thread}
      threadId={threadId}
      maximumAdditionalMessages={maximumAdditionalMessages}
    />
  )
}

function SupportThreadPreviewOwner({
  content,
  labels,
  spec,
  onAction,
  threadId,
  thread,
  maximumAdditionalMessages,
  replyPreviewOutcome = 'confirmed',
  resolvePreviewOutcome = 'confirmed',
  showResolutionControl = false,
  children,
}: SupportThreadPreviewHostProps & {
  readonly thread: Thread
  readonly threadId: string
  readonly maximumAdditionalMessages: number
}) {
  const [store] = useState(() => createSupportThreadPreviewStore(threadId, maximumAdditionalMessages))
  const state = useStore(store)
  const active = useRef(false)
  const action = useRef(onAction)
  action.current = onAction

  useLayoutEffect(() => {
    active.current = true
    return () => {
      active.current = false
      store.getState().cancelPending()
    }
  }, [store])

  useLayoutEffect(() => {
    store.getState().setMaximumAdditionalMessages(maximumAdditionalMessages)
  }, [maximumAdditionalMessages, store])

  const replyRequestId = state.pendingReplyRequest?.requestId ?? null
  useEffect(() => {
    if (!replyRequestId) return undefined
    const timer = setTimeout(() => {
      if (!active.current) return
      store.getState().completeReply(replyRequestId, replyPreviewOutcome)
    }, 400)
    return () => clearTimeout(timer)
  }, [replyRequestId, replyPreviewOutcome, store])

  const resolutionRequestId = state.pendingResolutionRequest?.requestId ?? null
  useEffect(() => {
    if (!resolutionRequestId) return undefined
    const timer = setTimeout(() => {
      if (!active.current) return
      store.getState().completeResolution(resolutionRequestId, resolvePreviewOutcome)
    }, 400)
    return () => clearTimeout(timer)
  }, [resolutionRequestId, resolvePreviewOutcome, store])

  function submitReply(): void {
    if (!active.current) return
    const request = store.getState().startReply()
    if (!request) return
    action.current?.({ variantId: spec.id, actionId: 'reply', value: JSON.stringify(request) })
  }

  function toggleResolution(resolved: boolean): void {
    if (!active.current) return
    const request = store.getState().startResolution(resolved)
    if (!request) return
    action.current?.({
      variantId: spec.id,
      actionId: request.resolved ? 'resolve' : 'reopen',
      value: JSON.stringify(request),
    })
  }

  const extraMessages: readonly ThreadMessage[] = state.confirmedReplies.map((reply) => ({
    ...labels.ownMessage,
    id: reply.id,
    body: reply.body,
    own: true,
  }))
  const messagesById = new Map(thread.messages.map((message) => [message.id, message]))
  for (const message of extraMessages) {
    if (!messagesById.has(message.id)) messagesById.set(message.id, message)
  }
  const flowLabels: FlowLabels = {
    replyLabel: labels.replyLabel,
    replyPending: labels.replyPending,
    replyConfirmed: labels.replyConfirmed,
    replyErrorUnavailable: labels.replyErrorUnavailable,
    replyLimitReached: labels.replyLimitReached,
    resolvePending: labels.resolvePending,
    resolveConfirmed: labels.resolveConfirmed,
    resolveErrorUnavailable: labels.resolveErrorUnavailable,
  }

  return (
    <HbarAppUiSupportProvider
      content={{
        ...content,
        thread: {
          ...thread,
          ownMessage: labels.ownMessage,
          messages: [...messagesById.values()],
          referenceFlow: {
            resolved: state.resolved,
            reply: state.reply,
            replyPhase: state.replyPhase,
            resolvePhase: state.resolvePhase,
            replyErrorCode: state.replyErrorCode,
            resolveErrorCode: state.resolveErrorCode,
            replyLimitReached: state.confirmedReplies.length >= state.maximumAdditionalMessages,
            showResolutionControl,
            labels: flowLabels,
            onReplyChange: (reply) => {
              if (active.current) store.getState().setReply(reply)
            },
            onSubmitReply: submitReply,
            onToggleResolution: toggleResolution,
          },
        },
      }}
    >
      {children}
    </HbarAppUiSupportProvider>
  )
}
