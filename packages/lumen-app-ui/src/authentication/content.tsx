'use client'

import * as React from 'react'

/**
 * Authentication previews use deliberately bounded collections. A host with
 * an unbounded account or workspace feed must page or virtualize it before it
 * reaches this surface; rendering an unknown history in an auth panel would
 * make selection and recovery controls inaccessible.
 */
export type LumenAuthListStrategy =
  | { readonly kind: 'content-grown'; readonly expectedMaximum: number }
  | { readonly kind: 'pane-scroll'; readonly expectedMaximum: number }

export interface LumenAuthChoice {
  readonly id: string
  readonly label: string
}

export interface LumenAuthProviderChoice extends LumenAuthChoice {
  readonly icon?: 'google' | 'apple' | 'github' | 'mail' | 'key' | undefined
}

export interface LumenAuthSignInContent {
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
    readonly invalidEmail: string
    readonly invalidPassword: string
    readonly signingIn: string
    readonly signedIn: string
    readonly signInFailed: string
    readonly signInUnavailable: string
  }
  readonly providers: readonly LumenAuthProviderChoice[]
  /** Sign-in providers are a short, content-grown group in this surface. */
  readonly providerListStrategy: LumenAuthListStrategy
  readonly initialEmail: string
  readonly initialRemember: boolean
  /** The host owns credential transport and confirms any successful sign-in. */
  readonly onSignIn?:
    | ((
        credentials: Readonly<{ email: string; password: string; remember: boolean }>,
        signal: AbortSignal,
      ) => Promise<'confirmed' | 'unchanged'>)
    | undefined
}

export interface LumenAuthProviderFirstContent {
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
    readonly ssoSuffix: string
    readonly ssoHelper: string
    readonly singleSignOn: string
    readonly useEmailInstead: string
    readonly helper: string
    readonly continueLabel: string
    readonly termsPrefix: string
    readonly inlineSeparator: string
    readonly terms: string
    readonly privacyPrefix: string
    readonly privacy: string
    readonly termsSuffix: string
    readonly trouble: string
    readonly systemNormal: string
  }
  /** Providers shown in the social/provider button group. */
  readonly socialProviders: readonly LumenAuthProviderChoice[]
  /** The provider group can grow with short content or scroll inside a bounded pane. */
  readonly providerListStrategy: LumenAuthListStrategy
  /** Accessible name for the provider group when its strategy owns a scroll region. */
  readonly providerListLabel?: string | undefined
  /** Stable technical IDs used for the email and enterprise branches. */
  readonly emailProviderId: string
  readonly ssoProviderId: string
  readonly initialProviderId: string
  /** Optional Host-owned projection for controlled reference implementations. */
  readonly referenceFlow?: LumenAuthProviderFirstReferenceFlow | undefined
}

export type LumenAuthProviderFirstMode = 'email' | 'sso'

export interface LumenAuthProviderFirstContinuationRequest {
  readonly mode: LumenAuthProviderFirstMode
  readonly providerId: string
  readonly draft: string
}

export interface LumenAuthProviderFirstReferenceFlow {
  readonly mode: LumenAuthProviderFirstMode
  readonly email: string
  readonly domain: string
  readonly onEmailChange: (value: string) => void
  readonly onDomainChange: (value: string) => void
  readonly onModeChange: (mode: LumenAuthProviderFirstMode) => void
  readonly onContinueRequest: (request: LumenAuthProviderFirstContinuationRequest) => void
  readonly onProviderRequest: (providerId: string) => void
  readonly onNavigationRequest: (action: 'create-account' | 'terms' | 'privacy') => void
}

export interface LumenAuthQuote {
  readonly id: string
  readonly text: string
  readonly initials: string
  readonly name: string
  readonly role: string
  readonly metrics: readonly { readonly label: string; readonly value: string }[]
}

export type LumenAuthQuoteNavigationAction = 'forgot-password' | 'create-account'

export interface LumenAuthQuoteSignInRequest {
  readonly email: string
  readonly quoteId: string | null
}

export interface LumenAuthQuoteReferenceFlow {
  readonly email: string
  readonly password: string
  readonly passwordVisible: boolean
  readonly quoteId: string | null
  readonly onEmailChange: (value: string) => void
  readonly onPasswordChange: (value: string) => void
  readonly onPasswordVisibleChange: (visible: boolean) => void
  readonly onQuoteChange: (quoteId: string) => void
  readonly onSignInRequest: (request: LumenAuthQuoteSignInRequest) => void
  readonly onProviderRequest: (providerId: string) => void
  readonly onNavigationRequest: (action: LumenAuthQuoteNavigationAction) => void
}

export interface LumenAuthQuoteContent {
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
    readonly inlineSeparator: string
    readonly createAccount: string
    readonly quoteEyebrow: string
    readonly emptyQuotes: string
    readonly previousQuote: string
    readonly nextQuote: string
    readonly showQuote: (name: string) => string
    readonly showPassword: string
    readonly hidePassword: string
  }
  readonly providers: readonly LumenAuthProviderChoice[]
  readonly providerListStrategy: LumenAuthListStrategy
  readonly quotes: readonly LumenAuthQuote[]
  readonly quoteListStrategy: LumenAuthListStrategy
  readonly initialEmail: string
  readonly initialQuoteId: string
  /** Host-owned interval for the reference's automatic quote rotation; 0 disables it. */
  readonly autoAdvanceMs: number
  readonly referenceFlow?: LumenAuthQuoteReferenceFlow | undefined
}

export interface LumenAuthTwoStepContent {
  readonly labels: {
    readonly brand: string
    readonly step: (current: number, total: number) => string
    readonly title: string
    readonly description: string
    readonly emailLabel: string
    readonly emailPlaceholder: string
    readonly continueLabel: string
    readonly continuing: string
    readonly magicLink: string
    readonly needAccount: string
    readonly createAccount: string
    readonly matchedAccount: string
    readonly back: string
    readonly forgotPassword: string
    readonly invalidEmail: string
    readonly securityNote: string
    readonly passwordLabel: string
    readonly passwordPlaceholder: string
    readonly signIn: string
    readonly signingIn: string
    readonly useAnother: string
    readonly showPassword: string
    readonly hidePassword: string
  }
  readonly initialEmail: string
  readonly account: {
    readonly initials: string
    readonly name: string
    readonly organization: string
  }
  /** Optional Host-owned projection for the controlled two-step reference flow. */
  readonly referenceFlow?: LumenAuthTwoStepReferenceFlow | undefined
}

export type LumenAuthTwoStepPhase = 'email' | 'email-pending' | 'password' | 'sign-in-pending'

export type LumenAuthTwoStepNavigationIntent = 'magic-link' | 'forgot-password' | 'create-account'

export interface LumenAuthTwoStepReferenceFlow {
  readonly phase: LumenAuthTwoStepPhase
  readonly email: string
  readonly password: string
  readonly passwordVisible: boolean
  readonly invalidEmail: boolean
  readonly onEmailChange: (value: string) => void
  readonly onPasswordChange: (value: string) => void
  readonly onPasswordVisibleChange: (visible: boolean) => void
  readonly onContinueRequest: () => void
  readonly onSignInRequest: () => void
  readonly onBack: () => void
  readonly onNavigationRequest: (intent: LumenAuthTwoStepNavigationIntent) => void
}

export interface LumenAuthMagicLinkContent {
  readonly labels: {
    readonly title: string
    readonly description: (email: string) => string
    readonly descriptionBeforeEmail: string
    readonly descriptionEmailSuffix: string
    readonly descriptionAfterEmail: string
    readonly sentTo: string
    readonly expires: string
    readonly requestedFrom: string
    readonly openMail: string
    readonly resend: (seconds: number) => string
    readonly resendReady: string
    readonly noEmail: string
    readonly differentEmail: string
    readonly rateLimit: string
    readonly formBrand: string
    readonly formTitle: string
    readonly formDescription: string
    readonly formEmailLabel: string
    readonly formEmailPlaceholder: string
    readonly formEmailHelper: string
    readonly formInvalidEmail: string
    readonly formSubmit: string
    readonly formPasswordPrompt: string
    readonly formPasswordSignIn: string
  }
  readonly email: string
  readonly expiry: string
  readonly requestedFromValue: string
  readonly resendAfterSeconds: number
  /** Optional Host-owned state and actions for the controlled reference flow. */
  readonly referenceFlow?: LumenAuthMagicLinkReferenceFlow | undefined
}

export interface LumenAuthMagicLinkReferenceFlow {
  readonly phase: 'sent' | 'form'
  readonly email: string
  readonly invalidEmail: boolean
  readonly seconds: number
  readonly onEmailChange: (value: string) => void
  readonly onSend: () => void
  readonly onResend: () => void
  readonly onDifferentEmail: () => void
  readonly onNavigate: (intent: 'open-mail' | 'password-sign-in') => void
}

export interface LumenAuthCodeContent {
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
  /** Optional richer host-owned flow; absence keeps the existing controlled code-entry contract. */
  readonly referenceFlow?:
    | {
        readonly labels: {
          readonly recoveryTitle: string
          readonly recoveryDescription: string
          readonly recoveryLabel: string
          readonly recoveryPlaceholder: string
          readonly recoveryHelper: string
          readonly useTextedCode: string
          readonly checkingCode: string
          readonly verifying: string
          readonly verifiedTitle: string
          readonly verifiedDescription: string
          readonly methodLabel: string
          readonly trustedUntilLabel: string
          readonly continueLabel: string
          readonly verifyAnother: string
          readonly resendReady: string
          readonly digitSeparator: string
        }
        readonly phase: 'text' | 'recovery' | 'verified'
        readonly recoveryCode: string
        readonly canVerifyRecovery: boolean
        readonly success: { readonly method: string; readonly trustedUntil: string }
        readonly onRecoveryCodeChange: (value: string) => void
        readonly onModeChange: (mode: 'text' | 'recovery') => void
        readonly onContinue: () => void
      }
    | undefined
}

export interface LumenAuthSignUpContent {
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
  /** The host owns draft, password feedback and disclosure in the reference form. */
  readonly referenceFlow?:
    | {
        readonly labels: {
          readonly strength: readonly [string, string, string, string]
          readonly agreementEnd: string
        }
        readonly name: string
        readonly email: string
        readonly password: string
        readonly visible: boolean
        readonly agreed: boolean
        readonly requirementsMet: readonly boolean[]
        readonly canSubmit: boolean
        readonly onNameChange: (value: string) => void
        readonly onEmailChange: (value: string) => void
        readonly onPasswordChange: (value: string) => void
        readonly onVisibleChange: (value: boolean) => void
        readonly onAgreedChange: (value: boolean) => void
      }
    | undefined
}

export interface LumenAuthEnterpriseContent {
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
  readonly referenceFlow?:
    | {
        readonly labels: {
          readonly redirecting: string
          readonly continueUnmatched: string
          readonly unmatchedHint: (domain: string) => string
          readonly emptyHint: string
          readonly noMatch: string
          readonly lookupTitle: string
          readonly lookupDescription: string
        }
        readonly alternateOrganizations: readonly {
          readonly organization: LumenAuthEnterpriseContent['organization']
          readonly providerHint: string
          readonly securityChecks: readonly string[]
          readonly lockedOut: string
        }[]
        readonly email: string
        readonly busy: boolean
        readonly onEmailChange: (value: string) => void
        readonly onContinue: () => void
      }
    | undefined
}

export interface LumenAuthPasskey {
  readonly id: string
  readonly name: string
  readonly detail: string
  readonly icon: 'laptop' | 'phone' | 'key'
}

export interface LumenAuthPasskeyContent {
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
  readonly passkeys: readonly LumenAuthPasskey[]
  readonly initialPasskeyId: string
  readonly listStrategy: LumenAuthListStrategy
  readonly referenceFlow?:
    | {
        readonly labels: {
          readonly confirmOn: (name: string) => string
          readonly waiting: string
          readonly cancel: string
        }
        readonly selectedId: string
        readonly phase: 'choose' | 'request'
        readonly onSelect: (id: string) => void
        readonly onContinue: (id: string) => void
        readonly onCancel: () => void
      }
    | undefined
}

export interface LumenAuthAccount {
  readonly id: string
  readonly initials: string
  readonly name: string
  readonly email: string
  readonly status: string
  readonly statusTone: 'neutral' | 'warning'
  readonly continuation?:
    | {
        readonly label: string
        readonly hint: string
        readonly kind: 'resume' | 'reauth'
      }
    | undefined
}

export interface LumenAuthAccountContent {
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
  readonly accounts: readonly LumenAuthAccount[]
  readonly workspaceName: string
  readonly initialAccountId: string
  readonly listStrategy: LumenAuthListStrategy
  readonly referenceFlow?:
    | {
        readonly selectedId: string
        readonly onSelect: (id: string) => void
      }
    | undefined
}

export interface LumenAuthWorkspace {
  readonly id: string
  readonly initials: string
  readonly name: string
  readonly summary: string
  readonly invitation?: string | undefined
  readonly invitationSummary?: string | undefined
}

export interface LumenAuthWorkspaceContent {
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
  readonly workspaces: readonly LumenAuthWorkspace[]
  readonly initialWorkspaceId: string
  readonly listStrategy: LumenAuthListStrategy
  readonly referenceFlow?:
    | {
        readonly selectedId: string
        readonly query: string
        readonly labels: {
          readonly acceptAndOpen: (name: string) => string
          readonly emptyForQuery: (query: string) => string
          readonly emptyHint: string
        }
        readonly onSelect: (id: string) => void
        readonly onQueryChange: (query: string) => void
      }
    | undefined
}

export interface LumenAuthProject {
  readonly id: string
  readonly name: string
  readonly summary: string
}

export interface LumenAuthMember {
  readonly id: string
  readonly initials: string
  readonly kind?: 'person' | 'count' | undefined
}

export interface LumenAuthInvitationContent {
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
  readonly organization: {
    readonly initials: string
    readonly name: string
    readonly domain: string
  }
  readonly members: readonly LumenAuthMember[]
  readonly memberCount: string
  readonly projects: readonly LumenAuthProject[]
  readonly listStrategy: LumenAuthListStrategy
  readonly referenceFlow?:
    | {
        readonly labels: {
          readonly invitationAfterName: (role: string) => string
          readonly descriptionBeforeEmail: string
          readonly descriptionAfterEmail: (expiry: string) => string
          readonly declinePrompt: string
          readonly declineAction: string
          readonly successTitle: string
          readonly successDescription: (workspace: string) => string
          readonly openWorkspace: (workspace: string) => string
          readonly review: string
        }
        readonly phase: 'form' | 'success'
        readonly fullName: string
        readonly password: string
        readonly passwordVisible: boolean
        readonly onFullNameChange: (name: string) => void
        readonly onPasswordChange: (password: string) => void
        readonly onTogglePassword: () => void
        readonly onSubmit: () => void
        readonly onReview: () => void
      }
    | undefined
}

export interface LumenAuthDevice {
  readonly id: string
  readonly name: string
  readonly detail: string
  readonly state: string
  readonly current?: boolean | undefined
  readonly icon: 'laptop' | 'phone'
}

export interface LumenAuthPasswordResetContent {
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
  readonly devices: readonly LumenAuthDevice[]
  readonly initialPassword: string
  readonly listStrategy: LumenAuthListStrategy
  readonly referenceFlow?:
    | {
        readonly labels: {
          readonly descriptionBeforeEmail: string
          readonly descriptionAfterEmail: string
          readonly strength: readonly [string, string, string, string]
          readonly mismatchHelper: string
          readonly stays: string
          readonly successTitle: string
          readonly successWithSignOut: (count: number, workspace: string) => string
          readonly successWithoutSignOut: (workspace: string) => string
          readonly continueWith: (workspace: string) => string
          readonly setDifferent: string
        }
        readonly workspaceName: string
        readonly password: string
        readonly confirmation: string
        readonly passwordVisible: boolean
        readonly signOutOther: boolean
        readonly phase: 'form' | 'success'
        readonly onPasswordChange: (value: string) => void
        readonly onConfirmationChange: (value: string) => void
        readonly onTogglePassword: () => void
        readonly onSignOutOtherChange: (value: boolean) => void
        readonly onSubmit: () => void
        readonly onSetDifferent: () => void
      }
    | undefined
}

export interface LumenAuthRecentSignIn {
  readonly id: string
  readonly device: string
  readonly location: string
  readonly time: string
  readonly attention?: boolean | undefined
}

export interface LumenAuthApprovalContent {
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
  readonly recent: readonly LumenAuthRecentSignIn[]
  readonly listStrategy: LumenAuthListStrategy
  readonly referenceFlow?:
    | {
        readonly phase: 'pending' | 'approved' | 'blocked'
        readonly labels: {
          readonly descriptionBeforeEmail: string
          readonly descriptionAfterEmail: string
          readonly approvedTitle: string
          readonly approvedDescription: string
          readonly blockedTitle: string
          readonly blockedDescription: string
          readonly blockedSteps: readonly [string, string]
          readonly changePassword: string
          readonly backToRequest: string
        }
        readonly onApprove: () => void
        readonly onDeny: () => void
        readonly onBack: () => void
        readonly onChangePassword: () => void
      }
    | undefined
}

export interface LumenAuthContent {
  readonly signIn?: LumenAuthSignInContent | undefined
  readonly providerFirst?: LumenAuthProviderFirstContent | undefined
  readonly quote?: LumenAuthQuoteContent | undefined
  readonly twoStep?: LumenAuthTwoStepContent | undefined
  readonly magicLink?: LumenAuthMagicLinkContent | undefined
  readonly code?: LumenAuthCodeContent | undefined
  readonly signUp?: LumenAuthSignUpContent | undefined
  readonly enterprise?: LumenAuthEnterpriseContent | undefined
  readonly passkey?: LumenAuthPasskeyContent | undefined
  readonly account?: LumenAuthAccountContent | undefined
  readonly workspace?: LumenAuthWorkspaceContent | undefined
  readonly invitation?: LumenAuthInvitationContent | undefined
  readonly passwordReset?: LumenAuthPasswordResetContent | undefined
  readonly approval?: LumenAuthApprovalContent | undefined
}

export interface LumenAuthProviderProps {
  readonly content: LumenAuthContent
  readonly children: React.ReactNode
}

export function uniqueLumenAuthItems<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function selectLumenAuthItem<
  T extends {
    readonly id: string
  },
>(items: readonly T[], requestedId: string | undefined): T | undefined {
  return items.find((item) => item.id === requestedId) ?? items[0]
}

const authContentContext = React.createContext<LumenAuthContent | undefined>(undefined)

export function LumenAuthenticationProvider({ content, children }: LumenAuthProviderProps) {
  return <authContentContext.Provider value={content}>{children}</authContentContext.Provider>
}

export function useLumenAuthenticationContent(): LumenAuthContent | undefined {
  return React.useContext(authContentContext)
}
