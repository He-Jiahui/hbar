import {
  LumenSettingsForm,
  LumenSettingsFormProvider as HbarAppUiSettingsFormProvider,
  selectLumenSettingsItem as selectHbarAppUiSettingsItem,
  uniqueLumenSettingsItems as uniqueHbarAppUiSettingsItems,
  type LumenSettingsFormContent,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiSettingsFormProps = HbarAppUiVariantProps & {
  readonly settingsFormContent?: LumenSettingsFormContent | undefined
}

export { HbarAppUiSettingsFormProvider, selectHbarAppUiSettingsItem, uniqueHbarAppUiSettingsItems }

export type {
  LumenSettingsApiKeysContent as HbarAppUiSettingsApiKeysContent,
  LumenSettingsChoice as HbarAppUiSettingsChoice,
  LumenSettingsDangerContent as HbarAppUiSettingsDangerContent,
  LumenSettingsField as HbarAppUiSettingsField,
  LumenSettingsFormContent as HbarAppUiSettingsFormContent,
  LumenSettingsFormProviderProps as HbarAppUiSettingsFormProviderProps,
  LumenSettingsIntegration as HbarAppUiSettingsIntegration,
  LumenSettingsListStrategy as HbarAppUiSettingsListStrategy,
  LumenSettingsMember as HbarAppUiSettingsMember,
  LumenSettingsMembersContent as HbarAppUiSettingsMembersContent,
  LumenSettingsPreferenceToggle as HbarAppUiSettingsPreferenceToggle,
  LumenSettingsPreferencesContent as HbarAppUiSettingsPreferencesContent,
  LumenSettingsProfileContent as HbarAppUiSettingsProfileContent,
  LumenSettingsSecret as HbarAppUiSettingsSecret,
  LumenSettingsWorkspaceContent as HbarAppUiSettingsWorkspaceContent,
} from '@lumen/app-ui'

/** Thin legacy-contract adapter; settings workflows and their controls are Lumen-owned. */
export function SettingsForm({ spec, onAction, settingsFormContent, className }: HbarAppUiSettingsFormProps) {
  return (
    <LumenSettingsForm
      variant={spec.variant}
      variantId={spec.id}
      content={settingsFormContent}
      className={className}
      density={spec.density}
      surface={spec.profile.surface}
      state={spec.profile.initialState}
      visualMode={spec.profile.visualMode}
      onAction={
        onAction
          ? ({ actionId, value }) =>
              onAction(
                value === undefined
                  ? { variantId: spec.id, actionId }
                  : { variantId: spec.id, actionId, value },
              )
          : undefined
      }
    />
  )
}
