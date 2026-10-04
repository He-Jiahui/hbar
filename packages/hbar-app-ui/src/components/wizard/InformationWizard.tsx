import {
  LumenFrame,
  LumenOption,
  LumenText,
 LumenInput, LumenSelect } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../../icon'
import {useState} from 'react'
import {ArrowLeft, ArrowRight, Check, CreditCard} from 'lucide-react'
import {
    reportWizardAction,
    WizardButton,
    WizardField,
    WizardFooter,
    WizardFrame,
    WizardStepRail,
    type WizardSurfaceProps,
} from './WizardPrimitives'

const steps = [
    {id: 'information', label: 'Information'},
    {id: 'payment', label: 'Payment'},
    {id: 'completed', label: 'Completed'},
] as const

type InformationValues = {
    firstName: string
    lastName: string
    company: string
    handle: string
    role: string
    country: string
    email: string
    mobile: string
}

export function InformationWizard({spec, onAction}: WizardSurfaceProps) {
    const [step, setStep] = useState(0)
    const [values, setValues] = useState<InformationValues>({
        firstName: 'Mara',
        lastName: 'Chen',
        company: 'Kepler Works',
        handle: 'kepler-works',
        role: 'Procurement owner',
        country: 'United States',
        email: 'mara@kepler.works',
        mobile: '+1 415 5151',
    })

    const update = (key: keyof InformationValues, value: string) => setValues((current) => ({...current, [key]: value}))
    const move = (nextStep: number) => {
        const bounded = Math.max(0, Math.min(steps.length - 1, nextStep))
        setStep(bounded)
        reportWizardAction(onAction, spec, 'step', String(bounded + 1))
    }

    return <WizardFrame spec={spec} onAction={onAction} className="hbar-app-ui-wizard-information">
        <WizardStepRail steps={steps} current={step} onSelect={move}/>
        <LumenFrame as="main" className="hbar-app-ui-wizard-information-main">{step === 0 && <>
            <LumenFrame as="header"><LumenText as="h1">Your information</LumenText><LumenText as="p">Billing owner details. These appear on every receipt.</LumenText></LumenFrame>
            <LumenFrame as="form" className="hbar-app-ui-wizard-information-form" onSubmit={(event) => {
                event.preventDefault()
                move(1)
            }}>
                <WizardField label="First name" required><LumenInput value={values.firstName}
                                                                onChange={(event) => update('firstName', event.target.value)}/></WizardField>
                <WizardField label="Last name" required><LumenInput value={values.lastName}
                                                               onChange={(event) => update('lastName', event.target.value)}/></WizardField>
                <WizardField label="Company" required><LumenInput value={values.company}
                                                             onChange={(event) => update('company', event.target.value)}/></WizardField>
                <WizardField label="Public handle">
                    <LumenFrame className="hbar-app-ui-wizard-input-prefix"><LumenText as="span" aria-hidden="true">@</LumenText><LumenInput
                        value={values.handle} onChange={(event) => update('handle', event.target.value)}/></LumenFrame>
                </WizardField>
                <WizardField label="Role"><LumenSelect value={values.role}
                                                  onChange={(event) => update('role', event.target.value)}>
                    <LumenOption>Procurement owner</LumenOption>
                    <LumenOption>Finance</LumenOption>
                    <LumenOption>Engineering</LumenOption>
                    <LumenOption>Founder</LumenOption>
                </LumenSelect></WizardField>
                <WizardField label="Country"><LumenSelect value={values.country}
                                                     onChange={(event) => update('country', event.target.value)}>
                    <LumenOption>United States</LumenOption>
                    <LumenOption>Portugal</LumenOption>
                    <LumenOption>Germany</LumenOption>
                    <LumenOption>Japan</LumenOption>
                </LumenSelect></WizardField>
                <WizardField label="Email address" required><LumenInput type="email" value={values.email}
                                                                   onChange={(event) => update('email', event.target.value)}/></WizardField>
                <WizardField label="Mobile">
                    <LumenFrame className="hbar-app-ui-wizard-input-prefix"><LumenText as="span">US</LumenText><LumenInput value={values.mobile}
                                                                                           onChange={(event) => update('mobile', event.target.value)}/>
                    </LumenFrame>
                </WizardField>
            </LumenFrame>
            <LumenText as="p" className="hbar-app-ui-wizard-information-note">Receipts and payment failures go to this address.</LumenText>
        </>}{step === 1 && <LumenFrame as="section" className="hbar-app-ui-wizard-payment-step">
            <LumenFrame as="header"><LumenText as="h1">Payment details</LumenText><LumenText as="p">Add a payment method for future receipts. Nothing is charged during
                setup.</LumenText></LumenFrame>
            <WizardField label="Card number" required>
                <LumenFrame className="hbar-app-ui-wizard-input-prefix"><HbarAppUiIcon icon={CreditCard} tier="sm"  aria-hidden="true"/><LumenInput
                    inputMode="numeric" placeholder="4242 4242 4242 4242"/></LumenFrame>
            </WizardField>
            <LumenFrame className="hbar-app-ui-wizard-payment-fields"><WizardField label="Expiry" required><LumenInput
                placeholder="MM / YY"/></WizardField><WizardField label="CVC" required><LumenInput
                placeholder="123"/></WizardField></LumenFrame>
        </LumenFrame>}{step === 2 && <LumenFrame as="section" className="hbar-app-ui-wizard-complete-step"><LumenText as="span"><HbarAppUiIcon icon={Check} tier="md" /></LumenText>
            <LumenFrame as="header"><LumenText as="h1">All set</LumenText><LumenText as="p">Your billing owner profile is ready. You can update these details later in
                settings.</LumenText></LumenFrame>
        </LumenFrame>}</LumenFrame>
        <WizardFooter><WizardButton disabled={step === 0} onClick={() => move(step - 1)}><HbarAppUiIcon icon={ArrowLeft} tier="sm"
            />Back</WizardButton><WizardButton tone="light"
                                                        onClick={() => move(step + 1)}>{step === 2 ? 'Done' : 'Next step'}{step < 2 &&
            <HbarAppUiIcon icon={ArrowRight} tier="sm" />}</WizardButton></WizardFooter>
    </WizardFrame>
}
