import {Check} from 'lucide-react'
import {useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiPaywallPlanContent} from './PaywallContent'
import {PaywallButton, PaywallFrame} from './PaywallPrimitives'

export function PlanComparisonPaywall({spec, onAction, content}: HbarAppUiVariantProps & {readonly content: HbarAppUiPaywallPlanContent}) {
    const {labels, plans} = content
    const [period, setPeriod] = useState(content.initialPeriod)
    return <PaywallFrame spec={spec} onAction={onAction} className="hbar-app-ui-paywall-plans-surface">
        <header className="hbar-app-ui-paywall-plans-head">
            <div><h2>{labels.title}</h2><p>{labels.description}</p></div>
            <div className="hbar-app-ui-paywall-period" role="group" aria-label={labels.billingPeriod}>
                <button type="button" className={period === 'monthly' ? 'is-selected' : ''} aria-pressed={period === 'monthly'} onClick={() => setPeriod('monthly')}>{labels.monthly}</button>
                <button type="button" className={period === 'yearly' ? 'is-selected' : ''} aria-pressed={period === 'yearly'} onClick={() => setPeriod('yearly')}>{labels.yearly}</button>
            </div>
        </header>
        <p className="hbar-app-ui-paywall-plans-note">{labels.yearlyNote}</p>
        <div className="hbar-app-ui-paywall-plan-list" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
            {plans.map((plan) => {
                const price = period === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice
                const actionLabel = plan.current ? labels.current : `${labels.choose} ${plan.name}`
                return <article className={`hbar-app-ui-paywall-plan${plan.featured ? ' is-featured' : ''}`} key={plan.id}>
                    <header className="hbar-app-ui-paywall-plan-head">
                        <div><span className="hbar-app-ui-paywall-plan-name">{plan.name}</span><p>{plan.description}</p></div>
                        {plan.current && <span className="hbar-app-ui-paywall-plan-badge">{labels.current}</span>}
                        {plan.featured && <span className="hbar-app-ui-paywall-plan-badge">{labels.recommended}</span>}
                    </header>
                    <div className="hbar-app-ui-paywall-plan-price"><strong>{price}</strong><span>{plan.priceSuffix}</span></div>
                    <ul className="hbar-app-ui-paywall-plan-features">
                        {plan.features.map((feature, index) => <li className="hbar-app-ui-paywall-plan-feature" key={`${index}-${feature}`}><Check className="hbar-app-ui-paywall-icon hbar-app-ui-icon-xs" aria-hidden="true" /><span>{feature}</span></li>)}
                    </ul>
                    <PaywallButton tone={plan.current ? 'neutral' : plan.featured ? 'accent' : 'neutral'} type="button" disabled={plan.current} onClick={() => onAction?.({variantId: spec.id, actionId: 'choose', value: plan.id})}>{actionLabel}</PaywallButton>
                </article>
            })}
        </div>
        <footer className="hbar-app-ui-paywall-plans-foot"><p>{labels.priceNote}</p><PaywallButton type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'compare'})}>{labels.compare}</PaywallButton></footer>
    </PaywallFrame>
}
