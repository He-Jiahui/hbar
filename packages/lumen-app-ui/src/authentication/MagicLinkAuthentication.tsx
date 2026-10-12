'use client'

import * as React from 'react'
import { MailCheck } from 'lucide-react'
import { LumenInput } from '../forms'
import { LumenButton } from '../primitives'
import { type LumenAuthMagicLinkContent, type LumenAuthMagicLinkReferenceFlow } from './content'
import { ExternalLink, RotateCcw } from './glyphs'
import { type LumenAuthCompositionProps, AuthArrow, AuthBrand, AuthCard, AuthFrame, AuthIcon } from './primitives'

export interface MagicLinkAuthenticationProps extends LumenAuthCompositionProps {
  readonly content: LumenAuthMagicLinkContent
}

export function MagicLinkAuthentication(props: MagicLinkAuthenticationProps) {
  const { referenceFlow } = props.content
  return referenceFlow ? (
    <ControlledMagicLinkAuthentication {...props} flow={referenceFlow} />
  ) : (
    <LegacyMagicLinkAuthentication {...props} />
  )
}

function ControlledMagicLinkAuthentication({
  spec,
  onAction,
  content,
  flow,
}: MagicLinkAuthenticationProps & { readonly flow: LumenAuthMagicLinkReferenceFlow }) {
  const emailId = React.useId()
  const emailHelperId = React.useId()

  return (
    <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-magic-link-surface">
      <div className="hbar-app-ui-auth-centered hbar-app-ui-full-canvas-owner" data-auth5-phase={flow.phase}>
        <AuthCard>
          {flow.phase === 'sent' ? (
            <>
              <div className="hbar-app-ui-auth-magic-link-emblem">
                <AuthIcon tier="sm">
                  <MailCheck />
                </AuthIcon>
              </div>
              <h1>{content.labels.title}</h1>
              <p className="hbar-app-ui-auth-magic-link-description">
                {content.labels.descriptionBeforeEmail}
                <span className="hbar-app-ui-auth-magic-link-email">
                  {flow.email}
                  {content.labels.descriptionEmailSuffix}
                </span>
                {content.labels.descriptionAfterEmail}
              </p>
              <div className="hbar-app-ui-auth-magic-link-summary">
                <div>
                  <span className="hbar-app-ui-auth-magic-link-summary-label">{content.labels.sentTo}</span>
                  <span className="hbar-app-ui-auth-magic-link-summary-value" title={flow.email}>
                    {flow.email}
                  </span>
                </div>
                <div>
                  <span className="hbar-app-ui-auth-magic-link-summary-label">{content.labels.expires}</span>
                  <span className="hbar-app-ui-auth-magic-link-summary-value">{content.expiry}</span>
                </div>
                <div>
                  <span className="hbar-app-ui-auth-magic-link-summary-label">{content.labels.requestedFrom}</span>
                  <span className="hbar-app-ui-auth-magic-link-summary-value" title={content.requestedFromValue}>
                    {content.requestedFromValue}
                  </span>
                </div>
              </div>
              <div className="hbar-app-ui-auth-magic-link-actions">
                <LumenButton
                  type="button"
                  data-auth5-action="open-mail"
                  indicator="none"
                  className="hbar-app-ui-auth-magic-link-primary"
                  onClick={() => flow.onNavigate('open-mail')}
                >
                  {content.labels.openMail}
                  <AuthIcon tier="sm">
                    <ExternalLink />
                  </AuthIcon>
                </LumenButton>
                <LumenButton
                  type="button"
                  data-auth5-action="resend"
                  indicator="none"
                  className="hbar-app-ui-auth-magic-link-resend"
                  disabled={flow.seconds > 0}
                  onClick={flow.onResend}
                >
                  <AuthIcon tier="sm">
                    <RotateCcw />
                  </AuthIcon>
                  <span className="hbar-app-ui-auth-magic-link-resend-label">
                    {flow.seconds > 0 ? content.labels.resend(flow.seconds) : content.labels.resendReady}
                  </span>
                </LumenButton>
              </div>
              <p className="hbar-app-ui-auth-magic-link-helper">{content.labels.noEmail}</p>
              <LumenButton
                type="button"
                data-auth5-action="different-email"
                indicator="none"
                className="hbar-app-ui-auth-magic-link-different"
                onClick={flow.onDifferentEmail}
              >
                <AuthArrow back />
                {content.labels.differentEmail}
              </LumenButton>
            </>
          ) : (
            <>
              <div className="hbar-app-ui-auth-magic-link-emblem hbar-app-ui-auth-magic-link-brand">
                <AuthBrand label={content.labels.formBrand} compact plain />
              </div>
              <h1>{content.labels.formTitle}</h1>
              <p className="hbar-app-ui-auth-magic-link-description">{content.labels.formDescription}</p>
              <form
                noValidate
                onSubmit={(event) => {
                  event.preventDefault()
                  flow.onSend()
                }}
              >
                <label htmlFor={emailId}>{content.labels.formEmailLabel}</label>
                <LumenInput
                  id={emailId}
                  data-auth5-field="email"
                  variant="plain"
                  autoFocus
                  autoComplete="email"
                  type="email"
                  value={flow.email}
                  placeholder={content.labels.formEmailPlaceholder}
                  aria-invalid={flow.invalidEmail}
                  aria-describedby={emailHelperId}
                  onChange={(event) => flow.onEmailChange(event.currentTarget.value)}
                />
                <p
                  id={emailHelperId}
                  className="hbar-app-ui-auth-magic-link-form-help"
                  aria-live="polite"
                  data-invalid={flow.invalidEmail || undefined}
                >
                  {flow.invalidEmail ? content.labels.formInvalidEmail : content.labels.formEmailHelper}
                </p>
                <LumenButton
                  type="submit"
                  data-auth5-action="send-link"
                  indicator="none"
                  className="hbar-app-ui-auth-magic-link-primary"
                >
                  {content.labels.formSubmit}
                </LumenButton>
              </form>
              <p className="hbar-app-ui-auth-magic-link-password-note">
                {content.labels.formPasswordPrompt}
                <LumenButton
                  type="button"
                  data-auth5-action="password-sign-in"
                  indicator="none"
                  onClick={() => flow.onNavigate('password-sign-in')}
                >
                  {content.labels.formPasswordSignIn}
                </LumenButton>
              </p>
            </>
          )}
        </AuthCard>
        <p className="hbar-app-ui-auth-footer-note">{content.labels.rateLimit}</p>
      </div>
    </AuthFrame>
  )
}

function LegacyMagicLinkAuthentication({ spec, onAction, content }: MagicLinkAuthenticationProps) {
  const [phase, setPhase] = React.useState<'sent' | 'form'>('sent')
  const [email, setEmail] = React.useState(content.email)
  const [invalidEmail, setInvalidEmail] = React.useState(false)
  const [seconds, setSeconds] = React.useState(content.resendAfterSeconds)
  const emailInput = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (phase === 'form' && emailInput.current) emailInput.current.scrollLeft = 0
  }, [phase])

  React.useEffect(() => {
    if (phase !== 'sent' || seconds <= 0) return
    const timer = window.setTimeout(() => setSeconds((current) => Math.max(0, current - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [phase, seconds])

  const sendLink = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setInvalidEmail(true)
      return
    }
    setInvalidEmail(false)
    setSeconds(content.resendAfterSeconds)
    setPhase('sent')
    onAction?.({ variantId: spec.id, actionId: 'send-link', value: email })
  }

  return (
    <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-magic-link-surface">
      <div className="hbar-app-ui-auth-centered hbar-app-ui-full-canvas-owner">
        <AuthCard>
          {phase === 'sent' ? (
            <>
              <div className="hbar-app-ui-auth-magic-link-emblem">
                <AuthIcon tier="sm">
                  <MailCheck />
                </AuthIcon>
              </div>
              <h1>{content.labels.title}</h1>
              <p className="hbar-app-ui-auth-magic-link-description">
                {content.labels.descriptionBeforeEmail}
                <span className="hbar-app-ui-auth-magic-link-email">
                  {email}
                  {content.labels.descriptionEmailSuffix}
                </span>
                {content.labels.descriptionAfterEmail}
              </p>
              <div className="hbar-app-ui-auth-magic-link-summary">
                <div>
                  <span className="hbar-app-ui-auth-magic-link-summary-label">{content.labels.sentTo}</span>
                  <span className="hbar-app-ui-auth-magic-link-summary-value" title={email}>
                    {email}
                  </span>
                </div>
                <div>
                  <span className="hbar-app-ui-auth-magic-link-summary-label">{content.labels.expires}</span>
                  <span className="hbar-app-ui-auth-magic-link-summary-value">{content.expiry}</span>
                </div>
                <div>
                  <span className="hbar-app-ui-auth-magic-link-summary-label">{content.labels.requestedFrom}</span>
                  <span className="hbar-app-ui-auth-magic-link-summary-value" title={content.requestedFromValue}>
                    {content.requestedFromValue}
                  </span>
                </div>
              </div>
              <div className="hbar-app-ui-auth-magic-link-actions">
                <LumenButton
                  type="button"
                  indicator="none"
                  className="hbar-app-ui-auth-magic-link-primary"
                  onClick={() => onAction?.({ variantId: spec.id, actionId: 'open-mail' })}
                >
                  {content.labels.openMail}
                  <AuthIcon tier="sm">
                    <ExternalLink />
                  </AuthIcon>
                </LumenButton>
                <LumenButton
                  type="button"
                  indicator="none"
                  className="hbar-app-ui-auth-magic-link-resend"
                  disabled={seconds > 0}
                  onClick={() => {
                    setSeconds(content.resendAfterSeconds)
                    onAction?.({ variantId: spec.id, actionId: 'resend' })
                  }}
                >
                  <AuthIcon tier="sm">
                    <RotateCcw />
                  </AuthIcon>
                  <span className="hbar-app-ui-auth-magic-link-resend-label">
                    {seconds > 0 ? content.labels.resend(seconds) : content.labels.resendReady}
                  </span>
                </LumenButton>
              </div>
              <p className="hbar-app-ui-auth-magic-link-helper">{content.labels.noEmail}</p>
              <LumenButton
                type="button"
                indicator="none"
                className="hbar-app-ui-auth-magic-link-different"
                onClick={() => {
                  setPhase('form')
                  setInvalidEmail(false)
                  onAction?.({ variantId: spec.id, actionId: 'different-email' })
                }}
              >
                <AuthArrow back />
                {content.labels.differentEmail}
              </LumenButton>
            </>
          ) : (
            <>
              <div className="hbar-app-ui-auth-magic-link-emblem hbar-app-ui-auth-magic-link-brand">
                <AuthBrand label={content.labels.formBrand} compact plain />
              </div>
              <h1>{content.labels.formTitle}</h1>
              <p className="hbar-app-ui-auth-magic-link-description">{content.labels.formDescription}</p>
              <form noValidate onSubmit={sendLink}>
                <label htmlFor={`${spec.id}-email`}>{content.labels.formEmailLabel}</label>
                <LumenInput
                  ref={emailInput}
                  id={`${spec.id}-email`}
                  variant="plain"
                  autoFocus
                  type="email"
                  value={email}
                  placeholder={content.labels.formEmailPlaceholder}
                  aria-invalid={invalidEmail || undefined}
                  onChange={(event) => {
                    setEmail(event.currentTarget.value)
                    setInvalidEmail(false)
                  }}
                />
                <p
                  className="hbar-app-ui-auth-magic-link-form-help"
                  aria-live="polite"
                  data-invalid={invalidEmail || undefined}
                >
                  {invalidEmail ? content.labels.formInvalidEmail : content.labels.formEmailHelper}
                </p>
                <LumenButton type="submit" indicator="none" className="hbar-app-ui-auth-magic-link-primary">
                  {content.labels.formSubmit}
                </LumenButton>
              </form>
              <p className="hbar-app-ui-auth-magic-link-password-note">
                {content.labels.formPasswordPrompt}
                <LumenButton
                  type="button"
                  indicator="none"
                  onClick={() => onAction?.({ variantId: spec.id, actionId: 'password-sign-in' })}
                >
                  {content.labels.formPasswordSignIn}
                </LumenButton>
              </p>
            </>
          )}
        </AuthCard>
        <p className="hbar-app-ui-auth-footer-note">{content.labels.rateLimit}</p>
      </div>
    </AuthFrame>
  )
}
