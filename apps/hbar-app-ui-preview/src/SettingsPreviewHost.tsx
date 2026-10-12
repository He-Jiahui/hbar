import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  HbarAppUiSettingsFormProvider,
  type HbarAppUiSettingsFormContent,
  type HbarAppUiVariantProps,
} from 'hbar-app-ui/catalog'
import type { HbarAppUiSettingsPreferencesContent } from 'hbar-app-ui/settings-form'
import type { LumenSettingsForm1Field } from '@lumen/app-ui/catalog'
import {
  createSettingsForm1PreviewStore,
  type SettingsForm1PreviewFieldValue,
  type SettingsForm1PreviewValue,
} from './settingsForm1PreviewStore'
import type { SettingsForm1PreviewFixture } from './settingsForm1ReferenceFixtures'

function values(content: HbarAppUiSettingsPreferencesContent | undefined) {
  return {
    themeId: content?.themeId ?? '',
    densityId: content?.densityId ?? '',
    languageId: content?.languageId ?? '',
    toggles: Object.fromEntries((content?.toggles ?? []).map((item) => [item.id, item.enabled])),
    checkbox: content?.checkbox?.enabled ?? false,
  }
}

function projectField(field: LumenSettingsForm1Field, stateField: SettingsForm1PreviewFieldValue | undefined) {
  if (!stateField || stateField.kind !== field.kind) return field
  switch (field.kind) {
    case 'switch':
    case 'checkbox':
      return typeof stateField.value === 'boolean'
        ? { ...field, value: stateField.value, changed: stateField.changed }
        : field
    case 'select':
    case 'textarea':
    case 'text-prefix':
    case 'text':
      return typeof stateField.value === 'string'
        ? { ...field, value: stateField.value, changed: stateField.changed }
        : field
  }
}

export function SettingsPreviewHost(props: Parameters<typeof SettingsPreviewOwner>[0]) {
  if (props.spec.category !== 'settings-form' || props.spec.variant !== 1) return props.children
  return <SettingsPreviewOwner key={props.spec.id} {...props} />
}

function SettingsPreviewOwner({
  content,
  spec,
  onAction,
  children,
  referenceFixture,
}: HbarAppUiVariantProps & {
  readonly content: HbarAppUiSettingsFormContent
  readonly referenceFixture: SettingsForm1PreviewFixture
  readonly children: ReactNode
}) {
  const [source, setSource] = useState(content),
    [draft, setDraft] = useState(() => values(content.preferences)),
    [saved, setSaved] = useState(draft),
    [dirty, setDirty] = useState(true)
  const referenceStore = useMemo(() => createSettingsForm1PreviewStore(referenceFixture.storeSeed), [referenceFixture])
  const referenceState = useStore(referenceStore)
  const failedOnce = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(
    () => () => {
      if (saveTimer.current !== undefined) clearTimeout(saveTimer.current)
    },
    [],
  )
  if (source !== content) {
    const next = values(content.preferences)
    setSource(content)
    setDraft(next)
    setSaved(next)
    setDirty(true)
  }
  const preference = content.preferences
  const referenceFields = new Map(referenceState.fields.map((field) => [field.id, field]))
  const workspaceReferenceContent = {
    ...referenceFixture.content,
    selectedSectionId: referenceState.selectedSectionId,
    sections: referenceFixture.content.sections.map((section) => ({
      ...section,
      groups: section.groups.map((group) => ({
        ...group,
        fields: group.fields.map((field) => projectField(field, referenceFields.get(field.id))),
      })),
    })),
  }
  return (
    <HbarAppUiSettingsFormProvider
      content={{
        ...content,
        workspaceReference:
          spec.variant === 1
            ? {
                content: workspaceReferenceContent,
                saveState: referenceState.saveState,
                statusMessage: referenceFixture.content.feedbackMessages[referenceState.feedback] || undefined,
                onSelectSection(sectionId) {
                  if (referenceStore.getState().selectSection(sectionId)) {
                    onAction?.({ variantId: spec.id, actionId: 'select-settings-section', value: sectionId })
                  }
                },
                onFieldChange(fieldId, value: SettingsForm1PreviewValue) {
                  if (referenceStore.getState().changeField(fieldId, value)) {
                    onAction?.({ variantId: spec.id, actionId: 'change-settings-field', value: fieldId })
                  }
                },
                onCancel() {
                  if (referenceStore.getState().cancel()) {
                    onAction?.({ variantId: spec.id, actionId: 'cancel-settings' })
                  }
                },
                onSave() {
                  if (!referenceStore.getState().beginSave()) return
                  const failThisAttempt = referenceFixture.saveBehavior === 'fail-once' && !failedOnce.current
                  if (failThisAttempt) failedOnce.current = true
                  saveTimer.current = setTimeout(() => {
                    saveTimer.current = undefined
                    if (failThisAttempt) {
                      referenceStore.getState().rejectSave()
                      onAction?.({ variantId: spec.id, actionId: 'save-settings-failed' })
                      return
                    }
                    referenceStore.getState().resolveSave()
                    onAction?.({ variantId: spec.id, actionId: 'save-settings' })
                  }, 1200)
                },
              }
            : content.workspaceReference,
        preferences: preference && {
          ...preference,
          themeId: draft.themeId,
          densityId: draft.densityId,
          languageId: draft.languageId,
          toggles: preference.toggles.map((item) => ({ ...item, enabled: draft.toggles[item.id] ?? item.enabled })),
          checkbox: preference.checkbox && { ...preference.checkbox, enabled: draft.checkbox },
          onChange(action) {
            if (action.type === 'theme') setDraft((current) => ({ ...current, themeId: action.id }))
            else if (action.type === 'density') setDraft((current) => ({ ...current, densityId: action.id }))
            else if (action.type === 'language') setDraft((current) => ({ ...current, languageId: action.id }))
            else if (action.type === 'toggle')
              setDraft((current) => ({ ...current, toggles: { ...current.toggles, [action.id]: action.enabled } }))
            else if (action.type === 'checkbox') setDraft((current) => ({ ...current, checkbox: action.enabled }))
            setDirty(true)
            onAction?.({ variantId: spec.id, actionId: 'change-preference', value: action.id })
          },
          persistence: {
            mode: 'explicit',
            dirty,
            busy: false,
            onCancel() {
              setDraft(saved)
              setDirty(false)
            },
            onSave() {
              setSaved(draft)
              setDirty(false)
              onAction?.({
                variantId: spec.id,
                actionId: 'save',
                value: `${draft.themeId}:${draft.densityId}:${draft.languageId}`,
              })
            },
          },
        },
      }}
    >
      {children}
    </HbarAppUiSettingsFormProvider>
  )
}
