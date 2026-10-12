import { LumenFrame, LumenText, LumenButton, LumenInput, LumenSelect } from '@lumen/app-ui'
import { LumenOption } from '@lumen/app-ui/catalog'
import { HbarAppUiIcon } from '../../icon'
import {useState} from 'react'
import {Building2, CalendarDays, Hash, Landmark, X} from 'lucide-react'
import {
    reportWizardAction,
    WizardButton,
    WizardField,
    WizardFooter,
    WizardFrame,
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

    if (closed) return <WizardFrame spec={spec} onAction={onAction} className="hbar-app-ui-wizard-invoice">
        <LumenFrame as="main" className="hbar-app-ui-wizard-invoice-closed"><LumenText as="h1">Invoice draft closed</LumenText><LumenText as="p">The customer details remain
            available in saved drafts.</LumenText><WizardButton tone="light" onClick={() => {
            setClosed(false)
            reportWizardAction(onAction, spec, 'reopen')
        }}>Reopen draft</WizardButton></LumenFrame>
    </WizardFrame>

    return <WizardFrame spec={spec} onAction={onAction} className="hbar-app-ui-wizard-invoice">
        <LumenFrame as="header" className="hbar-app-ui-wizard-invoice-topbar"><WizardButton className="hbar-app-ui-wizard-close"
                                                                            aria-label="Close" onClick={() => {
            setClosed(true)
            reportWizardAction(onAction, spec, 'close')
        }}><HbarAppUiIcon icon={X} tier="md" /></WizardButton><LumenText as="h1">Send invoice</LumenText>
            <LumenFrame className="hbar-app-ui-wizard-invoice-progress" role="progressbar" aria-label="Invoice step"
                 aria-valuemin={1} aria-valuemax={4} aria-valuenow={1}><LumenText as="span"/></LumenFrame>
            <LumenText as="small">1 / 4</LumenText></LumenFrame>
        <LumenFrame as="main" className="hbar-app-ui-wizard-invoice-main">
            <LumenFrame as="section" className="hbar-app-ui-wizard-invoice-card">
                <LumenFrame as="header">
                    <LumenFrame><LumenText as="h2">Customer details</LumenText><LumenText as="p">Customer, invoice references, and billing terms.</LumenText></LumenFrame>
                    <LumenText as="span">USD</LumenText></LumenFrame>
                <LumenFrame as="form" onSubmit={(event) => {
                    event.preventDefault()
                    reportWizardAction(onAction, spec, 'next')
                }}>
                    <LumenFrame as="section">
                        <LumenFrame as="header"><LumenText as="h3">Customer <LumenText as="em">Required</LumenText></LumenText><LumenText as="p">Billable account and invoice reference.</LumenText>
                        </LumenFrame>
                        <LumenFrame className="hbar-app-ui-wizard-invoice-fields"><WizardField label="Customer">
                            <LumenFrame className="hbar-app-ui-wizard-input-prefix"><LumenInput value={values.customer}
                                                                                    onChange={(event) => update('customer', event.target.value)}/>
                                <LumenButton type="button" aria-label="Clear customer" title="Clear customer"
                                        onClick={() => update('customer', '')}><HbarAppUiIcon icon={X} tier="sm" /></LumenButton>
                            </LumenFrame>
                        </WizardField><WizardField label="Tax ID">
                            <LumenFrame className="hbar-app-ui-wizard-input-prefix"><HbarAppUiIcon icon={Landmark} tier="sm"
                                                                                       aria-hidden="true"/><LumenInput
                                value={values.taxId} onChange={(event) => update('taxId', event.target.value)}/></LumenFrame>
                        </WizardField><WizardField label="Invoice number">
                            <LumenFrame className="hbar-app-ui-wizard-input-prefix"><HbarAppUiIcon icon={Hash} tier="sm"  aria-hidden="true"/><LumenInput
                                value={values.invoiceNumber}
                                onChange={(event) => update('invoiceNumber', event.target.value)}/></LumenFrame>
                        </WizardField><WizardField label="PO reference"><LumenInput value={values.purchaseOrder}
                                                                               onChange={(event) => update('purchaseOrder', event.target.value)}/></WizardField>
                        </LumenFrame>
                    </LumenFrame>
                    <LumenFrame as="section">
                        <LumenFrame as="header"><LumenText as="h3">Terms <LumenText as="em">{values.terms}</LumenText></LumenText><LumenText as="p">Dates, currency, and collection method.</LumenText>
                        </LumenFrame>
                        <LumenFrame className="hbar-app-ui-wizard-invoice-fields"><WizardField label="Issue date">
                            <LumenFrame className="hbar-app-ui-wizard-input-prefix"><LumenInput value={values.issueDate}
                                                                                    onChange={(event) => update('issueDate', event.target.value)}/><HbarAppUiIcon icon={CalendarDays} tier="sm"
                                 aria-hidden="true"/></LumenFrame>
                        </WizardField><WizardField label="Due date">
                            <LumenFrame className="hbar-app-ui-wizard-input-prefix"><LumenInput value={values.dueDate}
                                                                                    onChange={(event) => update('dueDate', event.target.value)}/><HbarAppUiIcon icon={CalendarDays} tier="sm"
                                 aria-hidden="true"/></LumenFrame>
                        </WizardField><WizardField label="Currency"><LumenSelect value={values.currency}
                                                                            onChange={(event) => update('currency', event.target.value)}>
                            <LumenOption>USD</LumenOption>
                            <LumenOption>EUR</LumenOption>
                            <LumenOption>GBP</LumenOption>
                        </LumenSelect></WizardField><WizardField label="Payment terms"><LumenSelect value={values.terms}
                                                                                          onChange={(event) => update('terms', event.target.value)}>
                            <LumenOption>Net 14</LumenOption>
                            <LumenOption>Net 30</LumenOption>
                            <LumenOption>Due on receipt</LumenOption>
                        </LumenSelect></WizardField><WizardField label="Collection"><LumenSelect value={values.collection}
                                                                                       onChange={(event) => update('collection', event.target.value)}>
                            <LumenOption>ACH transfer</LumenOption>
                            <LumenOption>Card</LumenOption>
                            <LumenOption>Wire</LumenOption>
                        </LumenSelect></WizardField><WizardField label="Billing address">
                            <LumenFrame className="hbar-app-ui-wizard-input-prefix"><HbarAppUiIcon icon={Building2} tier="sm"
                                                                                        aria-hidden="true"/><LumenInput
                                value={values.address} onChange={(event) => update('address', event.target.value)}/>
                            </LumenFrame>
                        </WizardField></LumenFrame>
                    </LumenFrame>
                </LumenFrame>
            </LumenFrame>
        </LumenFrame>
        <WizardFooter className="hbar-app-ui-wizard-invoice-footer"><WizardButton
            onClick={() => reportWizardAction(onAction, spec, 'save')}>Save draft</WizardButton><WizardButton
            tone="light" onClick={() => reportWizardAction(onAction, spec, 'next')}>Next
            step</WizardButton></WizardFooter>
    </WizardFrame>
}
