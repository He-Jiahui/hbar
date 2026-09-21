import { LumenInput } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../../icon'
import {useState} from 'react'
import {ArrowRight, Check} from 'lucide-react'
import {
    WizardButton,
    WizardFooter,
    WizardFrame,
    WizardStepRail,
    reportWizardAction,
    type WizardSurfaceProps,
} from './WizardPrimitives'

const steps = [
    {id: 'plan', label: 'Plan'},
    {id: 'seats', label: 'Seats'},
    {id: 'payment', label: 'Payment'},
    {id: 'review', label: 'Review'},
] as const

const plans = [
    {id: 'team', label: 'Team', detail: 'Workspace controls for growing product teams.', price: '$49', recommended: false},
    {id: 'business', label: 'Business', detail: 'SAML, audit exports, and priority support.', price: '$72', recommended: true},
    {id: 'enterprise', label: 'Enterprise', detail: 'Procurement review and account governance.', price: '$96', recommended: false},
] as const

export function BillingUpgradeWizard({spec, onAction}: WizardSurfaceProps) {
    const [step, setStep] = useState(0)
    const [plan, setPlan] = useState('business')
    const selectedPlan = plans.find((item) => item.id === plan) ?? plans[1]
    const move = (next: number) => {
        const bounded = Math.max(0, Math.min(steps.length - 1, next))
        setStep(bounded)
        reportWizardAction(onAction, spec, 'step', String(bounded + 1))
    }

    return <WizardFrame spec={spec} onAction={onAction} className="hbar-app-ui-wizard-billing-upgrade">
        <header className="hbar-app-ui-wizard-billing-header">
            <div><h1>Billing upgrade</h1><p>Change plan, seats, and payment terms before renewal.</p></div>
            <span className="hbar-app-ui-wizard-draft"><i/>Draft</span><WizardStepRail steps={steps} current={step}
                                                                                       onSelect={move}/></header>
        <main className="hbar-app-ui-wizard-billing-main">
            <section className="hbar-app-ui-wizard-plan-column"><h2>Plan</h2>
                <div className="hbar-app-ui-wizard-plan-list" role="radiogroup" aria-label="Plans">{plans.map((item) =>
                    <label key={item.id} className={item.id === plan ? 'is-selected' : ''}><LumenInput type="radio"
                                                                                                  name="billing-plan"
                                                                                                  value={item.id}
                                                                                                  checked={item.id === plan}
                                                                                                  onChange={() => {
                                                                                                      setPlan(item.id)
                                                                                                      reportWizardAction(onAction, spec, 'plan', item.id)
                                                                                                  }}/><span
                        className="hbar-app-ui-wizard-radio-mark" aria-hidden="true">{item.id === plan &&
                        <HbarAppUiIcon icon={Check} tier="xs" />}</span><span
                        className="hbar-app-ui-wizard-plan-copy"><span><strong>{item.label}</strong>{item.recommended &&
                        <em>Recommended</em>}</span><small>{item.detail}</small></span><span
                        className="hbar-app-ui-wizard-plan-price"><b>{item.price}</b>/seat/mo</span></label>)}</div>
                <p className="hbar-app-ui-wizard-plan-note">Seat count carries over from the current term. You can
                    adjust it on the next step before anything is charged.</p></section>
            <section className="hbar-app-ui-wizard-invoice-preview">
                <header><h2>Invoice preview</h2><span>Annual</span></header>
                <div className="hbar-app-ui-wizard-invoice-total"><small>Due
                    today</small><strong>{selectedPlan.id === 'team' ? '$21,235' : selectedPlan.id === 'enterprise' ? '$42,235' : '$31,235'}</strong>
                    <p>{selectedPlan.label} · 42 seats · billed once</p></div>
                <dl>
                    <div>
                        <dt>Seats</dt>
                        <dd><strong>42 seats, annual</strong><span>$36,288</span></dd>
                    </div>
                    <div>
                        <dt>Term credit</dt>
                        <dd><strong>15% on annual</strong><span>−$5,443</span></dd>
                    </div>
                    <div>
                        <dt>Support</dt>
                        <dd><strong>Priority response</strong><span>$390</span></dd>
                    </div>
                    <div>
                        <dt>Renewal</dt>
                        <dd><strong>May 31, 2026</strong></dd>
                    </div>
                    <div>
                        <dt>Purchase order</dt>
                        <dd><strong>PO-2026-184</strong></dd>
                    </div>
                </dl>
            </section>
        </main>
        <WizardFooter><span>Nothing is charged until the review step.</span><WizardButton tone="light"
                                                                                          onClick={() => move(step + 1)}>Next <HbarAppUiIcon icon={ArrowRight} tier="sm"
            /></WizardButton></WizardFooter></WizardFrame>
}
