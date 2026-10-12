'use client'

import * as React from 'react'
import { Check, Eye, EyeOff, KeyRound, Laptop, Smartphone, X } from 'lucide-react'
import { LumenCheckBoxControl, LumenInput } from '../forms'
import { LumenButton } from '../primitives'
import { Laptop as LegacyLaptop, Smartphone as LegacySmartphone } from './glyphs'
import {
  type LumenAuthCompositionProps,
  AuthButton,
  AuthCard,
  AuthCheck,
  AuthField,
  AuthFrame,
  AuthIcon,
  AuthPasswordButton,
} from './primitives'
import { type LumenAuthPasswordResetContent, uniqueLumenAuthItems } from './content'

export function PasswordResetAuthentication({ spec, onAction, content }: PasswordResetAuthenticationProps) {
  if (content.referenceFlow) {
    return <ReferencePasswordResetAuthentication spec={spec} onAction={onAction} content={content} />
  }
  return <LegacyPasswordResetAuthentication spec={spec} onAction={onAction} content={content} />
}

export type PasswordResetAuthenticationProps = LumenAuthCompositionProps & {
  readonly content: LumenAuthPasswordResetContent
}

function ReferencePasswordResetAuthentication({ spec, onAction, content }: PasswordResetAuthenticationProps) {
  const flow = content.referenceFlow
  const newPasswordId = React.useId()
  const confirmPasswordId = React.useId()
  if (!flow) {
    return null
  }
  const devices = uniqueLumenAuthItems(content.devices)
  const checks = [
    flow.password.length >= 10,
    /[a-z]/.test(flow.password) && /[A-Z]/.test(flow.password),
    /\d/.test(flow.password),
    /[^A-Za-z0-9]/.test(flow.password),
  ]
  const strength = checks.filter(Boolean).length
  const matches = flow.confirmation.length > 0 && flow.password === flow.confirmation
  const mismatch = flow.confirmation.length > 0 && !matches
  const canSubmit = checks.every(Boolean) && matches
  return (
    <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-password-reset-reference">
      <div className="hbar-app-ui-auth-centered hbar-app-ui-full-canvas-owner">
        {flow.phase === 'success' ? (
          <AuthCard className="hbar-app-ui-auth-password-reset-reference-success">
            <span className="hbar-app-ui-auth-password-reset-reference-success-icon">
              <AuthIcon tier="xl">
                <Check />
              </AuthIcon>
            </span>
            <h1>{flow.labels.successTitle}</h1>
            <p>
              {flow.signOutOther
                ? flow.labels.successWithSignOut(devices.filter((device) => !device.current).length, flow.workspaceName)
                : flow.labels.successWithoutSignOut(flow.workspaceName)}
            </p>
            <LumenButton
              type="button"
              indicator="none"
              className="hbar-app-ui-auth-password-reset-reference-continue"
              onClick={() => onAction?.({ variantId: spec.id, actionId: 'continue' })}
            >
              {flow.labels.continueWith(flow.workspaceName)}
            </LumenButton>
            <LumenButton
              type="button"
              indicator="none"
              className="hbar-app-ui-auth-password-reset-reference-different"
              onClick={flow.onSetDifferent}
            >
              {flow.labels.setDifferent}
            </LumenButton>
          </AuthCard>
        ) : (
          <AuthCard className="hbar-app-ui-auth-password-reset-reference-card">
            <span className="hbar-app-ui-auth-password-reset-reference-emblem">
              <AuthIcon tier="md">
                <KeyRound />
              </AuthIcon>
            </span>
            <h1>{content.labels.title}</h1>
            <p className="hbar-app-ui-auth-password-reset-reference-description">
              {flow.labels.descriptionBeforeEmail}
              <span className="is-emphasized">{content.email}</span>
              {flow.labels.descriptionAfterEmail}
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                if (canSubmit) {
                  flow.onSubmit()
                }
              }}
            >
              <div className="hbar-app-ui-auth-password-reset-reference-field">
                <label htmlFor={newPasswordId}>{content.labels.newPassword}</label>
                <span className="hbar-app-ui-auth-password-reset-reference-input-wrap">
                  <LumenInput
                    id={newPasswordId}
                    type={flow.passwordVisible ? 'text' : 'password'}
                    value={flow.password}
                    placeholder={content.labels.newPasswordPlaceholder}
                    onChange={(event) => flow.onPasswordChange(event.currentTarget.value)}
                  />
                  <LumenButton
                    type="button"
                    indicator="none"
                    aria-label={flow.passwordVisible ? content.labels.hidePassword : content.labels.showPassword}
                    onClick={flow.onTogglePassword}
                  >
                    <AuthIcon tier="sm">{flow.passwordVisible ? <EyeOff /> : <Eye />}</AuthIcon>
                  </LumenButton>
                </span>
              </div>
              <div
                className={`hbar-app-ui-auth-password-reset-reference-progress ${flow.password ? 'has-strength' : ''}`}
              >
                <span aria-hidden="true">
                  {checks.map((_, index) => (
                    <i className={index < strength ? 'is-active' : ''} key={index} />
                  ))}
                </span>
                <small>{flow.password ? flow.labels.strength[Math.max(0, strength - 1)] : null}</small>
              </div>
              <ul className="hbar-app-ui-auth-password-reset-reference-requirements">
                {content.labels.requirements.map((label, index) => (
                  <li className={checks[index] ? 'is-valid' : ''} key={label}>
                    <span aria-hidden="true">{checks[index] && <Check />}</span>
                    {label}
                  </li>
                ))}
              </ul>
              <div className="hbar-app-ui-auth-password-reset-reference-field hbar-app-ui-auth-password-reset-reference-confirm">
                <label htmlFor={confirmPasswordId}>{content.labels.confirmPassword}</label>
                <span
                  className={`hbar-app-ui-auth-password-reset-reference-input-wrap ${mismatch ? 'is-mismatch' : ''}`}
                >
                  <LumenInput
                    id={confirmPasswordId}
                    type="password"
                    value={flow.confirmation}
                    aria-invalid={mismatch || undefined}
                    placeholder={content.labels.confirmPlaceholder}
                    onChange={(event) => flow.onConfirmationChange(event.currentTarget.value)}
                  />
                  {(matches || mismatch) && <AuthIcon tier="sm">{matches ? <Check /> : <X />}</AuthIcon>}
                </span>
                <p className={mismatch ? 'is-mismatch' : ''}>
                  {mismatch ? flow.labels.mismatchHelper : content.labels.confirmHelper}
                </p>
              </div>
              <label className="hbar-app-ui-auth-password-reset-reference-signout">
                <LumenInput
                  type="checkbox"
                  checked={flow.signOutOther}
                  onChange={(event) => flow.onSignOutOtherChange(event.currentTarget.checked)}
                />
                {content.labels.signOutOther}
              </label>
              <div
                className="hbar-app-ui-auth-password-reset-reference-devices"
                data-hbar-app-ui-list-strategy={content.listStrategy.kind}
              >
                {devices.map((device) => (
                  <div
                    className="hbar-app-ui-auth-reset-device hbar-app-ui-auth-password-reset-reference-device"
                    key={device.id}
                  >
                    <AuthIcon tier="sm">{device.icon === 'phone' ? <Smartphone /> : <Laptop />}</AuthIcon>
                    <span>
                      <span>{device.name}</span>
                      <small>{device.detail}</small>
                    </span>
                    <small>
                      {device.current
                        ? content.labels.thisDevice
                        : flow.signOutOther
                          ? content.labels.ends
                          : flow.labels.stays}
                    </small>
                  </div>
                ))}
                {!devices.length && (
                  <p className="hbar-app-ui-auth-password-reset-reference-empty">{content.labels.emptyDevices}</p>
                )}
              </div>
              <LumenButton
                type="submit"
                indicator="none"
                className="hbar-app-ui-auth-password-reset-reference-submit"
                disabled={!canSubmit}
              >
                {content.labels.update}
              </LumenButton>
            </form>
          </AuthCard>
        )}
      </div>
    </AuthFrame>
  )
}

function LegacyPasswordResetAuthentication({ spec, onAction, content }: PasswordResetAuthenticationProps) {
  const [password, setPassword] = React.useState(content.initialPassword)
  const [confirmation, setConfirmation] = React.useState('')
  const [visible, setVisible] = React.useState(false)
  const [signOutOther, setSignOutOther] = React.useState(true)
  const checks = [
    password.length >= 10,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ]
  const canSubmit = checks.every(Boolean) && password === confirmation
  const devices = React.useMemo(() => uniqueLumenAuthItems(content.devices), [content.devices])
  return (
    <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-password-reset-surface">
      <div className="hbar-app-ui-auth-centered">
        <AuthCard className="hbar-app-ui-auth-reset-card">
          <AuthIcon tier="lg">
            <AuthCheck />
          </AuthIcon>
          <h1>{content.labels.title}</h1>
          <p>{content.labels.description(content.email)}</p>
          <div className="hbar-app-ui-auth-field">
            <span>{content.labels.newPassword}</span>
            <div className="hbar-app-ui-auth-input-wrap">
              <LumenInput
                type={visible ? 'text' : 'password'}
                placeholder={content.labels.newPasswordPlaceholder}
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
          <AuthField
            label={content.labels.confirmPassword}
            placeholder={content.labels.confirmPlaceholder}
            value={confirmation}
            onChange={setConfirmation}
            helper={content.labels.confirmHelper}
          />
          <label className="hbar-app-ui-auth-check">
            <LumenCheckBoxControl
              checked={signOutOther}
              onChange={(event) => setSignOutOther(event.currentTarget.checked)}
            />
            {content.labels.signOutOther}
          </label>
          <div
            className={`hbar-app-ui-auth-reset-devices ${content.listStrategy.kind === 'pane-scroll' ? 'hbar-app-ui-auth-list-scroll' : ''}`}
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          >
            {devices.map((device) => (
              <div className="hbar-app-ui-auth-reset-device" key={device.id}>
                <AuthIcon>{device.icon === 'phone' ? <LegacySmartphone /> : <LegacyLaptop />}</AuthIcon>
                <div>
                  <strong>{device.name}</strong>
                  <small>{device.detail}</small>
                </div>
                <span>{device.current ? content.labels.thisDevice : content.labels.ends}</span>
              </div>
            ))}
            {!devices.length && <p className="hbar-app-ui-auth-empty">{content.labels.emptyDevices}</p>}
          </div>
          <AuthButton
            type="button"
            tone="accent"
            disabled={!canSubmit}
            onClick={() =>
              onAction?.({
                variantId: spec.id,
                actionId: 'update-password',
                value: signOutOther ? 'all-devices' : 'current-device',
              })
            }
          >
            {content.labels.update}
          </AuthButton>
        </AuthCard>
      </div>
    </AuthFrame>
  )
}
