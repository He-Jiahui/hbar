import {Check, Sparkles, X} from 'lucide-react'
import {useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiPaywallFeatureGateContent} from './PaywallContent'
import {PaywallButton, PaywallFrame, PaywallIcon} from './PaywallPrimitives'

export function FeatureGatePaywall({spec, onAction, content}: HbarAppUiVariantProps & {readonly content: HbarAppUiPaywallFeatureGateContent}) {
    const {labels, features} = content
    const [open, setOpen] = useState(true)
    const close = () => {
        setOpen(false)
        onAction?.({variantId: spec.id, actionId: 'dismiss'})
    }
    return <PaywallFrame spec={spec} onAction={onAction} className="hbar-app-ui-paywall-feature-gate-surface">
        {open && <section className="hbar-app-ui-paywall-feature-gate" role="dialog" aria-label={labels.title}>
            <div className="hbar-app-ui-paywall-feature-card">
                <header className="hbar-app-ui-paywall-feature-head">
                    <PaywallIcon label={labels.seeIncluded} tier="md"><Sparkles /></PaywallIcon>
                    <div><h2>{labels.title}</h2><p>{labels.description}</p></div>
                    <PaywallButton type="button" aria-label={labels.dismiss} onClick={close}><X /></PaywallButton>
                </header>
                <ul className="hbar-app-ui-paywall-feature-list" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
                    {features.map((feature) => <li className="hbar-app-ui-paywall-feature-row" key={feature.id}>
                        <Check className="hbar-app-ui-paywall-icon hbar-app-ui-icon-sm" aria-hidden="true" />
                        <div><p>{feature.title}</p><p>{feature.description}</p></div>
                    </li>)}
                </ul>
                <footer className="hbar-app-ui-paywall-feature-footer">
                    <p>{labels.price}</p>
                    <div className="hbar-app-ui-paywall-feature-actions">
                        <PaywallButton type="button" onClick={close}>{labels.defer}</PaywallButton>
                        <PaywallButton tone="accent" type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'upgrade'})}>{labels.upgrade}</PaywallButton>
                    </div>
                </footer>
            </div>
        </section>}
    </PaywallFrame>
}
