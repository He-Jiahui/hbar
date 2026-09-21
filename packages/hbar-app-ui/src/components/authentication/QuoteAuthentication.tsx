import { LumenButton, LumenInput } from '@lumen/app-ui'
import {useMemo, useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import {type HbarAppUiAuthQuoteContent, uniqueHbarAppUiAuthItems} from './AuthContent'
import {
    AuthBrand,
    AuthButton,
    AuthCard,
    AuthDivider,
    AuthField,
    AuthFrame,
    AuthPasswordButton,
    AuthProviderButtons
} from './AuthPrimitives'

export function QuoteAuthentication({spec, onAction, content}: HbarAppUiVariantProps & {
    readonly content: HbarAppUiAuthQuoteContent
}) {
    const [email, setEmail] = useState(content.initialEmail)
    const [password, setPassword] = useState('')
    const [visible, setVisible] = useState(false)
    const [quoteId, setQuoteId] = useState(content.initialQuoteId)
    const quotes = useMemo(() => uniqueHbarAppUiAuthItems(content.quotes), [content.quotes])
    const quote = useMemo(() => quotes.find((item) => item.id === quoteId) ?? quotes[0], [quoteId, quotes])
    const moveQuote = (direction: 1 | -1) => {
        if (!quotes.length) return
        const index = Math.max(0, quotes.findIndex((item) => item.id === quote?.id))
        const next = quotes[(index + direction + quotes.length) % quotes.length]
        if (next) setQuoteId(next.id)
    }
    return <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-quote-surface">
        <div className="hbar-app-ui-auth-split">
            <main><AuthBrand label={content.labels.brand}/><AuthCard className="hbar-app-ui-auth-transparent-card">
                <h1>{content.labels.title}</h1><p>{content.labels.description}</p>
                <AuthField label={content.labels.emailLabel} placeholder={content.labels.emailPlaceholder} value={email}
                           onChange={setEmail}/>
                <div className="hbar-app-ui-auth-field">
                    <div className="hbar-app-ui-auth-help-row"><span>{content.labels.passwordLabel}</span>
                        <LumenButton type="button" onClick={() => onAction?.({
                            variantId: spec.id,
                            actionId: 'forgot-password'
                        })}>{content.labels.forgotPassword}</LumenButton>
                    </div>
                    <div className="hbar-app-ui-auth-input-wrap"><LumenInput type={visible ? 'text' : 'password'}
                                                                        value={password}
                                                                        placeholder={content.labels.passwordPlaceholder}
                                                                        onChange={(event) => setPassword(event.currentTarget.value)}/><AuthPasswordButton
                        visible={visible} showLabel={content.labels.showPassword}
                        hideLabel={content.labels.hidePassword} onToggle={() => setVisible((current) => !current)}/>
                    </div>
                </div>
                <AuthButton type="button" tone="accent" onClick={() => onAction?.({
                    variantId: spec.id,
                    actionId: 'sign-in',
                    value: email
                })}>{content.labels.signIn}</AuthButton>
                <AuthDivider label={content.labels.divider}/><AuthProviderButtons providers={content.providers}
                                                                                  listStrategy={content.providerListStrategy}
                                                                                  onSelect={(provider) => onAction?.({
                                                                                      variantId: spec.id,
                                                                                      actionId: 'provider',
                                                                                      value: provider.id
                                                                                  })}/>
            </AuthCard>
                <p className="hbar-app-ui-auth-footer-note">{content.labels.newAccount}
                    <LumenButton type="button" className="hbar-app-ui-auth-inline-link" onClick={() => onAction?.({
                        variantId: spec.id,
                        actionId: 'create-account'
                    })}>{content.labels.createAccount}</LumenButton>
                </p>
            </main>
            <aside><span className="hbar-app-ui-auth-eyebrow">{content.labels.quoteEyebrow}</span>{quote &&
                <div className="hbar-app-ui-auth-quote" data-hbar-app-ui-list-strategy={content.quoteListStrategy.kind}>
                    <blockquote>{quote.text}</blockquote>
                    <div className="hbar-app-ui-auth-quote-byline"><span
                        className="hbar-app-ui-auth-avatar">{quote.initials}</span>
                        <div><strong>{quote.name}</strong><small>{quote.role}</small></div>
                    </div>
                    <div className="hbar-app-ui-auth-metrics">{quote.metrics.map((metric) => <div
                        className="hbar-app-ui-auth-metric" key={`${metric.label}-${metric.value}`}>
                        <strong>{metric.value}</strong><small>{metric.label}</small></div>)}</div>
                    <div className="hbar-app-ui-auth-inline-actions">
                        <LumenButton type="button" className="hbar-app-ui-auth-inline-link"
                                aria-label={content.labels.previousQuote}
                                onClick={() => moveQuote(-1)}>{content.labels.previousQuote}</LumenButton>
                        <LumenButton type="button" className="hbar-app-ui-auth-inline-link"
                                aria-label={content.labels.nextQuote}
                                onClick={() => moveQuote(1)}>{content.labels.nextQuote}</LumenButton>
                    </div>
                </div>}</aside>
        </div>
    </AuthFrame>
}
