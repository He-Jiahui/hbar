import type { HbarAppUiVariantProps } from '../../types'
import type { HbarAppUiSettingsPreferencesContent } from './SettingsContent'
import { SettingsFrame } from './SettingsPrimitives'
import { HbarAppUiPreferencesSettings } from './Preferences'
export function PreferencesSettings({
  spec,
  onAction,
  content,
}: HbarAppUiVariantProps & { readonly content: HbarAppUiSettingsPreferencesContent }) {
  return (
    <SettingsFrame spec={spec} onAction={onAction} className="hbar-app-ui-settings-preferences-surface">
      <HbarAppUiPreferencesSettings {...content} />
    </SettingsFrame>
  )
}
