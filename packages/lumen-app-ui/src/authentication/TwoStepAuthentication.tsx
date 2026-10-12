'use client'

import * as React from 'react'
import { LumenInput } from '../forms'
import { LumenButton } from '../primitives'
import { type LumenAuthTwoStepContent, type LumenAuthTwoStepReferenceFlow } from './content'
import { ArrowRight, Mail } from './glyphs'
import {
  type LumenAuthCompositionProps,
  AuthArrow,
  AuthBrand,
  AuthCard,
  AuthFrame,
  AuthIcon,
  AuthPasswordButton,
} from './primitives'

export interface TwoStepAuthenticationProps extends LumenAuthCompositionProps {
  readonly content: LumenAuthTwoStepContent
}

export function TwoStepAuthentication(props: TwoStepAuthenticationProps) {
  const { referenceFlow } = props.content
  return referenceFlow ? (
    <ControlledTwoStepAuthentication {...props} flow={referenceFlow} />
  ) : (
    <LegacyTwoStepAuthentication {...props} />
  )
}

function ControlledTwoStepAuthentication({
  spec,
  onAction,
  content,
  flow,
}: TwoStepAuthenticationProps & { readonly flow: LumenAuthTwoStepReferenceFlow }) {
  const emailId = React.useId()
  const passwordId = React.useId()
  const emailErrorId = React.useId()
  const emailStep = flow.phase === 'email' || flow.phase === 'email-pending'
  const continuePending = flow.phase === 'email-pending'
  const signInPending = flow.phase === 'sign-in-pending'

  return (
    <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-two-step-surface">
      <div className="hbar-app-ui-auth-centered hbar-app-ui-full-canvas-owner" data-auth4-phase={flow.phase}>
        <AuthCard>
          <div className="hbar-app-ui-auth-step-head">
            <AuthBrand label={content.labels.brand} compact plain />
            <small>{content.labels.step(emailStep ? 1 : 2, 2)}</small>
          </div>
          {emailStep ? (
            <div className="hbar-app-ui-auth-two-step-body">
              <h1>{content.labels.title}</h1>
              <p>{content.labels.description}</p>
              <form
                noValidate
                onSubmit={(event) => {
                  event.preventDefault()
                  flow.onContinueRequest()
                }}
              >
                <div className="hbar-app-ui-auth-field">
                  <label htmlFor={emailId}>{content.labels.emailLabel}</label>
                  <LumenInput
                    variant="plain"
                    id={emailId}
                    data-auth4-field="email"
                    type="email"
                    autoComplete="email"
                    value={flow.email}
                    placeholder={content.labels.emailPlaceholder}
                    aria-invalid={flow.invalidEmail}
                    aria-describedby={flow.invalidEmail ? emailErrorId : undefined}
                    onChange={(event) => flow.onEmailChange(event.currentTarget.value)}
                  />
                  {flow.invalidEmail ? (
                    <small id={emailErrorId} role="alert">
                      {content.labels.invalidEmail}
                    </small>
                  ) : null}
                </div>
                <LumenButton
                  type="submit"
                  data-auth4-action="continue"
                  indicator="none"
                  loading={continuePending}
                  className="hbar-app-ui-auth-two-step-primary"
                >
                  {continuePending ? <span className="hbar-app-ui-auth-two-step-spinner" aria-hidden="true" /> : null}
                  {continuePending ? content.labels.continuing : content.labels.continueLabel}
                  {continuePending ? null : (
                    <AuthIcon tier="md">
                      <ArrowRight />
                    </AuthIcon>
                  )}
                </LumenButton>
              </form>
              <LumenButton
                type="button"
                data-auth4-action="magic-link"
                indicator="none"
                className="hbar-app-ui-auth-two-step-secondary"
                onClick={() => flow.onNavigationRequest('magic-link')}
              >
                <AuthIcon tier="md">
                  <Mail />
                </AuthIcon>
                {content.labels.magicLink}
              </LumenButton>
            </div>
          ) : (
            <div className="hbar-app-ui-auth-two-step-body hbar-app-ui-auth-two-step-password">
              <LumenButton
                type="button"
                data-auth4-action="back"
                indicator="none"
                className="hbar-app-ui-auth-two-step-back"
                onClick={flow.onBack}
              >
                <AuthArrow back />
                {content.labels.back}
              </LumenButton>
              <div className="hbar-app-ui-auth-two-step-account">
                <span className="hbar-app-ui-auth-two-step-avatar" aria-hidden="true">
                  {content.account.initials}
                </span>
                <div>
                  <p title={content.account.name}>{content.account.name}</p>
                  <p title={content.account.organization}>{content.account.organization}</p>
                </div>
              </div>
              <form
                noValidate
                onSubmit={(event) => {
                  event.preventDefault()
                  flow.onSignInRequest()
                }}
              >
                <div className="hbar-app-ui-auth-two-step-label-row">
                  <label htmlFor={passwordId}>{content.labels.passwordLabel}</label>
                  <LumenButton
                    type="button"
                    data-auth4-action="forgot-password"
                    indicator="none"
                    onClick={() => flow.onNavigationRequest('forgot-password')}
                  >
                    {content.labels.forgotPassword}
                  </LumenButton>
                </div>
                <div className="hbar-app-ui-auth-input-wrap">
                  <LumenInput
                    variant="plain"
                    id={passwordId}
                    data-auth4-field="password"
                    type={flow.passwordVisible ? 'text' : 'password'}
                    autoComplete="current-password"
                    autoFocus
                    value={flow.password}
                    placeholder={content.labels.passwordPlaceholder}
                    onChange={(event) => flow.onPasswordChange(event.currentTarget.value)}
                  />
                  <AuthPasswordButton
                    visible={flow.passwordVisible}
                    showLabel={content.labels.showPassword}
                    hideLabel={content.labels.hidePassword}
                    plain
                    onToggle={() => flow.onPasswordVisibleChange(!flow.passwordVisible)}
                  />
                </div>
                <LumenButton
                  type="submit"
                  data-auth4-action="sign-in"
                  indicator="none"
                  loading={signInPending}
                  className="hbar-app-ui-auth-two-step-primary"
                >
                  {signInPending ? <span className="hbar-app-ui-auth-two-step-spinner" aria-hidden="true" /> : null}
                  {signInPending ? content.labels.signingIn : content.labels.signIn}
                </LumenButton>
              </form>
              <p className="hbar-app-ui-auth-two-step-hint">{content.labels.securityNote}</p>
            </div>
          )}
        </AuthCard>
        <p className="hbar-app-ui-auth-footer-note">
          {content.labels.needAccount}
          <LumenButton
            type="button"
            data-auth4-action="create-account"
            indicator="none"
            className="hbar-app-ui-auth-inline-link"
            onClick={() => flow.onNavigationRequest('create-account')}
          >
            {content.labels.createAccount}
          </LumenButton>
        </p>
      </div>
    </AuthFrame>
  )
}

function LegacyTwoStepAuthentication({ spec, onAction, content }: TwoStepAuthenticationProps) {
  const [step, setStep] = React.useState<1 | 2>(1)
  const [email, setEmail] = React.useState(content.initialEmail)
  const [password, setPassword] = React.useState('')
  const [visible, setVisible] = React.useState(false)
  const [invalidEmail, setInvalidEmail] = React.useState(false)
  const [busy, setBusy] = React.useState<'continue' | 'sign-in' | null>(null)
  const timeout = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(
    () => () => {
      if (timeout.current) {
        clearTimeout(timeout.current)
      }
    },
    [],
  )

  const schedule = (action: () => void, delay: number) => {
    if (timeout.current) {
      clearTimeout(timeout.current)
    }
    timeout.current = setTimeout(() => {
      timeout.current = null
      action()
    }, delay)
  }

  const continueToPassword = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setInvalidEmail(true)
      return
    }
    setInvalidEmail(false)
    setBusy('continue')
    onAction?.({ variantId: spec.id, actionId: 'continue', value: email })
    schedule(() => {
      setStep(2)
      setBusy(null)
    }, 1050)
  }

  const signIn = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy('sign-in')
    onAction?.({ variantId: spec.id, actionId: 'sign-in', value: email })
    schedule(() => setBusy(null), 1400)
  }

  return (
    <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-two-step-surface">
      <div className="hbar-app-ui-auth-centered hbar-app-ui-full-canvas-owner">
        <AuthCard>
          <div className="hbar-app-ui-auth-step-head">
            <AuthBrand label={content.labels.brand} compact plain />
            <small>{content.labels.step(step, 2)}</small>
          </div>
          {step === 1 ? (
            <div className="hbar-app-ui-auth-two-step-body">
              <h1>{content.labels.title}</h1>
              <p>{content.labels.description}</p>
              <form noValidate onSubmit={continueToPassword}>
                <div className="hbar-app-ui-auth-field">
                  <label htmlFor={`${spec.id}-email`}>{content.labels.emailLabel}</label>
                  <LumenInput
                    variant="plain"
                    id={`${spec.id}-email`}
                    type="email"
                    value={email}
                    placeholder={content.labels.emailPlaceholder}
                    aria-invalid={invalidEmail || undefined}
                    onChange={(event) => {
                      setEmail(event.currentTarget.value)
                      setInvalidEmail(false)
                    }}
                  />
                  {invalidEmail && <small role="alert">{content.labels.invalidEmail}</small>}
                </div>
                <LumenButton
                  type="submit"
                  indicator="none"
                  disabled={busy === 'continue'}
                  className="hbar-app-ui-auth-two-step-primary"
                >
                  {busy === 'continue' ? (
                    <span className="hbar-app-ui-auth-two-step-spinner" aria-hidden="true" />
                  ) : null}
                  {busy === 'continue' ? content.labels.continuing : content.labels.continueLabel}
                  {busy === 'continue' ? null : <AuthArrow />}
                </LumenButton>
              </form>
              <LumenButton
                type="button"
                indicator="none"
                className="hbar-app-ui-auth-two-step-secondary"
                onClick={() => onAction?.({ variantId: spec.id, actionId: 'magic-link' })}
              >
                <AuthIcon tier="sm">
                  <Mail />
                </AuthIcon>
                {content.labels.magicLink}
              </LumenButton>
            </div>
          ) : (
            <div className="hbar-app-ui-auth-two-step-body hbar-app-ui-auth-two-step-password">
              <LumenButton
                type="button"
                indicator="none"
                className="hbar-app-ui-auth-two-step-back"
                onClick={() => {
                  if (timeout.current) {
                    clearTimeout(timeout.current)
                  }
                  timeout.current = null
                  setBusy(null)
                  setStep(1)
                }}
              >
                <AuthArrow back />
                {content.labels.back}
              </LumenButton>
              <div className="hbar-app-ui-auth-two-step-account">
                <span className="hbar-app-ui-auth-two-step-avatar" aria-hidden="true">
                  {content.account.initials}
                </span>
                <div>
                  <strong>{content.account.name}</strong>
                  <small>{content.account.organization}</small>
                </div>
              </div>
              <form noValidate onSubmit={signIn}>
                <div className="hbar-app-ui-auth-two-step-label-row">
                  <label htmlFor={`${spec.id}-password`}>{content.labels.passwordLabel}</label>
                  <LumenButton
                    type="button"
                    indicator="none"
                    onClick={() => onAction?.({ variantId: spec.id, actionId: 'forgot-password' })}
                  >
                    {content.labels.forgotPassword}
                  </LumenButton>
                </div>
                <div className="hbar-app-ui-auth-input-wrap">
                  <LumenInput
                    variant="plain"
                    id={`${spec.id}-password`}
                    autoFocus
                    type={visible ? 'text' : 'password'}
                    value={password}
                    placeholder={content.labels.passwordPlaceholder}
                    onChange={(event) => setPassword(event.currentTarget.value)}
                  />
                  <AuthPasswordButton
                    visible={visible}
                    showLabel={content.labels.showPassword}
                    hideLabel={content.labels.hidePassword}
                    plain
                    onToggle={() => setVisible((current) => !current)}
                  />
                </div>
                <LumenButton
                  type="submit"
                  indicator="none"
                  disabled={busy === 'sign-in'}
                  className="hbar-app-ui-auth-two-step-primary"
                >
                  {busy === 'sign-in' && <span className="hbar-app-ui-auth-two-step-spinner" aria-hidden="true" />}
                  {busy === 'sign-in' ? content.labels.signingIn : content.labels.signIn}
                </LumenButton>
              </form>
              <p className="hbar-app-ui-auth-two-step-hint">{content.labels.securityNote}</p>
            </div>
          )}
        </AuthCard>
        <p className="hbar-app-ui-auth-footer-note">
          {content.labels.needAccount}
          <LumenButton
            type="button"
            indicator="none"
            className="hbar-app-ui-auth-inline-link"
            onClick={() => onAction?.({ variantId: spec.id, actionId: 'create-account' })}
          >
            {content.labels.createAccount}
          </LumenButton>
        </p>
      </div>
    </AuthFrame>
  )
}
