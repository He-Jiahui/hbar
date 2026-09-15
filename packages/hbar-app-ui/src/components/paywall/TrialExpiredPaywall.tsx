import {CreditCard} from 'lucide-react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiPaywallTrialContent} from './PaywallContent'
import {PaywallButton, PaywallFrame} from './PaywallPrimitives'

export function TrialExpiredPaywall({spec, onAction, content}: HbarAppUiVariantProps & {readonly content: HbarAppUiPaywallTrialContent}) {
    const {labels, rows} = content
    return <PaywallFrame spec={spec} onAction={onAction} className="hbar-app-ui-paywall-trial-surface">
        <section className="hbar-app-ui-paywall-trial-card">
            <p className="hbar-app-ui-paywall-eyebrow">{labels.eyebrow}</p>
            <h2>{labels.title}</h2>
            <p>{labels.description}</p>
            <div className="hbar-app-ui-paywall-trial-list" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
                {rows.map((row) => <div className="hbar-app-ui-paywall-trial-row" key={row.id}><span>{row.label}</span><strong>{row.value}</strong></div>)}
            </div>
            <section className="hbar-app-ui-paywall-payment">
                <CreditCard className="hbar-app-ui-paywall-icon hbar-app-ui-icon-sm" aria-hidden="true" />
                <div><strong>{labels.paymentTitle}</strong><small>{labels.paymentDescription}</small></div>
                <PaywallButton type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'change-payment'})}>{labels.change}</PaywallButton>
            </section>
            <PaywallButton tone="accent" type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'reactivate'})}>{labels.reactivate}</PaywallButton>
            <p className="hbar-app-ui-paywall-trial-note">{labels.renewalNote}</p>
        </section>
    </PaywallFrame>
}
