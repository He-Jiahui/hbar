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
  LumenSettingsForm1Choice as HbarAppUiSettingsForm1Choice,
  LumenSettingsForm1Content as HbarAppUiSettingsForm1Content,
  LumenSettingsForm1Feedback as HbarAppUiSettingsForm1Feedback,
  LumenSettingsForm1Field as HbarAppUiSettingsForm1Field,
  LumenSettingsForm1FieldGroup as HbarAppUiSettingsForm1FieldGroup,
  LumenSettingsForm1SaveState as HbarAppUiSettingsForm1SaveState,
  LumenSettingsForm1Section as HbarAppUiSettingsForm1Section,
  LumenSettingsForm1Value as HbarAppUiSettingsForm1Value,
  LumenSettingsForm1ViewModel as HbarAppUiSettingsForm1ViewModel,
  LumenSettingsForm3CheckboxField as HbarAppUiSettingsForm3CheckboxField,
  LumenSettingsForm3ChoiceField as HbarAppUiSettingsForm3ChoiceField,
  LumenSettingsForm3Content as HbarAppUiSettingsForm3Content,
  LumenSettingsForm3Density as HbarAppUiSettingsForm3Density,
  LumenSettingsForm3Language as HbarAppUiSettingsForm3Language,
  LumenSettingsForm3Option as HbarAppUiSettingsForm3Option,
  LumenSettingsForm3PreferenceChange as HbarAppUiSettingsForm3PreferenceChange,
  LumenSettingsForm3Props as HbarAppUiSettingsForm3Props,
  LumenSettingsForm3SaveState as HbarAppUiSettingsForm3SaveState,
  LumenSettingsForm3SwitchField as HbarAppUiSettingsForm3SwitchField,
  LumenSettingsForm3Theme as HbarAppUiSettingsForm3Theme,
  LumenSettingsForm3ViewModel as HbarAppUiSettingsForm3ViewModel,
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
              onAction(value === undefined ? { variantId: spec.id, actionId } : { variantId: spec.id, actionId, value })
          : undefined
      }
    />
  )
}
