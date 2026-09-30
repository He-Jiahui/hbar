import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { HbarAppUiSupportProvider, type HbarAppUiSupportContent, type HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { createSupportTicketPreviewStore, type SupportTicketPreviewOutcome } from './supportTicketPreviewStore'

type SupportTicketPreviewLabels = NonNullable<NonNullable<HbarAppUiSupportContent['ticket']>['referenceFlow']>['labels']

type SupportTicketPreviewHostProps = Pick<HbarAppUiVariantProps, 'onAction' | 'spec'> & {
  readonly content: HbarAppUiSupportContent
  readonly labels: SupportTicketPreviewLabels
  readonly submitPreviewOutcome?: SupportTicketPreviewOutcome | undefined
  readonly children: ReactNode
}

export function SupportTicketPreviewHost(props: SupportTicketPreviewHostProps) {
  const ticket = props.content.ticket
  if (props.spec.category !== 'support' || props.spec.variant !== 2 || !ticket) {
    return props.children
  }

  const ownerKey = JSON.stringify([
    ticket.initialAreaId,
    ticket.initialWorkspaceId,
    ticket.initialPriorityId,
    ticket.initialSubject,
    ticket.attachmentName,
  ])
  return <SupportTicketPreviewOwner key={ownerKey} {...props} ticket={ticket} />
}

function SupportTicketPreviewOwner({
  content,
  labels,
  spec,
  onAction,
  submitPreviewOutcome = 'confirmed',
  children,
  ticket,
}: SupportTicketPreviewHostProps & {
  readonly ticket: NonNullable<HbarAppUiSupportContent['ticket']>
}) {
  const [store] = useState(() => createSupportTicketPreviewStore(ticket))
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
    store
      .getState()
      .replaceChoices({ areas: ticket.areas, workspaces: ticket.workspaces, priorities: ticket.priorities })
  }, [store, ticket.areas, ticket.workspaces, ticket.priorities])

  const pendingRequestId = state.pendingRequest?.requestId ?? null
  useEffect(() => {
    if (!pendingRequestId) return undefined
    const timer = setTimeout(() => {
      if (!active.current) return
      const error = submitPreviewOutcome === 'failed' ? labels.errorUnavailable : null
      store.getState().completePending(pendingRequestId, submitPreviewOutcome, error)
    }, 400)
    return () => clearTimeout(timer)
  }, [labels.errorUnavailable, pendingRequestId, store, submitPreviewOutcome])

  function submit(): void {
    if (!active.current) return
    const request = store.getState().startSubmit()
    if (!request) return
    action.current?.({ variantId: spec.id, actionId: 'submit', value: JSON.stringify(request) })
  }

  function saveDraft(): void {
    if (!active.current) return
    const phase = store.getState().phase
    if (phase !== 'idle' && phase !== 'failed') return
    action.current?.({ variantId: spec.id, actionId: 'save', value: 'preview-only' })
  }

  return (
    <HbarAppUiSupportProvider
      content={{
        ...content,
        ticket: {
          ...ticket,
          referenceFlow: {
            areaId: state.areaId,
            workspaceId: state.workspaceId,
            priorityId: state.priorityId,
            subject: state.subject,
            description: state.description,
            attached: state.attached,
            phase: state.phase,
            error: state.error,
            labels,
            onAreaChange: (areaId) => {
              if (active.current) store.getState().setAreaId(areaId)
            },
            onWorkspaceChange: (workspaceId) => {
              if (active.current) store.getState().setWorkspaceId(workspaceId)
            },
            onPriorityChange: (priorityId) => {
              if (active.current) store.getState().setPriorityId(priorityId)
            },
            onSubjectChange: (subject) => {
              if (active.current) store.getState().setSubject(subject)
            },
            onDescriptionChange: (description) => {
              if (active.current) store.getState().setDescription(description)
            },
            onAttachmentAdd: () => {
              if (active.current) store.getState().addAttachment()
            },
            onAttachmentRemove: () => {
              if (active.current) store.getState().removeAttachment()
            },
            onSubmit: submit,
            onSaveDraft: saveDraft,
          },
        },
      }}
    >
      {children}
    </HbarAppUiSupportProvider>
  )
}
