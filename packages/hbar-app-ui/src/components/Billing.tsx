import {useState} from 'react'
import {ChevronDown, ChevronRight, CreditCard, Download, FileText, RotateCcw, WalletCards} from 'lucide-react'
import {
    HbarAppUiButton,
    HbarAppUiMetricStrip,
    HbarAppUiProgress,
    HbarAppUiSpotlight,
    HbarAppUiStatus,
    HbarAppUiTabs,
    HbarAppUiToolbar
} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'

type BillingProps = HbarAppUiVariantProps

function BillingOverview({spec, onAction}: BillingProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-billing-variant-1"><HbarAppUiToolbar title="Billing overview"
                                                                                           detail="Statement summary · past due recovery"/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'download', value: 'statement'})}><Download size={13}/>Download
        statement</HbarAppUiButton><HbarAppUiMetricStrip metrics={[{label: 'Current total', value: '$128.40'}, {
        label: 'Past due',
        value: '$0',
        tone: 'positive'
    }, {label: 'Next invoice', value: 'Oct 01'}]}/><HbarAppUiSpotlight
        className="hbar-app-ui-recovery-banner"><WalletCards size={16}/>
        <div><strong>Payment method is up to date</strong><small>No recovery action needed.</small></div>
        <HbarAppUiStatus value="Healthy" tone="positive"/></HbarAppUiSpotlight>
        <div className="hbar-app-ui-invoice-list">{['INV-2026-09', 'INV-2026-08', 'INV-2026-07'].map((invoice, index) =>
            <HbarAppUiSpotlight key={invoice}><FileText size={15}/>
                <div><strong>{invoice}</strong><small>{index ? 'Paid' : 'Due Oct 01'} · Workspace plan</small></div>
                <b>{index ? '$96.00' : '$128.40'}</b><ChevronRight size={14}/></HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function PlanManager({spec, onAction}: BillingProps) {
    const [dirty, setDirty] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-billing-variant-2"><HbarAppUiToolbar title="Plan manager"
                                                                                           detail="Entitlements and per-plan toggles"/>
        <div
            className="hbar-app-ui-entitlement-cards">{['Activity history', 'Advanced analytics', 'Priority support'].map((feature, index) =>
            <HbarAppUiSpotlight
                key={feature}><strong>{feature}</strong><small>{index === 1 ? 'Team plan' : 'Included'}</small>
                <button type="button" role="switch" aria-checked={index !== 1}
                        className={`hbar-app-ui-switch ${index !== 1 ? 'is-on' : ''}`} onClick={() => setDirty(true)}>
                    <i/></button>
            </HbarAppUiSpotlight>)}</div>
        <div className="hbar-app-ui-sticky-save">
            <span>{dirty ? 'Unsaved plan changes' : 'Current plan · Team'}</span><HbarAppUiButton tone="accent"
                                                                                                  onClick={() => {
                                                                                                      setDirty(false);
                                                                                                      onAction?.({
                                                                                                          variantId: spec.id,
                                                                                                          actionId: 'save'
                                                                                                      })
                                                                                                  }}>Save
            plan</HbarAppUiButton></div>
    </ActionSurfaceFrame>
}

function InvoiceWizard({spec, onAction}: BillingProps) {
    const [step, setStep] = useState(1);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-billing-variant-3"><HbarAppUiToolbar title="New invoice"
                                                                                           detail={`Step ${step} of 3`}/><HbarAppUiProgress
        value={step / 3 * 100} label="Invoice progress"/>
        <div className="hbar-app-ui-invoice-wizard">
            <div className="hbar-app-ui-step-list">{['Customer', 'Line items', 'Payment terms'].map((name, index) =>
                <span className={index + 1 === step ? 'is-active' : index + 1 < step ? 'is-complete' : ''}
                      key={name}>{index + 1}. {name}</span>)}</div>
            <HbarAppUiSpotlight><strong>{['Customer', 'Line items', 'Payment terms'][step - 1]}</strong><label>{step === 1 ? 'Customer' : step === 2 ? 'Line item' : 'Payment terms'}<input
                placeholder={step === 1 ? 'Project Atlas' : step === 2 ? 'Workspace plan' : 'Net 30'}/></label></HbarAppUiSpotlight>
        </div>
        <HbarAppUiButton tone="accent" onClick={() => {
            setStep(Math.min(3, step + 1));
            onAction?.({variantId: spec.id, actionId: 'step', value: String(step + 1)})
        }}>{step === 3 ? 'Create invoice' : 'Continue'}</HbarAppUiButton></ActionSurfaceFrame>
}

function RecoveryQueue({spec, onAction}: BillingProps) {
    const [open, setOpen] = useState<string | undefined>();
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-billing-variant-4"><HbarAppUiToolbar title="Recovery queue"
                                                                                           detail="Retry metrics and failed-charge log"/><HbarAppUiMetricStrip
        metrics={[{label: 'Failed charges', value: '4', tone: 'warning'}, {
            label: 'Recovered',
            value: '18',
            tone: 'positive'
        }, {label: 'Next retry', value: '10m'}]}/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'retry', value: 'all'})}><RotateCcw size={13}/>Retry
        all</HbarAppUiButton>
        <div
            className="hbar-app-ui-recovery-rows">{['INV-2026-08', 'INV-2026-07', 'INV-2026-06'].map((invoice, index) =>
            <div key={invoice}>
                <button type="button" onClick={() => setOpen(open === invoice ? undefined : invoice)}><ChevronDown
                    size={13} className={open === invoice ? 'is-open' : ''}/><strong>{invoice}</strong><HbarAppUiStatus
                    value="Failed" tone="danger"/><span>{index + 1} attempts</span></button>
                {open === invoice &&
                    <HbarAppUiSpotlight><p>Card declined · retry scheduled in {index + 1}h.</p><HbarAppUiButton
                        onClick={() => onAction?.({variantId: spec.id, actionId: 'retry', value: invoice})}>Retry
                        now</HbarAppUiButton></HbarAppUiSpotlight>}</div>)}</div>
    </ActionSurfaceFrame>
}

function ChangePlan({spec, onAction}: BillingProps) {
    const [plan, setPlan] = useState('Pro');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-billing-variant-5"><HbarAppUiToolbar title="Change plan"
                                                                                           detail="Tier selection and proration preview"/>
        <div className="hbar-app-ui-tier-picker">{['Starter', 'Pro', 'Team'].map((tier) => <button type="button"
                                                                                                   className={plan === tier ? 'is-selected' : ''}
                                                                                                   key={tier}
                                                                                                   onClick={() => setPlan(tier)}>
            <strong>{tier}</strong><small>{tier === 'Starter' ? '$0' : tier === 'Pro' ? '$24' : '$48'} / month</small>
        </button>)}</div>
        <HbarAppUiSpotlight><strong>Proration
            preview</strong><span>Credit for current plan · −$8.00</span><span>New {plan} plan · +${plan === 'Starter' ? '0.00' : plan === 'Pro' ? '16.00' : '40.00'}</span><b>Due
            today ·
            ${plan === 'Starter' ? '0.00' : plan === 'Pro' ? '8.00' : '32.00'}</b></HbarAppUiSpotlight><HbarAppUiButton
            tone="accent" onClick={() => onAction?.({variantId: spec.id, actionId: 'change-plan', value: plan})}>Change
            to {plan}</HbarAppUiButton></ActionSurfaceFrame>
}

function PaymentMethods({spec, onAction}: BillingProps) {
    const [primary, setPrimary] = useState('Visa');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-billing-variant-6"><HbarAppUiToolbar title="Payment methods"
                                                                                           detail="Primary card, contacts and tax"/>
        <div className="hbar-app-ui-payment-list">{['Visa', 'Mastercard'].map((card, index) => <button type="button"
                                                                                                       className={primary === card ? 'is-selected' : ''}
                                                                                                       key={card}
                                                                                                       onClick={() => setPrimary(card)}>
            <CreditCard
                size={16}/><span><strong>{card} ending {index ? '4242' : '1881'}</strong><small>Expires 09/28</small></span><HbarAppUiStatus
            value={primary === card ? 'Primary' : 'Use as primary'} tone={primary === card ? 'positive' : 'neutral'}/>
        </button>)}</div>
        <HbarAppUiButton onClick={() => onAction?.({variantId: spec.id, actionId: 'add-card'})}>Add payment
            method</HbarAppUiButton>
        <div className="hbar-app-ui-billing-contacts"><span>Billing contact · billing@workspace.test</span><span>Tax ID · US-91A2</span>
        </div>
    </ActionSurfaceFrame>
}

function UsageOverage({spec, onAction}: BillingProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-billing-variant-7"><HbarAppUiToolbar title="Usage and overage"
                                                                                           detail="Metered allowances and estimated total"/><HbarAppUiMetricStrip
        metrics={[{label: 'Included', value: '100k'}, {
            label: 'Used',
            value: '124k',
            tone: 'warning'
        }, {label: 'Estimated total', value: '$28.80'}]}/>
        <div className="hbar-app-ui-metered-allowances">{['Tokens', 'Requests', 'Storage'].map((name, index) =>
            <HbarAppUiSpotlight key={name}><strong>{name}</strong><HbarAppUiProgress
                value={index === 0 ? 100 : 48 + index * 12} label={`${name} allowance`}
                tone={index === 0 ? 'warning' : 'accent'}/><small>{index === 0 ? '24k over included' : 'Within limit'}</small></HbarAppUiSpotlight>)}</div>
        <HbarAppUiButton tone="accent"
                         onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: 'usage'})}>Review
            usage</HbarAppUiButton></ActionSurfaceFrame>
}

function InvoiceDetail({spec, onAction}: BillingProps) {
    const [tab, setTab] = useState('Items');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-billing-variant-8"><HbarAppUiToolbar title="Invoice detail"
                                                                                           detail="Line items, totals and collection info"/><HbarAppUiTabs
        label="Invoice detail" value={tab} options={['Items', 'Activity', 'Collection'].map((id) => ({id, label: id}))}
        onChange={setTab}/>{tab === 'Items' && <div className="hbar-app-ui-invoice-lines">
        <div><span>Workspace plan · 12 seats</span><b>$120.00</b></div>
        <div><span>Additional storage</span><b>$8.40</b></div>
        <div className="is-total"><span>Total</span><b>$128.40</b></div>
    </div>}{tab === 'Activity' && <ol className="hbar-app-ui-invoice-timeline">
        <li>Issued · Sep 01</li>
        <li>Viewed · Sep 02</li>
        <li>Paid · Sep 03</li>
    </ol>}{tab === 'Collection' &&
        <HbarAppUiSpotlight><strong>Collection status</strong><p>Paid automatically with Visa ending 1881.</p>
            <HbarAppUiButton onClick={() => onAction?.({variantId: spec.id, actionId: 'download'})}><Download
                size={13}/>Download PDF</HbarAppUiButton></HbarAppUiSpotlight>}</ActionSurfaceFrame>
}

export function Billing({spec, onAction}: BillingProps) {
    switch (spec.variant) {
        case 1:
            return <BillingOverview spec={spec} onAction={onAction}/>;
        case 2:
            return <PlanManager spec={spec} onAction={onAction}/>;
        case 3:
            return <InvoiceWizard spec={spec} onAction={onAction}/>;
        case 4:
            return <RecoveryQueue spec={spec} onAction={onAction}/>;
        case 5:
            return <ChangePlan spec={spec} onAction={onAction}/>;
        case 6:
            return <PaymentMethods spec={spec} onAction={onAction}/>;
        case 7:
            return <UsageOverage spec={spec} onAction={onAction}/>;
        case 8:
            return <InvoiceDetail spec={spec} onAction={onAction}/>;
        default:
            return <BillingOverview spec={spec} onAction={onAction}/>
    }
}
