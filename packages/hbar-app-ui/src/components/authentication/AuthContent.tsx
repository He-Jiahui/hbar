import { createContext, type ReactNode, useContext } from 'react'

/**
 * Authentication previews use deliberately bounded collections. A host with
 * an unbounded account or workspace feed must page or virtualize it before it
 * reaches this surface; rendering an unknown history in an auth panel would
 * make selection and recovery controls inaccessible.
 */
export type HbarAppUiAuthListStrategy =
  | { readonly kind: 'content-grown'; readonly expectedMaximum: number }
  | { readonly kind: 'pane-scroll'; readonly expectedMaximum: number }

export interface HbarAppUiAuthChoice {
  readonly id: string
  readonly label: string
}

export interface HbarAppUiAuthProviderChoice extends HbarAppUiAuthChoice {
  readonly icon?: 'google' | 'apple' | 'github' | 'mail' | 'key' | undefined
}

export interface HbarAppUiAuthSignInContent {
  readonly labels: {
    readonly brand: string
    readonly title: string
    readonly description: string
    readonly emailLabel: string
    readonly emailPlaceholder: string
    readonly passwordLabel: string
    readonly passwordPlaceholder: string
    readonly forgotPassword: string
    readonly rememberLabel: string
    readonly signIn: string
    readonly divider: string
    readonly noAccount: string
    readonly createAccount: string
    readonly privacy: string
    readonly terms: string
    readonly status: string
    readonly showPassword: string
    readonly hidePassword: string
  }
  readonly providers: readonly HbarAppUiAuthProviderChoice[]
  /** Sign-in providers are a short, content-grown group in this surface. */
  readonly providerListStrategy: HbarAppUiAuthListStrategy
  readonly initialEmail: string
  readonly initialRemember: boolean
}

export interface HbarAppUiAuthProviderFirstContent {
  readonly labels: {
    readonly brand: string
    readonly createAccount: string
    readonly title: string
    readonly description: string
    readonly divider: string
    readonly emailLabel: string
    readonly emailPlaceholder: string
    readonly ssoLabel: string
    readonly ssoPlaceholder: string
    readonly singleSignOn: string
    readonly helper: string
    readonly continueLabel: string
    readonly termsPrefix: string
    readonly terms: string
    readonly privacyPrefix: string
    readonly privacy: string
    readonly trouble: string
    readonly systemNormal: string
  }
  /** Providers shown in the social/provider button group. */
  readonly socialProviders: readonly HbarAppUiAuthProviderChoice[]
  /** Social providers remain a short, content-grown action group. */
  readonly providerListStrategy: HbarAppUiAuthListStrategy
  /** Stable technical IDs used for the email and enterprise branches. */
  readonly emailProviderId: string
  readonly ssoProviderId: string
  readonly initialProviderId: string
}

export interface HbarAppUiAuthQuote {
  readonly id: string
  readonly text: string
  readonly initials: string
  readonly name: string
  readonly role: string
  readonly metrics: readonly { readonly label: string; readonly value: string }[]
}

export interface HbarAppUiAuthQuoteContent {
  readonly labels: {
    readonly brand: string
    readonly title: string
    readonly description: string
    readonly emailLabel: string
    readonly emailPlaceholder: string
    readonly passwordLabel: string
    readonly passwordPlaceholder: string
    readonly forgotPassword: string
    readonly signIn: string
    readonly divider: string
    readonly newAccount: string
    readonly createAccount: string
    readonly quoteEyebrow: string
    readonly previousQuote: string
    readonly nextQuote: string
    readonly showQuote: (name: string) => string
    readonly showPassword: string
    readonly hidePassword: string
  }
  readonly providers: readonly HbarAppUiAuthProviderChoice[]
  readonly providerListStrategy: HbarAppUiAuthListStrategy
  readonly quotes: readonly HbarAppUiAuthQuote[]
  readonly quoteListStrategy: HbarAppUiAuthListStrategy
  readonly initialEmail: string
  readonly initialQuoteId: string
}

export interface HbarAppUiAuthTwoStepContent {
  readonly labels: {
    readonly brand: string
    readonly step: (current: number, total: number) => string
    readonly title: string
    readonly description: string
    readonly emailLabel: string
    readonly emailPlaceholder: string
    readonly continueLabel: string
    readonly magicLink: string
    readonly needAccount: string
    readonly createAccount: string
    readonly matchedAccount: string
    readonly passwordLabel: string
    readonly passwordPlaceholder: string
    readonly signIn: string
    readonly useAnother: string
    readonly showPassword: string
    readonly hidePassword: string
  }
  readonly initialEmail: string
}

export interface HbarAppUiAuthMagicLinkContent {
  readonly labels: {
    readonly title: string
    readonly description: (email: string) => string
    readonly sentTo: string
    readonly expires: string
    readonly requestedFrom: string
    readonly openMail: string
    readonly resend: (seconds: number) => string
    readonly noEmail: string
    readonly differentEmail: string
    readonly rateLimit: string
  }
  readonly email: string
  readonly expiry: string
  readonly requestedFromValue: string
  readonly resendAfterSeconds: number
}

export interface HbarAppUiAuthCodeContent {
  readonly labels: {
    readonly title: string
    readonly description: string
    readonly codeLabel: string
    readonly codeDigit: (index: number) => string
    readonly helper: string
    readonly verify: string
    readonly resend: (seconds: number) => string
    readonly recovery: string
    readonly back: string
  }
  readonly code: string
  readonly codeLength: number
  readonly busy: boolean
  readonly canVerify: boolean
  readonly error: string | undefined
  readonly onCodeChange: (code: string) => void
  readonly onVerify: () => void
  readonly resend: { readonly seconds: number; readonly enabled: boolean; readonly onResend: () => void } | undefined
  readonly onRecovery: (() => void) | undefined
  readonly onBack: (() => void) | undefined
}

export interface HbarAppUiAuthSignUpContent {
  readonly labels: {
    readonly brand: string
    readonly title: string
    readonly description: string
    readonly nameLabel: string
    readonly namePlaceholder: string
    readonly emailLabel: string
    readonly emailPlaceholder: string
    readonly emailHelper: string
    readonly passwordLabel: string
    readonly passwordPlaceholder: string
    readonly requirements: readonly string[]
    readonly agreementPrefix: string
    readonly terms: string
    readonly agreementJoin: string
    readonly privacy: string
    readonly createAccount: string
    readonly existingAccount: string
    readonly signIn: string
    readonly showPassword: string
    readonly hidePassword: string
  }
  readonly initialName: string
  readonly initialEmail: string
}

export interface HbarAppUiAuthEnterpriseContent {
  readonly labels: {
    readonly brand: string
    readonly title: string
    readonly description: string
    readonly emailLabel: string
    readonly emailPlaceholder: string
    readonly providerHint: string
    readonly continueProvider: (provider: string) => string
    readonly passwordInstead: string
    readonly auditNote: string
    readonly matchedOrganization: string
    readonly directory: string
    readonly provider: string
    readonly sessionLength: string
    readonly members: (count: string) => string
    readonly securityChecks: readonly string[]
    readonly lockedOut: string
  }
  readonly organization: {
    readonly name: string
    readonly domain: string
    readonly provider: string
    readonly memberCount: string
    readonly sessionLength: string
  }
  readonly email: string
}

export interface HbarAppUiAuthPasskey {
  readonly id: string
  readonly name: string
  readonly detail: string
  readonly icon: 'laptop' | 'phone' | 'key'
}

export interface HbarAppUiAuthPasskeyContent {
  readonly labels: {
    readonly title: string
    readonly description: string
    readonly choose: string
    readonly continueWith: (name: string) => string
    readonly otherWays: string
    readonly password: string
    readonly emailLink: string
    readonly footer: string
    readonly emptyPasskeys: string
  }
  readonly passkeys: readonly HbarAppUiAuthPasskey[]
  readonly initialPasskeyId: string
  readonly listStrategy: HbarAppUiAuthListStrategy
}

export interface HbarAppUiAuthAccount {
  readonly id: string
  readonly initials: string
  readonly name: string
  readonly email: string
  readonly status: string
  readonly statusTone: 'neutral' | 'warning'
}

export interface HbarAppUiAuthAccountContent {
  readonly labels: {
    readonly brand: string
    readonly title: string
    readonly description: string
    readonly useAnother: string
    readonly useAnotherDescription: string
    readonly continueWith: (workspace: string) => string
    readonly signingInAs: (email: string) => string
    readonly finished: string
    readonly signOutAll: string
    readonly emptyAccounts: string
  }
  readonly accounts: readonly HbarAppUiAuthAccount[]
  readonly workspaceName: string
  readonly initialAccountId: string
  readonly listStrategy: HbarAppUiAuthListStrategy
}

export interface HbarAppUiAuthWorkspace {
  readonly id: string
  readonly initials: string
  readonly name: string
  readonly summary: string
  readonly invitation?: string | undefined
}

export interface HbarAppUiAuthWorkspaceContent {
  readonly labels: {
    readonly signedInAs: string
    readonly signOut: string
    readonly title: string
    readonly description: string
    readonly searchLabel: string
    readonly searchPlaceholder: string
    readonly create: string
    readonly createDescription: string
    readonly open: (name: string) => string
    readonly footer: string
    readonly emptyWorkspaces: string
  }
  readonly account: { readonly initials: string; readonly name: string; readonly email: string }
  readonly workspaces: readonly HbarAppUiAuthWorkspace[]
  readonly initialWorkspaceId: string
  readonly listStrategy: HbarAppUiAuthListStrategy
}

export interface HbarAppUiAuthProject {
  readonly id: string
  readonly name: string
  readonly summary: string
}

export interface HbarAppUiAuthMember {
  readonly id: string
  readonly initials: string
}

export interface HbarAppUiAuthInvitationContent {
  readonly labels: {
    readonly brand: string
    readonly invitationNotice: (name: string, role: string) => string
    readonly title: string
    readonly description: (email: string, expiry: string) => string
    readonly google: string
    readonly divider: string
    readonly fullNameLabel: string
    readonly fullNamePlaceholder: string
    readonly passwordLabel: string
    readonly passwordPlaceholder: string
    readonly accept: string
    readonly decline: string
    readonly whatJoining: string
    readonly memberCount: (count: string) => string
    readonly projectsShared: string
    readonly roleNote: string
    readonly showPassword: string
    readonly hidePassword: string
    readonly emptyProjects: string
  }
  readonly inviter: { readonly initials: string; readonly name: string; readonly role: string }
  readonly inviteeEmail: string
  readonly expiry: string
  readonly organization: { readonly initials: string; readonly name: string; readonly domain: string }
  readonly members: readonly HbarAppUiAuthMember[]
  readonly memberCount: string
  readonly projects: readonly HbarAppUiAuthProject[]
  readonly listStrategy: HbarAppUiAuthListStrategy
}

export interface HbarAppUiAuthDevice {
  readonly id: string
  readonly name: string
  readonly detail: string
  readonly state: string
  readonly current?: boolean | undefined
  readonly icon: 'laptop' | 'phone'
}

export interface HbarAppUiAuthPasswordResetContent {
  readonly labels: {
    readonly title: string
    readonly description: (email: string) => string
    readonly newPassword: string
    readonly newPasswordPlaceholder: string
    readonly requirements: readonly string[]
    readonly confirmPassword: string
    readonly confirmPlaceholder: string
    readonly confirmHelper: string
    readonly signOutOther: string
    readonly update: string
    readonly showPassword: string
    readonly hidePassword: string
    readonly thisDevice: string
    readonly ends: string
    readonly emptyDevices: string
  }
  readonly email: string
  readonly devices: readonly HbarAppUiAuthDevice[]
  readonly initialPassword: string
  readonly listStrategy: HbarAppUiAuthListStrategy
}

export interface HbarAppUiAuthRecentSignIn {
  readonly id: string
  readonly device: string
  readonly location: string
  readonly time: string
}

export interface HbarAppUiAuthApprovalContent {
  readonly labels: {
    readonly title: string
    readonly description: (email: string) => string
    readonly device: string
    readonly location: string
    readonly ipAddress: string
    readonly requested: string
    readonly expiry: string
    readonly approve: string
    readonly deny: string
    readonly recent: string
    readonly emptyRecentSignIns: string
  }
  readonly email: string
  readonly request: {
    readonly device: string
    readonly location: string
    readonly ipAddress: string
    readonly requested: string
    readonly expiry: string
  }
  readonly recent: readonly HbarAppUiAuthRecentSignIn[]
  readonly listStrategy: HbarAppUiAuthListStrategy
}

export interface HbarAppUiAuthContent {
  readonly signIn?: HbarAppUiAuthSignInContent | undefined
  readonly providerFirst?: HbarAppUiAuthProviderFirstContent | undefined
  readonly quote?: HbarAppUiAuthQuoteContent | undefined
  readonly twoStep?: HbarAppUiAuthTwoStepContent | undefined
  readonly magicLink?: HbarAppUiAuthMagicLinkContent | undefined
  readonly code?: HbarAppUiAuthCodeContent | undefined
  readonly signUp?: HbarAppUiAuthSignUpContent | undefined
  readonly enterprise?: HbarAppUiAuthEnterpriseContent | undefined
  readonly passkey?: HbarAppUiAuthPasskeyContent | undefined
  readonly account?: HbarAppUiAuthAccountContent | undefined
  readonly workspace?: HbarAppUiAuthWorkspaceContent | undefined
  readonly invitation?: HbarAppUiAuthInvitationContent | undefined
  readonly passwordReset?: HbarAppUiAuthPasswordResetContent | undefined
  readonly approval?: HbarAppUiAuthApprovalContent | undefined
}

export interface HbarAppUiAuthProviderProps {
  readonly content: HbarAppUiAuthContent
  readonly children: ReactNode
}

export function uniqueHbarAppUiAuthItems<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

export function selectHbarAppUiAuthItem<
  T extends {
    readonly id: string
  },
>(items: readonly T[], requestedId: string | undefined): T | undefined {
  return items.find((item) => item.id === requestedId) ?? items[0]
}

const authContentContext = createContext<HbarAppUiAuthContent | undefined>(undefined)

export function HbarAppUiAuthenticationProvider({ content, children }: HbarAppUiAuthProviderProps) {
  return <authContentContext.Provider value={content}>{children}</authContentContext.Provider>
}

export function useHbarAppUiAuthenticationContent(): HbarAppUiAuthContent | undefined {
  return useContext(authContentContext)
}
