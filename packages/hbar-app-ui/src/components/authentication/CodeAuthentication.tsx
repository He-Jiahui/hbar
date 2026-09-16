import { HbarAppUiButton } from '../../primitives'
import type { HbarAppUiVariantProps } from '../../types'
import type { HbarAppUiAuthCodeContent } from './AuthContent'
import { AuthFrame } from './AuthPrimitives'
import { HbarAppUiCodeVerification } from './CodeVerification'

export function CodeAuthentication({
  spec,
  onAction,
  content,
}: HbarAppUiVariantProps & { readonly content: HbarAppUiAuthCodeContent }) {
  return (
    <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-code-surface">
      <HbarAppUiCodeVerification
        labels={{ ...content.labels, code: content.labels.codeLabel, submit: content.labels.verify }}
        codeLength={content.codeLength}
        presentation="segmented"
        value={content.code}
        busy={content.busy}
        canSubmit={content.canVerify}
        error={content.error}
        onCodeChange={content.onCodeChange}
        onSubmit={content.onVerify}
        secondaryActions={
          <>
            {content.resend && (
              <HbarAppUiButton disabled={content.busy || !content.resend.enabled} onClick={content.resend.onResend}>
                {content.labels.resend(content.resend.seconds)}
              </HbarAppUiButton>
            )}
            {content.onRecovery && (
              <HbarAppUiButton disabled={content.busy} onClick={content.onRecovery}>
                {content.labels.recovery}
              </HbarAppUiButton>
            )}
          </>
        }
        footer={
          content.onBack && (
            <HbarAppUiButton disabled={content.busy} onClick={content.onBack}>
              {content.labels.back}
            </HbarAppUiButton>
          )
        }
      />
    </AuthFrame>
  )
}
