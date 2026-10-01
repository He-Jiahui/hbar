import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  LumenSettingsFormProvider as HbarAppUiSettingsFormProvider,
  useLumenSettingsFormContent,
  type LumenSettingsFormContent,
} from '@lumen/app-ui'
import { createSettingsForm2PreviewStore, type SettingsForm2PreviewStoreState } from './settingsForm2PreviewStore'
import type { SettingsForm2PreviewFixture } from './settingsForm2PreviewFixtures'

export function SettingsForm2PreviewHost(props: Parameters<typeof SettingsForm2PreviewOwner>[0]) {
  if (props.spec.id !== 'hbar-app-ui-settings-form-2') return props.children
  return <SettingsForm2PreviewOwner key={props.spec.id} {...props} />
}

function SettingsForm2PreviewOwner({
  content,
  spec,
  onAction,
  children,
  referenceFixture,
}: {
  readonly content: LumenSettingsFormContent
  readonly spec: { readonly id: string }
  readonly onAction?:
    ((event: { readonly variantId: string; readonly actionId: string; readonly value?: string }) => void) | undefined
  readonly referenceFixture: SettingsForm2PreviewFixture
  readonly children: ReactNode
}) {
  const parentContent = useLumenSettingsFormContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(
    () =>
      createSettingsForm2PreviewStore(referenceFixture.storeSeed, {
        onSaveRequested() {
          onActionRef.current?.({ variantId: spec.id, actionId: 'request-profile-save' })
        },
        onPhotoSelected(file) {
          onActionRef.current?.({
            variantId: spec.id,
            actionId: 'select-profile-photo',
            value: `${file.name}:${file.type}`,
          })
        },
        onCancel() {
          onActionRef.current?.({ variantId: spec.id, actionId: 'cancel-profile-edits' })
        },
      }),
    [referenceFixture, spec.id],
  )
  const state = useStore(store)

  const profileReference: NonNullable<LumenSettingsFormContent['profileReference']> = {
    content: referenceFixture.contentFor(state as SettingsForm2PreviewStoreState),
    onFieldChange(fieldId, value) {
      if (store.getState().changeField(fieldId, value)) {
        onActionRef.current?.({ variantId: spec.id, actionId: 'change-profile-field', value: fieldId })
      }
    },
    onPhotoSelected(file) {
      store.getState().selectPhoto(file)
    },
    onCancel() {
      store.getState().cancel()
    },
    onSave() {
      store.getState().requestSave()
    },
  }

  return (
    <HbarAppUiSettingsFormProvider content={{ ...(parentContent ?? content), profileReference }}>
      {children}
    </HbarAppUiSettingsFormProvider>
  )
}
