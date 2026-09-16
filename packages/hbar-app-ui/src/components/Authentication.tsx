import type {HbarAppUiVariantProps} from '../types'
import {AccountChooserAuthentication} from './authentication/AccountChooserAuthentication'
import {CodeAuthentication} from './authentication/CodeAuthentication'
import {EnterpriseAuthentication} from './authentication/EnterpriseAuthentication'
import {InvitationAuthentication} from './authentication/InvitationAuthentication'
import {MagicLinkAuthentication} from './authentication/MagicLinkAuthentication'
import {PasskeyAuthentication} from './authentication/PasskeyAuthentication'
import {PasswordResetAuthentication} from './authentication/PasswordResetAuthentication'
import {ProviderFirstAuthentication} from './authentication/ProviderFirstAuthentication'
import {QuoteAuthentication} from './authentication/QuoteAuthentication'
import {SignInApprovalAuthentication} from './authentication/SignInApprovalAuthentication'
import {SignInAuthentication} from './authentication/SignInAuthentication'
import {SignUpAuthentication} from './authentication/SignUpAuthentication'
import {TwoStepAuthentication} from './authentication/TwoStepAuthentication'
import {WorkspacePickerAuthentication} from './authentication/WorkspacePickerAuthentication'
import {AuthFrame} from './authentication/AuthPrimitives'
import {useHbarAppUiAuthenticationContent} from './authentication/AuthContent'
import './authentication/AuthenticationSurface.css'

export type HbarAppUiAuthenticationProps = HbarAppUiVariantProps & {
    readonly authenticationContent?: import('./authentication/AuthContent').HbarAppUiAuthContent | undefined
}

export {HbarAppUiAuthenticationProvider, selectHbarAppUiAuthItem, uniqueHbarAppUiAuthItems} from './authentication/AuthContent'
export type {
    HbarAppUiAuthAccount,
    HbarAppUiAuthAccountContent,
    HbarAppUiAuthApprovalContent,
    HbarAppUiAuthChoice,
    HbarAppUiAuthCodeContent,
    HbarAppUiAuthContent,
    HbarAppUiAuthDevice,
    HbarAppUiAuthEnterpriseContent,
    HbarAppUiAuthInvitationContent,
    HbarAppUiAuthListStrategy,
    HbarAppUiAuthMagicLinkContent,
    HbarAppUiAuthMember,
    HbarAppUiAuthPasskey,
    HbarAppUiAuthPasskeyContent,
    HbarAppUiAuthPasswordResetContent,
    HbarAppUiAuthProject,
    HbarAppUiAuthProviderChoice,
    HbarAppUiAuthProviderFirstContent,
    HbarAppUiAuthProviderProps,
    HbarAppUiAuthQuote,
    HbarAppUiAuthQuoteContent,
    HbarAppUiAuthRecentSignIn,
    HbarAppUiAuthSignInContent,
    HbarAppUiAuthSignUpContent,
    HbarAppUiAuthTwoStepContent,
    HbarAppUiAuthWorkspace,
    HbarAppUiAuthWorkspaceContent,
} from './authentication/AuthContent'

export function Authentication({spec, onAction, authenticationContent}: HbarAppUiAuthenticationProps) {
    const providerContent = useHbarAppUiAuthenticationContent()
    const content = authenticationContent ?? providerContent
    if (!content) return <AuthFrame spec={spec} onAction={onAction}>{null}</AuthFrame>
    switch (spec.variant) {
        case 1:
            return content.signIn ? <SignInAuthentication spec={spec} onAction={onAction} content={content.signIn} /> : <AuthFrame spec={spec} onAction={onAction}>{null}</AuthFrame>
        case 2:
            return content.providerFirst ? <ProviderFirstAuthentication spec={spec} onAction={onAction} content={content.providerFirst} /> : <AuthFrame spec={spec} onAction={onAction}>{null}</AuthFrame>
        case 3:
            return content.quote ? <QuoteAuthentication spec={spec} onAction={onAction} content={content.quote} /> : <AuthFrame spec={spec} onAction={onAction}>{null}</AuthFrame>
        case 4:
            return content.twoStep ? <TwoStepAuthentication spec={spec} onAction={onAction} content={content.twoStep} /> : <AuthFrame spec={spec} onAction={onAction}>{null}</AuthFrame>
        case 5:
            return content.magicLink ? <MagicLinkAuthentication spec={spec} onAction={onAction} content={content.magicLink} /> : <AuthFrame spec={spec} onAction={onAction}>{null}</AuthFrame>
        case 6:
            return content.code ? <CodeAuthentication spec={spec} onAction={onAction} content={content.code} /> : <AuthFrame spec={spec} onAction={onAction}>{null}</AuthFrame>
        case 7:
            return content.signUp ? <SignUpAuthentication spec={spec} onAction={onAction} content={content.signUp} /> : <AuthFrame spec={spec} onAction={onAction}>{null}</AuthFrame>
        case 8:
            return content.enterprise ? <EnterpriseAuthentication spec={spec} onAction={onAction} content={content.enterprise} /> : <AuthFrame spec={spec} onAction={onAction}>{null}</AuthFrame>
        case 9:
            return content.passkey ? <PasskeyAuthentication spec={spec} onAction={onAction} content={content.passkey} /> : <AuthFrame spec={spec} onAction={onAction}>{null}</AuthFrame>
        case 10:
            return content.account ? <AccountChooserAuthentication spec={spec} onAction={onAction} content={content.account} /> : <AuthFrame spec={spec} onAction={onAction}>{null}</AuthFrame>
        case 11:
            return content.workspace ? <WorkspacePickerAuthentication spec={spec} onAction={onAction} content={content.workspace} /> : <AuthFrame spec={spec} onAction={onAction}>{null}</AuthFrame>
        case 12:
            return content.invitation ? <InvitationAuthentication spec={spec} onAction={onAction} content={content.invitation} /> : <AuthFrame spec={spec} onAction={onAction}>{null}</AuthFrame>
        case 13:
            return content.passwordReset ? <PasswordResetAuthentication spec={spec} onAction={onAction} content={content.passwordReset} /> : <AuthFrame spec={spec} onAction={onAction}>{null}</AuthFrame>
        case 14:
            return content.approval ? <SignInApprovalAuthentication spec={spec} onAction={onAction} content={content.approval} /> : <AuthFrame spec={spec} onAction={onAction}>{null}</AuthFrame>
        default:
            return <AuthFrame spec={spec} onAction={onAction}>{null}</AuthFrame>
    }
}
