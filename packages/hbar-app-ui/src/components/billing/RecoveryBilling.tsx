import { LumenButton } from '@lumen/app-ui'
import {ChevronDown, Download, ListFilter, RotateCcw, TriangleAlert} from 'lucide-react'
import {useMemo, useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiBillingRecoveryContent, HbarAppUiBillingSubscription} from './BillingContent'
import {BillingButton, BillingEmptyState, BillingFrame, BillingIcon, BillingMetricCard, BillingStatus} from './BillingPrimitives'

export function RecoveryBilling({spec, onAction, content}: HbarAppUiVariantProps & {
    readonly content: HbarAppUiBillingRecoveryContent
}) {
    const subscriptions = useMemo(() => {
        const seen = new Set<string>()
        return content.subscriptions.filter((subscription) => {
            if (seen.has(subscription.id)) return false
            seen.add(subscription.id)
            return true
        })
    }, [content.subscriptions])
    const initialExpanded = subscriptions.some((subscription) => subscription.id === content.initialExpandedId) ? content.initialExpandedId : undefined
    const [expandedId, setExpandedId] = useState<string | undefined>(initialExpanded)

    const toggleSubscription = (subscription: HbarAppUiBillingSubscription) => {
        const next = expandedId === subscription.id ? undefined : subscription.id
        setExpandedId(next)
        onAction?.({variantId: spec.id, actionId: 'toggle-retry-attempts', value: subscription.id})
    }

    return <BillingFrame spec={spec} onAction={onAction} className="hbar-app-ui-billing-recovery-surface">
        <main className="hbar-app-ui-billing-page">
            <header className="hbar-app-ui-billing-topbar">
                <div><h1>{content.labels.pageTitle}</h1><p className="hbar-app-ui-billing-recovery-description"><span>{content.labels.pageDescriptionLeading}</span><strong>{content.labels.pageDescriptionEmphasis}</strong></p></div>
                <div className="hbar-app-ui-billing-actions">
                    <BillingButton type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'rules'})}><BillingIcon tier="sm"><ListFilter/></BillingIcon>{content.labels.rules}</BillingButton>
                    <BillingButton type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'export'})}><BillingIcon tier="sm"><Download/></BillingIcon>{content.labels.export}</BillingButton>
                    <BillingButton tone="accent" type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'retry-due'})}><BillingIcon tier="sm"><RotateCcw/></BillingIcon>{content.labels.retryDue}</BillingButton>
                </div>
            </header>

            <div className="hbar-app-ui-billing-recovery-metrics" data-hbar-app-ui-list-strategy="content-grown">
                {content.metrics.map((metric) => <BillingMetricCard key={metric.id} metric={metric} progressLabel={metric.label}/>) }
            </div>

            <section className="hbar-app-ui-billing-panel hbar-app-ui-billing-recovery-list-panel">
                <header className="hbar-app-ui-billing-section-head">
                    <div><h2>{content.labels.listTitle}</h2><p>{content.labels.listDescription}</p></div>
                    <BillingButton type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'manage-playbooks'})}>{content.labels.managePlaybooks}</BillingButton>
                </header>
                <div className="hbar-app-ui-billing-data-table hbar-app-ui-billing-pane-scroll" role="table" aria-label={content.labels.listTitle}
                     data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
                    <div className="hbar-app-ui-billing-data-header" role="row">
                        <span className="hbar-app-ui-billing-data-cell hbar-app-ui-billing-data-cell-customer" role="columnheader">{content.labels.customerColumn}</span>
                        <span className="hbar-app-ui-billing-data-cell" role="columnheader">{content.labels.statusColumn}</span>
                        <span className="hbar-app-ui-billing-data-cell" role="columnheader">{content.labels.billingColumn}</span>
                        <span className="hbar-app-ui-billing-data-cell" role="columnheader">{content.labels.ownerColumn}</span>
                        <span className="hbar-app-ui-billing-data-cell hbar-app-ui-billing-data-cell-amount" role="columnheader">{content.labels.amountColumn}</span>
                        <span className="hbar-app-ui-billing-data-cell" role="columnheader">{content.labels.retryColumn}</span>
                    </div>
                    {subscriptions.length ? subscriptions.map((subscription) => <div className="hbar-app-ui-billing-subscription-row" role="row" key={subscription.id} data-hbar-app-ui-item-id={subscription.id}>
                        <LumenButton className="hbar-app-ui-billing-subscription-trigger" type="button" aria-expanded={expandedId === subscription.id} aria-label={subscription.actionLabel}
                                onClick={() => toggleSubscription(subscription)}>
                            <BillingIcon tier="sm"><ChevronDown/></BillingIcon>
                            <div className="hbar-app-ui-billing-subscription-details">
                                <span><strong>{subscription.customer}</strong><small>{subscription.customerMeta}</small></span>
                                <span><BillingStatus value={subscription.status} tone={subscription.statusTone}/></span>
                                <span><strong>{subscription.plan}</strong><small>{subscription.planMeta}</small></span>
                                <span><strong>{subscription.owner}</strong></span>
                                <span className="is-amount"><strong>{subscription.amount}</strong><small>{subscription.paymentMethod}</small></span>
                                <span><strong>{subscription.nextRetry}</strong><small>{subscription.attemptSummary}</small></span>
                            </div>
                        </LumenButton>
                        {expandedId === subscription.id && <section className="hbar-app-ui-billing-retry-attempts">
                            <header><div><strong>{subscription.retryTitle}</strong><p>{subscription.retryDescription}</p></div><span>{subscription.invoice}</span></header>
                            {subscription.attempts.map((attempt, index) => <div className="hbar-app-ui-billing-retry-attempt" key={attempt.id}>
                                <BillingIcon tier="sm"><TriangleAlert/></BillingIcon>
                                <div><strong>{content.labels.retryAttemptLabel(index + 1, attempt.title)}</strong><small>{attempt.description}</small></div>
                                <span>{attempt.code}</span><span>{attempt.date}</span>
                            </div>)}
                            <BillingButton type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'retry-now', value: subscription.id})}><BillingIcon tier="sm"><RotateCcw/></BillingIcon>{content.labels.retryNow}</BillingButton>
                        </section>}
                    </div>) : <BillingEmptyState message={content.labels.emptySubscriptions}/>}
                </div>
            </section>
        </main>
    </BillingFrame>
}
