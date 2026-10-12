import { LumenAuthentication, LumenAuthenticationProvider as HbarAppUiAuthenticationProvider, type LumenAuthContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiAuthenticationProps = HbarAppUiVariantProps & {
  readonly authenticationContent?: LumenAuthContent | undefined
}

export { HbarAppUiAuthenticationProvider }
export { selectLumenAuthItem as selectHbarAppUiAuthItem, uniqueLumenAuthItems as uniqueHbarAppUiAuthItems, useLumenAuthenticationContent as useHbarAppUiAuthenticationContent } from '@lumen/app-ui/catalog'
export type { LumenAuthAccount as HbarAppUiAuthAccount, LumenAuthAccountContent as HbarAppUiAuthAccountContent, LumenAuthApprovalContent as HbarAppUiAuthApprovalContent, LumenAuthChoice as HbarAppUiAuthChoice, LumenAuthCodeContent as HbarAppUiAuthCodeContent, LumenAuthContent as HbarAppUiAuthContent, LumenAuthDevice as HbarAppUiAuthDevice, LumenAuthEnterpriseContent as HbarAppUiAuthEnterpriseContent, LumenAuthInvitationContent as HbarAppUiAuthInvitationContent, LumenAuthListStrategy as HbarAppUiAuthListStrategy, LumenAuthMagicLinkContent as HbarAppUiAuthMagicLinkContent, LumenAuthMember as HbarAppUiAuthMember, LumenAuthPasskey as HbarAppUiAuthPasskey, LumenAuthPasskeyContent as HbarAppUiAuthPasskeyContent, LumenAuthPasswordResetContent as HbarAppUiAuthPasswordResetContent, LumenAuthProject as HbarAppUiAuthProject, LumenAuthProviderChoice as HbarAppUiAuthProviderChoice, LumenAuthProviderFirstContent as HbarAppUiAuthProviderFirstContent, LumenAuthProviderProps as HbarAppUiAuthProviderProps, LumenAuthQuote as HbarAppUiAuthQuote, LumenAuthQuoteContent as HbarAppUiAuthQuoteContent, LumenAuthRecentSignIn as HbarAppUiAuthRecentSignIn, LumenAuthSignInContent as HbarAppUiAuthSignInContent, LumenAuthSignUpContent as HbarAppUiAuthSignUpContent, LumenAuthTwoStepContent as HbarAppUiAuthTwoStepContent, LumenAuthWorkspace as HbarAppUiAuthWorkspace, LumenAuthWorkspaceContent as HbarAppUiAuthWorkspaceContent } from '@lumen/app-ui/catalog'

export function Authentication({ spec, onAction, authenticationContent, className }: HbarAppUiAuthenticationProps) {
  return (
    <LumenAuthentication
      variant={spec.variant}
      variantId={spec.id}
      content={authenticationContent}
      className={className}
      density={spec.density}
      surface={spec.profile.surface}
      state={spec.profile.initialState}
      visualMode={spec.profile.visualMode}
      onAction={
        onAction
          ? ({ actionId, value }) =>
              onAction(value === undefined ? { variantId: spec.id, actionId } : { variantId: spec.id, actionId, value })
          : undefined
      }
    />
  )
}
