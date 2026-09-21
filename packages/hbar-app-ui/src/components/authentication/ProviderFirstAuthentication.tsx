import { LumenButton } from '@lumen/app-ui'
import {useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiAuthProviderFirstContent} from './AuthContent'
import {AuthBrand, AuthButton, AuthDivider, AuthField, AuthFrame, AuthProviderButtons} from './AuthPrimitives'

export function ProviderFirstAuthentication({spec, onAction, content}: HbarAppUiVariantProps & {
    readonly content: HbarAppUiAuthProviderFirstContent
}) {
    const [providerId, setProviderId] = useState(content.initialProviderId)
    const [email, setEmail] = useState('')
    const provider = content.socialProviders.find((item) => item.id === providerId)
        ?? (providerId === content.emailProviderId ? {
            id: content.emailProviderId,
            label: content.labels.emailLabel
        } : undefined)
        ?? (providerId === content.ssoProviderId ? {
            id: content.ssoProviderId,
            label: content.labels.ssoLabel
        } : undefined)
    const isSso = providerId === content.ssoProviderId
    return <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-provider-first-surface">
        <div className="hbar-app-ui-auth-wide-shell">
            <header className="hbar-app-ui-auth-top-bar"><AuthBrand label={content.labels.brand}/><AuthButton
                type="button" onClick={() => onAction?.({
                variantId: spec.id,
                actionId: 'create-account'
            })}>{content.labels.createAccount}</AuthButton></header>
            <main className="hbar-app-ui-auth-wide-main">
                <div className="hbar-app-ui-auth-wide-content">
                    <h1>{content.labels.title}</h1><p>{content.labels.description}</p>
                    <div className="hbar-app-ui-auth-single-actions"><AuthProviderButtons
                        providers={content.socialProviders} listStrategy={content.providerListStrategy}
                        onSelect={(item) => {
                            setProviderId(item.id);
                            onAction?.({variantId: spec.id, actionId: 'provider', value: item.id})
                        }}/></div>
                    <AuthDivider label={content.labels.divider}/>
                    <div className="hbar-app-ui-auth-help-row">
                        <span>{isSso ? content.labels.ssoLabel : content.labels.emailLabel}</span>
                        <LumenButton type="button" onClick={() => {
                            const next = isSso ? content.emailProviderId : content.ssoProviderId;
                            setProviderId(next);
                            onAction?.({variantId: spec.id, actionId: 'toggle-provider', value: next})
                        }}>{isSso ? content.labels.emailLabel : content.labels.singleSignOn}</LumenButton>
                    </div>
                    <AuthField label={isSso ? content.labels.ssoLabel : content.labels.emailLabel}
                               placeholder={isSso ? content.labels.ssoPlaceholder : content.labels.emailPlaceholder}
                               value={email} onChange={setEmail} helper={content.labels.helper}/>
                    <AuthButton type="button" tone="accent" disabled={!email.trim()} onClick={() => onAction?.({
                        variantId: spec.id,
                        actionId: 'continue',
                        value: provider?.id ?? providerId
                    })}>{content.labels.continueLabel}</AuthButton>
                    <p className="hbar-app-ui-auth-footer-note">{content.labels.termsPrefix}
                        <LumenButton type="button" className="hbar-app-ui-auth-inline-link" onClick={() => onAction?.({
                            variantId: spec.id,
                            actionId: 'terms'
                        })}>{content.labels.terms}</LumenButton>
                        {content.labels.privacyPrefix}
                        <LumenButton type="button" className="hbar-app-ui-auth-inline-link" onClick={() => onAction?.({
                            variantId: spec.id,
                            actionId: 'privacy'
                        })}>{content.labels.privacy}</LumenButton>
                    </p>
                </div>
            </main>
            <footer className="hbar-app-ui-auth-help-row hbar-app-ui-auth-header-bar">
                <span>{content.labels.trouble}</span><span className="hbar-app-ui-auth-status"><i
                aria-hidden="true"/>{content.labels.systemNormal}</span></footer>
        </div>
    </AuthFrame>
}
