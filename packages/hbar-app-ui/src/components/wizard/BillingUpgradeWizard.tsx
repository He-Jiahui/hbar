import {
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenText,
 LumenInput } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../../icon'
import {useState} from 'react'
import {ArrowRight, Check} from 'lucide-react'
import {
    reportWizardAction,
    WizardButton,
    WizardFooter,
    WizardFrame,
    WizardStepRail,
    type WizardSurfaceProps,
} from './WizardPrimitives'

const steps = [
    {id: 'plan', label: 'Plan'},
    {id: 'seats', label: 'Seats'},
    {id: 'payment', label: 'Payment'},
    {id: 'review', label: 'Review'},
] as const

const plans = [
    {
        id: 'team',
        label: 'Team',
        detail: 'Workspace controls for growing product teams.',
        price: '$49',
        recommended: false
    },
    {
        id: 'business',
        label: 'Business',
        detail: 'SAML, audit exports, and priority support.',
        price: '$72',
        recommended: true
    },
    {
        id: 'enterprise',
        label: 'Enterprise',
        detail: 'Procurement review and account governance.',
        price: '$96',
        recommended: false
    },
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
        <LumenFrame as="header" className="hbar-app-ui-wizard-billing-header">
            <LumenFrame><LumenText as="h1">Billing upgrade</LumenText><LumenText as="p">Change plan, seats, and payment terms before renewal.</LumenText></LumenFrame>
            <LumenText as="span" className="hbar-app-ui-wizard-draft"><LumenFrame as="i"/>Draft</LumenText><WizardStepRail steps={steps} current={step}
                                                                                       onSelect={move}/></LumenFrame>
        <LumenFrame as="main" className="hbar-app-ui-wizard-billing-main">
            <LumenFrame as="section" className="hbar-app-ui-wizard-plan-column"><LumenText as="h2">Plan</LumenText>
                <LumenFrame className="hbar-app-ui-wizard-plan-list" role="radiogroup" aria-label="Plans">{plans.map((item) =>
                    <LumenFrame as="label" key={item.id} className={item.id === plan ? 'is-selected' : ''}><LumenInput type="radio"
                                                                                                  name="billing-plan"
                                                                                                  value={item.id}
                                                                                                  checked={item.id === plan}
                                                                                                  onChange={() => {
                                                                                                      setPlan(item.id)
                                                                                                      reportWizardAction(onAction, spec, 'plan', item.id)
                                                                                                  }}/><LumenText as="span"
                        className="hbar-app-ui-wizard-radio-mark" aria-hidden="true">{item.id === plan &&
                        <HbarAppUiIcon icon={Check} tier="xs" />}</LumenText><LumenText as="span"
                        className="hbar-app-ui-wizard-plan-copy"><LumenText as="span"><LumenText as="strong">{item.label}</LumenText>{item.recommended &&
                        <LumenText as="em">Recommended</LumenText>}</LumenText><LumenText as="small">{item.detail}</LumenText></LumenText><LumenText as="span"
                        className="hbar-app-ui-wizard-plan-price"><LumenText as="b">{item.price}</LumenText>/seat/mo</LumenText></LumenFrame>)}</LumenFrame>
                <LumenText as="p" className="hbar-app-ui-wizard-plan-note">Seat count carries over from the current term. You can
                    adjust it on the next step before anything is charged.</LumenText></LumenFrame>
            <LumenFrame as="section" className="hbar-app-ui-wizard-invoice-preview">
                <LumenFrame as="header"><LumenText as="h2">Invoice preview</LumenText><LumenText as="span">Annual</LumenText></LumenFrame>
                <LumenFrame className="hbar-app-ui-wizard-invoice-total"><LumenText as="small">Due
                    today</LumenText><LumenText as="strong">{selectedPlan.id === 'team' ? '$21,235' : selectedPlan.id === 'enterprise' ? '$42,235' : '$31,235'}</LumenText>
                    <LumenText as="p">{selectedPlan.label} · 42 seats · billed once</LumenText></LumenFrame>
                <LumenCollection as="dl">
                    <LumenFrame>
                        <LumenCollectionItem as="dt">Seats</LumenCollectionItem>
                        <LumenCollectionItem as="dd"><LumenText as="strong">42 seats, annual</LumenText><LumenText as="span">$36,288</LumenText></LumenCollectionItem>
                    </LumenFrame>
                    <LumenFrame>
                        <LumenCollectionItem as="dt">Term credit</LumenCollectionItem>
                        <LumenCollectionItem as="dd"><LumenText as="strong">15% on annual</LumenText><LumenText as="span">−$5,443</LumenText></LumenCollectionItem>
                    </LumenFrame>
                    <LumenFrame>
                        <LumenCollectionItem as="dt">Support</LumenCollectionItem>
                        <LumenCollectionItem as="dd"><LumenText as="strong">Priority response</LumenText><LumenText as="span">$390</LumenText></LumenCollectionItem>
                    </LumenFrame>
                    <LumenFrame>
                        <LumenCollectionItem as="dt">Renewal</LumenCollectionItem>
                        <LumenCollectionItem as="dd"><LumenText as="strong">May 31, 2026</LumenText></LumenCollectionItem>
                    </LumenFrame>
                    <LumenFrame>
                        <LumenCollectionItem as="dt">Purchase order</LumenCollectionItem>
                        <LumenCollectionItem as="dd"><LumenText as="strong">PO-2026-184</LumenText></LumenCollectionItem>
                    </LumenFrame>
                </LumenCollection>
            </LumenFrame>
        </LumenFrame>
        <WizardFooter><LumenText as="span">Nothing is charged until the review step.</LumenText><WizardButton tone="light"
                                                                                          onClick={() => move(step + 1)}>Next <HbarAppUiIcon icon={ArrowRight} tier="sm"
            /></WizardButton></WizardFooter></WizardFrame>
}
