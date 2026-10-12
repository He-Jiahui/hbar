'use client'

import * as React from 'react'
import { LumenInput } from '../forms'
import { LumenButton } from '../primitives'
import {
  type LumenAuthCompositionProps,
  AuthArrow,
  AuthBrand,
  AuthButton,
  AuthDivider,
  AuthFrame,
  AuthIconButton,
  AuthPasswordButton,
  AuthProviderIcon,
} from './primitives'
import {
  type LumenAuthQuote,
  type LumenAuthQuoteContent,
  type LumenAuthQuoteNavigationAction,
  uniqueLumenAuthItems,
} from './content'

type QuoteAuthenticationProps = LumenAuthCompositionProps & {
  readonly content: LumenAuthQuoteContent
}

interface QuoteAuthenticationViewProps {
  readonly spec: LumenAuthCompositionProps['spec']
  readonly content: LumenAuthQuoteContent
  readonly email: string
  readonly password: string
  readonly passwordVisible: boolean
  readonly quotes: readonly LumenAuthQuote[]
  readonly quote: LumenAuthQuote | undefined
  readonly onEmailChange: (value: string) => void
  readonly onPasswordChange: (value: string) => void
  readonly onPasswordVisibleChange: (visible: boolean) => void
  readonly onQuoteChange: (quoteId: string) => void
  readonly onSignInRequest: () => void
  readonly onProviderRequest: (providerId: string) => void
  readonly onNavigationRequest: (action: LumenAuthQuoteNavigationAction) => void
}

export function selectQuote(quotes: readonly LumenAuthQuote[], requestedId: string): LumenAuthQuote | undefined {
  return quotes.find((item) => item.id === requestedId) ?? quotes[0]
}

export function QuoteAuthentication(props: QuoteAuthenticationProps) {
  const { content } = props
  return content.referenceFlow ? (
    <QuoteAuthenticationReferenceOwner {...props} referenceFlow={content.referenceFlow} />
  ) : (
    <QuoteAuthenticationLegacyOwner {...props} />
  )
}

function QuoteAuthenticationLegacyOwner({ spec, onAction, content }: QuoteAuthenticationProps) {
  const [email, setEmail] = React.useState(content.initialEmail)
  const [password, setPassword] = React.useState('')
  const [passwordVisible, setPasswordVisible] = React.useState(false)
  const [quoteId, setQuoteId] = React.useState(content.initialQuoteId)
  const quotes = React.useMemo(() => uniqueLumenAuthItems(content.quotes), [content.quotes])
  const quote = selectQuote(quotes, quoteId)

  React.useEffect(() => {
    if (quotes.length < 2 || !Number.isFinite(content.autoAdvanceMs) || content.autoAdvanceMs <= 0) {
      return undefined
    }
    const interval = setInterval(() => {
      setQuoteId((current) => {
        const index = Math.max(
          0,
          quotes.findIndex((item) => item.id === current),
        )
        return quotes[(index + 1) % quotes.length]?.id ?? current
      })
    }, content.autoAdvanceMs)
    return () => clearInterval(interval)
  }, [content.autoAdvanceMs, quotes])

  return (
    <QuoteAuthenticationView
      spec={spec}
      content={content}
      email={email}
      password={password}
      passwordVisible={passwordVisible}
      quotes={quotes}
      quote={quote}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onPasswordVisibleChange={setPasswordVisible}
      onQuoteChange={setQuoteId}
      onSignInRequest={() => onAction?.({ variantId: spec.id, actionId: 'sign-in', value: email })}
      onProviderRequest={(providerId) => onAction?.({ variantId: spec.id, actionId: 'provider', value: providerId })}
      onNavigationRequest={(action) => onAction?.({ variantId: spec.id, actionId: action })}
    />
  )
}

function QuoteAuthenticationReferenceOwner({
  spec,
  content,
  referenceFlow,
}: QuoteAuthenticationProps & {
  readonly referenceFlow: NonNullable<LumenAuthQuoteContent['referenceFlow']>
}) {
  const quotes = React.useMemo(() => uniqueLumenAuthItems(content.quotes), [content.quotes])
  const quote = selectQuote(quotes, referenceFlow.quoteId ?? content.initialQuoteId)

  return (
    <QuoteAuthenticationView
      spec={spec}
      content={content}
      email={referenceFlow.email}
      password={referenceFlow.password}
      passwordVisible={referenceFlow.passwordVisible}
      quotes={quotes}
      quote={quote}
      onEmailChange={referenceFlow.onEmailChange}
      onPasswordChange={referenceFlow.onPasswordChange}
      onPasswordVisibleChange={referenceFlow.onPasswordVisibleChange}
      onQuoteChange={referenceFlow.onQuoteChange}
      onSignInRequest={() => referenceFlow.onSignInRequest({ email: referenceFlow.email, quoteId: quote?.id ?? null })}
      onProviderRequest={referenceFlow.onProviderRequest}
      onNavigationRequest={referenceFlow.onNavigationRequest}
    />
  )
}

function QuoteAuthenticationView({
  spec,
  content,
  email,
  password,
  passwordVisible,
  quotes,
  quote,
  onEmailChange,
  onPasswordChange,
  onPasswordVisibleChange,
  onQuoteChange,
  onSignInRequest,
  onProviderRequest,
  onNavigationRequest,
}: QuoteAuthenticationViewProps) {
  const emailId = React.useId()
  const passwordId = React.useId()

  const moveQuote = (direction: 1 | -1) => {
    if (!quotes.length) {
      return
    }
    const index = Math.max(
      0,
      quotes.findIndex((item) => item.id === quote?.id),
    )
    const next = quotes[(index + direction + quotes.length) % quotes.length]
    if (next) {
      onQuoteChange(next.id)
    }
  }

  return (
    <AuthFrame spec={spec} className="hbar-app-ui-auth-quote-surface">
      <div className="hbar-app-ui-auth-quote-layout" data-auth3-view="quote-authentication">
        <div className="hbar-app-ui-auth-quote-sign-in">
          <AuthBrand label={content.labels.brand} plain />
          <div className="hbar-app-ui-auth-quote-sign-in-center">
            <div className="hbar-app-ui-auth-quote-form-content">
              <h1>{content.labels.title}</h1>
              <p>{content.labels.description}</p>
              <form
                data-auth3-action="sign-in"
                onSubmit={(event) => {
                  event.preventDefault()
                  onSignInRequest()
                }}
              >
                <label htmlFor={emailId}>{content.labels.emailLabel}</label>
                <LumenInput
                  id={emailId}
                  data-auth3-field="email"
                  variant="plain"
                  type="email"
                  autoComplete="email"
                  value={email}
                  placeholder={content.labels.emailPlaceholder}
                  onChange={(event) => onEmailChange(event.currentTarget.value)}
                />
                <div className="hbar-app-ui-auth-quote-password-label">
                  <label htmlFor={passwordId}>{content.labels.passwordLabel}</label>
                  <LumenButton
                    type="button"
                    data-auth3-action="forgot-password"
                    indicator="none"
                    onClick={() => onNavigationRequest('forgot-password')}
                  >
                    {content.labels.forgotPassword}
                  </LumenButton>
                </div>
                <div className="hbar-app-ui-auth-quote-password-input" data-auth3-action="toggle-password">
                  <LumenInput
                    id={passwordId}
                    data-auth3-field="password"
                    variant="plain"
                    type={passwordVisible ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    placeholder={content.labels.passwordPlaceholder}
                    onChange={(event) => onPasswordChange(event.currentTarget.value)}
                  />
                  <AuthPasswordButton
                    visible={passwordVisible}
                    showLabel={content.labels.showPassword}
                    hideLabel={content.labels.hidePassword}
                    plain
                    onToggle={() => onPasswordVisibleChange(!passwordVisible)}
                  />
                </div>
                <AuthButton type="submit" tone="accent" indicator="none" data-auth3-action="sign-in">
                  {content.labels.signIn}
                </AuthButton>
              </form>
              <AuthDivider label={content.labels.divider} />
              <div
                className="hbar-app-ui-auth-provider-buttons"
                data-hbar-app-ui-list-strategy={content.providerListStrategy.kind}
                data-auth3-action="provider"
              >
                {uniqueLumenAuthItems(content.providers).map((provider) => (
                  <AuthButton
                    key={provider.id}
                    type="button"
                    indicator="none"
                    data-auth3-provider={provider.id}
                    onClick={() => onProviderRequest(provider.id)}
                  >
                    <AuthProviderIcon kind={provider.icon} />
                    <span>{provider.label}</span>
                  </AuthButton>
                ))}
              </div>
            </div>
          </div>
          <p className="hbar-app-ui-auth-quote-sign-in-footer">
            {content.labels.newAccount}
            {content.labels.inlineSeparator}
            <LumenButton
              type="button"
              data-auth3-action="create-account"
              indicator="none"
              onClick={() => onNavigationRequest('create-account')}
            >
              {content.labels.createAccount}
            </LumenButton>
          </p>
        </div>
        <aside className="hbar-app-ui-auth-quote-testimonial" data-auth3-quote-panel>
          <p className="hbar-app-ui-auth-quote-eyebrow">{content.labels.quoteEyebrow}</p>
          <div
            className="hbar-app-ui-auth-quote-testimonial-center"
            data-hbar-app-ui-list-strategy={content.quoteListStrategy.kind}
          >
            {quote ? (
              <div className="hbar-app-ui-auth-quote-testimonial-body" key={quote.id} data-auth3-quote={quote.id}>
                <blockquote>{quote.text}</blockquote>
                <div className="hbar-app-ui-auth-quote-byline">
                  <span className="hbar-app-ui-auth-avatar">{quote.initials}</span>
                  <div>
                    <p>{quote.name}</p>
                    <p>{quote.role}</p>
                  </div>
                </div>
                <div className="hbar-app-ui-auth-quote-metrics">
                  {quote.metrics.map((metric, index) => (
                    <div className="hbar-app-ui-auth-quote-metric" key={`${quote.id}-${index}`}>
                      <p>{metric.value}</p>
                      <p title={metric.label}>{metric.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p>{content.labels.emptyQuotes}</p>
            )}
          </div>
          {quote && (
            <div className="hbar-app-ui-auth-quote-carousel">
              <div className="hbar-app-ui-auth-quote-dots">
                {quotes.map((item) => (
                  <LumenButton
                    key={item.id}
                    type="button"
                    className={item.id === quote.id ? 'is-active' : undefined}
                    aria-label={content.labels.showQuote(item.name)}
                    aria-current={item.id === quote.id}
                    data-auth3-selected={item.id === quote.id ? 'true' : undefined}
                    data-auth3-action="select-quote"
                    data-auth3-quote={item.id}
                    onClick={() => onQuoteChange(item.id)}
                  />
                ))}
              </div>
              <div className="hbar-app-ui-auth-quote-arrows">
                <AuthIconButton
                  type="button"
                  label={content.labels.previousQuote}
                  indicator="none"
                  data-auth3-action="previous-quote"
                  onClick={() => moveQuote(-1)}
                >
                  <AuthArrow back />
                </AuthIconButton>
                <AuthIconButton
                  type="button"
                  label={content.labels.nextQuote}
                  indicator="none"
                  data-auth3-action="next-quote"
                  onClick={() => moveQuote(1)}
                >
                  <AuthArrow />
                </AuthIconButton>
              </div>
            </div>
          )}
        </aside>
      </div>
    </AuthFrame>
  )
}
