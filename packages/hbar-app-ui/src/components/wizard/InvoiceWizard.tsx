import { HbarAppUiIcon } from '../../icon'
import {useState} from 'react'
import {Building2, CalendarDays, Hash, Landmark, X} from 'lucide-react'
import {
    WizardButton,
    WizardField,
    WizardFooter,
    WizardFrame,
    reportWizardAction,
    type WizardSurfaceProps,
} from './WizardPrimitives'

type InvoiceValues = {
    customer: string
    taxId: string
    invoiceNumber: string
    purchaseOrder: string
    issueDate: string
    dueDate: string
    currency: string
    terms: string
    collection: string
    address: string
}

export function InvoiceWizard({spec, onAction}: WizardSurfaceProps) {
    const [closed, setClosed] = useState(false)
    const [values, setValues] = useState<InvoiceValues>({
        customer: 'Orchid Ledger Group',
        taxId: 'US-88-2947135',
        invoiceNumber: 'INV-2048',
        purchaseOrder: 'PO-7418',
        issueDate: 'Apr 24, 2026',
        dueDate: 'May 08, 2026',
        currency: 'USD',
        terms: 'Net 14',
        collection: 'ACH transfer',
        address: '42 Orchid Lane, Portland, OR',
    })
    const update = (key: keyof InvoiceValues, value: string) => setValues((current) => ({...current, [key]: value}))

    if (closed) return <WizardFrame spec={spec} onAction={onAction} className="hbar-app-ui-wizard-invoice"><main className="hbar-app-ui-wizard-invoice-closed"><h1>Invoice draft closed</h1><p>The customer details remain available in saved drafts.</p><WizardButton tone="light" onClick={() => {
        setClosed(false)
        reportWizardAction(onAction, spec, 'reopen')
    }}>Reopen draft</WizardButton></main></WizardFrame>

    return <WizardFrame spec={spec} onAction={onAction} className="hbar-app-ui-wizard-invoice">
        <header className="hbar-app-ui-wizard-invoice-topbar"><WizardButton className="hbar-app-ui-wizard-close" aria-label="Close" onClick={() => {
            setClosed(true)
            reportWizardAction(onAction, spec, 'close')
        }}><HbarAppUiIcon icon={X} tier="md" /></WizardButton><h1>Send invoice</h1><div className="hbar-app-ui-wizard-invoice-progress" role="progressbar" aria-label="Invoice step" aria-valuemin={1} aria-valuemax={4} aria-valuenow={1}><span/></div><small>1 / 4</small></header>
        <main className="hbar-app-ui-wizard-invoice-main"><section className="hbar-app-ui-wizard-invoice-card"><header><div><h2>Customer details</h2><p>Customer, invoice references, and billing terms.</p></div><span>USD</span></header><form onSubmit={(event) => {
            event.preventDefault()
            reportWizardAction(onAction, spec, 'next')
        }}><section><header><h3>Customer <em>Required</em></h3><p>Billable account and invoice reference.</p></header><div className="hbar-app-ui-wizard-invoice-fields"><WizardField label="Customer"><div className="hbar-app-ui-wizard-input-prefix"><input value={values.customer} onChange={(event) => update('customer', event.target.value)}/><button type="button" aria-label="Clear customer" title="Clear customer" onClick={() => update('customer', '')}><HbarAppUiIcon icon={X} tier="sm" /></button></div></WizardField><WizardField label="Tax ID"><div className="hbar-app-ui-wizard-input-prefix"><HbarAppUiIcon icon={Landmark} tier="sm"  aria-hidden="true"/><input value={values.taxId} onChange={(event) => update('taxId', event.target.value)}/></div></WizardField><WizardField label="Invoice number"><div className="hbar-app-ui-wizard-input-prefix"><HbarAppUiIcon icon={Hash} tier="sm"  aria-hidden="true"/><input value={values.invoiceNumber} onChange={(event) => update('invoiceNumber', event.target.value)}/></div></WizardField><WizardField label="PO reference"><input value={values.purchaseOrder} onChange={(event) => update('purchaseOrder', event.target.value)}/></WizardField></div></section><section><header><h3>Terms <em>{values.terms}</em></h3><p>Dates, currency, and collection method.</p></header><div className="hbar-app-ui-wizard-invoice-fields"><WizardField label="Issue date"><div className="hbar-app-ui-wizard-input-prefix"><input value={values.issueDate} onChange={(event) => update('issueDate', event.target.value)}/><HbarAppUiIcon icon={CalendarDays} tier="sm"  aria-hidden="true"/></div></WizardField><WizardField label="Due date"><div className="hbar-app-ui-wizard-input-prefix"><input value={values.dueDate} onChange={(event) => update('dueDate', event.target.value)}/><HbarAppUiIcon icon={CalendarDays} tier="sm"  aria-hidden="true"/></div></WizardField><WizardField label="Currency"><select value={values.currency} onChange={(event) => update('currency', event.target.value)}><option>USD</option><option>EUR</option><option>GBP</option></select></WizardField><WizardField label="Payment terms"><select value={values.terms} onChange={(event) => update('terms', event.target.value)}><option>Net 14</option><option>Net 30</option><option>Due on receipt</option></select></WizardField><WizardField label="Collection"><select value={values.collection} onChange={(event) => update('collection', event.target.value)}><option>ACH transfer</option><option>Card</option><option>Wire</option></select></WizardField><WizardField label="Billing address"><div className="hbar-app-ui-wizard-input-prefix"><HbarAppUiIcon icon={Building2} tier="sm"  aria-hidden="true"/><input value={values.address} onChange={(event) => update('address', event.target.value)}/></div></WizardField></div></section></form></section></main>
        <WizardFooter className="hbar-app-ui-wizard-invoice-footer"><WizardButton onClick={() => reportWizardAction(onAction, spec, 'save')}>Save draft</WizardButton><WizardButton tone="light" onClick={() => reportWizardAction(onAction, spec, 'next')}>Next step</WizardButton></WizardFooter>
    </WizardFrame>
}
