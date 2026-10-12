'use client'

import * as React from 'react'
import { LumenCheckBoxControl, LumenInput } from '../forms'
import { LumenButton } from '../primitives'
import {
  type LumenAuthCompositionProps,
  AuthBrand,
  AuthButton,
  AuthCard,
  AuthDivider,
  AuthFooterLinks,
  AuthFrame,
  AuthPasswordButton,
  AuthProviderButtons,
} from './primitives'
import { type LumenAuthSignInContent, uniqueLumenAuthItems } from './content'

export function SignInAuthentication({
  spec,
  onAction,
  content,
}: LumenAuthCompositionProps & {
  readonly content: LumenAuthSignInContent
}) {
  const [email, setEmail] = React.useState(content.initialEmail)
  const [password, setPassword] = React.useState('')
  const [visible, setVisible] = React.useState(false)
  const [remember, setRemember] = React.useState(content.initialRemember)
  const [emailError, setEmailError] = React.useState(false)
  const [passwordError, setPasswordError] = React.useState(false)
  const [phase, setPhase] = React.useState<'idle' | 'pending' | 'confirmed' | 'failed'>('idle')
  const request = React.useRef<AbortController | null>(null)
  const emailId = React.useId()
  const passwordId = React.useId()
  const emailErrorId = React.useId()
  const passwordErrorId = React.useId()
  React.useEffect(() => () => request.current?.abort(), [])
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (request.current || phase === 'confirmed') {
      return
    }
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    setEmailError(!validEmail)
    if (!validEmail) {
      return
    }
    const validPassword = password.length >= 8
    setPasswordError(!validPassword)
    if (!validPassword || !content.onSignIn) {
      return
    }
    const controller = new AbortController()
    request.current = controller
    setPhase('pending')
    try {
      const result = await content.onSignIn({ email: email.trim(), password, remember }, controller.signal)
      if (controller.signal.aborted) {
        return
      }
      setPhase(result === 'confirmed' ? 'confirmed' : 'idle')
      if (result === 'confirmed') {
        onAction?.({ variantId: spec.id, actionId: 'sign-in', value: email.trim() })
      }
    } catch {
      if (!controller.signal.aborted) {
        setPhase('failed')
      }
    } finally {
      if (request.current === controller) {
        request.current = null
      }
    }
  }
  return (
    <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-sign-in-surface">
      <div className="hbar-app-ui-auth-centered hbar-app-ui-full-canvas-owner">
        <AuthCard>
          <header className="hbar-app-ui-auth-sign-in-intro">
            <AuthBrand label={content.labels.brand} compact plain />
            <h1>{content.labels.title}</h1>
            <p>{content.labels.description}</p>
          </header>
          <form
            className="hbar-app-ui-auth-sign-in-form"
            noValidate
            onSubmit={(event) => {
              void submit(event)
            }}
          >
            <div className="hbar-app-ui-auth-field">
              <label htmlFor={emailId}>{content.labels.emailLabel}</label>
              <LumenInput
                id={emailId}
                variant="plain"
                type="email"
                autoComplete="username"
                placeholder={content.labels.emailPlaceholder}
                value={email}
                aria-invalid={emailError || undefined}
                aria-describedby={emailError ? emailErrorId : undefined}
                onChange={(event) => {
                  setEmail(event.currentTarget.value)
                  setEmailError(false)
                  setPhase('idle')
                }}
              />
              {emailError ? (
                <small id={emailErrorId} role="alert">
                  {content.labels.invalidEmail}
                </small>
              ) : null}
            </div>
            <div className="hbar-app-ui-auth-field">
              <div className="hbar-app-ui-auth-help-row">
                <label htmlFor={passwordId}>{content.labels.passwordLabel}</label>
                <LumenButton
                  type="button"
                  variant="text"
                  indicator="none"
                  onClick={() =>
                    onAction?.({
                      variantId: spec.id,
                      actionId: 'forgot-password',
                    })
                  }
                >
                  {content.labels.forgotPassword}
                </LumenButton>
              </div>
              <div className="hbar-app-ui-auth-input-wrap">
                <LumenInput
                  id={passwordId}
                  variant="plain"
                  type={visible ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder={content.labels.passwordPlaceholder}
                  value={password}
                  aria-invalid={passwordError || undefined}
                  aria-describedby={passwordError ? passwordErrorId : undefined}
                  onChange={(event) => {
                    setPassword(event.currentTarget.value)
                    setPasswordError(false)
                    setPhase('idle')
                  }}
                />
                <AuthPasswordButton
                  plain
                  visible={visible}
                  showLabel={content.labels.showPassword}
                  hideLabel={content.labels.hidePassword}
                  onToggle={() => setVisible((current) => !current)}
                />
              </div>
              {passwordError ? (
                <small id={passwordErrorId} role="alert">
                  {content.labels.invalidPassword}
                </small>
              ) : null}
            </div>
            <label className="hbar-app-ui-auth-check">
              <LumenCheckBoxControl checked={remember} onChange={(event) => setRemember(event.currentTarget.checked)} />
              <span>{content.labels.rememberLabel}</span>
            </label>
            <AuthButton
              type="submit"
              tone="accent"
              indicator="none"
              disabled={!content.onSignIn || phase === 'pending' || phase === 'confirmed'}
              data-hbar-app-ui-action="sign-in"
            >
              {phase === 'pending' ? <span className="hbar-app-ui-auth-sign-in-spinner" aria-hidden="true" /> : null}
              {phase === 'pending' ? content.labels.signingIn : content.labels.signIn}
            </AuthButton>
            {!content.onSignIn ? (
              <p role="status" className="hbar-app-ui-auth-sign-in-status">
                {content.labels.signInUnavailable}
              </p>
            ) : null}
            {phase === 'failed' ? (
              <p role="alert" className="hbar-app-ui-auth-sign-in-status">
                {content.labels.signInFailed}
              </p>
            ) : null}
            {phase === 'confirmed' ? (
              <p role="status" className="hbar-app-ui-auth-sign-in-status">
                {content.labels.signedIn}
              </p>
            ) : null}
          </form>
          {uniqueLumenAuthItems(content.providers).length > 0 ? (
            <React.Fragment>
              <AuthDivider label={content.labels.divider} />
              <AuthProviderButtons
                providers={content.providers}
                listStrategy={content.providerListStrategy}
                indicator="none"
                onSelect={(provider) =>
                  onAction?.({
                    variantId: spec.id,
                    actionId: 'provider',
                    value: provider.id,
                  })
                }
              />
            </React.Fragment>
          ) : null}
        </AuthCard>
        <p className="hbar-app-ui-auth-footer-note">
          {content.labels.noAccount}
          <LumenButton
            type="button"
            variant="text"
            indicator="none"
            className="hbar-app-ui-auth-inline-link"
            onClick={() =>
              onAction?.({
                variantId: spec.id,
                actionId: 'create-account',
              })
            }
          >
            {content.labels.createAccount}
          </LumenButton>
        </p>
        <AuthFooterLinks
          links={[content.labels.privacy, content.labels.terms, content.labels.status]}
          indicator="none"
          navigation={false}
          onSelect={(value) => onAction?.({ variantId: spec.id, actionId: 'footer-link', value })}
        />
      </div>
    </AuthFrame>
  )
}
