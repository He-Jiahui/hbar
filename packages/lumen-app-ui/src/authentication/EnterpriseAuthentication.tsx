import { ArrowRight, Building2, Clock3, KeyRound, ShieldCheck, Users } from './glyphs'
import { useId, useState } from 'react'
import { LumenButton } from '../primitives'
import { LumenInput } from '../forms'
import { type LumenAuthCompositionProps, AuthBrand, AuthButton, AuthField, AuthFrame, AuthIcon } from './primitives'
import { type LumenAuthEnterpriseContent } from './content'

export function EnterpriseAuthentication({
  spec,
  onAction,
  content,
}: LumenAuthCompositionProps & {
  readonly content: LumenAuthEnterpriseContent
}) {
  if (content.referenceFlow)
    return <ReferenceEnterpriseAuthentication spec={spec} onAction={onAction} content={content} />
  return <LegacyEnterpriseAuthentication spec={spec} onAction={onAction} content={content} />
}

function ReferenceEnterpriseAuthentication({
  spec,
  onAction,
  content,
}: LumenAuthCompositionProps & { readonly content: LumenAuthEnterpriseContent }) {
  const flow = content.referenceFlow
  const emailId = useId()
  if (!flow) return null
  const domain = flow.email.split('@')[1]?.trim().toLowerCase()
  const alternate = flow.alternateOrganizations.find((entry) => domain === entry.organization.domain.toLowerCase())
  const matched = domain === content.organization.domain.toLowerCase() || Boolean(alternate)
  const organization = alternate?.organization ?? content.organization
  const providerHint = alternate?.providerHint ?? content.labels.providerHint
  const securityChecks = alternate?.securityChecks ?? content.labels.securityChecks
  const lockedOut = alternate?.lockedOut ?? content.labels.lockedOut
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(flow.email)
  return (
    <AuthFrame
      spec={spec}
      onAction={onAction}
      className="hbar-app-ui-auth-enterprise-surface hbar-app-ui-auth-enterprise-reference"
    >
      <div className="hbar-app-ui-auth-enterprise-layout hbar-app-ui-full-canvas-owner">
        <div className="hbar-app-ui-auth-enterprise-left">
          <div className="hbar-app-ui-auth-enterprise-brand">
            <span>{content.labels.brand.slice(0, 1)}</span>
            {content.labels.brand}
          </div>
          <form
            className="hbar-app-ui-auth-enterprise-form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              if (validEmail && !flow.busy) flow.onContinue()
            }}
          >
            <h1>{content.labels.title}</h1>
            <p className="hbar-app-ui-auth-enterprise-description">{content.labels.description}</p>
            <div className="hbar-app-ui-auth-enterprise-field">
              <label htmlFor={emailId}>{content.labels.emailLabel}</label>
              <LumenInput
                id={emailId}
                variant="plain"
                type="email"
                autoComplete="email"
                value={flow.email}
                placeholder={content.labels.emailPlaceholder}
                onChange={(event) => flow.onEmailChange(event.currentTarget.value)}
              />
              <p>
                {matched ? providerHint : validEmail ? flow.labels.unmatchedHint(domain ?? '') : flow.labels.emptyHint}
              </p>
            </div>
            <div className="hbar-app-ui-auth-enterprise-actions">
              <LumenButton
                type="submit"
                indicator="none"
                className="hbar-app-ui-auth-enterprise-primary"
                disabled={!validEmail || flow.busy}
              >
                {flow.busy ? (
                  flow.labels.redirecting
                ) : (
                  <>
                    <AuthIcon tier="md">
                      <KeyRound />
                    </AuthIcon>
                    {matched ? content.labels.continueProvider(organization.provider) : flow.labels.continueUnmatched}
                    <AuthIcon tier="sm">
                      <ArrowRight />
                    </AuthIcon>
                  </>
                )}
              </LumenButton>
              <LumenButton
                type="button"
                indicator="none"
                className="hbar-app-ui-auth-enterprise-secondary"
                onClick={() => onAction?.({ variantId: spec.id, actionId: 'password' })}
              >
                {content.labels.passwordInstead}
              </LumenButton>
            </div>
            <p className="hbar-app-ui-auth-enterprise-audit">{content.labels.auditNote}</p>
          </form>
        </div>
        <aside className="hbar-app-ui-auth-enterprise-aside">
          <p className="hbar-app-ui-auth-enterprise-eyebrow">
            {matched ? content.labels.matchedOrganization : flow.labels.noMatch}
          </p>
          {matched ? (
            <>
              <div className="hbar-app-ui-auth-enterprise-org">
                <span className="hbar-app-ui-auth-enterprise-org-mark">
                  <AuthIcon tier="md">
                    <Building2 />
                  </AuthIcon>
                </span>
                <div>
                  <p>{organization.name}</p>
                  <p>{organization.domain}</p>
                </div>
              </div>
              <div className="hbar-app-ui-auth-enterprise-metrics">
                <div>
                  <span>
                    <AuthIcon tier="xs">
                      <Users />
                    </AuthIcon>
                    {content.labels.directory}
                  </span>
                  <p>{organization.memberCount}</p>
                </div>
                <div>
                  <span>
                    <AuthIcon tier="xs">
                      <KeyRound />
                    </AuthIcon>
                    {content.labels.provider}
                  </span>
                  <p>{organization.provider}</p>
                </div>
                <div>
                  <span>
                    <AuthIcon tier="xs">
                      <Clock3 />
                    </AuthIcon>
                    {content.labels.sessionLength}
                  </span>
                  <p>{organization.sessionLength}</p>
                </div>
              </div>
              <ul className="hbar-app-ui-auth-enterprise-security">
                {securityChecks.map((item) => (
                  <li key={item}>
                    <AuthIcon tier="xs">
                      <ShieldCheck />
                    </AuthIcon>
                    {item}
                  </li>
                ))}
              </ul>
              <p className="hbar-app-ui-auth-enterprise-locked">{lockedOut}</p>
            </>
          ) : (
            <div className="hbar-app-ui-auth-enterprise-unknown">
              <span className="hbar-app-ui-auth-enterprise-org-mark">
                <AuthIcon tier="md">
                  <Building2 />
                </AuthIcon>
              </span>
              <p>{flow.labels.lookupTitle}</p>
              <p>{flow.labels.lookupDescription}</p>
            </div>
          )}
        </aside>
      </div>
    </AuthFrame>
  )
}

function LegacyEnterpriseAuthentication({
  spec,
  onAction,
  content,
}: LumenAuthCompositionProps & { readonly content: LumenAuthEnterpriseContent }) {
  const [email, setEmail] = useState(content.email)
  const domain = email.split('@')[1]?.trim().toLowerCase()
  const detected = domain === content.organization.domain.toLowerCase()
  return (
    <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-enterprise-surface">
      <div className="hbar-app-ui-auth-organization-layout">
        <main>
          <AuthBrand label={content.labels.brand} />
          <div className="hbar-app-ui-auth-wide-content hbar-app-ui-auth-enterprise-main">
            <h1>{content.labels.title}</h1>
            <p>{content.labels.description}</p>
            <AuthField
              label={content.labels.emailLabel}
              placeholder={content.labels.emailPlaceholder}
              value={email}
              onChange={setEmail}
              helper={detected ? content.labels.providerHint : undefined}
            />
            <AuthButton
              type="button"
              tone="accent"
              disabled={!detected}
              onClick={() =>
                onAction?.({
                  variantId: spec.id,
                  actionId: 'continue-sso',
                  value: content.organization.provider,
                })
              }
            >
              <AuthIcon>
                <KeyRound />
              </AuthIcon>
              {content.labels.continueProvider(content.organization.provider)}
            </AuthButton>
            <AuthButton
              type="button"
              onClick={() =>
                onAction?.({
                  variantId: spec.id,
                  actionId: 'password',
                })
              }
            >
              {content.labels.passwordInstead}
            </AuthButton>
            <p className="hbar-app-ui-auth-footer-note">{content.labels.auditNote}</p>
          </div>
        </main>
        <aside>
          <span className="hbar-app-ui-auth-eyebrow">{content.labels.matchedOrganization}</span>
          <div className="hbar-app-ui-auth-org-header">
            <span className="hbar-app-ui-auth-org-mark">
              <Building2 />
            </span>
            <div>
              <strong>{content.organization.name}</strong>
              <small>{content.organization.domain}</small>
            </div>
          </div>
          <dl className="hbar-app-ui-auth-metrics">
            <div className="hbar-app-ui-auth-metric">
              <AuthIcon>
                <Users />
              </AuthIcon>
              <strong>{content.organization.memberCount}</strong>
              <small>{content.labels.directory}</small>
            </div>
            <div className="hbar-app-ui-auth-metric">
              <AuthIcon>
                <KeyRound />
              </AuthIcon>
              <strong>{content.organization.provider}</strong>
              <small>{content.labels.provider}</small>
            </div>
            <div className="hbar-app-ui-auth-metric">
              <AuthIcon>
                <Clock3 />
              </AuthIcon>
              <strong>{content.organization.sessionLength}</strong>
              <small>{content.labels.sessionLength}</small>
            </div>
          </dl>
          <ul className="hbar-app-ui-auth-security-card">
            {content.labels.securityChecks.map((item) => (
              <li key={item}>
                <AuthIcon tier="xs">
                  <ShieldCheck />
                </AuthIcon>
                {item}
              </li>
            ))}
          </ul>
          <p className="hbar-app-ui-auth-footer-note">{content.labels.lockedOut}</p>
        </aside>
      </div>
    </AuthFrame>
  )
}
;('use client')
