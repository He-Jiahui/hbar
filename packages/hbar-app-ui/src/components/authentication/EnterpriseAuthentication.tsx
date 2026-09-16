import {Building2, Clock3, KeyRound, ShieldCheck, Users} from 'lucide-react'
import {useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiAuthEnterpriseContent} from './AuthContent'
import {AuthBrand, AuthButton, AuthField, AuthFrame, AuthIcon} from './AuthPrimitives'

export function EnterpriseAuthentication({spec, onAction, content}: HbarAppUiVariantProps & {
    readonly content: HbarAppUiAuthEnterpriseContent
}) {
    const [email, setEmail] = useState(content.email)
    const domain = email.split('@')[1]?.trim().toLowerCase()
    const detected = domain === content.organization.domain.toLowerCase()
    return <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-enterprise-surface">
        <div className="hbar-app-ui-auth-organization-layout">
            <main><AuthBrand label={content.labels.brand}/>
                <div className="hbar-app-ui-auth-wide-content hbar-app-ui-auth-enterprise-main">
                    <h1>{content.labels.title}</h1><p>{content.labels.description}</p><AuthField
                    label={content.labels.emailLabel} placeholder={content.labels.emailPlaceholder} value={email}
                    onChange={setEmail} helper={detected ? content.labels.providerHint : undefined}/><AuthButton
                    type="button" tone="accent" disabled={!detected} onClick={() => onAction?.({
                    variantId: spec.id,
                    actionId: 'continue-sso',
                    value: content.organization.provider
                })}><AuthIcon><KeyRound/></AuthIcon>{content.labels.continueProvider(content.organization.provider)}
                </AuthButton><AuthButton type="button" onClick={() => onAction?.({
                    variantId: spec.id,
                    actionId: 'password'
                })}>{content.labels.passwordInstead}</AuthButton><p
                    className="hbar-app-ui-auth-footer-note">{content.labels.auditNote}</p></div>
            </main>
            <aside><span className="hbar-app-ui-auth-eyebrow">{content.labels.matchedOrganization}</span>
                <div className="hbar-app-ui-auth-org-header"><span
                    className="hbar-app-ui-auth-org-mark"><Building2/></span>
                    <div><strong>{content.organization.name}</strong><small>{content.organization.domain}</small></div>
                </div>
                <dl className="hbar-app-ui-auth-metrics">
                    <div className="hbar-app-ui-auth-metric">
                        <AuthIcon><Users/></AuthIcon><strong>{content.organization.memberCount}</strong><small>{content.labels.directory}</small>
                    </div>
                    <div className="hbar-app-ui-auth-metric">
                        <AuthIcon><KeyRound/></AuthIcon><strong>{content.organization.provider}</strong><small>{content.labels.provider}</small>
                    </div>
                    <div className="hbar-app-ui-auth-metric">
                        <AuthIcon><Clock3/></AuthIcon><strong>{content.organization.sessionLength}</strong><small>{content.labels.sessionLength}</small>
                    </div>
                </dl>
                <ul className="hbar-app-ui-auth-security-card">{content.labels.securityChecks.map((item) => <li
                    key={item}><AuthIcon tier="xs"><ShieldCheck/></AuthIcon>{item}</li>)}</ul>
                <p className="hbar-app-ui-auth-footer-note">{content.labels.lockedOut}</p></aside>
        </div>
    </AuthFrame>
}
