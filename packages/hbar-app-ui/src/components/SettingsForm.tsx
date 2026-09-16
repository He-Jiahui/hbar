import type {HbarAppUiVariantProps} from '../types'
import {useHbarAppUiSettingsFormContent} from './settings-form/SettingsContent'
import {ApiKeysSettings} from './settings-form/ApiKeysSettings'
import {DangerSettings} from './settings-form/DangerSettings'
import {MembersSettings} from './settings-form/MembersSettings'
import {PreferencesSettings} from './settings-form/PreferencesSettings'
import {ProfileSettings} from './settings-form/ProfileSettings'
import {SettingsFrame} from './settings-form/SettingsPrimitives'
import {WorkspaceSettings} from './settings-form/WorkspaceSettings'
import './settings-form/SettingsSurface.css'

export type HbarAppUiSettingsFormProps = HbarAppUiVariantProps & {
    readonly settingsFormContent?: import('./settings-form/SettingsContent').HbarAppUiSettingsFormContent | undefined
}

export {HbarAppUiSettingsFormProvider, selectHbarAppUiSettingsItem, uniqueHbarAppUiSettingsItems} from './settings-form/SettingsContent'
export type {
    HbarAppUiSettingsApiKeysContent,
    HbarAppUiSettingsChoice,
    HbarAppUiSettingsDangerContent,
    HbarAppUiSettingsField,
    HbarAppUiSettingsFormContent,
    HbarAppUiSettingsFormProviderProps,
    HbarAppUiSettingsIntegration,
    HbarAppUiSettingsListStrategy,
    HbarAppUiSettingsMember,
    HbarAppUiSettingsMembersContent,
    HbarAppUiSettingsPreferenceToggle,
    HbarAppUiSettingsPreferencesContent,
    HbarAppUiSettingsProfileContent,
    HbarAppUiSettingsSecret,
    HbarAppUiSettingsWorkspaceContent,
} from './settings-form/SettingsContent'

export function SettingsForm({spec, onAction, settingsFormContent}: HbarAppUiSettingsFormProps) {
    const providerContent = useHbarAppUiSettingsFormContent()
    const content = settingsFormContent ?? providerContent
    if (!content) return <SettingsFrame spec={spec} onAction={onAction} className="hbar-app-ui-settings-empty-surface">{null}</SettingsFrame>

    switch (spec.variant) {
        case 1:
            return content.workspace ? <WorkspaceSettings spec={spec} onAction={onAction} content={content.workspace} /> : <SettingsFrame spec={spec} onAction={onAction}>{null}</SettingsFrame>
        case 2:
            return content.profile ? <ProfileSettings spec={spec} onAction={onAction} content={content.profile} /> : <SettingsFrame spec={spec} onAction={onAction}>{null}</SettingsFrame>
        case 3:
            return content.preferences ? <PreferencesSettings spec={spec} onAction={onAction} content={content.preferences} /> : <SettingsFrame spec={spec} onAction={onAction}>{null}</SettingsFrame>
        case 4:
            return content.members ? <MembersSettings spec={spec} onAction={onAction} content={content.members} /> : <SettingsFrame spec={spec} onAction={onAction}>{null}</SettingsFrame>
        case 5:
            return content.apiKeys ? <ApiKeysSettings spec={spec} onAction={onAction} content={content.apiKeys} /> : <SettingsFrame spec={spec} onAction={onAction}>{null}</SettingsFrame>
        case 6:
            return content.danger ? <DangerSettings spec={spec} onAction={onAction} content={content.danger} /> : <SettingsFrame spec={spec} onAction={onAction}>{null}</SettingsFrame>
        default:
            return <SettingsFrame spec={spec} onAction={onAction}>{null}</SettingsFrame>
    }
}
