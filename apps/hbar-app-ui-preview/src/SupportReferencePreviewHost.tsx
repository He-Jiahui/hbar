import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { HbarAppUiSupportProvider, type HbarAppUiSupportContent, type HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { createSupportBrowsePreviewStore, type SupportBrowsePreviewSeed } from './supportBrowsePreviewStore'
import { createSupportThreadPreviewStore, type SupportThreadPreviewOutcome } from './supportThreadPreviewStore'
import { createSupportReferencePreviewCopy } from './supportReferencePreviewCopy'

export interface SupportReferencePreviewHostProps extends Pick<HbarAppUiVariantProps, 'spec' | 'onAction'> {
  readonly content: HbarAppUiSupportContent
  readonly locale: 'en' | 'de'
  readonly assistantOutcome?: SupportThreadPreviewOutcome | undefined
  readonly children: ReactNode
}

type AssistantContent = NonNullable<HbarAppUiSupportContent['assistant']>
type AssistantLayout = NonNullable<AssistantContent['referenceLayout']>

export function SupportReferencePreviewHost(props: SupportReferencePreviewHostProps) {
  if (props.spec.category !== 'support') return props.children
  const assistant = props.content.assistant
  if (props.spec.variant === 4 && assistant?.referenceLayout) {
    return (
      <AssistantOwner
        key={JSON.stringify([props.spec.id, assistant.referenceLayout.conversationId])}
        {...props}
        assistant={assistant}
        layout={assistant.referenceLayout}
      />
    )
  }
  if (
    (props.spec.variant === 1 && props.content.help?.referenceLayout) ||
    (props.spec.variant === 5 && props.content.requests?.referenceLayout)
  ) {
    return <BrowseOwner key={props.spec.id} {...props} />
  }
  return props.children
}

function BrowseOwner({ content, spec, children }: SupportReferencePreviewHostProps) {
  const seed = useMemo<SupportBrowsePreviewSeed>(() => {
    const choices = spec.variant === 5 ? (content.requests?.statuses ?? []) : []
    return {
      statusIds: choices.filter((item) => !item.disabled).map(({ id }) => id),
      initialStatusId: spec.variant === 5 ? (content.requests?.initialStatusId ?? null) : null,
    }
  }, [content.requests, spec.variant])
  const [store] = useState(() => createSupportBrowsePreviewStore(seed))
  const query = useStore(store, (state) => state.query)
  const statusId = useStore(store, (state) => state.statusId)
  const active = useRef(false)
  useLayoutEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  useLayoutEffect(() => {
    store.getState().reconcile(seed)
  }, [seed, store])
  const changeQuery = (nextQuery: string) => {
    if (active.current) store.getState().setQuery(nextQuery)
  }
  return (
    <HbarAppUiSupportProvider
      content={{
        ...content,
        help:
          content.help && spec.variant === 1
            ? {
                ...content.help,
                referenceFlow: { query, onQueryChange: changeQuery },
              }
            : content.help,
        requests:
          content.requests && spec.variant === 5
            ? {
                ...content.requests,
                referenceFlow: {
                  query,
                  statusId,
                  onQueryChange: changeQuery,
                  onStatusChange: (id) => {
                    if (active.current) store.getState().selectStatus(id)
                  },
                },
              }
            : content.requests,
      }}
    >
      {children}
    </HbarAppUiSupportProvider>
  )
}

function AssistantOwner({
  content,
  assistant,
  layout,
  spec,
  onAction,
  locale,
  children,
  assistantOutcome = 'confirmed',
}: SupportReferencePreviewHostProps & { readonly assistant: AssistantContent; readonly layout: AssistantLayout }) {
  const sourceCount = new Set(assistant.messages.map(({ id }) => id)).size
  const maximum = Number.isFinite(assistant.listStrategy.expectedMaximum)
    ? Math.max(0, Math.min(20, Math.floor(assistant.listStrategy.expectedMaximum) - sourceCount))
    : 0
  // The existing support reply machine owns drafts/tickets. Open is only ephemeral widget visibility.
  const [store] = useState(() => createSupportThreadPreviewStore(layout.conversationId, maximum))
  const [open, setOpen] = useState(layout.initialOpen)
  const draft = useStore(store, (state) => state.reply)
  const phase = useStore(store, (state) => state.replyPhase)
  const errorCode = useStore(store, (state) => state.replyErrorCode)
  const localMessages = useStore(store, (state) => state.confirmedReplies)
  const requestId = useStore(store, (state) => state.pendingReplyRequest?.requestId ?? null)
  const active = useRef(false)
  const action = useRef(onAction)
  action.current = onAction
  const copy = createSupportReferencePreviewCopy(locale)
  const limitReached = localMessages.length >= maximum

  useLayoutEffect(() => {
    active.current = true
    return () => {
      active.current = false
      store.getState().cancelPending()
    }
  }, [store])
  useLayoutEffect(() => {
    store.getState().setMaximumAdditionalMessages(maximum)
  }, [store, maximum])
  useEffect(() => {
    if (!requestId) return undefined
    const timer = setTimeout(() => {
      if (active.current) store.getState().completeReply(requestId, assistantOutcome)
    }, 400)
    return () => clearTimeout(timer)
  }, [requestId, assistantOutcome, store])

  const error =
    limitReached || errorCode === 'limit-reached' ? copy.limitReached : phase === 'failed' ? copy.failed : null
  const feedback = phase === 'pending' ? copy.pending : phase === 'confirmed' ? copy.confirmed : null
  return (
    <HbarAppUiSupportProvider
      content={{
        ...content,
        assistant: {
          ...assistant,
          messages: [
            ...assistant.messages,
            ...localMessages.map((message) => ({
              ...message,
              own: true,
              status: copy.notDelivered,
            })),
          ],
          referenceFlow: {
            open,
            draft,
            pending: phase === 'pending',
            limitReached,
            error,
            feedback,
            onDraftChange: (value) => {
              if (active.current) store.getState().setReply(value)
            },
            onOpenChange: (nextOpen) => {
              if (!active.current) return
              if (!nextOpen) store.getState().cancelPending()
              setOpen(nextOpen)
            },
            onSubmit: () => {
              if (!active.current || !open) return
              const request = store.getState().startReply()
              if (request)
                action.current?.({
                  variantId: spec.id,
                  actionId: 'assistant-send-preview',
                  value: JSON.stringify(request),
                })
            },
          },
        },
      }}
    >
      {children}
    </HbarAppUiSupportProvider>
  )
}
