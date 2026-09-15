import {useState} from 'react'
import {ArrowLeft, ArrowRight, Check, CreditCard} from 'lucide-react'
import {
    WizardButton,
    WizardField,
    WizardFooter,
    WizardFrame,
    WizardStepRail,
    reportWizardAction,
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
        <main className="hbar-app-ui-wizard-information-main">{step === 0 && <>
            <header><h1>Your information</h1><p>Billing owner details. These appear on every receipt.</p></header>
            <form className="hbar-app-ui-wizard-information-form" onSubmit={(event) => {
                event.preventDefault()
                move(1)
            }}>
                <WizardField label="First name" required><input value={values.firstName} onChange={(event) => update('firstName', event.target.value)}/></WizardField>
                <WizardField label="Last name" required><input value={values.lastName} onChange={(event) => update('lastName', event.target.value)}/></WizardField>
                <WizardField label="Company" required><input value={values.company} onChange={(event) => update('company', event.target.value)}/></WizardField>
                <WizardField label="Public handle"><div className="hbar-app-ui-wizard-input-prefix"><span aria-hidden="true">@</span><input value={values.handle} onChange={(event) => update('handle', event.target.value)}/></div></WizardField>
                <WizardField label="Role"><select value={values.role} onChange={(event) => update('role', event.target.value)}><option>Procurement owner</option><option>Finance</option><option>Engineering</option><option>Founder</option></select></WizardField>
                <WizardField label="Country"><select value={values.country} onChange={(event) => update('country', event.target.value)}><option>United States</option><option>Portugal</option><option>Germany</option><option>Japan</option></select></WizardField>
                <WizardField label="Email address" required><input type="email" value={values.email} onChange={(event) => update('email', event.target.value)}/></WizardField>
                <WizardField label="Mobile"><div className="hbar-app-ui-wizard-input-prefix"><span>US</span><input value={values.mobile} onChange={(event) => update('mobile', event.target.value)}/></div></WizardField>
            </form>
            <p className="hbar-app-ui-wizard-information-note">Receipts and payment failures go to this address.</p>
        </>}{step === 1 && <section className="hbar-app-ui-wizard-payment-step"><header><h1>Payment details</h1><p>Add a payment method for future receipts. Nothing is charged during setup.</p></header><WizardField label="Card number" required><div className="hbar-app-ui-wizard-input-prefix"><CreditCard size={15} aria-hidden="true"/><input inputMode="numeric" placeholder="4242 4242 4242 4242"/></div></WizardField><div className="hbar-app-ui-wizard-payment-fields"><WizardField label="Expiry" required><input placeholder="MM / YY"/></WizardField><WizardField label="CVC" required><input placeholder="123"/></WizardField></div></section>}{step === 2 && <section className="hbar-app-ui-wizard-complete-step"><span><Check size={18}/></span><header><h1>All set</h1><p>Your billing owner profile is ready. You can update these details later in settings.</p></header></section>}</main>
        <WizardFooter><WizardButton disabled={step === 0} onClick={() => move(step - 1)}><ArrowLeft size={15}/>Back</WizardButton><WizardButton tone="light" onClick={() => move(step + 1)}>{step === 2 ? 'Done' : 'Next step'}{step < 2 && <ArrowRight size={15}/>}</WizardButton></WizardFooter>
    </WizardFrame>
}
