import {CircleAlert} from 'lucide-react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiPaywallUsageContent} from './PaywallContent'
import {PaywallButton, PaywallFrame, PaywallIcon} from './PaywallPrimitives'

export function UsageLimitPaywall({spec, onAction, content}: HbarAppUiVariantProps & {readonly content: HbarAppUiPaywallUsageContent}) {
    const {labels, meters} = content
    return <PaywallFrame spec={spec} onAction={onAction} className="hbar-app-ui-paywall-limit-surface">
        <section className="hbar-app-ui-paywall-limit">
            <header className="hbar-app-ui-paywall-limit-head">
                <PaywallIcon label={labels.title} tier="md"><CircleAlert /></PaywallIcon>
                <div><h2>{labels.title}</h2><p>{labels.description}</p></div>
            </header>
            <div className="hbar-app-ui-paywall-meter-list" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
                {meters.map((meter) => <div className="hbar-app-ui-paywall-meter" key={meter.id}>
                    <div className="hbar-app-ui-paywall-meter-head"><strong>{meter.label}</strong><span>{meter.value}</span></div>
                    <div className="hbar-app-ui-paywall-meter-track" role="progressbar" aria-label={meter.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, meter.progress))}><span style={{inlineSize: `${Math.max(0, Math.min(100, meter.progress))}%`}} /></div>
                </div>)}
            </div>
            <section className="hbar-app-ui-paywall-limit-card">
                <strong>{labels.proTitle}</strong><p>{labels.proDescription}</p>
                <div className="hbar-app-ui-paywall-limit-actions"><PaywallButton type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'top-up'})}>{labels.topUp}</PaywallButton><PaywallButton tone="accent" type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'upgrade'})}>{labels.upgrade}</PaywallButton></div>
            </section>
        </section>
    </PaywallFrame>
}
