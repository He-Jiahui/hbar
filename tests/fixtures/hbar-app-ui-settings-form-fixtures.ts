import type {HbarAppUiSettingsFormContent} from '../../packages/hbar-app-ui/src/index'

export const HBAR_APP_UI_SETTINGS_FORM_FIXTURES: HbarAppUiSettingsFormContent = {
    workspace: {
        labels: {pageTitle: 'Settings', accountName: 'Northwind Labs', panelTitle: 'Workspace', panelDescription: 'Details, defaults, and formats people use across the workspace.', navigation: 'Settings sections', unsaved: 'Unsaved changes in Workspace', cancel: 'Cancel', save: 'Save changes', changed: 'Changed'},
        navigation: [{id: 'workspace', label: 'Workspace'}, {id: 'billing', label: 'Billing'}, {id: 'notifications', label: 'Notifications'}, {id: 'security', label: 'Security'}, {id: 'advanced', label: 'Advanced'}],
        activeNavigationId: 'workspace',
        fields: [
            {id: 'name', label: 'Name', description: 'Shown in sidebars, invitations, and reports.', kind: 'text', value: 'Northwind Labs', changed: true},
            {id: 'url', label: 'Workspace URL', description: 'Lowercase letters, numbers, and hyphens only.', kind: 'url', value: 'northwind', prefix: 'northwind.app/'},
            {id: 'region', label: 'Primary region', description: 'Where new projects store data by default.', kind: 'select', value: 'us-east', options: [{id: 'us-east', label: 'US East (N. Virginia)'}, {id: 'us-west', label: 'US West (Oregon)'}, {id: 'eu-central', label: 'Europe (Frankfurt)'}, {id: 'apac', label: 'Asia Pacific (Singapore)'}]},
            {id: 'description', label: 'Description', description: 'A short note for people joining the workspace.', kind: 'textarea', value: 'Internal tools and dashboards for the operations team. Shared with 24 people.'},
            {id: 'language', label: 'Language', description: 'The default language for shared workspace screens.', kind: 'select', value: 'en', options: [{id: 'en', label: 'English'}, {id: 'de', label: 'German'}, {id: 'fr', label: 'French'}, {id: 'ja', label: 'Japanese'}]},
            {id: 'timezone', label: 'Time zone', description: 'Used for timestamps in reports and exports.', kind: 'select', value: 'new-york', options: [{id: 'new-york', label: 'New York, GMT−05:00'}, {id: 'london', label: 'London, GMT+00:00'}, {id: 'berlin', label: 'Berlin, GMT+01:00'}, {id: 'tokyo', label: 'Tokyo, GMT+09:00'}]},
            {id: 'date-format', label: 'Date format', description: 'How dates appear in shared workspace screens.', kind: 'select', value: 'august', options: [{id: 'august', label: 'Aug 5, 2026'}, {id: 'day-month', label: '5 Aug 2026'}, {id: 'iso', label: '2026-08-05'}]},
        ],
    },
    profile: {
        labels: {pageTitle: 'Public profile', panelTitle: 'Account', panelDescription: 'The profile other people see when you collaborate.', photoLabel: 'Profile photo', photoDescription: 'JPG, PNG, or GIF up to 2 MB.', changePhoto: 'Change', uploadPhoto: 'Upload a profile photo', unsaved: 'Unsaved profile changes', cancel: 'Cancel', save: 'Save profile', changed: 'Changed'},
        initials: 'MW',
        fields: [
            {id: 'full-name', label: 'Full name', description: 'Shown with comments, edits, and shared documents.', kind: 'text', value: 'Mara Whitfield'},
            {id: 'title', label: 'Title', description: 'A short role that appears beneath your name.', kind: 'text', value: 'Product designer'},
            {id: 'username', label: 'Username', description: 'This is the address of your public profile.', kind: 'text', value: 'mara', prefix: 'northwind.co/', changed: true, error: 'mara is taken. Try another handle.'},
            {id: 'email', label: 'Email', description: 'Used for sign-in and account notices.', kind: 'text', value: 'mara.whitfield@northwind.co', note: 'Never shown publicly.'},
            {id: 'bio', label: 'Bio', description: 'A short line under your name.', kind: 'textarea', value: 'Designing the tools our operations team uses every day. Previously at Fieldbase.', maxLength: 160, note: '80 of 160 characters'},
        ],
    },
    preferences: {
        labels: {pageTitle: 'Preferences', panelTitle: 'Workspace preferences', panelDescription: 'Defaults for appearance, editing, and notifications.', themeLabel: 'Theme', themeCurrent: 'This device', themeDescription: 'Choose how this device renders the interface.', densityLabel: 'Density', densityDescription: 'Set the default spacing for tables and panels.', languageLabel: 'Language', languageDescription: 'Use this language for shared workspace screens.', toggleGroup: 'Notification preferences', changed: 'Changed', recommended: 'Recommended', unsaved: 'Unsaved preferences', cancel: 'Cancel', save: 'Save changes'},
        themeChoices: [{id: 'system', label: 'System'}, {id: 'light', label: 'Light'}, {id: 'dark', label: 'Dark'}], initialThemeId: 'dark',
        densityChoices: [{id: 'comfortable', label: 'Comfortable'}, {id: 'cozy', label: 'Cozy'}, {id: 'compact', label: 'Compact'}], initialDensityId: 'cozy',
        languageChoices: [{id: 'en', label: 'English'}, {id: 'de', label: 'German'}, {id: 'fr', label: 'French'}, {id: 'ja', label: 'Japanese'}], initialLanguageId: 'en',
        toggles: [{id: 'weekly', label: 'Weekly summary', description: 'A digest of activity every Monday morning.', enabled: true, recommended: true}, {id: 'mentions', label: 'Mentions', description: 'Notify me when someone mentions my name.', enabled: true}, {id: 'replies', label: 'Comment replies', description: 'Replies to threads I have posted in.', enabled: true, changed: true}],
        checkbox: {id: 'sounds', label: 'Play notification sounds', description: 'A short chime when something needs your attention.', enabled: false},
    },
    members: {
        labels: {pageTitle: 'Members', panelTitle: 'Team access', panelDescription: 'Invite people and keep role assignments aligned.', inviteTitle: 'Invite member', inviteDescription: 'Send an invitation with the right role from the start.', emailLabel: 'Email address', emailPlaceholder: 'name@company.com', roleLabel: 'Role for invite', sendInvite: 'Send invite', active: 'Active', invited: 'Invited', empty: 'No members yet.', actions: (name) => `Actions for ${name}`, seats: (used, total) => `${used} of ${total} seats used`},
        inviteRoles: [{id: 'admin', label: 'Admin'}, {id: 'member', label: 'Member'}, {id: 'billing', label: 'Billing'}, {id: 'viewer', label: 'Viewer'}], initialInviteRoleId: 'member',
        members: [
            {id: 'mara', initials: 'MW', name: 'Mara Whitfield', email: 'mara.whitfield@northwind.co', status: 'active', role: 'Owner', roleId: 'owner', roleChoices: [{id: 'owner', label: 'Owner'}]},
            {id: 'devan', initials: 'DR', name: 'Devan Rao', email: 'devan@northwind.co', status: 'active', role: 'Admin', roleId: 'admin', roleChoices: [{id: 'admin', label: 'Admin'}, {id: 'member', label: 'Member'}, {id: 'billing', label: 'Billing'}, {id: 'viewer', label: 'Viewer'}]},
            {id: 'priyanka', initials: 'PB', name: 'Priyanka Balasubramanian', email: 'priyanka.b@northwind.co', status: 'active', role: 'Member', roleId: 'member', roleChoices: [{id: 'admin', label: 'Admin'}, {id: 'member', label: 'Member'}, {id: 'billing', label: 'Billing'}, {id: 'viewer', label: 'Viewer'}]},
            {id: 'tom', initials: 'TE', name: 'Tom Ek', email: 'tom@contractors.northwind.co', status: 'active', role: 'Viewer', roleId: 'viewer', roleChoices: [{id: 'admin', label: 'Admin'}, {id: 'member', label: 'Member'}, {id: 'billing', label: 'Billing'}, {id: 'viewer', label: 'Viewer'}]},
            {id: 'jules', initials: 'JM', name: 'Jules Moreau', email: 'jules.moreau@northwind.co', status: 'invited', role: 'Member', roleId: 'member', roleChoices: [{id: 'admin', label: 'Admin'}, {id: 'member', label: 'Member'}, {id: 'billing', label: 'Billing'}, {id: 'viewer', label: 'Viewer'}]},
            {id: 'sofia', initials: 'SC', name: 'Sofia Castellano', email: 'sofia@northwind.co', status: 'active', role: 'Billing', roleId: 'billing', roleChoices: [{id: 'admin', label: 'Admin'}, {id: 'member', label: 'Member'}, {id: 'billing', label: 'Billing'}, {id: 'viewer', label: 'Viewer'}]},
        ], seatsUsed: 6, seatsTotal: 10, listStrategy: {kind: 'pane-scroll', expectedMaximum: 20},
    },
    apiKeys: {
        labels: {pageTitle: 'API keys', secretsTitle: 'Secret keys', secretsDescription: 'Rotate credentials and copy tokens for server-side services.', createKey: 'Create key', actions: (name) => `Actions for ${name}`, reveal: (name) => `Reveal ${name}`, hide: (name) => `Hide ${name}`, copy: (name) => `Copy ${name}`, secretMeta: (created, lastUsed) => `${created} · ${lastUsed}`, empty: 'No secret keys yet.', integrationsTitle: 'Integrations', integrationsDescription: 'Allow connected services to act on this account.', connected: 'Connected', disconnected: 'Disconnected', auditNote: 'Key rotations and integration changes are audit logged.', toggle: (name) => `Toggle ${name}`},
        secrets: [{id: 'production', name: 'Production server', created: 'Created Mar 2, 2026.', lastUsed: 'Last used 3 minutes ago.', token: 'sk_live_1234567890abcdef4a2f6c0b'}, {id: 'staging', name: 'Staging', created: 'Created Jan 18, 2026.', lastUsed: 'Last used Yesterday.', token: 'sk_test_1234567890abcdef7719ee02'}, {id: 'warehouse', name: 'Data warehouse sync', created: 'Created Nov 9, 2025.', lastUsed: 'Never used.', token: 'sk_live_1234567890abcdef2e5a8c4d'}],
        integrations: [{id: 'slack', name: 'Slack', status: 'connected', description: 'Post alerts to #ops-notifications.', enabled: true}, {id: 'github', name: 'GitHub', status: 'disconnected', description: 'Link commits to deployments.', enabled: false}, {id: 'linear', name: 'Linear', status: 'connected', description: 'Create follow-up issues from incidents.', enabled: true}],
        listStrategy: {kind: 'content-grown', expectedMaximum: 12},
    },
    danger: {
        labels: {pageTitle: 'Danger zone', panelTitle: 'Workspace controls', panelDescription: 'These actions affect everyone in the workspace. Review before you confirm.', transferTitle: 'Transfer ownership', transferDescription: 'Hand the workspace to another admin. You keep your account.', transferAction: 'Transfer', archiveTitle: 'Export and archive', archiveDescription: 'Download all data, then make the workspace read-only.', archiveAction: 'Archive workspace', deleteTitle: 'Delete workspace', deleteDescription: 'Permanently remove the workspace and everything in it.', deleteSummary: 'Deleting removes, for all {count} members:', typePrompt: 'Type {workspace} to confirm', confirmationLabel: 'Workspace name confirmation', cancel: 'Cancel', deleteAction: 'Delete this workspace', footerNote: 'Export data before irreversible workspace changes.', transferNotice: 'Ownership transfer requested.', archiveNotice: 'Workspace archive requested.', deleteSuccess: 'Workspace deletion requested.'},
        workspaceName: 'northwind', memberCount: 24, consequences: ['1,284 projects and their history', 'All API keys and connected integrations', 'The northwind.app subdomain, released for reuse'],
    },
}

export function createHbarAppUiSettingsFormOverflowFixtures(): HbarAppUiSettingsFormContent {
    const base = HBAR_APP_UI_SETTINGS_FORM_FIXTURES
    return {...base, members: base.members && {...base.members, members: [...base.members.members, ...Array.from({length: 24}, (_, index) => ({id: `overflow-member-${index}`, initials: 'OV', name: `Overflow member ${index + 1}`, email: `overflow-${index + 1}@example.test`, status: 'active' as const, role: 'Member', roleId: 'member', roleChoices: base.members!.inviteRoles}))]}, apiKeys: base.apiKeys && {...base.apiKeys, secrets: [...base.apiKeys.secrets, ...Array.from({length: 16}, (_, index) => ({id: `overflow-key-${index}`, name: `Overflow key ${index + 1}`, created: 'Created today.', lastUsed: 'Never used.', token: `sk_test_overflow_${index}`}))]}}
}

export function createHbarAppUiSettingsFormLocalizedFixtures(): HbarAppUiSettingsFormContent {
    const base = HBAR_APP_UI_SETTINGS_FORM_FIXTURES
    return {
        ...base,
        workspace: base.workspace && {
            ...base.workspace,
            labels: {...base.workspace.labels, pageTitle: 'Einstellungen', panelDescription: 'Sehr lange lokalisierte Beschreibung für gemeinsame Arbeitsbereiche und ihre Standardwerte.', save: 'Änderungen speichern'},
        },
        profile: base.profile && {...base.profile, labels: {...base.profile.labels, pageTitle: 'Öffentliches Profil', save: 'Profil speichern'}},
        members: base.members && {...base.members, labels: {...base.members.labels, pageTitle: 'Mitglieder', panelTitle: 'Teamzugriff', sendInvite: 'Einladung senden'}},
        apiKeys: base.apiKeys && {...base.apiKeys, labels: {...base.apiKeys.labels, pageTitle: 'API-Schlüssel', createKey: 'Schlüssel erstellen'}},
        danger: base.danger && {...base.danger, labels: {...base.danger.labels, pageTitle: 'Gefahrenzone', deleteAction: 'Arbeitsbereich löschen'}},
    }
}
