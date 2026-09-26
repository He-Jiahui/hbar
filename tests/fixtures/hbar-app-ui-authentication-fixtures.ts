import type {HbarAppUiAuthContent} from '../../packages/hbar-app-ui/src/index'

const providers = [
    {id: 'google', label: 'Google', icon: 'google' as const},
    {id: 'apple', label: 'Apple', icon: 'apple' as const},
    {id: 'github', label: 'GitHub', icon: 'github' as const},
]

export const HBAR_APP_UI_AUTHENTICATION_FIXTURES: HbarAppUiAuthContent = {
    signIn: {
        labels: {brand: 'Northwind', title: 'Sign in', description: 'Continue to the Northwind workspace.', emailLabel: 'Email or username', emailPlaceholder: 'you@northwind.com', passwordLabel: 'Password', passwordPlaceholder: 'Enter your password', forgotPassword: 'Forgot password?', rememberLabel: 'Keep me signed in for 30 days', signIn: 'Sign in', divider: 'Or continue with', noAccount: 'Need an account?', createAccount: 'Create one', privacy: 'Privacy', terms: 'Terms', status: 'Status', showPassword: 'Show password', hidePassword: 'Hide password', invalidEmail: 'Enter a valid email address.', invalidPassword: 'Passwords are at least 8 characters.', signingIn: 'Signing in', signedIn: 'Signed in', signInFailed: 'Sign-in failed. Try again.', signInUnavailable: 'Sign-in is unavailable.'},
        providers, providerListStrategy: {kind: 'content-grown', expectedMaximum: 4}, initialEmail: '', initialRemember: true,
        onSignIn: (_credentials, signal) => new Promise((resolve, reject) => {
            const timeout = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve('confirmed') }, 3000)
            const onAbort = () => { clearTimeout(timeout); reject(new Error('Preview sign-in cancelled')) }
            signal.addEventListener('abort', onAbort, {once: true})
        }),
    },
    providerFirst: {
        labels: {brand: 'Northwind', createAccount: 'Create account', title: 'Welcome back', description: 'Sign in to pick up your tasks, timelines, and reviews exactly where you left them.', divider: 'or', emailLabel: 'Work email', emailPlaceholder: 'you@company.com', ssoLabel: 'Company domain', ssoPlaceholder: 'northwind', ssoSuffix: '.northwind.app', ssoHelper: 'Your admin set this when the workspace was created.', singleSignOn: 'Use single sign-on', useEmailInstead: 'Use email instead', helper: 'We match your email to an existing workspace.', continueLabel: 'Continue', termsPrefix: 'By continuing you agree to the', inlineSeparator: ' ', terms: 'terms of service', privacyPrefix: 'and', privacy: 'privacy policy', termsSuffix: '.', trouble: 'Trouble signing in? Reach the workspace admin.', systemNormal: 'All systems normal'},
        socialProviders: [{id: 'google', label: 'Continue with Google', icon: 'google'}, {id: 'github', label: 'Continue with GitHub', icon: 'github'}, {id: 'apple', label: 'Continue with Apple', icon: 'apple'}], providerListStrategy: {kind: 'content-grown', expectedMaximum: 4}, emailProviderId: 'email', ssoProviderId: 'sso', initialProviderId: 'email',
    },
    quote: {
        labels: {brand: 'Northwind', title: 'Sign in', description: 'Use your Northwind account to continue.', emailLabel: 'Work email', emailPlaceholder: 'name@company.com', passwordLabel: 'Password', passwordPlaceholder: 'Enter your password', forgotPassword: 'Forgot password?', signIn: 'Sign in', divider: 'Or continue with', newAccount: 'New to Northwind?', inlineSeparator: ' ', createAccount: 'Create an account', quoteEyebrow: 'Why teams switch', emptyQuotes: 'No customer stories yet.', previousQuote: 'Previous quote', nextQuote: 'Next quote', showQuote: (name) => `Show quote from ${name}`, showPassword: 'Show password', hidePassword: 'Hide password'},
        providers: [...providers], providerListStrategy: {kind: 'content-grown', expectedMaximum: 4}, quoteListStrategy: {kind: 'content-grown', expectedMaximum: 6}, initialEmail: 'dana.whitfield@northwind.com', initialQuoteId: 'mina', autoAdvanceMs: 8000,
        quotes: [{id: 'mina', text: 'We replaced four spreadsheets and a weekly status call with one board. Reviews now start with everyone already agreeing on the numbers.', initials: 'MP', name: 'Mina Park', role: 'Head of product design, Aurelia', metrics: [{label: 'Setup', value: '1 day'}, {label: 'Weekly hours saved', value: '9.5'}, {label: 'Teams onboarded', value: '24'}]}, {id: 'daniel', text: 'The audit trail is the part nobody expected to love. Every approval has a name and a timestamp, so compliance stopped chasing us.', initials: 'DO', name: 'Daniel Osei', role: 'Director of operations, Ardent Freight', metrics: [{label: 'Approval time', value: '-62%'}, {label: 'Audit findings', value: '0'}, {label: 'Sites live', value: '31'}]}, {id: 'rachel', text: 'Our on-call handover used to take half an hour. It takes four minutes now, and the incoming engineer already knows what changed.', initials: 'RL', name: 'Rachel Lindqvist', role: 'Staff engineer, Kestrel Data', metrics: [{label: 'Handover', value: '4 min'}, {label: 'Escalations', value: '-38%'}, {label: 'Services tracked', value: '112'}]}],
    },
    twoStep: {
        labels: {brand: 'Northwind', step: (current, total) => `Step ${current} of ${total}`, title: 'Sign in to Northwind', description: 'Start with the email your workspace was created with.', emailLabel: 'Work email', emailPlaceholder: 'name@company.com', continueLabel: 'Continue', continuing: 'Continue', magicLink: 'Email me a sign-in link', needAccount: 'Need an account?', createAccount: 'Create one', matchedAccount: 'Matched account', back: 'Back', forgotPassword: 'Forgot password?', invalidEmail: 'Enter a valid email address.', securityNote: 'Signing in from a new device adds a one-time code step.', passwordLabel: 'Password', passwordPlaceholder: 'Enter your password', signIn: 'Sign in', signingIn: 'Signing in', useAnother: 'Use another email', showPassword: 'Show password', hidePassword: 'Hide password'},
        initialEmail: 'dana.whitfield@northwind.com',
        account: {initials: 'DW', name: 'Dana Whitfield', organization: 'Northwind Operations'},
    },
    magicLink: {
        labels: {title: 'Check your inbox', description: (email) => `A sign-in link is on its way to ${email}. It works once and expires in 15 minutes.`, descriptionBeforeEmail: 'A sign-in link is on its way to ', descriptionEmailSuffix: '.', descriptionAfterEmail: ' It works once and expires in 15 minutes.', sentTo: 'Sent to', expires: 'Expires', requestedFrom: 'Requested from', openMail: 'Open mail app', resend: (seconds) => `Resend link in 0:${String(seconds).padStart(2, '0')}`, resendReady: 'Resend link', noEmail: 'No email yet? Check spam, then try a different address.', differentEmail: 'Use a different email', rateLimit: 'Requests are rate limited to protect your account.', formBrand: 'Northwind', formTitle: 'Sign in with a link', formDescription: 'No password needed. We send a one-time link to your work address.', formEmailLabel: 'Work email', formEmailPlaceholder: 'name@company.com', formEmailHelper: 'Links expire after 15 minutes and can be used once.', formInvalidEmail: 'Enter a valid email address.', formSubmit: 'Send sign-in link', formPasswordPrompt: 'Prefer a password?', formPasswordSignIn: 'Sign in the usual way'},
        email: 'dana.whitfield@northwind.com', expiry: '15 minutes', requestedFromValue: 'Chrome on macOS, Lisbon', resendAfterSeconds: 45,
    },
    code: {
        labels: {title: 'Verify it is you', description: 'We sent a six-digit code to the phone ending 4417.', codeLabel: 'Six-digit verification code', codeDigit: (index) => `Digit ${index}`, helper: 'Paste the whole code and it fills every box.', verify: 'Verify and continue', resend: (seconds) => `Resend in 0:${String(seconds).padStart(2, '0')}`, recovery: 'Use a recovery code', back: 'Back to sign in'},
        code: '', codeLength: 6, busy: false, canVerify: false, error: undefined, onCodeChange() {}, onVerify() {}, resend: { seconds: 28, enabled: false, onResend() {} }, onRecovery() {}, onBack() {},
        referenceFlow: {
            labels: {recoveryTitle: 'Enter a recovery code', recoveryDescription: 'Use one of the eight codes saved when two-factor sign-in was turned on.', recoveryLabel: 'Recovery code', recoveryPlaceholder: 'XXXXX-XXXXX', recoveryHelper: 'Each recovery code works once.', useTextedCode: 'Use the texted code', checkingCode: 'Checking your code', verifying: 'Verifying', verifiedTitle: 'Device verified', verifiedDescription: 'This browser is trusted for 30 days. You will not need a code again until then.', methodLabel: 'Method', trustedUntilLabel: 'Trusted until', continueLabel: 'Continue to Northwind', verifyAnother: 'Verify another device', resendReady: 'Resend code', digitSeparator: '—'},
            phase: 'text', recoveryCode: '', canVerifyRecovery: false,
            success: {method: 'Text message', trustedUntil: '9 September 2026'},
            onRecoveryCodeChange() {}, onModeChange() {}, onContinue() {},
        },
    },
    signUp: {
        labels: {brand: 'Northwind', title: 'Create your account', description: 'Free for 14 days. No card, no seat minimum.', nameLabel: 'Full name', namePlaceholder: 'Dana Whitfield', emailLabel: 'Work email', emailPlaceholder: 'you@company.com', emailHelper: 'We use this to match you to an existing workspace.', passwordLabel: 'Password', passwordPlaceholder: 'Choose a password', requirements: ['At least 10 characters', 'One uppercase letter', 'One number', 'One symbol'], agreementPrefix: 'I agree to the', terms: 'terms of service', agreementJoin: 'and the', privacy: 'privacy policy', createAccount: 'Create account', existingAccount: 'Already have an account?', signIn: 'Sign in', showPassword: 'Show password', hidePassword: 'Hide password'},
        initialName: '', initialEmail: '',
        referenceFlow: {
            labels: {strength: ['Weak', 'Fair', 'Good', 'Strong'], agreementEnd: '.'},
            name: '', email: '', password: '', visible: false, agreed: false, requirementsMet: [false, false, false, false], canSubmit: false,
            onNameChange() {}, onEmailChange() {}, onPasswordChange() {}, onVisibleChange() {}, onAgreedChange() {},
        },
    },
    enterprise: {
        labels: {brand: 'Northwind', title: 'Sign in with your company account', description: 'Enter your work email and we route you to the identity provider your organization uses.', emailLabel: 'Work email', emailPlaceholder: 'you@company.com', providerHint: 'northwind.com signs in through Okta.', continueProvider: (provider) => `Continue with ${provider}`, passwordInstead: 'Use a password instead', auditNote: 'Sign-in is logged with the time, device and location, and your admin can review it at any time.', matchedOrganization: 'Matched organization', directory: 'Directory', provider: 'Provider', sessionLength: 'Session length', members: (count) => `${count} members`, securityChecks: ['Two-factor enforced by your admin', 'Directory sync adds and removes access', 'Device posture checked at sign-in'], lockedOut: 'Locked out? Your workspace admin is at it-help@northwind.com.'},
        organization: {name: 'Northwind Operations', domain: 'northwind.com', provider: 'Okta', memberCount: '412 members', sessionLength: '8 hours, then re-authenticate'}, email: 'dana.whitfield@northwind.com',
        referenceFlow: {
            labels: {redirecting: 'Redirecting', continueUnmatched: 'Continue', unmatchedHint: (domain) => `No provider is configured for ${domain}. You can use a password instead.`, emptyHint: 'Try northwind.com or ardentfreight.co to see a matched provider.', noMatch: 'No match yet', lookupTitle: 'We look up your domain', lookupDescription: 'Once your email matches a configured organization, its provider, directory size and security rules appear here before you continue.'},
            alternateOrganizations: [{organization: {name: 'Ardent Freight', domain: 'ardentfreight.co', provider: 'Microsoft Entra ID', memberCount: '1,284 members', sessionLength: '12 hours, then re-authenticate'}, providerHint: 'ardentfreight.co signs in through Microsoft Entra ID.', securityChecks: ['Two-factor enforced by your admin', 'Directory sync adds and removes access', 'Sign-in restricted to managed devices'], lockedOut: 'Locked out? Your workspace admin is at identity@ardentfreight.co.'}],
            email: 'dana.whitfield@northwind.com', busy: false, onEmailChange() {}, onContinue() {},
        },
    },
    passkey: {
        labels: {title: 'Sign in with a passkey', description: 'Your device confirms it is you. There is nothing to type and nothing to remember.', choose: 'Choose a passkey', continueWith: (name) => `Continue with ${name}`, otherWays: 'Other ways in', password: 'Password', emailLink: 'Email link', footer: 'Passkeys stay on your device and are never sent to Northwind.', emptyPasskeys: 'No passkeys are available on this device.'},
        passkeys: [{id: 'mac', name: 'MacBook Pro', detail: 'Touch ID · used 2 days ago', icon: 'laptop'}, {id: 'phone', name: "Dana's iPhone", detail: 'Face ID · used 3 weeks ago', icon: 'phone'}, {id: 'security', name: 'Security key', detail: 'Hardware key · used in March', icon: 'key'}], initialPasskeyId: 'mac', listStrategy: {kind: 'content-grown', expectedMaximum: 5},
        referenceFlow: {labels: {confirmOn: (name) => `Confirm on ${name}`, waiting: 'Waiting for your device. This request expires in two minutes.', cancel: 'Cancel request'}, selectedId: 'mac', phase: 'choose', onSelect() {}, onContinue() {}, onCancel() {}},
    },
    account: {
        labels: {brand: 'Northwind', title: 'Choose an account', description: 'This browser remembers three Northwind accounts.', useAnother: 'Use another account', useAnotherDescription: 'Sign in with a different email or provider', continueWith: (workspace) => `Continue to ${workspace}`, signingInAs: (email) => `Signing in as ${email}`, finished: 'Finished on this device?', signOutAll: 'Sign out of all accounts', emptyAccounts: 'No remembered accounts are available.'},
        accounts: [{id: 'dana', initials: 'DW', name: 'Dana Whitfield', email: 'dana.whitfield@northwind.com', status: 'Signed in 4 hours ago', statusTone: 'neutral'}, {id: 'mina', initials: 'MP', name: 'Mina Park', email: 'mina.park@northwind.com', status: 'Signed in yesterday', statusTone: 'neutral'}, {id: 'contractor', initials: 'DW', name: 'D. Whitfield (contractor)', email: 'd.whitfield@ardentfreight.co', status: 'Session expired, sign in again', statusTone: 'warning'}], workspaceName: 'Northwind Operations', initialAccountId: 'dana', listStrategy: {kind: 'content-grown', expectedMaximum: 8},
    },
    workspace: {
        labels: {signedInAs: 'Signed in as', signOut: 'Sign out', title: 'Pick a workspace', description: 'You belong to four workspaces and have two open invitations.', searchLabel: 'Search workspaces', searchPlaceholder: 'Search workspaces', create: 'Create a workspace', createDescription: 'Start fresh and invite your team later', open: (name) => `Open ${name}`, footer: 'Your last workspace opens automatically next time.', emptyWorkspaces: 'No workspaces match this search.'},
        account: {initials: 'DW', name: 'Dana Whitfield', email: 'dana.whitfield@northwind.com'},
        workspaces: [{id: 'operations', initials: 'NO', name: 'Northwind Operations', summary: '412 members · Admin'}, {id: 'design', initials: 'ND', name: 'Northwind Design', summary: '38 members · Editor'}, {id: 'freight', initials: 'AF', name: 'Ardent Freight', summary: '1,284 members · Contractor'}, {id: 'kestrel', initials: 'KD', name: 'Kestrel Data Platform', summary: '96 members · Viewer'}, {id: 'aurelia', initials: 'AP', name: 'Aurelia Product Studio', summary: '24 members', invitation: 'Invitation'}, {id: 'harbour', initials: 'HL', name: 'Harbour Logistics Consortium', summary: '3,410 members', invitation: 'Invitation'}], initialWorkspaceId: 'operations', listStrategy: {kind: 'pane-scroll', expectedMaximum: 6},
    },
    invitation: {
        labels: {brand: 'Northwind', invitationNotice: (name, role) => `${name} invited you as an ${role}`, title: 'Join Northwind Operations', description: (email, expiry) => `Set a name and password for ${email}. The invitation expires on ${expiry}.`, google: 'Continue with Google', divider: 'or set a password', fullNameLabel: 'Full name', fullNamePlaceholder: 'Dana Whitfield', passwordLabel: 'Password', passwordPlaceholder: 'At least 10 characters', accept: 'Accept invitation', decline: 'Not expecting this? Decline the invitation', whatJoining: 'What you are joining', memberCount: (count) => `${count} members`, projectsShared: 'Projects shared with you', roleNote: 'Editors can create and change work but cannot manage billing or remove members.', showPassword: 'Show password', hidePassword: 'Hide password', emptyProjects: 'No shared projects are available.'},
        inviter: {initials: 'MB', name: 'Marcus Bell', role: 'editor'}, inviteeEmail: 'dana.whitfield@northwind.com', expiry: '14 August', organization: {initials: 'NO', name: 'Northwind Operations', domain: 'northwind.com'}, members: [{id: 'marcus', initials: 'MB'}, {id: 'priya', initials: 'PN'}, {id: 'sam', initials: 'SA'}, {id: 'wei', initials: 'WC'}, {id: 'taylor', initials: 'TG'}, {id: 'more', initials: '+407'}], memberCount: '412', projects: [{id: 'q3', name: 'Q3 network rollout', summary: '18 open tasks'}, {id: 'carrier', name: 'Carrier scorecards', summary: '6 open tasks'}, {id: 'depot', name: 'Depot capacity model', summary: '2 open tasks'}], listStrategy: {kind: 'content-grown', expectedMaximum: 8},
    },
    passwordReset: {
        labels: {title: 'Set a new password', description: (email) => `For ${email}. The reset link stays valid for 30 minutes.`, newPassword: 'New password', newPasswordPlaceholder: 'Choose a password', requirements: ['10 characters or more', 'Upper and lower case', 'A number', 'A symbol'], confirmPassword: 'Confirm password', confirmPlaceholder: 'Repeat the password', confirmHelper: 'Type it a second time so a typo cannot lock you out.', signOutOther: 'Sign out of my other devices', update: 'Update password', showPassword: 'Show password', hidePassword: 'Hide password', thisDevice: 'This device', ends: 'Ends', emptyDevices: 'No other signed-in devices are available.'},
        email: 'dana.whitfield@northwind.com', devices: [{id: 'mac', name: 'MacBook Pro · Chrome', detail: 'Lisbon · active now', state: 'active', current: true, icon: 'laptop'}, {id: 'iphone', name: 'iPhone 15 · Safari', detail: 'Lisbon · 2 hours ago', state: 'ends', icon: 'phone'}, {id: 'windows', name: 'Windows 11 · Edge', detail: 'Porto · 6 days ago', state: 'ends', icon: 'laptop'}], initialPassword: '', listStrategy: {kind: 'content-grown', expectedMaximum: 6},
    },
    approval: {
        labels: {title: 'Approve this sign-in', description: (email) => `A device we have not seen before is trying to open Northwind as ${email}.`, device: 'Device', location: 'Location', ipAddress: 'IP address', requested: 'Requested', expiry: 'The request expires in 4 minutes.', approve: 'Yes, that was me', deny: 'No, secure my account', recent: 'Recent sign-ins', emptyRecentSignIns: 'No recent sign-ins are available.'},
        email: 'dana.whitfield@northwind.com', request: {device: 'Windows 11 · Edge 126', location: 'Rotterdam, Netherlands', ipAddress: '84.29.117.4', requested: 'Just now · 14:06 CET', expiry: 'The request expires in 4 minutes.'}, recent: [{id: 'mac', device: 'MacBook Pro · Chrome', location: 'Lisbon', time: '2 hours ago'}, {id: 'iphone', device: 'iPhone 15 · Safari', location: 'Lisbon', time: 'Yesterday'}, {id: 'unknown', device: 'Unknown · Firefox', location: 'Sofia', time: '3 days ago'}], listStrategy: {kind: 'pane-scroll', expectedMaximum: 8},
    },
}

export function createHbarAppUiAuthenticationSignInFixture(mode: string | null): HbarAppUiAuthContent {
    const base = HBAR_APP_UI_AUTHENTICATION_FIXTURES
    const signIn = base.signIn!
    switch (mode) {
        case 'sign-in-failure': return {...base, signIn: {...signIn, onSignIn: async () => { throw new Error('Preview-only sign-in failure') }}}
        case 'sign-in-retry': {
            let attempts = 0
            return {...base, signIn: {...signIn, onSignIn: async (credentials, signal) => {
                attempts += 1
                if (attempts === 1) throw new Error('Preview-only first sign-in failure')
                return signIn.onSignIn?.(credentials, signal) ?? 'unchanged'
            }}}
        }
        case 'sign-in-unavailable': return {...base, signIn: {...signIn, onSignIn: undefined}}
        case 'sign-in-empty': return {...base, signIn: {...signIn, providers: []}}
        case 'sign-in-one': return {...base, signIn: {...signIn, providers: signIn.providers.slice(0, 1)}}
        case 'sign-in-duplicate': return {...base, signIn: {...signIn, providers: [...signIn.providers, signIn.providers[0]!]}}
        case 'sign-in-overbound': return {...base, signIn: {...signIn, providers: [...signIn.providers, {id: 'microsoft', label: 'Microsoft', icon: 'mail'}, {id: 'passkey', label: 'Passkey', icon: 'key'}]}}
        case null:
        default: return base
    }
}

export function createHbarAppUiAuthenticationOverflowFixtures(): HbarAppUiAuthContent {
    const base = HBAR_APP_UI_AUTHENTICATION_FIXTURES
    return {
        ...base,
        passkey: base.passkey && {...base.passkey, passkeys: [...base.passkey.passkeys, ...Array.from({length: 10}, (_, index) => ({id: `overflow-passkey-${index}`, name: `Overflow passkey ${index + 1}`, detail: 'Host-provided device', icon: 'laptop' as const}))]},
        account: base.account && {...base.account, accounts: [...base.account.accounts, ...Array.from({length: 12}, (_, index) => ({id: `overflow-account-${index}`, initials: 'OV', name: `Overflow account ${index + 1}`, email: `overflow-${index + 1}@example.test`, status: 'Signed in recently', statusTone: 'neutral' as const}))]},
        workspace: base.workspace && {...base.workspace, workspaces: [...base.workspace.workspaces, ...Array.from({length: 12}, (_, index) => ({id: `overflow-workspace-${index}`, initials: 'OV', name: `Overflow workspace ${index + 1}`, summary: '1 member · Viewer'}))]},
        invitation: base.invitation && {...base.invitation, projects: [...base.invitation.projects, ...Array.from({length: 12}, (_, index) => ({id: `overflow-project-${index}`, name: `Overflow project ${index + 1}`, summary: '1 open task'}))]},
        passwordReset: base.passwordReset && {...base.passwordReset, devices: [...base.passwordReset.devices, ...Array.from({length: 10}, (_, index) => ({id: `overflow-device-${index}`, name: `Overflow device ${index + 1}`, detail: 'Remote · recently active', state: 'ends', icon: 'laptop' as const}))]},
        approval: base.approval && {...base.approval, recent: [...base.approval.recent, ...Array.from({length: 12}, (_, index) => ({id: `overflow-recent-${index}`, device: `Overflow device ${index + 1}`, location: 'Remote location', time: 'Recently'}))]},
    }
}

export function createHbarAppUiAuthenticationLocalizedFixtures(): HbarAppUiAuthContent {
    const base = HBAR_APP_UI_AUTHENTICATION_FIXTURES
    return {
        ...base,
        signIn: base.signIn && {...base.signIn, labels: {...base.signIn.labels, title: 'Anmelden', description: 'Sehr lange lokalisierte Beschreibung für den gemeinsamen Arbeitsbereich.', signIn: 'Anmelden'}},
        providerFirst: base.providerFirst && {...base.providerFirst, labels: {...base.providerFirst.labels, title: 'Willkommen zurück', ssoLabel: 'Lange Unternehmensdomäne', ssoSuffix: '.sehr-lange-arbeitsbereich-adresse.beispiel.test', ssoHelper: 'Die Verwaltung hat diese Domäne für den Arbeitsbereich festgelegt.', useEmailInstead: 'Stattdessen E-Mail verwenden', continueLabel: 'Fortfahren'}},
        quote: base.quote && {...base.quote, labels: {...base.quote.labels, title: 'Anmelden', description: 'Lokalisierter Text mit absichtlich langem Umbruch für schmale Geräte.'}},
        twoStep: base.twoStep && {...base.twoStep, labels: {...base.twoStep.labels, title: 'Beim Northwind-Arbeitsbereich anmelden', description: 'Bitte beginnen Sie mit der geschäftlichen E-Mail-Adresse, die bei der Einrichtung dieses Arbeitsbereichs verwendet wurde.', step: (current, total) => `Schritt ${current} von ${total}`}, account: {...base.twoStep.account, name: 'Dana Whitfield mit einem besonders langen Anzeigenamen', organization: 'Northwind Operations und internationale Arbeitsbereiche'}},
        magicLink: base.magicLink && {...base.magicLink, email: 'dana.whitfield+international@northwind.com', labels: {...base.magicLink.labels, title: 'Prüfen Sie Ihren Posteingang', descriptionBeforeEmail: 'Ein Anmeldelink ist unterwegs an ', descriptionAfterEmail: ' Er ist nur einmal gültig und läuft in 15 Minuten ab.', formTitle: 'Mit einem Link anmelden', formDescription: 'Kein Passwort nötig. Wir senden einen einmaligen Link an Ihre geschäftliche E-Mail-Adresse.', formEmailLabel: 'Geschäftliche E-Mail-Adresse', formSubmit: 'Anmeldelink senden'}},
        code: base.code && {...base.code, labels: {...base.code.labels, title: 'Bestätigen Sie Ihre Identität', description: 'Wir haben einen sechsstelligen Bestätigungscode an die Telefonnummer mit der Endung 4417 gesendet.'}, referenceFlow: base.code.referenceFlow && {...base.code.referenceFlow, labels: {...base.code.referenceFlow.labels, recoveryTitle: 'Einen Wiederherstellungscode eingeben', recoveryDescription: 'Verwenden Sie einen der acht gespeicherten Wiederherstellungscodes für die Zwei-Faktor-Anmeldung.', verifiedTitle: 'Gerät erfolgreich bestätigt', verifiedDescription: 'Dieser Browser bleibt dreißig Tage lang als vertrauenswürdig gespeichert.'}}},
        workspace: base.workspace && {...base.workspace, labels: {...base.workspace.labels, title: 'Arbeitsbereich auswählen', open: (name) => `${name} öffnen`}},
        invitation: base.invitation && {...base.invitation, labels: {...base.invitation.labels, title: 'Northwind Operations beitreten', accept: 'Einladung annehmen'}},
        passwordReset: base.passwordReset && {...base.passwordReset, labels: {...base.passwordReset.labels, title: 'Neues Passwort festlegen'}},
        signUp: base.signUp && {...base.signUp, labels: {...base.signUp.labels, title: 'Konto erstellen', description: 'Vierzehn Tage kostenlos. Keine Karte, keine Mindestanzahl an Sitzen.'}, referenceFlow: base.signUp.referenceFlow && {...base.signUp.referenceFlow, labels: {...base.signUp.referenceFlow.labels, strength: ['Schwach', 'Mittel', 'Gut', 'Stark']}}},
        enterprise: base.enterprise && {...base.enterprise, labels: {...base.enterprise.labels, title: 'Mit Ihrem Unternehmenskonto anmelden', description: 'Geben Sie Ihre geschäftliche E-Mail-Adresse ein, damit wir Sie zum passenden Identitätsanbieter für Ihre Organisation weiterleiten.', emailLabel: 'Geschäftliche E-Mail-Adresse'}, referenceFlow: base.enterprise.referenceFlow && {...base.enterprise.referenceFlow, labels: {...base.enterprise.referenceFlow.labels, redirecting: 'Weiterleitung läuft', continueUnmatched: 'Fortfahren', unmatchedHint: (domain) => `Für ${domain} wurde kein Anbieter eingerichtet. Sie können stattdessen ein Passwort verwenden.`, emptyHint: 'Probieren Sie northwind.com oder ardentfreight.co aus.', noMatch: 'Noch kein Treffer', lookupTitle: 'Wir prüfen Ihre Domäne', lookupDescription: 'Sobald Ihre E-Mail zu einer Organisation passt, erscheinen Anbieter und Sicherheitsregeln hier.'}}},
        passkey: base.passkey && {...base.passkey, labels: {...base.passkey.labels, title: 'Mit einem Passkey anmelden', description: 'Ihr Gerät bestätigt Ihre Identität. Sie müssen kein Passwort eingeben oder sich merken.'}, referenceFlow: base.passkey.referenceFlow && {...base.passkey.referenceFlow, labels: {...base.passkey.referenceFlow.labels, confirmOn: (name) => `Auf ${name} bestätigen`, waiting: 'Wir warten auf Ihr Gerät. Diese Anfrage läuft in zwei Minuten ab.', cancel: 'Anfrage abbrechen'}}},
    }
}
