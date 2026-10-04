import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { HbarAppUiBillingProvider, type HbarAppUiBillingContent, type HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import {
  createBillingReferencePreviewStore,
  type BillingReferencePreviewSeed,
  type BillingReferencePreviewOperation,
} from './billingReferencePreviewStore'
import { createBillingReferencePreviewCopy } from './billingReferencePreviewCopy'

export interface BillingReferencePreviewHostProps extends Pick<HbarAppUiVariantProps, 'spec' | 'onAction'> {
  readonly content: HbarAppUiBillingContent
  readonly locale: 'en' | 'de'
  readonly outcome?: 'confirmed' | 'failed' | undefined
  readonly children: ReactNode
}

function previewSeed(content: HbarAppUiBillingContent, variant: number): BillingReferencePreviewSeed | null {
  const base = {
    targetIds: [],
    initialSelectionId: null,
    initialExpandedIds: [],
    flags: [],
    initialDirty: false,
    fields: [],
    valueLimit: 5000,
  }
  switch (variant) {
    case 1:
      return content.statement?.referenceLayout ? { ...base, ownerId: 'billing-statement', kind: 'statement' } : null
    case 2: {
      const input = content.plans
      return input?.referenceLayout
        ? {
            ...base,
            ownerId: input.referenceLayout.ownerId,
            kind: 'plans',
            initialDirty: input.initialDirty ?? false,
            flags: input.plans.flatMap((plan) =>
              plan.toggles.map((flag) => ({ planId: plan.id, toggleId: flag.id, enabled: flag.enabled })),
            ),
          }
        : null
    }
    case 3: {
      const input = content.invoiceComposer
      return input?.referenceLayout
        ? {
            ...base,
            ownerId: input.referenceLayout.draftId,
            kind: 'invoice',
            valueLimit: input.referenceLayout.valueLimit,
            fields: input.sections.flatMap(({ fields }) =>
              fields.map((field) => ({
                id: field.id,
                value: field.value,
                choices: field.choices?.map(({ id }) => id),
              })),
            ),
          }
        : null
    }
    case 4: {
      const input = content.recovery
      return input?.referenceLayout
        ? {
            ...base,
            ownerId: 'billing-recovery',
            kind: 'recovery',
            targetIds: input.subscriptions.map(({ id }) => id),
            initialExpandedIds: input.initialExpandedId ? [input.initialExpandedId] : [],
          }
        : null
    }
    case 5: {
      const input = content.changePlan
      return input?.referenceLayout
        ? {
            ...base,
            ownerId: input.referenceLayout.ownerId,
            kind: 'change-plan',
            targetIds: input.choices.map(({ id }) => id),
            initialSelectionId: input.initialChoiceId,
          }
        : null
    }
    case 6: {
      const input = content.paymentMethods
      return input?.referenceLayout
        ? {
            ...base,
            ownerId: input.referenceLayout.ownerId,
            kind: 'payment-methods',
            targetIds: input.methods.map(({ id }) => id),
            initialSelectionId: input.methods.find(({ primary }) => primary)?.id ?? null,
          }
        : null
    }
    case 7: {
      const input = content.usage
      return input?.referenceLayout
        ? {
            ...base,
            ownerId: input.referenceLayout.ownerId,
            kind: 'usage',
            targetIds: input.periods.map(({ id }) => id),
            initialSelectionId: input.initialPeriodId,
          }
        : null
    }
    case 8:
      return content.invoiceDetail?.referenceLayout
        ? { ...base, ownerId: content.invoiceDetail.invoice, kind: 'detail' }
        : null
    default:
      return null
  }
}

export function BillingReferencePreviewHost(props: BillingReferencePreviewHostProps) {
  if (props.spec.category !== 'billing') return props.children
  const seed = previewSeed(props.content, props.spec.variant)
  if (!seed) return props.children
  return <BillingReferenceOwner key={JSON.stringify([props.spec.id, seed.ownerId])} {...props} />
}

function BillingReferenceOwner({
  content,
  spec,
  onAction,
  locale,
  outcome = 'confirmed',
  children,
}: BillingReferencePreviewHostProps) {
  const seed = useMemo(() => previewSeed(content, spec.variant), [content, spec.variant])
  const [store] = useState(() => {
    if (!seed) throw new Error('The billing reference owner needs a supported source contract')
    return createBillingReferencePreviewStore(seed)
  })
  const query = useStore(store, (state) => state.query)
  const selectionId = useStore(store, (state) => state.selectionId)
  const expandedIds = useStore(store, (state) => state.expandedIds)
  const flags = useStore(store, (state) => state.flags)
  const dirty = useStore(store, (state) => state.dirty)
  const values = useStore(store, (state) => state.values)
  const phase = useStore(store, (state) => state.phase)
  const requestId = useStore(store, (state) => state.pendingRequest?.requestId ?? null)
  const active = useRef(false)
  const action = useRef(onAction)
  action.current = onAction
  const copy = createBillingReferencePreviewCopy(locale)
  const status = {
    pending: phase === 'pending',
    error: phase === 'failed' ? copy.failed : null,
    feedback: phase === 'idle' || phase === 'failed' ? null : copy[phase],
  }

  useLayoutEffect(() => {
    active.current = true
    return () => {
      active.current = false
      store.getState().cancelPending()
    }
  }, [store])
  useLayoutEffect(() => {
    if (seed) store.getState().reconcile(seed)
  }, [seed, store])
  useEffect(() => {
    if (!requestId) return undefined
    const timer = setTimeout(() => {
      if (active.current) store.getState().completeRequest(requestId, outcome)
    }, 400)
    return () => clearTimeout(timer)
  }, [requestId, store, outcome])

  const request = (operation: BillingReferencePreviewOperation, targetId?: string) => {
    if (!active.current) return
    const ticket = store.getState().startRequest(operation, targetId)
    if (ticket)
      action.current?.({ variantId: spec.id, actionId: `billing-${operation}-preview`, value: JSON.stringify(ticket) })
  }
  const intent = (actionId: string, value: unknown) => {
    if (active.current) action.current?.({ variantId: spec.id, actionId, value: JSON.stringify(value) })
  }
  let projected = content
  switch (spec.variant) {
    case 1:
      if (content.statement)
        projected = {
          ...content,
          statement: {
            ...content.statement,
            referenceFlow: {
              query,
              onQueryChange: (value) => {
                if (active.current) store.getState().setQuery(value)
              },
            },
          },
        }
      break
    case 2:
      if (content.plans)
        projected = {
          ...content,
          plans: {
            ...content.plans,
            referenceFlow: {
              ...status,
              flags,
              dirty,
              onToggle: (planId, toggleId, enabled) => {
                if (active.current) store.getState().setFlag(planId, toggleId, enabled)
              },
              onDiscard: () => {
                if (active.current) store.getState().discard()
              },
              onSave: () => request('save-plans'),
            },
          },
        }
      break
    case 3:
      if (content.invoiceComposer)
        projected = {
          ...content,
          invoiceComposer: {
            ...content.invoiceComposer,
            referenceFlow: {
              ...status,
              values,
              onFieldChange: (id, value) => {
                if (active.current) store.getState().setField(id, value)
              },
              onSaveDraft: () => request('save-invoice'),
              onNext: () =>
                intent('invoice-next-step', {
                  draftId: store.getState().seed.ownerId,
                  values: store.getState().values,
                  outcome: 'intent-only',
                }),
            },
          },
        }
      break
    case 4:
      if (content.recovery)
        projected = {
          ...content,
          recovery: {
            ...content.recovery,
            referenceFlow: {
              expandedIds,
              onToggleSubscription: (id) => {
                if (active.current) store.getState().toggleExpanded(id)
              },
            },
          },
        }
      break
    case 5:
      if (content.changePlan)
        projected = {
          ...content,
          changePlan: {
            ...content.changePlan,
            referenceFlow: {
              choiceId: selectionId,
              onChoiceChange: (id) => {
                if (active.current) store.getState().select(id)
              },
              onContinue: () =>
                intent('continue-plan-change', {
                  ownerId: store.getState().seed.ownerId,
                  choiceId: store.getState().selectionId,
                  outcome: 'intent-only',
                }),
              onCancel: () =>
                intent('cancel-plan-change', { ownerId: store.getState().seed.ownerId, outcome: 'intent-only' }),
            },
          },
        }
      break
    case 6:
      if (content.paymentMethods)
        projected = {
          ...content,
          paymentMethods: {
            ...content.paymentMethods,
            referenceFlow: {
              ...status,
              primaryMethodId: selectionId,
              onMakePrimary: (id) => request('primary', id),
            },
          },
        }
      break
    case 7:
      if (content.usage)
        projected = {
          ...content,
          usage: {
            ...content.usage,
            referenceFlow: {
              periodId: selectionId,
              onPeriodChange: (id) => {
                if (active.current) store.getState().select(id)
              },
            },
          },
        }
      break
    default:
      break
  }
  return <HbarAppUiBillingProvider content={projected}>{children}</HbarAppUiBillingProvider>
}
