import {describe, expect, test} from 'bun:test'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {canContinueProviderFirst} from '../hbar-ui/packages/lumen-app-ui/src/authentication/ProviderFirstAuthentication'
import {selectQuote} from '../hbar-ui/packages/lumen-app-ui/src/authentication/QuoteAuthentication'
import {
    getHbarAppUiVariant,
    HbarAppUiAuthenticationProvider,
    selectHbarAppUiAuthItem,
    uniqueHbarAppUiAuthItems,
    type HbarAppUiAuthContent,
} from '../packages/hbar-app-ui/src/index'
import {
    createHbarAppUiAuthenticationLocalizedFixtures,
    createHbarAppUiAuthenticationOverflowFixtures,
    HBAR_APP_UI_AUTHENTICATION_FIXTURES,
} from './fixtures/hbar-app-ui-authentication-fixtures'

function renderAuthentication(variant: number, content: HbarAppUiAuthContent = HBAR_APP_UI_AUTHENTICATION_FIXTURES): string {
    const component = getHbarAppUiVariant('authentication', variant).component
    return renderToStaticMarkup(createElement(HbarAppUiAuthenticationProvider, {content, children: createElement(component, {})}))
}

function occurrences(markup: string, token: string): number {
    return markup.match(new RegExp(token, 'g'))?.length ?? 0
}

describe('hbar-app-ui authentication surfaces', () => {
    test('renders fourteen independent workflows from host-owned content', () => {
        const markup = Array.from({length: 14}, (_, index) => renderAuthentication(index + 1))
        const markers = [
            'hbar-app-ui-auth-sign-in-surface',
            'hbar-app-ui-auth-provider-first-surface',
            'hbar-app-ui-auth-quote-surface',
            'hbar-app-ui-auth-two-step-surface',
            'hbar-app-ui-auth-magic-link-surface',
            'hbar-app-ui-auth-code-surface',
            'hbar-app-ui-auth-sign-up-surface',
            'hbar-app-ui-auth-enterprise-surface',
            'hbar-app-ui-auth-passkey-surface',
            'hbar-app-ui-auth-account-surface',
            'hbar-app-ui-auth-workspace-surface',
            'hbar-app-ui-auth-invitation-surface',
            'hbar-app-ui-auth-password-reset-surface',
            'hbar-app-ui-auth-approval-surface',
        ]
        expect(new Set(markup).size).toBe(14)
        for (const [index, value] of markup.entries()) {
            expect(value).toContain(markers[index]!)
        }
    })

    test('renders long non-default locale copy exclusively from the host bundle', () => {
        const localized = createHbarAppUiAuthenticationLocalizedFixtures()
        expect(renderAuthentication(1, localized)).toContain('Sehr lange lokalisierte Beschreibung')
        expect(renderAuthentication(2, localized)).toContain('Willkommen zurück')
        expect(renderAuthentication(3, localized)).toContain('Lokalisierter Text mit absichtlich langem Umbruch')
        expect(renderAuthentication(4, localized)).toContain('Beim Northwind-Arbeitsbereich anmelden')
        expect(renderAuthentication(11, localized)).toContain('Arbeitsbereich auswählen')
        expect(renderAuthentication(12, localized)).toContain('Einladung annehmen')
        expect(renderAuthentication(13, localized)).toContain('Neues Passwort festlegen')
        expect(renderAuthentication(1, localized)).not.toContain('Continue to the Northwind workspace.')
    })

    test('supports host-defined provider IDs instead of encoded email or SSO identifiers', () => {
        const base = HBAR_APP_UI_AUTHENTICATION_FIXTURES.providerFirst
        if (!base) throw new Error('Expected provider-first fixture')
        const content: HbarAppUiAuthContent = {
            ...HBAR_APP_UI_AUTHENTICATION_FIXTURES,
            providerFirst: {
                ...base,
                emailProviderId: 'host-email-route',
                ssoProviderId: 'enterprise-route',
                initialProviderId: 'host-email-route',
            },
        }
        const markup = renderAuthentication(2, content)
        expect(markup).toContain(base.labels.emailLabel)
        expect(markup).toContain(base.labels.singleSignOn)
        expect(markup).not.toContain('host-email-route')
        expect(markup).not.toContain('enterprise-route')
    })

    test('provider-first uses one associated email label, host-owned provider copy, and valid email/domain gates', () => {
        const markup = renderAuthentication(2)
        expect(occurrences(markup, '>Work email<')).toBe(1)
        expect(markup).toContain('Continue with Google')
        expect(markup.indexOf('Continue with Google')).toBeLessThan(markup.indexOf('Continue with GitHub'))
        expect(markup.indexOf('Continue with GitHub')).toBeLessThan(markup.indexOf('Continue with Apple'))
        expect(markup).toContain('type="email"')
        expect(markup).toContain('disabled=""')
        expect(canContinueProviderFirst('', false)).toBe(false)
        expect(canContinueProviderFirst('not-an-email', false)).toBe(false)
        expect(canContinueProviderFirst('a@b.c', false)).toBe(false)
        expect(canContinueProviderFirst('dana@example.com', false)).toBe(true)
        expect(canContinueProviderFirst(' ', true)).toBe(false)
        expect(canContinueProviderFirst('northwind', true)).toBe(true)
    })

    test('provider-first retains host provider count and localized/domain content without duplicating controls', () => {
        const base = HBAR_APP_UI_AUTHENTICATION_FIXTURES.providerFirst
        if (!base) throw new Error('Expected provider-first fixture')
        for (const size of [0, 1, base.providerListStrategy.expectedMaximum, base.providerListStrategy.expectedMaximum + 1]) {
            const socialProviders = Array.from({length: size}, (_, index) => ({id: `host-${index}`, label: `Provider ${index}`, icon: 'key' as const}))
            const markup = renderAuthentication(2, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, providerFirst: {...base, socialProviders}})
            expect(occurrences(markup, 'Provider [0-9]')).toBe(size)
            expect(markup).toContain(base.labels.emailLabel)
        }
        const localized = renderAuthentication(2, {
            ...HBAR_APP_UI_AUTHENTICATION_FIXTURES,
            providerFirst: {...base, initialProviderId: base.ssoProviderId, labels: {...base.labels, ssoLabel: 'Lange Unternehmensdomäne', ssoPlaceholder: 'organisationsname', ssoSuffix: '.beispiel.test', ssoHelper: 'Die Verwaltung hat diese Domäne für den Arbeitsbereich festgelegt.'}},
        })
        expect(localized).toContain('Lange Unternehmensdomäne')
        expect(localized).toContain('.beispiel.test')
        expect(localized).toContain('Die Verwaltung hat diese Domäne')
        expect(localized).not.toContain('>Work email<')
    })

    test('quote carousel retains host-authored stories, empty recovery, duplicate IDs and over-bound content', () => {
        const base = HBAR_APP_UI_AUTHENTICATION_FIXTURES.quote
        if (!base) throw new Error('Expected quote fixture')
        expect(selectQuote(base.quotes, 'daniel')?.name).toBe('Daniel Osei')
        expect(selectQuote(base.quotes, 'stale')?.name).toBe('Mina Park')
        expect(selectQuote([], 'stale')).toBeUndefined()
        const markup = renderAuthentication(3)
        expect(markup).toContain('Show quote from Rachel Lindqvist')
        expect(occurrences(markup, 'Show quote from ')).toBe(3)
        const empty = renderAuthentication(3, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, quote: {...base, quotes: []}})
        expect(empty).toContain(base.labels.emptyQuotes)
        expect(empty).not.toContain('Previous quote')
        const duplicated = renderAuthentication(3, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, quote: {...base, quotes: [base.quotes[0]!, base.quotes[0]!, base.quotes[1]!]}})
        expect(occurrences(duplicated, 'Show quote from ')).toBe(2)
        const overBound = Array.from({length: base.quoteListStrategy.expectedMaximum + 1}, (_, index) => ({...base.quotes[0]!, id: `story-${index}`, name: `Host story ${index}`}))
        const expanded = renderAuthentication(3, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, quote: {...base, quotes: overBound}})
        expect(occurrences(expanded, 'Show quote from Host story')).toBe(overBound.length)
        expect(expanded).toContain('Host story 6')
    })

    test('two-step email view uses host labels and a native, associated email form', () => {
        const base = HBAR_APP_UI_AUTHENTICATION_FIXTURES.twoStep
        if (!base) throw new Error('Expected two-step fixture')
        const markup = renderAuthentication(4)
        expect(markup).toContain('type="email"')
        expect(markup).toContain('name@company.com')
        expect(markup).toContain(base.labels.magicLink)
        expect(markup).toContain(base.labels.step(1, 2))
        expect(markup).not.toContain(base.account.name)
        expect(markup).not.toContain('disabled=""')
        const localized = renderAuthentication(4, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, twoStep: {...base, labels: {...base.labels, title: 'Ein langer lokalisierter Titel', emailLabel: 'Geschäftliche E-Mail', magicLink: 'Anmeldelink per E-Mail senden'}}})
        expect(localized).toContain('Ein langer lokalisierter Titel')
        expect(localized).toContain('Geschäftliche E-Mail')
        expect(localized).toContain('Anmeldelink per E-Mail senden')
        expect(localized).not.toContain('Sign in to Northwind')
    })

    test('handles empty, one, boundary, over-bound, duplicate, and stale list states', () => {
        const passkey = HBAR_APP_UI_AUTHENTICATION_FIXTURES.passkey
        const account = HBAR_APP_UI_AUTHENTICATION_FIXTURES.account
        const workspace = HBAR_APP_UI_AUTHENTICATION_FIXTURES.workspace
        const invitation = HBAR_APP_UI_AUTHENTICATION_FIXTURES.invitation
        const passwordReset = HBAR_APP_UI_AUTHENTICATION_FIXTURES.passwordReset
        const approval = HBAR_APP_UI_AUTHENTICATION_FIXTURES.approval
        if (!passkey || !account || !workspace || !invitation || !passwordReset || !approval) throw new Error('Expected authentication list fixtures')

        const empty: HbarAppUiAuthContent = {
            ...HBAR_APP_UI_AUTHENTICATION_FIXTURES,
            passkey: {...passkey, passkeys: []},
            account: {...account, accounts: []},
            workspace: {...workspace, workspaces: []},
            invitation: {...invitation, projects: []},
            passwordReset: {...passwordReset, devices: []},
            approval: {...approval, recent: []},
        }
        expect(renderAuthentication(9, empty)).toContain(passkey.labels.emptyPasskeys)
        expect(renderAuthentication(10, empty)).toContain(account.labels.emptyAccounts)
        expect(renderAuthentication(11, empty)).toContain(workspace.labels.emptyWorkspaces)
        expect(renderAuthentication(12, empty)).toContain(invitation.labels.emptyProjects)
        expect(renderAuthentication(13, empty)).toContain(passwordReset.labels.emptyDevices)
        expect(renderAuthentication(14, empty)).toContain(approval.labels.emptyRecentSignIns)

        const onePasskey = {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, passkey: {...passkey, passkeys: [passkey.passkeys[0]!], initialPasskeyId: passkey.passkeys[0]!.id}}
        const oneWorkspace = {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, workspace: {...workspace, workspaces: [workspace.workspaces[0]!], initialWorkspaceId: workspace.workspaces[0]!.id}}
        expect(occurrences(renderAuthentication(9, onePasskey), 'hbar-app-ui-auth-device-row')).toBe(1)
        expect(occurrences(renderAuthentication(11, oneWorkspace), 'hbar-app-ui-auth-workspace-row')).toBe(1)

        const boundaryPasskeys = Array.from({length: passkey.listStrategy.expectedMaximum}, (_, index) => ({...passkey.passkeys[0]!, id: `boundary-passkey-${index}`, name: `Boundary passkey ${index}`}))
        const overPasskeys = [...boundaryPasskeys, {...passkey.passkeys[0]!, id: 'over-passkey', name: 'Over-bound passkey'}]
        expect(occurrences(renderAuthentication(9, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, passkey: {...passkey, passkeys: boundaryPasskeys}}), 'hbar-app-ui-auth-device-row')).toBe(passkey.listStrategy.expectedMaximum)
        expect(occurrences(renderAuthentication(9, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, passkey: {...passkey, passkeys: overPasskeys}}), 'hbar-app-ui-auth-device-row')).toBe(passkey.listStrategy.expectedMaximum + 1)

        const boundaryWorkspaces = Array.from({length: workspace.listStrategy.expectedMaximum}, (_, index) => ({...workspace.workspaces[0]!, id: `boundary-workspace-${index}`, name: `Boundary workspace ${index}`}))
        const overWorkspaces = [...boundaryWorkspaces, {...workspace.workspaces[0]!, id: 'over-workspace', name: 'Over-bound workspace'}]
        expect(occurrences(renderAuthentication(11, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, workspace: {...workspace, workspaces: boundaryWorkspaces}}), 'hbar-app-ui-auth-workspace-row')).toBe(workspace.listStrategy.expectedMaximum)
        expect(occurrences(renderAuthentication(11, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, workspace: {...workspace, workspaces: overWorkspaces}}), 'hbar-app-ui-auth-workspace-row')).toBe(workspace.listStrategy.expectedMaximum + 1)

        const duplicate = uniqueHbarAppUiAuthItems([{id: 'same', label: 'first'}, {id: 'same', label: 'duplicate'}, {id: 'other', label: 'second'}])
        expect(duplicate).toEqual([{id: 'same', label: 'first'}, {id: 'other', label: 'second'}])
        expect(selectHbarAppUiAuthItem(duplicate, 'missing')).toEqual({id: 'same', label: 'first'})
        expect(selectHbarAppUiAuthItem([], 'missing')).toBeUndefined()
    })

    test('preserves the selected rows and declares the correct scroll ownership', () => {
        const overflow = createHbarAppUiAuthenticationOverflowFixtures()
        const workspace = overflow.workspace
        const account = overflow.account
        const passkey = overflow.passkey
        const invitation = overflow.invitation
        const passwordReset = overflow.passwordReset
        const approval = overflow.approval
        if (!workspace || !account || !passkey || !invitation || !passwordReset || !approval) throw new Error('Expected overflow authentication fixtures')
        expect(renderAuthentication(10, overflow)).toContain('data-hbar-app-ui-list-strategy="content-grown"')
        expect(renderAuthentication(11, overflow)).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
        expect(renderAuthentication(12, overflow)).toContain('data-hbar-app-ui-list-strategy="content-grown"')
        expect(renderAuthentication(13, overflow)).toContain('data-hbar-app-ui-list-strategy="content-grown"')
        expect(occurrences(renderAuthentication(10, overflow), 'hbar-app-ui-auth-account-row')).toBe(account.accounts.length + 1)
        expect(occurrences(renderAuthentication(11, overflow), 'hbar-app-ui-auth-workspace-row')).toBe(workspace.workspaces.length)
        expect(occurrences(renderAuthentication(9, overflow), 'hbar-app-ui-auth-device-row')).toBe(passkey.passkeys.length)
        expect(occurrences(renderAuthentication(12, overflow), 'hbar-app-ui-auth-project-row')).toBe(invitation.projects.length)
        expect(occurrences(renderAuthentication(13, overflow), 'class="hbar-app-ui-auth-reset-device"')).toBe(passwordReset.devices.length)
        expect(occurrences(renderAuthentication(14, overflow), 'hbar-app-ui-auth-recent-row')).toBe(approval.recent.length)
    })
})
