import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  LumenSettingsFormProvider,
  useLumenSettingsFormContent,
  type LumenSettingsForm3Content,
  type LumenSettingsFormContent,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { createSettingsForm3PreviewStore } from './settingsForm3PreviewStore'
import type { SettingsForm3PreviewContent, SettingsForm3PreviewFixture } from './settingsForm3PreviewFixtures'

function projectLumenContent(content: SettingsForm3PreviewContent): LumenSettingsForm3Content {
  return {
    pageTitle: content.pageTitle,
    panelTitle: content.panelTitle,
    panelDescription: content.panelDescription,
    changedLabel: content.changedLabel,
    recommendedLabel: content.recommendedLabel,
    fields: {
      theme: {
        label: content.fields.theme.label,
        description: content.fields.theme.description,
        value: content.fields.theme.value,
        changed: content.fields.theme.changed,
        deviceLabel: content.fields.theme.deviceLabel,
        options: content.fields.theme.options,
      },
      density: {
        label: content.fields.density.label,
        description: content.fields.density.description,
        value: content.fields.density.value,
        changed: content.fields.density.changed,
        ...(content.fields.density.recommended === undefined
          ? {}
          : { recommendedLabel: content.fields.density.recommended }),
        options: content.fields.density.options,
      },
      language: {
        label: content.fields.language.label,
        description: content.fields.language.description,
        value: content.fields.language.value,
        changed: content.fields.language.changed,
        options: content.fields.language.options,
      },
      weeklySummary: {
        label: content.fields.weeklySummary.label,
        description: content.fields.weeklySummary.description,
        value: content.fields.weeklySummary.value,
        changed: content.fields.weeklySummary.changed,
        ...(content.fields.weeklySummary.recommended === undefined
          ? {}
          : { recommendedLabel: content.fields.weeklySummary.recommended }),
      },
      mentions: {
        label: content.fields.mentions.label,
        description: content.fields.mentions.description,
        value: content.fields.mentions.value,
        changed: content.fields.mentions.changed,
      },
      commentReplies: {
        label: content.fields.commentReplies.label,
        description: content.fields.commentReplies.description,
        value: content.fields.commentReplies.value,
        changed: content.fields.commentReplies.changed,
      },
      notificationSounds: {
        label: content.fields.notificationSounds.label,
        description: content.fields.notificationSounds.description,
        value: content.fields.notificationSounds.value,
        changed: content.fields.notificationSounds.changed,
      },
    },
    footer: {
      statusText: content.footer.status,
      cancelLabel: content.footer.cancelLabel,
      saveLabel: content.footer.saveLabel,
      savingLabel: content.footer.savingLabel,
    },
  }
}

export function SettingsForm3PreviewHost(props: Parameters<typeof SettingsForm3PreviewOwner>[0]) {
  if (props.spec.category !== 'settings-form' || props.spec.variant !== 3) return props.children
  return <SettingsForm3PreviewOwner key={props.spec.id} {...props} />
}

function SettingsForm3PreviewOwner({
  content,
  spec,
  onAction,
  referenceFixture,
  children,
}: HbarAppUiVariantProps & {
  readonly content: LumenSettingsFormContent
  readonly referenceFixture: SettingsForm3PreviewFixture
  readonly children: ReactNode
}) {
  const parentContent = useLumenSettingsFormContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(() => createSettingsForm3PreviewStore(referenceFixture.storeSeed), [referenceFixture])
  const state = useStore(store)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(
    () => () => {
      if (timerRef.current !== undefined) clearTimeout(timerRef.current)
    },
    [],
  )

  if (spec.category !== 'settings-form' || spec.variant !== 3) return children

  const preferencesReference: NonNullable<LumenSettingsFormContent['preferencesReference']> = {
    content: projectLumenContent(referenceFixture.contentFor(state)),
    saveState: state.saveState,
    onPreferenceChange(change) {
      if (store.getState().changePreference(change)) {
        onActionRef.current?.({
          variantId: spec.id,
          actionId: `change-preference-${change.fieldId}`,
          value: typeof change.value === 'boolean' ? String(change.value) : change.value,
        })
      }
    },
    onCancel() {
      if (store.getState().cancel()) {
        onActionRef.current?.({ variantId: spec.id, actionId: 'cancel-preferences' })
      }
    },
    onSave() {
      if (!store.getState().beginSave()) return
      timerRef.current = setTimeout(() => {
        timerRef.current = undefined
        if (store.getState().resolveSave()) {
          onActionRef.current?.({ variantId: spec.id, actionId: 'save-preferences' })
        }
      }, 1500)
    },
  }

  return (
    <LumenSettingsFormProvider content={{ ...(parentContent ?? content), preferencesReference }}>
      {children}
    </LumenSettingsFormProvider>
  )
}
