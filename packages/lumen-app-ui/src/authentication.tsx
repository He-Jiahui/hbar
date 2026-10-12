'use client'

import { AccountChooserAuthentication } from './authentication/AccountChooserAuthentication'
import { CodeAuthentication } from './authentication/CodeAuthentication'
import { EnterpriseAuthentication } from './authentication/EnterpriseAuthentication'
import { InvitationAuthentication } from './authentication/InvitationAuthentication'
import { MagicLinkAuthentication } from './authentication/MagicLinkAuthentication'
import { PasskeyAuthentication } from './authentication/PasskeyAuthentication'
import { PasswordResetAuthentication } from './authentication/PasswordResetAuthentication'
import { ProviderFirstAuthentication } from './authentication/ProviderFirstAuthentication'
import { QuoteAuthentication } from './authentication/QuoteAuthentication'
import { SignInApprovalAuthentication } from './authentication/SignInApprovalAuthentication'
import { SignInAuthentication } from './authentication/SignInAuthentication'
import { SignUpAuthentication } from './authentication/SignUpAuthentication'
import { TwoStepAuthentication } from './authentication/TwoStepAuthentication'
import { WorkspacePickerAuthentication } from './authentication/WorkspacePickerAuthentication'
import {
  LumenAuthenticationProvider,
  selectLumenAuthItem,
  uniqueLumenAuthItems,
  useLumenAuthenticationContent,
  type LumenAuthContent,
} from './authentication/content'
import { AuthFrame, type LumenAuthCompositionProps } from './authentication/primitives'
import './authentication.css'
import './authentication-sign-in-reference.css'
import './authentication-provider-first-reference.css'
import './authentication-quote-reference.css'
import './authentication-two-step-reference.css'
import './authentication-magic-link-reference.css'
import './authentication-code-reference.css'
import './authentication-sign-up-reference.css'
import './authentication-enterprise-reference.css'
import './authentication-passkey-reference.css'
import './authentication-account-reference.css'
import './authentication-workspace-reference.css'
import './authentication-invitation-reference.css'
import './authentication-password-reset-reference.css'
import './authentication-sign-in-approval-reference.css'

export interface LumenAuthenticationAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenAuthenticationProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenAuthContent | undefined
  readonly onAction?: ((event: LumenAuthenticationAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
}

export type LumenAuthenticationVariantProps = Omit<LumenAuthenticationProps, 'variant' | 'variantId'>

export { LumenAuthenticationProvider, selectLumenAuthItem, uniqueLumenAuthItems, useLumenAuthenticationContent }

function compositionProps(props: LumenAuthenticationProps): LumenAuthCompositionProps {
  return {
    spec: {
      id: props.variantId,
      variant: props.variant,
      density: props.density,
      className: props.className,
      profile: {
        surface: props.surface,
        initialState: props.state,
        visualMode: props.visualMode,
      },
    },
    onAction: props.onAction
      ? ({ actionId, value }) => props.onAction?.(value === undefined ? { actionId } : { actionId, value })
      : undefined,
  }
}

function empty(props: LumenAuthenticationProps) {
  return <AuthFrame {...compositionProps(props)}>{null}</AuthFrame>
}

export function LumenAuthentication(props: LumenAuthenticationProps) {
  const inheritedContent = useLumenAuthenticationContent()
  const content = props.content ?? inheritedContent
  const composition = compositionProps(props)
  if (props.variant === 1) {
    return content?.signIn ? <SignInAuthentication {...composition} content={content.signIn} /> : empty(props)
  }
  if (props.variant === 2) {
    return content?.providerFirst ? (
      <ProviderFirstAuthentication {...composition} content={content.providerFirst} />
    ) : (
      empty(props)
    )
  }
  if (props.variant === 3) {
    return content?.quote ? <QuoteAuthentication {...composition} content={content.quote} /> : empty(props)
  }
  if (props.variant === 4) {
    return content?.twoStep ? <TwoStepAuthentication {...composition} content={content.twoStep} /> : empty(props)
  }
  if (props.variant === 5) {
    return content?.magicLink ? <MagicLinkAuthentication {...composition} content={content.magicLink} /> : empty(props)
  }
  if (props.variant === 6) {
    return content?.code ? <CodeAuthentication {...composition} content={content.code} /> : empty(props)
  }
  if (props.variant === 7) {
    return content?.signUp ? <SignUpAuthentication {...composition} content={content.signUp} /> : empty(props)
  }
  if (props.variant === 8) {
    return content?.enterprise ? (
      <EnterpriseAuthentication {...composition} content={content.enterprise} />
    ) : (
      empty(props)
    )
  }
  if (props.variant === 9) {
    return content?.passkey ? <PasskeyAuthentication {...composition} content={content.passkey} /> : empty(props)
  }
  if (props.variant === 10) {
    return content?.account ? <AccountChooserAuthentication {...composition} content={content.account} /> : empty(props)
  }
  if (props.variant === 11) {
    return content?.workspace ? (
      <WorkspacePickerAuthentication {...composition} content={content.workspace} />
    ) : (
      empty(props)
    )
  }
  if (props.variant === 12) {
    return content?.invitation ? (
      <InvitationAuthentication {...composition} content={content.invitation} />
    ) : (
      empty(props)
    )
  }
  if (props.variant === 13) {
    return content?.passwordReset ? (
      <PasswordResetAuthentication {...composition} content={content.passwordReset} />
    ) : (
      empty(props)
    )
  }
  if (props.variant === 14) {
    return content?.approval ? (
      <SignInApprovalAuthentication {...composition} content={content.approval} />
    ) : (
      empty(props)
    )
  }
  return empty(props)
}

function variant(value: number, props: LumenAuthenticationVariantProps) {
  return <LumenAuthentication {...props} variant={value} variantId={`hbar-app-ui-authentication-${value}`} />
}

export function LumenAuthentication01(props: LumenAuthenticationVariantProps) {
  return variant(1, props)
}

export function LumenAuthentication02(props: LumenAuthenticationVariantProps) {
  return variant(2, props)
}

export function LumenAuthentication03(props: LumenAuthenticationVariantProps) {
  return variant(3, props)
}

export function LumenAuthentication04(props: LumenAuthenticationVariantProps) {
  return variant(4, props)
}

export function LumenAuthentication05(props: LumenAuthenticationVariantProps) {
  return variant(5, props)
}

export function LumenAuthentication06(props: LumenAuthenticationVariantProps) {
  return variant(6, props)
}

export function LumenAuthentication07(props: LumenAuthenticationVariantProps) {
  return variant(7, props)
}

export function LumenAuthentication08(props: LumenAuthenticationVariantProps) {
  return variant(8, props)
}

export function LumenAuthentication09(props: LumenAuthenticationVariantProps) {
  return variant(9, props)
}

export function LumenAuthentication10(props: LumenAuthenticationVariantProps) {
  return variant(10, props)
}

export function LumenAuthentication11(props: LumenAuthenticationVariantProps) {
  return variant(11, props)
}

export function LumenAuthentication12(props: LumenAuthenticationVariantProps) {
  return variant(12, props)
}

export function LumenAuthentication13(props: LumenAuthenticationVariantProps) {
  return variant(13, props)
}

export function LumenAuthentication14(props: LumenAuthenticationVariantProps) {
  return variant(14, props)
}
