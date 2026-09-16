import type {ButtonHTMLAttributes, ReactNode} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import {ActionSurfaceFrame} from '../SurfaceFrame'
import type {HbarAppUiBillingMetric, HbarAppUiBillingTone, HbarAppUiBillingValueRow, HbarAppUiBillingWorkflowStep} from './BillingContent'
import './BillingSurface.css'

export function BillingFrame({spec, onAction, className, children}: HbarAppUiVariantProps & {
    readonly children: ReactNode
}) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className={`hbar-app-ui-billing-surface ${className ?? ''}`}>{children}</ActionSurfaceFrame>
}

export function BillingIcon({children, tier = 'sm', label}: {
    readonly children: ReactNode
    readonly tier?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
    readonly label?: string | undefined
}) {
    if (label) {
        return <span className={`hbar-app-ui-billing-icon hbar-app-ui-icon-${tier}`} aria-label={label}>{children}</span>
    }
    return <span className={`hbar-app-ui-billing-icon hbar-app-ui-icon-${tier}`} aria-hidden="true">{children}</span>
}

export function BillingButton({children, tone = 'neutral', ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {
    readonly tone?: 'neutral' | 'accent' | 'quiet'
}) {
    return <button {...props}
                   className={`hbar-app-ui-billing-button hbar-app-ui-billing-button-${tone} ${props.className ?? ''}`}>{children}</button>
}

export function BillingIconButton({children, label, ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {
    readonly label: string
}) {
    return <BillingButton {...props} className={`hbar-app-ui-billing-icon-button ${props.className ?? ''}`}
                          aria-label={props['aria-label'] ?? label} title={props.title ?? label}>{children}</BillingButton>
}

export function BillingStatus({value, tone = 'neutral'}: {
    readonly value: string
    readonly tone?: HbarAppUiBillingTone | undefined
}) {
    return <span className={`hbar-app-ui-billing-status hbar-app-ui-billing-status-${tone}`}><i aria-hidden="true"/>{value}</span>
}

export function BillingProgress({value, label, tone = 'neutral'}: {
    readonly value: number
    readonly label: string
    readonly tone?: HbarAppUiBillingTone | undefined
}) {
    const bounded = Math.max(0, Math.min(100, value))
    return <span className="hbar-app-ui-billing-progress" role="progressbar" aria-label={label} aria-valuemin={0}
                 aria-valuemax={100} aria-valuenow={bounded}><i className={`hbar-app-ui-billing-progress-fill hbar-app-ui-billing-progress-${tone}`}
                                                                style={{inlineSize: `${bounded}%`}}/></span>
}

export function BillingMetricCard({metric, progressLabel}: {
    readonly metric: HbarAppUiBillingMetric
    readonly progressLabel: string
}) {
    return <section className={`hbar-app-ui-billing-metric hbar-app-ui-billing-tone-${metric.tone ?? 'neutral'}`}>
        <header><span>{metric.label}</span>{metric.trend && <strong>{metric.trend}</strong>}</header>
        <b>{metric.value}</b>
        {metric.detail && <small>{metric.detail}</small>}
        {metric.progress !== undefined && <BillingProgress value={metric.progress} label={progressLabel} tone={metric.tone}/>}
    </section>
}

export function BillingValueRows({rows, className}: {
    readonly rows: readonly HbarAppUiBillingValueRow[]
    readonly className?: string | undefined
}) {
    return <dl className={`hbar-app-ui-billing-value-rows ${className ?? ''}`}>
        {rows.map((row) => <div key={row.id} className={`hbar-app-ui-billing-value-row hbar-app-ui-billing-tone-${row.tone ?? 'neutral'}`}>
            <dt>{row.label}</dt>
            <dd><span>{row.value}</span>{row.detail && <small>{row.detail}</small>}</dd>
        </div>)}
    </dl>
}

export function BillingWorkflowSteps({steps, activeId}: {
    readonly steps: readonly HbarAppUiBillingWorkflowStep[]
    readonly activeId: string
}) {
    const activeIndex = Math.max(0, steps.findIndex((step) => step.id === activeId))
    return <ol className="hbar-app-ui-billing-workflow-steps">
        {steps.map((step, index) => <li key={step.id}
                                        className={index === activeIndex ? 'is-active' : index < activeIndex ? 'is-complete' : ''}
                                        aria-current={index === activeIndex ? 'step' : undefined}>
            <span>{index + 1}</span>
            <div><strong>{step.label}</strong><small>{step.description}</small></div>
        </li>)}
    </ol>
}

export function BillingListStrategy({kind}: { readonly kind: HbarAppUiBillingListStrategyKind }) {
    return <span className="hbar-app-ui-billing-strategy" data-hbar-app-ui-list-strategy={kind} aria-hidden="true"/>
}

type HbarAppUiBillingListStrategyKind = 'content-grown' | 'pane-scroll' | 'virtualized'

export function BillingEmptyState({message}: { readonly message: string }) {
    return <p className="hbar-app-ui-billing-empty">{message}</p>
}
