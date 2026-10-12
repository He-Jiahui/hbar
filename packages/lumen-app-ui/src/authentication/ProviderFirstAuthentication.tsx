'use client'

import * as React from 'react'
import { LumenInput } from '../forms'
import { LumenButton } from '../primitives'
import {
  type LumenAuthProviderFirstContent,
  type LumenAuthProviderFirstContinuationRequest,
  type LumenAuthProviderFirstMode,
  type LumenAuthProviderFirstReferenceFlow,
} from './content'
import {
  type LumenAuthCompositionProps,
  AuthArrow,
  AuthBrand,
  AuthButton,
  AuthDivider,
  AuthFrame,
  AuthIcon,
  AuthProviderButtons,
} from './primitives'
import { KeyRound } from './glyphs'

export function canContinueProviderFirst(value: string, isSso: boolean): boolean {
  return isSso ? value.trim().length > 0 : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())
}

type ProviderFirstViewProps = Pick<LumenAuthCompositionProps, 'spec'> & {
  readonly content: LumenAuthProviderFirstContent
  readonly mode: LumenAuthProviderFirstMode
  readonly email: string
  readonly domain: string
  readonly onEmailChange: (value: string) => void
  readonly onDomainChange: (value: string) => void
  readonly onModeChange: (mode: LumenAuthProviderFirstMode) => void
  readonly onContinueRequest: (request: LumenAuthProviderFirstContinuationRequest) => void
  readonly onProviderRequest: (providerId: string) => void
  readonly onNavigationRequest: (action: 'create-account' | 'terms' | 'privacy') => void
}

function ProviderFirstView({
  spec,
  content,
  mode,
  email,
  domain,
  onEmailChange,
  onDomainChange,
  onModeChange,
  onContinueRequest,
  onProviderRequest,
  onNavigationRequest,
}: ProviderFirstViewProps) {
  const fieldId = React.useId()
  const isSso = mode === 'sso'
  const draft = isSso ? domain : email
  const isProviderScrollRegion = content.providerListStrategy.kind === 'pane-scroll'
  const providerScrollLimit = Math.max(1, content.providerListStrategy.expectedMaximum) * 3

  return (
    <AuthFrame spec={spec} className="hbar-app-ui-auth-provider-first-surface">
      <div className="hbar-app-ui-auth-wide-shell" data-auth2-mode={mode}>
        <header className="hbar-app-ui-auth-top-bar">
          <AuthBrand label={content.labels.brand} plain />
          <AuthButton
            type="button"
            indicator="none"
            data-auth2-action="create-account"
            onClick={() => onNavigationRequest('create-account')}
          >
            {content.labels.createAccount}
          </AuthButton>
        </header>
        <div className="hbar-app-ui-auth-wide-main">
          <div className="hbar-app-ui-auth-wide-content">
            <h1>{content.labels.title}</h1>
            <p>{content.labels.description}</p>
            <div
              className={`hbar-app-ui-auth-single-actions${isProviderScrollRegion ? ' is-scrollable' : ''}`}
              data-auth2-action="provider-group"
              data-auth2-provider-list={content.providerListStrategy.kind}
              role={isProviderScrollRegion ? 'region' : undefined}
              tabIndex={isProviderScrollRegion ? 0 : undefined}
              aria-label={isProviderScrollRegion ? content.providerListLabel : undefined}
              style={isProviderScrollRegion ? { maxBlockSize: `${providerScrollLimit}rem` } : undefined}
            >
              <AuthProviderButtons
                providers={content.socialProviders}
                listStrategy={content.providerListStrategy}
                indicator="none"
                onSelect={(item) => onProviderRequest(item.id)}
              />
            </div>
            <AuthDivider label={content.labels.divider} />
            <form
              className="hbar-app-ui-auth-provider-first-form"
              data-auth2-mode={mode}
              onSubmit={(event) => {
                event.preventDefault()
                if (!canContinueProviderFirst(draft, isSso)) {
                  return
                }
                onContinueRequest({
                  mode,
                  providerId: isSso ? content.ssoProviderId : content.emailProviderId,
                  draft,
                })
              }}
            >
              <div className="hbar-app-ui-auth-provider-first-label-row">
                <label htmlFor={fieldId}>{isSso ? content.labels.ssoLabel : content.labels.emailLabel}</label>
                <LumenButton
                  type="button"
                  indicator="none"
                  data-auth2-action="toggle-mode"
                  onClick={() => onModeChange(isSso ? 'email' : 'sso')}
                >
                  <AuthIcon tier="sm">
                    <KeyRound />
                  </AuthIcon>
                  {isSso ? content.labels.useEmailInstead : content.labels.singleSignOn}
                </LumenButton>
              </div>
              <div className="hbar-app-ui-auth-provider-first-input">
                <LumenInput
                  id={fieldId}
                  data-auth2-draft={isSso ? 'domain' : 'email'}
                  variant="plain"
                  type={isSso ? 'text' : 'email'}
                  autoComplete={isSso ? 'organization' : 'email'}
                  placeholder={isSso ? content.labels.ssoPlaceholder : content.labels.emailPlaceholder}
                  value={draft}
                  onChange={(event) => (isSso ? onDomainChange : onEmailChange)(event.currentTarget.value)}
                />
                {isSso && <span className="hbar-app-ui-auth-provider-first-suffix">{content.labels.ssoSuffix}</span>}
              </div>
              <p className="hbar-app-ui-auth-provider-first-helper">
                {isSso ? content.labels.ssoHelper : content.labels.helper}
              </p>
              <AuthButton
                type="submit"
                tone="accent"
                indicator="none"
                data-auth2-action="continue"
                disabled={!canContinueProviderFirst(draft, isSso)}
              >
                {content.labels.continueLabel}
                <AuthArrow />
              </AuthButton>
            </form>
            <p className="hbar-app-ui-auth-footer-note">
              {content.labels.termsPrefix}
              {content.labels.inlineSeparator}
              <LumenButton
                type="button"
                indicator="none"
                className="hbar-app-ui-auth-inline-link"
                data-auth2-action="terms"
                onClick={() => onNavigationRequest('terms')}
              >
                {content.labels.terms}
              </LumenButton>
              {content.labels.inlineSeparator}
              {content.labels.privacyPrefix}
              {content.labels.inlineSeparator}
              <LumenButton
                type="button"
                indicator="none"
                className="hbar-app-ui-auth-inline-link"
                data-auth2-action="privacy"
                onClick={() => onNavigationRequest('privacy')}
              >
                {content.labels.privacy}
              </LumenButton>
              {content.labels.termsSuffix}
            </p>
          </div>
        </div>
        <footer className="hbar-app-ui-auth-help-row hbar-app-ui-auth-header-bar">
          <span>{content.labels.trouble}</span>
          <span className="hbar-app-ui-auth-status">
            <i aria-hidden="true" />
            {content.labels.systemNormal}
          </span>
        </footer>
      </div>
    </AuthFrame>
  )
}

function ControlledProviderFirstAuthentication({
  spec,
  content,
  flow,
}: Pick<LumenAuthCompositionProps, 'spec'> & {
  readonly content: LumenAuthProviderFirstContent
  readonly flow: LumenAuthProviderFirstReferenceFlow
}) {
  return (
    <ProviderFirstView
      spec={spec}
      content={content}
      mode={flow.mode}
      email={flow.email}
      domain={flow.domain}
      onEmailChange={flow.onEmailChange}
      onDomainChange={flow.onDomainChange}
      onModeChange={flow.onModeChange}
      onContinueRequest={flow.onContinueRequest}
      onProviderRequest={flow.onProviderRequest}
      onNavigationRequest={flow.onNavigationRequest}
    />
  )
}

function UncontrolledProviderFirstAuthentication({
  spec,
  onAction,
  content,
}: LumenAuthCompositionProps & {
  readonly content: LumenAuthProviderFirstContent
}) {
  const [mode, setMode] = React.useState<LumenAuthProviderFirstMode>(
    content.initialProviderId === content.ssoProviderId ? 'sso' : 'email',
  )
  const [email, setEmail] = React.useState('')
  const [domain, setDomain] = React.useState('')

  return (
    <ProviderFirstView
      spec={spec}
      content={content}
      mode={mode}
      email={email}
      domain={domain}
      onEmailChange={setEmail}
      onDomainChange={setDomain}
      onModeChange={(nextMode) => {
        setMode(nextMode)
        onAction?.({
          variantId: spec.id,
          actionId: 'toggle-provider',
          value: nextMode === 'sso' ? content.ssoProviderId : content.emailProviderId,
        })
      }}
      onContinueRequest={({ providerId }) =>
        onAction?.({ variantId: spec.id, actionId: 'continue', value: providerId })
      }
      onProviderRequest={(providerId) => onAction?.({ variantId: spec.id, actionId: 'provider', value: providerId })}
      onNavigationRequest={(actionId) => onAction?.({ variantId: spec.id, actionId })}
    />
  )
}

export function ProviderFirstAuthentication({
  spec,
  onAction,
  content,
}: LumenAuthCompositionProps & {
  readonly content: LumenAuthProviderFirstContent
}) {
  const flow = content.referenceFlow
  if (flow) {
    return <ControlledProviderFirstAuthentication spec={spec} content={content} flow={flow} />
  }
  return <UncontrolledProviderFirstAuthentication spec={spec} onAction={onAction} content={content} />
}
