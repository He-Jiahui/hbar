import {Download, Mail, Printer, Send, Zap} from 'lucide-react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiBillingInvoiceDetailContent} from './BillingContent'
import {BillingButton, BillingEmptyState, BillingFrame, BillingIcon, BillingIconButton, BillingStatus, BillingValueRows} from './BillingPrimitives'

export function InvoiceDetailBilling({spec, onAction, content}: HbarAppUiVariantProps & {
    readonly content: HbarAppUiBillingInvoiceDetailContent
}) {
    return <BillingFrame spec={spec} onAction={onAction} className="hbar-app-ui-billing-invoice-detail-surface">
        <main className="hbar-app-ui-billing-invoice-page">
            <header className="hbar-app-ui-billing-topbar">
                <div><h1>{content.invoice}</h1><p><BillingStatus value={content.status} tone={content.statusTone}/>{content.description}</p></div>
                <div className="hbar-app-ui-billing-actions">
                    <BillingIconButton type="button" label={content.labels.print} onClick={() => onAction?.({variantId: spec.id, actionId: 'print'})}><Printer/></BillingIconButton>
                    <BillingButton type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'pdf'})}><BillingIcon tier="sm"><Download/></BillingIcon>{content.labels.pdf}</BillingButton>
                    <BillingButton tone="accent" type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'send-reminder'})}><BillingIcon tier="sm"><Send/></BillingIcon>{content.labels.sendReminder}</BillingButton>
                </div>
            </header>

            <div className="hbar-app-ui-billing-invoice-layout">
                <div className="hbar-app-ui-billing-invoice-main">
                    <section className="hbar-app-ui-billing-panel hbar-app-ui-billing-invoice-metadata">
                        <div className="hbar-app-ui-billing-invoice-address"><span>{content.labels.billedTo}</span>{content.addressLines.map((line, index) => index === 0 ? <strong key={`${line}-${index}`}>{line}</strong> : <span key={`${line}-${index}`}>{line}</span>)}</div>
                        <BillingValueRows rows={content.metadata}/>
                    </section>
                    <section className="hbar-app-ui-billing-panel hbar-app-ui-billing-invoice-lines">
                        <header className="hbar-app-ui-billing-section-head"><div><h2>{content.labels.lineItemsTitle}</h2></div></header>
                        {content.lines.length ? <div className="hbar-app-ui-billing-data-table" role="table" aria-label={content.labels.lineItemsTitle} data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
                            <div className="hbar-app-ui-billing-data-header" role="row">
                                <span className="hbar-app-ui-billing-data-cell hbar-app-ui-billing-data-cell-description" role="columnheader">{content.labels.descriptionColumn}</span>
                                <span className="hbar-app-ui-billing-data-cell" role="columnheader">{content.labels.quantityColumn}</span>
                                <span className="hbar-app-ui-billing-data-cell" role="columnheader">{content.labels.rateColumn}</span>
                                <span className="hbar-app-ui-billing-data-cell hbar-app-ui-billing-data-cell-amount" role="columnheader">{content.labels.amountColumn}</span>
                            </div>
                            {content.lines.map((line) => <div className="hbar-app-ui-billing-data-row" role="row" key={line.id} data-hbar-app-ui-item-id={line.id}>
                                <div className="hbar-app-ui-billing-data-cell hbar-app-ui-billing-data-cell-description" role="cell"><strong>{line.description}</strong><small>{line.detail}</small></div>
                                <div className="hbar-app-ui-billing-data-cell" role="cell"><span>{line.quantity}</span></div>
                                <div className="hbar-app-ui-billing-data-cell" role="cell"><span>{line.rate}</span></div>
                                <div className="hbar-app-ui-billing-data-cell hbar-app-ui-billing-data-cell-amount" role="cell"><b>{line.amount}</b></div>
                            </div>)}
                        </div> : <BillingEmptyState message={content.labels.emptyLines}/>}
                    </section>
                    <section className="hbar-app-ui-billing-panel hbar-app-ui-billing-totals-panel"><BillingValueRows rows={content.totals}/></section>
                </div>

                <aside className="hbar-app-ui-billing-invoice-side">
                    <section className="hbar-app-ui-billing-panel"><header className="hbar-app-ui-billing-section-head"><div><h2>{content.labels.activityTitle}</h2></div></header>
                        <ol className="hbar-app-ui-billing-activity-list">{content.activities.map((activity) => <li className={`hbar-app-ui-billing-activity-item hbar-app-ui-billing-tone-${activity.tone ?? 'neutral'}`} key={activity.id}>
                            <i aria-hidden="true"/><div><strong>{activity.title}</strong><span>{activity.description}</span><small>{activity.date}</small></div>
                        </li>)}</ol>
                    </section>
                    <section className="hbar-app-ui-billing-panel hbar-app-ui-billing-collection-panel"><header className="hbar-app-ui-billing-section-head"><div><h2>{content.labels.collectionTitle}</h2></div></header><BillingValueRows rows={content.collection}/><BillingButton type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'charge-now'})}><BillingIcon tier="sm"><Zap/></BillingIcon>{content.labels.chargeNow}</BillingButton></section>
                    <p className="hbar-app-ui-billing-panel hbar-app-ui-billing-help-notice"><BillingIcon tier="sm"><Mail/></BillingIcon><span>{content.labels.helpNotice}</span></p>
                </aside>
            </div>
        </main>
    </BillingFrame>
}
