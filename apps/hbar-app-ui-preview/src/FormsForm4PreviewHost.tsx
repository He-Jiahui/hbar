import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { LumenFormsProvider, useLumenFormsContent, type LumenForms4ViewModel, type LumenFormsContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import type { Forms4PreviewFixture } from './forms4PreviewFixtures'
import { createForms4PreviewStore } from './forms4PreviewStore'

type FormsForm4PreviewHostProps = HbarAppUiVariantProps & {
  readonly content: LumenFormsContent
  readonly referenceFixture: Forms4PreviewFixture
  readonly children: ReactNode
}

export function FormsForm4PreviewHost(props: FormsForm4PreviewHostProps) {
  if (props.spec.category !== 'forms' || props.spec.variant !== 4) return props.children
  return <FormsForm4PreviewHostOwner key={props.spec.id} {...props} />
}

function FormsForm4PreviewHostOwner({
  content,
  spec,
  onAction,
  referenceFixture,
  children,
}: FormsForm4PreviewHostProps) {
  const parentContent = useLumenFormsContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(() => createForms4PreviewStore(referenceFixture.storeSeed), [referenceFixture])
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

  const equipmentRecordReference: LumenForms4ViewModel = {
    content: preview,
    onBeginEdit(propertyId) {
      notifyIfChanged('edit-equipment-property', store.getState().beginEdit(propertyId), propertyId)
    },
    onEditValueChange(value) {
      notifyIfChanged('edit-equipment-property-draft', store.getState().updateEditValue(value))
    },
    onCancelEdit() {
      notifyIfChanged('cancel-equipment-property-edit', store.getState().cancelEdit())
    },
    onSaveProperty(request) {
      const recorded = store.getState().requestSave()
      if (recorded?.propertyId !== request.propertyId || recorded.value !== request.value) return
      notify('request-save-equipment-property', `${request.propertyId}:${request.value}`)
    },
    onAddNote() {
      notify('request-add-equipment-note')
    },
    onConditionTrackingChange(enabled) {
      notifyIfChanged(
        'toggle-condition-tracking',
        store.getState().setConditionTracking(enabled),
        enabled ? 'enabled' : 'disabled',
      )
    },
  }

  return (
    <LumenFormsProvider content={{ ...(parentContent ?? content), equipmentRecordReference }}>
      {children}
    </LumenFormsProvider>
  )
}
