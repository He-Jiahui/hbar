'use client'

import * as React from 'react'
import { LumenInput } from '../forms'
import { LumenButton } from '../primitives'
import { type LumenAuthCodeContent } from './content'
import { Check, ShieldCheck } from './glyphs'
import { type LumenAuthCompositionProps, AuthArrow, AuthCard, AuthFrame, AuthIcon } from './primitives'
import { LumenCodeVerification } from './CodeVerification'

export function CodeAuthentication({
  spec,
  onAction,
  content,
}: LumenAuthCompositionProps & { readonly content: LumenAuthCodeContent }) {
  const fields = React.useRef<(HTMLInputElement | null)[]>([])
  const recoveryId = React.useId()
  const flow = content.referenceFlow

  if (!flow) {
    return (
      <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-code-surface">
        <LumenCodeVerification
          labels={{
            ...content.labels,
            code: content.labels.codeLabel,
            submit: content.labels.verify,
          }}
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
                <LumenButton
                  variant="text"
                  disabled={content.busy || !content.resend.enabled}
                  onClick={content.resend.onResend}
                >
                  {content.labels.resend(content.resend.seconds)}
                </LumenButton>
              )}
              {content.onRecovery && (
                <LumenButton variant="text" disabled={content.busy} onClick={content.onRecovery}>
                  {content.labels.recovery}
                </LumenButton>
              )}
            </>
          }
          footer={
            content.onBack && (
              <LumenButton variant="text" disabled={content.busy} onClick={content.onBack}>
                {content.labels.back}
              </LumenButton>
            )
          }
        />
      </AuthFrame>
    )
  }

  const length = Number.isSafeInteger(content.codeLength) && content.codeLength > 0 ? content.codeLength : 0
  const updateDigits = (index: number, value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, length - index)
    const next = content.code.padEnd(length, ' ').split('')
    next.splice(index, Math.max(1, digits.length), ...(digits || ' ').split(''))
    content.onCodeChange(next.join('').trimEnd())
    if (digits) fields.current[Math.min(index + digits.length, length - 1)]?.focus()
  }
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!content.busy && (flow.phase === 'recovery' ? flow.canVerifyRecovery : content.canVerify)) content.onVerify()
  }

  return (
    <AuthFrame
      spec={spec}
      onAction={onAction}
      className="hbar-app-ui-auth-code-surface hbar-app-ui-auth-code-reference"
    >
      <div className="hbar-app-ui-auth-centered hbar-app-ui-full-canvas-owner">
        {flow.phase === 'verified' ? (
          <AuthCard className="hbar-app-ui-auth-code-verified">
            <div className="hbar-app-ui-auth-code-success-icon">
              <AuthIcon tier="md">
                <Check />
              </AuthIcon>
            </div>
            <h1>{flow.labels.verifiedTitle}</h1>
            <p className="hbar-app-ui-auth-code-description">{flow.labels.verifiedDescription}</p>
            <div className="hbar-app-ui-auth-code-summary">
              <div>
                <span>{flow.labels.methodLabel}</span>
                <span className="hbar-app-ui-auth-code-summary-value">{flow.success.method}</span>
              </div>
              <div>
                <span>{flow.labels.trustedUntilLabel}</span>
                <span className="hbar-app-ui-auth-code-summary-value">{flow.success.trustedUntil}</span>
              </div>
            </div>
            <LumenButton
              type="button"
              indicator="none"
              className="hbar-app-ui-auth-code-primary"
              onClick={flow.onContinue}
            >
              {flow.labels.continueLabel}
            </LumenButton>
            <LumenButton
              type="button"
              indicator="none"
              className="hbar-app-ui-auth-code-link hbar-app-ui-auth-code-again"
              onClick={() => flow.onModeChange('text')}
            >
              {flow.labels.verifyAnother}
            </LumenButton>
          </AuthCard>
        ) : (
          <form className="hbar-app-ui-auth-code-card" noValidate onSubmit={onSubmit}>
            <div className="hbar-app-ui-auth-code-emblem">
              <AuthIcon tier="md">
                <ShieldCheck />
              </AuthIcon>
            </div>
            <h1>{flow.phase === 'recovery' ? flow.labels.recoveryTitle : content.labels.title}</h1>
            <p className="hbar-app-ui-auth-code-description">
              {flow.phase === 'recovery' ? flow.labels.recoveryDescription : content.labels.description}
            </p>
            {flow.phase === 'recovery' ? (
              <div className="hbar-app-ui-auth-code-recovery-field">
                <label htmlFor={recoveryId}>{flow.labels.recoveryLabel}</label>
                <LumenInput
                  id={recoveryId}
                  variant="plain"
                  value={flow.recoveryCode}
                  maxLength={11}
                  placeholder={flow.labels.recoveryPlaceholder}
                  onChange={(event) => flow.onRecoveryCodeChange(event.currentTarget.value)}
                />
              </div>
            ) : (
              <fieldset className="hbar-app-ui-auth-code-digits" disabled={content.busy || !length}>
                <legend>{content.labels.codeLabel}</legend>
                <div>
                  {Array.from({ length }, (_, index) => (
                    <React.Fragment key={index}>
                      {index === Math.floor(length / 2) && (
                        <span className="hbar-app-ui-auth-code-separator" aria-hidden="true">
                          {flow.labels.digitSeparator}
                        </span>
                      )}
                      <LumenInput
                        variant="plain"
                        ref={(element) => {
                          fields.current[index] = element
                        }}
                        aria-label={content.labels.codeDigit(index + 1)}
                        inputMode="numeric"
                        autoComplete={index === 0 ? 'one-time-code' : 'off'}
                        maxLength={1}
                        value={content.code[index]?.trim() ?? ''}
                        onPaste={(event) => {
                          event.preventDefault()
                          updateDigits(index, event.clipboardData.getData('text'))
                        }}
                        onChange={(event) => updateDigits(index, event.currentTarget.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Backspace' && !content.code[index]?.trim() && index > 0)
                            fields.current[index - 1]?.focus()
                        }}
                      />
                    </React.Fragment>
                  ))}
                </div>
              </fieldset>
            )}
            <p className="hbar-app-ui-auth-code-helper">
              {flow.phase === 'recovery'
                ? flow.labels.recoveryHelper
                : content.busy
                  ? flow.labels.checkingCode
                  : content.labels.helper}
            </p>
            {content.error && (
              <p className="hbar-app-ui-auth-code-error" role="alert">
                {content.error}
              </p>
            )}
            <LumenButton
              type="submit"
              indicator="none"
              className="hbar-app-ui-auth-code-primary"
              disabled={content.busy || !(flow.phase === 'recovery' ? flow.canVerifyRecovery : content.canVerify)}
            >
              {content.busy && <span className="hbar-app-ui-auth-code-spinner" aria-hidden="true" />}
              {content.busy ? flow.labels.verifying : content.labels.verify}
            </LumenButton>
            <div className="hbar-app-ui-auth-code-actions">
              {content.resend && (
                <LumenButton
                  type="button"
                  indicator="none"
                  className="hbar-app-ui-auth-code-resend"
                  disabled={!content.resend.enabled}
                  onClick={content.resend.onResend}
                >
                  {content.resend.enabled ? flow.labels.resendReady : content.labels.resend(content.resend.seconds)}
                </LumenButton>
              )}
              <LumenButton
                type="button"
                indicator="none"
                className="hbar-app-ui-auth-code-link"
                onClick={() => flow.onModeChange(flow.phase === 'recovery' ? 'text' : 'recovery')}
              >
                {flow.phase === 'recovery' ? flow.labels.useTextedCode : content.labels.recovery}
              </LumenButton>
            </div>
          </form>
        )}
        {content.onBack && (
          <LumenButton type="button" indicator="none" className="hbar-app-ui-auth-code-back" onClick={content.onBack}>
            <AuthArrow back />
            {content.labels.back}
          </LumenButton>
        )}
      </div>
    </AuthFrame>
  )
}
