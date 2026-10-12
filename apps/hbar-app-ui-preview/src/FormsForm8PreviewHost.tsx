import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { LumenFormsProvider, useLumenFormsContent, type LumenForms8ConditionValue, type LumenForms8MatchMode, type LumenForms8ViewModel, type LumenFormsContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import type { Forms8PreviewFixture } from './forms8PreviewFixtures'
import { createForms8PreviewStore } from './forms8PreviewStore'

type FormsForm8PreviewHostProps = HbarAppUiVariantProps & {
  readonly content: LumenFormsContent
  readonly referenceFixture: Forms8PreviewFixture
  readonly children: ReactNode
}

export function FormsForm8PreviewHost(props: FormsForm8PreviewHostProps) {
  if (props.spec.category !== 'forms' || props.spec.variant !== 8) return props.children
  return <FormsForm8PreviewHostOwner key={props.spec.id} {...props} />
}

function FormsForm8PreviewHostOwner({
  content,
  spec,
  onAction,
  referenceFixture,
  children,
}: FormsForm8PreviewHostProps) {
  const parentContent = useLumenFormsContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(() => createForms8PreviewStore(referenceFixture.storeSeed), [referenceFixture])
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

  const inboundPalletRoutingReference: LumenForms8ViewModel = {
    content: preview,
    onMatchModeChange(mode: LumenForms8MatchMode) {
      notifyIfChanged('select-rule-match-mode', store.getState().setMatchMode(mode), mode)
    },
    onConditionFieldChange(conditionId, fieldId) {
      notifyIfChanged(
        'select-rule-condition-field',
        store.getState().setConditionField(conditionId, fieldId),
        `${conditionId}:${fieldId}`,
      )
    },
    onConditionOperatorChange(conditionId, operatorId) {
      notifyIfChanged(
        'select-rule-condition-operator',
        store.getState().setConditionOperator(conditionId, operatorId),
        `${conditionId}:${operatorId}`,
      )
    },
    onConditionValueChange(conditionId, value: LumenForms8ConditionValue) {
      notifyIfChanged('edit-rule-condition-value', store.getState().setConditionValue(conditionId, value))
    },
    onAddCondition() {
      const conditionId = store.getState().addCondition()
      notify('add-rule-condition', conditionId)
    },
    onRemoveCondition(conditionId) {
      const request = store.getState().requestConditionRemoval(conditionId)
      if (request?.kind !== 'remove-condition') return
      notifyIfChanged('request-remove-rule-condition', store.getState().removeCondition(conditionId), conditionId)
    },
    onActionPickerRequest(actionId, part) {
      notify('request-edit-rule-action', `${actionId}:${part}`)
    },
    onTestRule() {
      const request = store.getState().requestTestRule()
      if (request.kind === 'test-rule') notify('request-test-rule')
    },
    onSaveRule() {
      const request = store.getState().requestSaveRule()
      if (request.kind === 'save-rule') notify('request-save-rule')
    },
  }

  return (
    <LumenFormsProvider content={{ ...(parentContent ?? content), inboundPalletRoutingReference }}>
      {children}
    </LumenFormsProvider>
  )
}
