import { LumenCheckBoxControl, LumenInput } from '../forms'
import { LumenButton } from '../primitives'
import { useId, useState } from 'react'
import { Check, Eye, EyeOff } from './glyphs'
import {
  type LumenAuthCompositionProps,
  AuthBrand,
  AuthButton,
  AuthCard,
  AuthCheck,
  AuthField,
  AuthFrame,
  AuthPasswordButton,
  AuthIcon,
} from './primitives'
import { type LumenAuthSignUpContent } from './content'

export function SignUpAuthentication({
  spec,
  onAction,
  content,
}: LumenAuthCompositionProps & {
  readonly content: LumenAuthSignUpContent
}) {
  if (content.referenceFlow) return <ReferenceSignUpAuthentication spec={spec} onAction={onAction} content={content} />
  return <LegacySignUpAuthentication spec={spec} onAction={onAction} content={content} />
}

function ReferenceSignUpAuthentication({
  spec,
  onAction,
  content,
}: LumenAuthCompositionProps & { readonly content: LumenAuthSignUpContent }) {
  const flow = content.referenceFlow
  const fieldIdPrefix = useId()
  if (!flow) return null
  const nameId = `${fieldIdPrefix}-name`
  const emailId = `${fieldIdPrefix}-email`
  const passwordId = `${fieldIdPrefix}-password`
  const requirementsId = `${fieldIdPrefix}-requirements`
  const strength = Math.min(4, flow.requirementsMet.filter(Boolean).length)
  return (
    <AuthFrame
      spec={spec}
      onAction={onAction}
      className="hbar-app-ui-auth-sign-up-surface hbar-app-ui-auth-sign-up-reference"
    >
      <div className="hbar-app-ui-auth-centered hbar-app-ui-full-canvas-owner">
        <form
          className="hbar-app-ui-auth-sign-up-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            if (flow.canSubmit) onAction?.({ variantId: spec.id, actionId: 'create-account', value: flow.email })
          }}
        >
          <div className="hbar-app-ui-auth-sign-up-brand">{content.labels.brand.slice(0, 1)}</div>
          <h1>{content.labels.title}</h1>
          <p className="hbar-app-ui-auth-sign-up-description">{content.labels.description}</p>
          <div className="hbar-app-ui-auth-sign-up-fields">
            <div className="hbar-app-ui-auth-sign-up-field">
              <label htmlFor={nameId}>{content.labels.nameLabel}</label>
              <LumenInput
                id={nameId}
                variant="plain"
                autoComplete="name"
                value={flow.name}
                placeholder={content.labels.namePlaceholder}
                onChange={(event) => flow.onNameChange(event.currentTarget.value)}
              />
            </div>
            <div className="hbar-app-ui-auth-sign-up-field">
              <label htmlFor={emailId}>{content.labels.emailLabel}</label>
              <LumenInput
                id={emailId}
                variant="plain"
                type="email"
                autoComplete="email"
                aria-invalid={false}
                value={flow.email}
                placeholder={content.labels.emailPlaceholder}
                onChange={(event) => flow.onEmailChange(event.currentTarget.value)}
              />
              <p className="hbar-app-ui-auth-sign-up-helper">{content.labels.emailHelper}</p>
            </div>
            <div className="hbar-app-ui-auth-sign-up-field">
              <label htmlFor={passwordId}>{content.labels.passwordLabel}</label>
              <div className="hbar-app-ui-auth-sign-up-password-wrap">
                <LumenInput
                  id={passwordId}
                  variant="plain"
                  type={flow.visible ? 'text' : 'password'}
                  autoComplete="new-password"
                  aria-describedby={requirementsId}
                  value={flow.password}
                  placeholder={content.labels.passwordPlaceholder}
                  onChange={(event) => flow.onPasswordChange(event.currentTarget.value)}
                />
                <LumenButton
                  type="button"
                  indicator="none"
                  className="hbar-app-ui-auth-sign-up-reveal"
                  aria-label={flow.visible ? content.labels.hidePassword : content.labels.showPassword}
                  onClick={() => flow.onVisibleChange(!flow.visible)}
                >
                  <AuthIcon tier="sm">{flow.visible ? <EyeOff /> : <Eye />}</AuthIcon>
                </LumenButton>
              </div>
              <div className="hbar-app-ui-auth-sign-up-strength" aria-live="polite">
                <div className="hbar-app-ui-auth-sign-up-bars" aria-hidden="true">
                  {content.labels.requirements.map((label, index) => (
                    <span key={label} className={index < strength ? 'is-active' : ''} />
                  ))}
                </div>
                <span>{strength ? flow.labels.strength[strength - 1] : null}</span>
              </div>
              <ul className="hbar-app-ui-auth-sign-up-requirements" id={requirementsId}>
                {content.labels.requirements.map((label, index) => (
                  <li key={label} className={flow.requirementsMet[index] ? 'is-valid' : ''}>
                    <span className="hbar-app-ui-auth-sign-up-requirement-icon" aria-hidden="true">
                      {flow.requirementsMet[index] && <Check />}
                    </span>
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <label className="hbar-app-ui-auth-sign-up-agreement">
            <LumenCheckBoxControl
              checked={flow.agreed}
              onChange={(event) => flow.onAgreedChange(event.currentTarget.checked)}
            />
            <span>
              {content.labels.agreementPrefix}{' '}
              <span className="hbar-app-ui-auth-sign-up-agreement-emphasis">{content.labels.terms}</span>{' '}
              {content.labels.agreementJoin}{' '}
              <span className="hbar-app-ui-auth-sign-up-agreement-emphasis">{content.labels.privacy}</span>
              {flow.labels.agreementEnd}
            </span>
          </label>
          <LumenButton
            type="submit"
            indicator="none"
            className="hbar-app-ui-auth-sign-up-submit"
            disabled={!flow.canSubmit}
          >
            {content.labels.createAccount}
          </LumenButton>
        </form>
        <p className="hbar-app-ui-auth-sign-up-footer">
          {content.labels.existingAccount}{' '}
          <LumenButton
            type="button"
            indicator="none"
            onClick={() => onAction?.({ variantId: spec.id, actionId: 'sign-in' })}
          >
            {content.labels.signIn}
          </LumenButton>
        </p>
      </div>
    </AuthFrame>
  )
}

function LegacySignUpAuthentication({
  spec,
  onAction,
  content,
}: LumenAuthCompositionProps & { readonly content: LumenAuthSignUpContent }) {
  const [name, setName] = useState(content.initialName)
  const [email, setEmail] = useState(content.initialEmail)
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const checks = [password.length >= 10, /[A-Z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)]
  const canSubmit = name.trim().length > 1 && email.includes('@') && checks.every(Boolean) && agreed
  return (
    <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-sign-up-surface">
      <div className="hbar-app-ui-auth-centered">
        <AuthCard>
          <AuthBrand label={content.labels.brand} compact />
          <h1>{content.labels.title}</h1>
          <p>{content.labels.description}</p>
          <AuthField
            label={content.labels.nameLabel}
            placeholder={content.labels.namePlaceholder}
            value={name}
            onChange={setName}
          />
          <AuthField
            label={content.labels.emailLabel}
            placeholder={content.labels.emailPlaceholder}
            value={email}
            onChange={setEmail}
            helper={content.labels.emailHelper}
          />
          <div className="hbar-app-ui-auth-field">
            <span>{content.labels.passwordLabel}</span>
            <div className="hbar-app-ui-auth-input-wrap">
              <LumenInput
                type={visible ? 'text' : 'password'}
                placeholder={content.labels.passwordPlaceholder}
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
              />
              <AuthPasswordButton
                visible={visible}
                showLabel={content.labels.showPassword}
                hideLabel={content.labels.hidePassword}
                onToggle={() => setVisible((current) => !current)}
              />
            </div>
          </div>
          <div className="hbar-app-ui-auth-progress" aria-hidden="true">
            {checks.map((valid, index) => (
              <span className={valid ? 'is-active' : ''} key={`${index}-${valid}`} />
            ))}
          </div>
          <div className="hbar-app-ui-auth-requirements">
            {content.labels.requirements.map((label, index) => (
              <span className={`hbar-app-ui-auth-requirement ${checks[index] ? 'is-valid' : ''}`} key={label}>
                {checks[index] && <AuthCheck />}
                {label}
              </span>
            ))}
          </div>
          <div className="hbar-app-ui-auth-check">
            <label>
              <LumenCheckBoxControl checked={agreed} onChange={(event) => setAgreed(event.currentTarget.checked)} />
              <span>{content.labels.agreementPrefix}</span>
            </label>
            <span>
              <LumenButton
                type="button"
                className="hbar-app-ui-auth-inline-link"
                onClick={() => onAction?.({ variantId: spec.id, actionId: 'terms' })}
              >
                {content.labels.terms}
              </LumenButton>
              {content.labels.agreementJoin}
              <LumenButton
                type="button"
                className="hbar-app-ui-auth-inline-link"
                onClick={() =>
                  onAction?.({
                    variantId: spec.id,
                    actionId: 'privacy',
                  })
                }
              >
                {content.labels.privacy}
              </LumenButton>
            </span>
          </div>
          <AuthButton
            type="button"
            tone="accent"
            disabled={!canSubmit}
            onClick={() =>
              onAction?.({
                variantId: spec.id,
                actionId: 'create-account',
                value: email,
              })
            }
          >
            {content.labels.createAccount}
          </AuthButton>
        </AuthCard>
        <p className="hbar-app-ui-auth-footer-note">
          {content.labels.existingAccount}
          <LumenButton
            type="button"
            className="hbar-app-ui-auth-inline-link"
            onClick={() =>
              onAction?.({
                variantId: spec.id,
                actionId: 'sign-in',
              })
            }
          >
            {content.labels.signIn}
          </LumenButton>
        </p>
      </div>
    </AuthFrame>
  )
}
;('use client')
