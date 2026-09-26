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
            'hbar-app-ui-auth-account-reference',
            'hbar-app-ui-auth-workspace-reference',
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
        expect(renderAuthentication(5, localized)).toContain('Prüfen Sie Ihren Posteingang')
        expect(renderAuthentication(6, localized)).toContain('Bestätigen Sie Ihre Identität')
        expect(renderAuthentication(7, localized)).toContain('Konto erstellen')
        expect(renderAuthentication(8, localized)).toContain('Mit Ihrem Unternehmenskonto anmelden')
        expect(renderAuthentication(9, localized)).toContain('Mit einem Passkey anmelden')
        expect(renderAuthentication(10, localized)).toContain('Konto auswählen')
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

    test('magic-link summary keeps host-authored rich email copy and bounded metadata rows', () => {
        const base = HBAR_APP_UI_AUTHENTICATION_FIXTURES.magicLink
        if (!base) throw new Error('Expected magic-link fixture')
        const markup = renderAuthentication(5)
        expect(markup).toContain(`${base.labels.descriptionBeforeEmail}<span class="hbar-app-ui-auth-magic-link-email">${base.email}${base.labels.descriptionEmailSuffix}</span>${base.labels.descriptionAfterEmail}`)
        expect(occurrences(markup, 'hbar-app-ui-auth-magic-link-summary-label')).toBe(3)
        expect(occurrences(markup, 'hbar-app-ui-auth-magic-link-summary-value')).toBe(3)
        expect(markup).toContain('disabled=""')
        const localized = createHbarAppUiAuthenticationLocalizedFixtures()
        const localizedMarkup = renderAuthentication(5, localized)
        expect(localizedMarkup).toContain('Ein Anmeldelink ist unterwegs an ')
        expect(localizedMarkup).toContain('dana.whitfield+international@northwind.com')
        expect(localizedMarkup).not.toContain('A sign-in link is on its way to ')
    })

    test('code verification renders controlled text, recovery, pending and verified states from its host', () => {
        const base = HBAR_APP_UI_AUTHENTICATION_FIXTURES.code
        const flow = base?.referenceFlow
        if (!base || !flow) throw new Error('Expected reference code fixture')
        const initial = renderAuthentication(6)
        expect(occurrences(initial, 'aria-label="Digit ')).toBe(6)
        expect(initial).toContain('<fieldset')
        const recovery = renderAuthentication(6, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, code: {...base, referenceFlow: {...flow, phase: 'recovery', recoveryCode: 'ABCDE-12345', canVerifyRecovery: true}}})
        expect(recovery).toContain(flow.labels.recoveryTitle)
        expect(recovery).toContain('value="ABCDE-12345"')
        expect(recovery).not.toContain('aria-label="Digit ')
        const pending = renderAuthentication(6, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, code: {...base, busy: true, code: '123456'}})
        expect(pending).toContain(flow.labels.checkingCode)
        expect(pending).toContain(flow.labels.verifying)
        const verified = renderAuthentication(6, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, code: {...base, referenceFlow: {...flow, phase: 'verified', success: {method: 'Host-owned method', trustedUntil: 'Host-owned expiry'}}}})
        expect(verified).toContain(flow.labels.verifiedTitle)
        expect(verified).toContain('Host-owned method')
        expect(verified).toContain('Host-owned expiry')
        expect(verified).not.toContain('<fieldset')
        const legacy = renderAuthentication(6, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, code: {...base, referenceFlow: undefined}})
        expect(legacy).toContain('hbar-app-ui-code-verification')
    })

    test('sign-up reference form renders host-owned strength, valid requirements and native labels', () => {
        const base = HBAR_APP_UI_AUTHENTICATION_FIXTURES.signUp
        const flow = base?.referenceFlow
        if (!base || !flow) throw new Error('Expected reference sign-up fixture')
        const initial = renderAuthentication(7)
        expect(initial).toContain('<form')
        expect(initial).toContain('type="email"')
        expect(initial).toContain('type="password"')
        expect(occurrences(initial, '<li')).toBe(4)
        expect(initial).not.toContain('Weak')
        const strong = renderAuthentication(7, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, signUp: {...base, referenceFlow: {...flow, password: 'StrongPassword1!', requirementsMet: [true, true, true, true], canSubmit: true, agreed: true}}})
        expect(strong).toContain('Strong')
        expect(occurrences(strong, 'class="is-active"')).toBe(4)
        expect(strong).not.toContain('disabled=""')
        const legacy = renderAuthentication(7, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, signUp: {...base, referenceFlow: undefined}})
        expect(legacy).toContain('hbar-app-ui-auth-progress')
    })

    test('enterprise reference renders controlled email and passive organization metadata without inventing controls', () => {
        const base = HBAR_APP_UI_AUTHENTICATION_FIXTURES.enterprise
        const flow = base?.referenceFlow
        if (!base || !flow) throw new Error('Expected enterprise fixture')
        const initial = renderAuthentication(8)
        expect(initial).toContain('<aside')
        expect(initial).toContain('type="email"')
        expect(initial).toContain('dana.whitfield@northwind.com')
        expect(occurrences(initial, '<li')).toBe(3)
        const alternate = renderAuthentication(8, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, enterprise: {...base, referenceFlow: {...flow, email: 'team@ardentfreight.co'}}})
        expect(alternate).toContain('Continue with Microsoft Entra ID')
        expect(alternate).toContain('Sign-in restricted to managed devices')
        const unmatched = renderAuthentication(8, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, enterprise: {...base, referenceFlow: {...flow, email: 'team@unknown.example', alternateOrganizations: []}}})
        expect(unmatched).toContain(flow.labels.noMatch)
        expect(unmatched).toContain(flow.labels.lookupDescription)
        expect(unmatched).not.toContain('412 members')
        const many = Array.from({length: 20}, (_, index) => ({organization: {...base.organization, domain: `team-${index}.example`, name: `Host organization ${index}`}, providerHint: `Host provider ${index}`, securityChecks: [`Host policy ${index}`], lockedOut: `Host help ${index}`}))
        const last = renderAuthentication(8, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, enterprise: {...base, referenceFlow: {...flow, email: 'staff@team-19.example', alternateOrganizations: many}}})
        expect(last).toContain('Host organization 19')
        expect(last).toContain('Host policy 19')
        expect(occurrences(last, '<li')).toBe(1)
        const pending = renderAuthentication(8, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, enterprise: {...base, referenceFlow: {...flow, email: 'another@northwind.com', busy: true}}})
        expect(pending).toContain('another@northwind.com')
        expect(pending).toContain(flow.labels.redirecting)
        const legacy = renderAuthentication(8, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, enterprise: {...base, referenceFlow: undefined}})
        expect(legacy).toContain('hbar-app-ui-auth-organization-layout')
    })

    test('passkey reference keeps selected device and request phase in the Host contract', () => {
        const base = HBAR_APP_UI_AUTHENTICATION_FIXTURES.passkey
        const flow = base?.referenceFlow
        if (!base || !flow) throw new Error('Expected passkey fixture')
        const initial = renderAuthentication(9)
        expect(initial).toContain('<fieldset')
        expect(occurrences(initial, 'aria-pressed=')).toBe(3)
        const request = renderAuthentication(9, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, passkey: {...base, referenceFlow: {...flow, phase: 'request', selectedId: 'phone'}}})
        expect(request).toContain("Confirm on Dana&#x27;s iPhone")
        expect(request).toContain(flow.labels.waiting)
        expect(request).not.toContain('hbar-app-ui-auth-passkey-options')
        const empty = renderAuthentication(9, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, passkey: {...base, passkeys: [], referenceFlow: {...flow, selectedId: ''}}})
        expect(empty).toContain(base.labels.emptyPasskeys)
        expect(empty).toContain('disabled=""')
        const legacy = renderAuthentication(9, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, passkey: {...base, referenceFlow: undefined}})
        expect(legacy).toContain('hbar-app-ui-auth-device-list')
    })

    test('account reference projects host-selected resume and reauthentication paths', () => {
        const base = HBAR_APP_UI_AUTHENTICATION_FIXTURES.account
        const flow = base?.referenceFlow
        if (!base || !flow) throw new Error('Expected account fixture')
        const initial = renderAuthentication(10)
        expect(occurrences(initial, 'aria-pressed=')).toBe(3)
        expect(initial).toContain('Continue to Northwind Operations')
        const mina = renderAuthentication(10, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, account: {...base, referenceFlow: {...flow, selectedId: 'mina'}}})
        expect(mina).toContain('Continue to Northwind Design')
        expect(mina).toContain('Signing in as mina.park@northwind.com')
        const contractor = renderAuthentication(10, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, account: {...base, referenceFlow: {...flow, selectedId: 'contractor'}}})
        expect(contractor).toContain('Sign in again as D.')
        expect(contractor).toContain('Sessions for contractor accounts end after 12 hours.')
        const empty = renderAuthentication(10, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, account: {...base, accounts: [], referenceFlow: {...flow, selectedId: ''}}})
        expect(empty).toContain(base.labels.emptyAccounts)
        expect(empty).toContain('disabled=""')
        const legacy = renderAuthentication(10, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, account: {...base, referenceFlow: undefined}})
        expect(legacy).toContain('hbar-app-ui-auth-account-list')
    })

    test('workspace reference retains host selection across filtered, invitation and empty list states', () => {
        const base = HBAR_APP_UI_AUTHENTICATION_FIXTURES.workspace
        const flow = base?.referenceFlow
        if (!base || !flow) throw new Error('Expected workspace fixture')
        const initial = renderAuthentication(11)
        expect(occurrences(initial, 'aria-pressed=')).toBe(base.workspaces.length)
        expect(initial).toContain('Invited by Mina Park')
        expect(initial).toContain(base.labels.createDescription)
        const filtered = renderAuthentication(11, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, workspace: {...base, referenceFlow: {...flow, query: 'Design'}}})
        expect(filtered).toContain('Northwind Design')
        expect(filtered).not.toContain('Ardent Freight')
        expect(filtered).toContain('Open Northwind Operations')
        const invitation = renderAuthentication(11, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, workspace: {...base, referenceFlow: {...flow, selectedId: 'aurelia'}}})
        expect(invitation).toContain('Accept and open Aurelia Product Studio')
        const noMatch = renderAuthentication(11, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, workspace: {...base, referenceFlow: {...flow, query: 'no matching workspace'}}})
        expect(noMatch).toContain('No workspace matches “no matching workspace”')
        expect(noMatch).toContain(flow.labels.emptyHint)
        const legacy = renderAuthentication(11, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, workspace: {...base, referenceFlow: undefined}})
        expect(legacy).toContain('hbar-app-ui-auth-workspace-list')
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
        expect(occurrences(renderAuthentication(9, onePasskey), 'hbar-app-ui-auth-passkey-option ')).toBe(1)
        expect(occurrences(renderAuthentication(11, oneWorkspace), 'hbar-app-ui-auth-workspace-row')).toBe(1)

        const boundaryPasskeys = Array.from({length: passkey.listStrategy.expectedMaximum}, (_, index) => ({...passkey.passkeys[0]!, id: `boundary-passkey-${index}`, name: `Boundary passkey ${index}`}))
        const overPasskeys = [...boundaryPasskeys, {...passkey.passkeys[0]!, id: 'over-passkey', name: 'Over-bound passkey'}]
        expect(occurrences(renderAuthentication(9, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, passkey: {...passkey, passkeys: boundaryPasskeys}}), 'hbar-app-ui-auth-passkey-option ')).toBe(passkey.listStrategy.expectedMaximum)
        expect(occurrences(renderAuthentication(9, {...HBAR_APP_UI_AUTHENTICATION_FIXTURES, passkey: {...passkey, passkeys: overPasskeys}}), 'hbar-app-ui-auth-passkey-option ')).toBe(passkey.listStrategy.expectedMaximum + 1)

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
        expect(occurrences(renderAuthentication(9, overflow), 'hbar-app-ui-auth-passkey-option ')).toBe(passkey.passkeys.length)
        expect(occurrences(renderAuthentication(12, overflow), 'hbar-app-ui-auth-project-row')).toBe(invitation.projects.length)
        expect(occurrences(renderAuthentication(13, overflow), 'class="hbar-app-ui-auth-reset-device"')).toBe(passwordReset.devices.length)
        expect(occurrences(renderAuthentication(14, overflow), 'hbar-app-ui-auth-recent-row')).toBe(approval.recent.length)
    })
})
