import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  LumenFormsProvider,
  useLumenFormsContent,
  type LumenForms11ViewModel,
  type LumenFormsContent,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import type { Forms11PreviewFixture } from './forms11PreviewFixtures'
import { createForms11PreviewStore } from './forms11PreviewStore'

export function FormsForm11PreviewHost({
  content,
  spec,
  onAction,
  referenceFixture,
  children,
}: HbarAppUiVariantProps & {
  readonly content: LumenFormsContent
  readonly referenceFixture: Forms11PreviewFixture
  readonly children: ReactNode
}) {
  const parentContent = useLumenFormsContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(() => createForms11PreviewStore(), [])
  const state = useStore(store)

  if (spec.category !== 'forms' || spec.variant !== 11) return children

  const preview = referenceFixture.contentFor(state)
  const notify = (actionId: string, value?: string) => {
    const handler = onActionRef.current
    if (!handler) return
    handler(value === undefined ? { variantId: spec.id, actionId } : { variantId: spec.id, actionId, value })
  }
  const notifyIfChanged = (actionId: string, changed: boolean, value?: string) => {
    if (changed) notify(actionId, value)
  }

  const environmentDialogReference: LumenForms11ViewModel = {
    content: preview,
    onEnvironmentKindChange(kindId) {
      notifyIfChanged('select-environment-kind', store.getState().selectEnvironmentKind(kindId), kindId)
    },
    onNameChange(value) {
      notifyIfChanged('edit-environment-name', store.getState().setName(value), value)
    },
    onRegionChange(regionId) {
      notifyIfChanged('select-environment-region', store.getState().setRegion(regionId), regionId)
    },
    onCopyVariablesChange(sourceId) {
      if (!preview.copyVariables.options.some((option) => option.id === sourceId)) return
      notifyIfChanged('select-environment-variable-source', store.getState().setCopyVariablesFrom(sourceId), sourceId)
    },
    onAutoDeployChange(enabled) {
      notifyIfChanged(
        'toggle-environment-auto-deploy',
        store.getState().setAutoDeployOnPush(enabled),
        enabled ? 'enabled' : 'disabled',
      )
    },
    onDescriptionChange(value) {
      notifyIfChanged('edit-environment-description', store.getState().setDescription(value))
    },
    onCreateRequest() {
      const request = store.getState().requestCreate()
      if (request?.kind === 'create-environment') {
        notify('request-create-environment', JSON.stringify(request.draft))
      }
    },
    onCancelRequest() {
      const request = store.getState().requestCancel()
      if (request.kind === 'cancel') notify('request-cancel-environment-dialog')
    },
    onCloseRequest() {
      const request = store.getState().requestClose()
      if (request.kind === 'close') notify('request-close-environment-dialog')
    },
  }

  return (
    <LumenFormsProvider content={{ ...(parentContent ?? content), environmentDialogReference }}>
      {children}
    </LumenFormsProvider>
  )
}
