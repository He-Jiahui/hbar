import { LumenInput } from '@lumen/app-ui'
import {ArrowUpRight, Download, MoreHorizontal, Search} from 'lucide-react'
import {useMemo, useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiBillingStatementContent} from './BillingContent'
import {BillingButton, BillingFrame, BillingIcon, BillingIconButton, BillingStatus, BillingEmptyState} from './BillingPrimitives'

export function BillingStatement({spec, onAction, content}: HbarAppUiVariantProps & {
    readonly content: HbarAppUiBillingStatementContent
}) {
    const [query, setQuery] = useState('')
    const invoices = useMemo(() => {
        const normalized = query.trim().toLowerCase()
        const unique = new Map<string, HbarAppUiBillingStatementContent['invoices'][number]>()
        for (const invoice of content.invoices) {
            if (!unique.has(invoice.id)) unique.set(invoice.id, invoice)
        }
        const values = [...unique.values()]
        if (!normalized) return values
        return values.filter((invoice) => [invoice.customer, invoice.customerMeta, invoice.invoice, invoice.invoiceMeta, invoice.plan, invoice.status]
            .join(' ').toLowerCase().includes(normalized))
    }, [content.invoices, query])

    return <BillingFrame spec={spec} onAction={onAction} className="hbar-app-ui-billing-statement-surface">
        <main className="hbar-app-ui-billing-page">
            <header className="hbar-app-ui-billing-topbar">
                <div>
                    <h1>{content.labels.pageTitle}</h1>
                    <p>{content.labels.pageDescription}</p>
                </div>
                <div className="hbar-app-ui-billing-actions">
                    <BillingButton type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'export'})}>
                        <BillingIcon tier="sm"><Download/></BillingIcon>{content.labels.export}
                    </BillingButton>
                </div>
            </header>

            <section className="hbar-app-ui-billing-panel hbar-app-ui-billing-statement-panel">
                <div className="hbar-app-ui-billing-statement-balance">
                    <div className="hbar-app-ui-billing-balance-main">
                        <span>{content.labels.balanceLabel}</span>
                        <b>{content.balance.amount}</b>
                        <small>{content.balance.detail}</small>
                    </div>
                    <div className="hbar-app-ui-billing-balance-metrics">
                        {content.balance.metrics.map((metric) => <div className="hbar-app-ui-billing-mini-metric" key={metric.id}>
                            <span>{metric.label}</span><b className={`hbar-app-ui-billing-tone-${metric.tone ?? 'neutral'}`}>{metric.value}</b>
                        </div>)}
                    </div>
                </div>
                <div className="hbar-app-ui-billing-panel hbar-app-ui-billing-subtle-panel hbar-app-ui-billing-recovery-banner">
                    <p><span>{content.labels.recoveryLeading}</span><strong>{content.labels.recoveryEmphasis}</strong><span>{content.labels.recoveryTrailing}</span></p>
                    <div className="hbar-app-ui-billing-actions">
                        <BillingButton tone="quiet" type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'view-statement'})}>{content.labels.viewStatement}</BillingButton>
                        <BillingButton tone="accent" type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'start-recovery'})}>
                            {content.labels.startRecovery}<BillingIcon tier="sm"><ArrowUpRight/></BillingIcon>
                        </BillingButton>
                    </div>
                </div>
            </section>

            <section className="hbar-app-ui-billing-panel hbar-app-ui-billing-statement-ledger-panel">
                <header className="hbar-app-ui-billing-section-head">
                    <div><h2>{content.labels.ledgerTitle}</h2><p>{content.labels.ledgerSummary}</p></div>
                    <div className="hbar-app-ui-billing-actions">
                        <label className="hbar-app-ui-billing-search-field">
                            <span className="hbar-app-ui-billing-visually-hidden">{content.labels.searchLabel}</span>
                            <BillingIcon tier="sm"><Search/></BillingIcon>
                            <LumenInput type="search" value={query} aria-label={content.labels.searchLabel} placeholder={content.labels.searchPlaceholder}
                                   onChange={(event) => setQuery(event.target.value)}/>
                        </label>
                        <BillingButton tone="accent" type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'new-invoice'})}>{content.labels.newInvoice}</BillingButton>
                    </div>
                </header>
                <div className="hbar-app-ui-billing-data-table hbar-app-ui-billing-pane-scroll" role="table" aria-label={content.labels.ledgerTitle}
                     data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
                    <div className="hbar-app-ui-billing-data-header" role="row">
                        <span className="hbar-app-ui-billing-data-cell hbar-app-ui-billing-data-cell-customer" role="columnheader">{content.labels.customerColumn}</span>
                        <span className="hbar-app-ui-billing-data-cell hbar-app-ui-billing-data-cell-invoice" role="columnheader">{content.labels.invoiceColumn}</span>
                        <span className="hbar-app-ui-billing-data-cell" role="columnheader">{content.labels.planColumn}</span>
                        <span className="hbar-app-ui-billing-data-cell hbar-app-ui-billing-data-cell-amount" role="columnheader">{content.labels.amountColumn}</span>
                        <span className="hbar-app-ui-billing-data-cell" role="columnheader">{content.labels.dueColumn}</span>
                        <span className="hbar-app-ui-billing-data-cell hbar-app-ui-billing-data-cell-status" role="columnheader">{content.labels.statusColumn}</span>
                        <span className="hbar-app-ui-billing-data-cell hbar-app-ui-billing-data-cell-action" role="columnheader" aria-hidden="true"/>
                    </div>
                    {invoices.length ? invoices.map((invoice, index) => <div className="hbar-app-ui-billing-data-row" role="row" key={invoice.id}
                                                                                 data-hbar-app-ui-item-id={invoice.id} aria-rowindex={index + 2}>
                        <div className="hbar-app-ui-billing-data-cell hbar-app-ui-billing-data-cell-customer" role="cell"><strong>{invoice.customer}</strong><small>{invoice.customerMeta}</small></div>
                        <div className="hbar-app-ui-billing-data-cell hbar-app-ui-billing-data-cell-invoice" role="cell"><strong>{invoice.invoice}</strong><small>{invoice.invoiceMeta}</small></div>
                        <div className="hbar-app-ui-billing-data-cell" role="cell"><span>{invoice.plan}</span><small>{invoice.paymentMethod}</small></div>
                        <div className="hbar-app-ui-billing-data-cell hbar-app-ui-billing-data-cell-amount" role="cell"><b>{invoice.amount}</b></div>
                        <div className="hbar-app-ui-billing-data-cell" role="cell"><strong>{invoice.dueDate}</strong><small>{invoice.dueDetail}</small></div>
                        <div className="hbar-app-ui-billing-data-cell hbar-app-ui-billing-data-cell-status" role="cell"><BillingStatus value={invoice.status} tone={invoice.statusTone}/></div>
                        <div className="hbar-app-ui-billing-data-cell hbar-app-ui-billing-data-cell-action" role="cell">
                            <BillingIconButton type="button" label={content.labels.actionsForInvoice(invoice.invoice)} onClick={() => onAction?.({variantId: spec.id, actionId: 'invoice-actions', value: invoice.id})}>
                                <MoreHorizontal/>
                            </BillingIconButton>
                        </div>
                    </div>) : <BillingEmptyState message={content.labels.emptyLedger}/>}
                </div>
            </section>
        </main>
    </BillingFrame>
}
