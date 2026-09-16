import { useState, type ReactNode } from 'react'
import {
  HbarAppUiSettingsFormProvider,
  type HbarAppUiSettingsFormContent,
  type HbarAppUiVariantProps,
} from 'hbar-app-ui/catalog'
import type { HbarAppUiSettingsPreferencesContent } from 'hbar-app-ui/settings-form'

function values(content: HbarAppUiSettingsPreferencesContent | undefined) {
  return {
    themeId: content?.themeId ?? '',
    densityId: content?.densityId ?? '',
    languageId: content?.languageId ?? '',
    toggles: Object.fromEntries((content?.toggles ?? []).map((item) => [item.id, item.enabled])),
    checkbox: content?.checkbox?.enabled ?? false,
  }
}
export function SettingsPreviewHost({
  content,
  spec,
  onAction,
  children,
}: HbarAppUiVariantProps & { readonly content: HbarAppUiSettingsFormContent; readonly children: ReactNode }) {
  const [source, setSource] = useState(content),
    [draft, setDraft] = useState(() => values(content.preferences)),
    [saved, setSaved] = useState(draft),
    [dirty, setDirty] = useState(true)
  if (source !== content) {
    const next = values(content.preferences)
    setSource(content)
    setDraft(next)
    setSaved(next)
    setDirty(true)
  }
  const preference = content.preferences
  return (
    <HbarAppUiSettingsFormProvider
      content={{
        ...content,
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
