import type { HbarAppUiPreferenceAction, HbarAppUiPreferencePersistence } from './PreferenceContract'
import {createContext, useContext, type ReactNode} from 'react'

export type HbarAppUiSettingsListStrategy =
    | {readonly kind: 'content-grown'; readonly expectedMaximum: number}
    | {readonly kind: 'pane-scroll'; readonly expectedMaximum: number}

export interface HbarAppUiSettingsChoice {
    readonly id: string
    readonly label: string
}

export interface HbarAppUiSettingsField {
    readonly id: string
    readonly label: string
    readonly description: string
    readonly kind: 'text' | 'url' | 'textarea' | 'select'
    readonly value: string
    readonly prefix?: string | undefined
    readonly changed?: boolean | undefined
    readonly error?: string | undefined
    readonly note?: string | undefined
    readonly maxLength?: number | undefined
    readonly options?: readonly HbarAppUiSettingsChoice[] | undefined
}

export interface HbarAppUiSettingsWorkspaceContent {
    readonly labels: {
        readonly pageTitle: string
        readonly accountName: string
        readonly panelTitle: string
        readonly panelDescription: string
        readonly navigation: string
        readonly unsaved: string
        readonly cancel: string
        readonly save: string
        readonly changed: string
    }
    readonly navigation: readonly HbarAppUiSettingsChoice[]
    readonly fields: readonly HbarAppUiSettingsField[]
    readonly activeNavigationId?: string | undefined
}

export interface HbarAppUiSettingsProfileContent {
    readonly labels: {
        readonly pageTitle: string
        readonly panelTitle: string
        readonly panelDescription: string
        readonly photoLabel: string
        readonly photoDescription: string
        readonly changePhoto: string
        readonly uploadPhoto: string
        readonly unsaved: string
        readonly cancel: string
        readonly save: string
        readonly changed: string
    }
    readonly initials: string
    readonly fields: readonly HbarAppUiSettingsField[]
}

export interface HbarAppUiSettingsPreferenceToggle {
    readonly id: string
    readonly label: string
    readonly description: string
    readonly enabled: boolean
    readonly recommended?: boolean | undefined
    readonly changed?: boolean | undefined
}

export interface HbarAppUiSettingsPreferencesContent {
    readonly onChange: (action: HbarAppUiPreferenceAction) => void
    readonly persistence: HbarAppUiPreferencePersistence
    readonly error?: string | undefined
    readonly labels: {
        readonly pageTitle: string
        readonly panelTitle: string
        readonly panelDescription: string
        readonly themeLabel: string
        readonly themeCurrent: string
        readonly themeDescription: string
        readonly densityLabel: string
        readonly densityDescription: string
        readonly languageLabel: string
        readonly languageDescription: string
        readonly toggleGroup: string
        readonly changed: string
        readonly recommended: string
        readonly unsaved: string
        readonly cancel: string
        readonly unavailableChoice: string
        readonly save: string
    }
    readonly themeChoices: readonly HbarAppUiSettingsChoice[]
    readonly themeId: string
    readonly densityChoices: readonly HbarAppUiSettingsChoice[]
    readonly densityId: string
    readonly languageChoices: readonly HbarAppUiSettingsChoice[]
    readonly languageId: string
    readonly toggles: readonly HbarAppUiSettingsPreferenceToggle[]
    readonly checkbox: {
        readonly id: string
        readonly label: string
        readonly description: string
        readonly enabled: boolean
    } | undefined
}

export interface HbarAppUiSettingsMember {
    readonly id: string
    readonly initials: string
    readonly name: string
    readonly email: string
    readonly status: 'active' | 'invited'
    readonly role: string
    readonly roleId: string
    readonly roleChoices: readonly HbarAppUiSettingsChoice[]
}

export interface HbarAppUiSettingsMembersContent {
    readonly labels: {
        readonly pageTitle: string
        readonly panelTitle: string
        readonly panelDescription: string
        readonly inviteTitle: string
        readonly inviteDescription: string
        readonly emailLabel: string
        readonly emailPlaceholder: string
        readonly roleLabel: string
        readonly sendInvite: string
        readonly active: string
        readonly invited: string
        readonly empty: string
        readonly actions: (name: string) => string
        readonly seats: (used: number, total: number) => string
    }
    readonly inviteRoles: readonly HbarAppUiSettingsChoice[]
    readonly initialInviteRoleId: string
    readonly members: readonly HbarAppUiSettingsMember[]
    readonly seatsUsed: number
    readonly seatsTotal: number
    readonly listStrategy: HbarAppUiSettingsListStrategy
}

export interface HbarAppUiSettingsSecret {
    readonly id: string
    readonly name: string
    readonly created: string
    readonly lastUsed: string
    readonly token: string
}

export interface HbarAppUiSettingsIntegration {
    readonly id: string
    readonly name: string
    readonly status: 'connected' | 'disconnected'
    readonly description: string
    readonly enabled: boolean
}

export interface HbarAppUiSettingsApiKeysContent {
    readonly labels: {
        readonly pageTitle: string
        readonly secretsTitle: string
        readonly secretsDescription: string
        readonly createKey: string
        readonly actions: (name: string) => string
        readonly reveal: (name: string) => string
        readonly hide: (name: string) => string
        readonly copy: (name: string) => string
        readonly secretMeta: (created: string, lastUsed: string) => string
        readonly empty: string
        readonly integrationsTitle: string
        readonly integrationsDescription: string
        readonly connected: string
        readonly disconnected: string
        readonly auditNote: string
        readonly toggle: (name: string) => string
    }
    readonly secrets: readonly HbarAppUiSettingsSecret[]
    readonly integrations: readonly HbarAppUiSettingsIntegration[]
    readonly listStrategy: HbarAppUiSettingsListStrategy
}

export interface HbarAppUiSettingsDangerContent {
    readonly labels: {
        readonly pageTitle: string
        readonly panelTitle: string
        readonly panelDescription: string
        readonly transferTitle: string
        readonly transferDescription: string
        readonly transferAction: string
        readonly archiveTitle: string
        readonly archiveDescription: string
        readonly archiveAction: string
        readonly deleteTitle: string
        readonly deleteDescription: string
        readonly deleteSummary: string
        readonly typePrompt: string
        readonly confirmationLabel: string
        readonly cancel: string
        readonly deleteAction: string
        readonly footerNote: string
        readonly transferNotice: string
        readonly archiveNotice: string
        readonly deleteSuccess: string
    }
    readonly workspaceName: string
    readonly memberCount: number
    readonly consequences: readonly string[]
}

export interface HbarAppUiSettingsFormContent {
    readonly workspace?: HbarAppUiSettingsWorkspaceContent | undefined
    readonly profile?: HbarAppUiSettingsProfileContent | undefined
    readonly preferences?: HbarAppUiSettingsPreferencesContent | undefined
    readonly members?: HbarAppUiSettingsMembersContent | undefined
    readonly apiKeys?: HbarAppUiSettingsApiKeysContent | undefined
    readonly danger?: HbarAppUiSettingsDangerContent | undefined
}

export interface HbarAppUiSettingsFormProviderProps {
    readonly content: HbarAppUiSettingsFormContent
    readonly children: ReactNode
}

export function uniqueHbarAppUiSettingsItems<T extends {readonly id: string}>(items: readonly T[]): readonly T[] {
    const seen = new Set<string>()
    return items.filter((item) => {
        if (seen.has(item.id)) return false
        seen.add(item.id)
        return true
    })
}

export function selectHbarAppUiSettingsItem<T extends {readonly id: string}>(items: readonly T[], requestedId: string | undefined): T | undefined {
    return items.find((item) => item.id === requestedId) ?? items[0]
}

const settingsContentContext = createContext<HbarAppUiSettingsFormContent | undefined>(undefined)

export function HbarAppUiSettingsFormProvider({content, children}: HbarAppUiSettingsFormProviderProps) {
    return <settingsContentContext.Provider value={content}>{children}</settingsContentContext.Provider>
}

export function useHbarAppUiSettingsFormContent(): HbarAppUiSettingsFormContent | undefined {
    return useContext(settingsContentContext)
}
