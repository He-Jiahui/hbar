import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  LumenFormsProvider,
  useLumenFormsContent,
  type LumenForms3Content,
  type LumenForms3ViewModel,
  type LumenFormsContent,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import type { Forms3PreviewFixture } from './formsForm3PreviewFixtures'
import { createForms3PreviewStore } from './formsForm3PreviewStore'

type FormsForm3PreviewHostProps = HbarAppUiVariantProps & {
  readonly content: LumenFormsContent
  readonly referenceFixture: Forms3PreviewFixture
  readonly children: ReactNode
}

export function FormsForm3PreviewHost(props: FormsForm3PreviewHostProps) {
  if (props.spec.category !== 'forms' || props.spec.variant !== 3) return props.children
  return <FormsForm3PreviewHostOwner key={props.spec.id} {...props} />
}

function FormsForm3PreviewHostOwner({
  content,
  spec,
  onAction,
  referenceFixture,
  children,
}: FormsForm3PreviewHostProps) {
  const parentContent = useLumenFormsContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(() => createForms3PreviewStore(referenceFixture.storeSeed), [referenceFixture])
  const state = useStore(store)

  const preview = referenceFixture.contentFor(state)
  const notify = (actionId: string, value?: string) => {
    const handler = onActionRef.current
    if (!handler) return
    handler(value === undefined ? { variantId: spec.id, actionId } : { variantId: spec.id, actionId, value })
  }
  const notifyIfChanged = (actionId: string, changed: boolean, value?: string) => {
    if (changed) notify(actionId, value)
  }
  const referenceContent: LumenForms3Content = {
    copy: preview.copy,
    account: preview.account,
    bookingReference: preview.bookingReference,
    taxIdentifier: preview.taxIdentifier,
    bookingContact: preview.bookingContact,
    pickupDate: preview.pickupDate,
    deliveryDate: preview.deliveryDate,
    incoterm: preview.incoterm,
    serviceLevel: preview.serviceLevel,
    currency: preview.currency,
    cargo: preview.cargo,
  }
  const freightBookingReference: LumenForms3ViewModel = {
    content: referenceContent,
    onTextChange(fieldId, value) {
      notifyIfChanged('edit-booking-text', store.getState().setTextField(fieldId, value), fieldId)
    },
    onDateChange(fieldId, value) {
      notifyIfChanged('edit-booking-date', store.getState().setDateField(fieldId, value), fieldId)
    },
    onChoiceChange(fieldId, choiceId) {
      notifyIfChanged('select-booking-choice', store.getState().selectChoice(fieldId, choiceId), choiceId)
    },
    onLineTextChange(lineId, fieldId, value) {
      notifyIfChanged('edit-cargo-line', store.getState().setLineText(lineId, fieldId, value), `${lineId}:${fieldId}`)
    },
    onLineChoiceChange(lineId, fieldId, choiceId) {
      notifyIfChanged(
        'select-cargo-line-choice',
        store.getState().selectLineChoice(lineId, fieldId, choiceId),
        `${lineId}:${fieldId}:${choiceId}`,
      )
    },
    onAddLine() {
      notify('add-cargo-line', store.getState().addLine())
    },
    onRemoveLine(lineId) {
      notifyIfChanged('remove-cargo-line', store.getState().removeLine(lineId), lineId)
    },
    onSaveDraft() {
      notify('request-save-draft')
    },
    onBookShipment() {
      notify('request-book-shipment')
    },
  }

  return (
    <LumenFormsProvider content={{ ...(parentContent ?? content), freightBookingReference }}>
      {children}
    </LumenFormsProvider>
  )
}
