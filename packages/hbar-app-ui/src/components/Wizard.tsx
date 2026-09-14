import {useState} from 'react'
import {ArrowLeft, ArrowRight, Check, PackageCheck} from 'lucide-react'
import {
    HbarAppUiButton,
    HbarAppUiProgress,
    HbarAppUiSpotlight,
    HbarAppUiStatus,
    HbarAppUiTimeline,
    HbarAppUiToolbar
} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'
import {activitySteps} from './data'

type WizardProps = HbarAppUiVariantProps

function CardWizard({spec, onAction}: WizardProps) {
    const [step, setStep] = useState(1);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-wizard-variant-1"><HbarAppUiToolbar title="Create workspace"
                                                                                          detail={`Step ${step} of 3`}/>
        <div className="hbar-app-ui-inline-stepper">{[1, 2, 3].map((item) => <span
            className={item <= step ? 'is-active' : ''} key={item}>{item}</span>)}</div>
        <div className="hbar-app-ui-wizard-two-column">
            <main><label>Name<input placeholder="Workspace name"/></label><label>Region<select defaultValue="us-east">
                <option>us-east</option>
                <option>eu-west</option>
            </select></label></main>
            <HbarAppUiSpotlight><strong>Details</strong><span>Plan · Team</span><span>Seats · 12</span><span>Region · us-east</span></HbarAppUiSpotlight>
        </div>
        <footer><HbarAppUiButton disabled={step === 1} onClick={() => setStep((value) => value - 1)}><ArrowLeft
            size={13}/>Back</HbarAppUiButton><HbarAppUiButton tone="accent" onClick={() => {
            setStep(Math.min(3, step + 1));
            onAction?.({variantId: spec.id, actionId: 'step', value: String(step + 1)})
        }}>{step === 3 ? 'Finish' : 'Next'}<ArrowRight size={13}/></HbarAppUiButton></footer>
    </ActionSurfaceFrame>
}

function FullWizard({spec, onAction}: WizardProps) {
    const [step, setStep] = useState(2);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-wizard-variant-2"><HbarAppUiToolbar title="Task wizard"
                                                                                          detail={`Section ${step} of 5`}/><HbarAppUiProgress
        value={step / 5 * 100} label="Wizard progress"/>
        <div
            className="hbar-app-ui-wizard-sections">{['Scope', 'Sources', 'Actions', 'Review', 'Done'].map((section, index) =>
            <section className={index + 1 === step ? 'is-current' : index + 1 < step ? 'is-complete' : ''}
                     key={section}><span>{index + 1 < step ? <Check size={13}/> : index + 1}</span>
                <div>
                    <strong>{section}</strong><small>{index + 1 === step ? 'Current section' : index + 1 < step ? 'Complete' : 'Pending'}</small>
                </div>
            </section>)}</div>
        <HbarAppUiSpotlight><h3>{['Scope', 'Sources', 'Actions', 'Review', 'Done'][step - 1]}</h3><p>Complete this
            section before moving to the next one.</p><HbarAppUiButton tone="accent" onClick={() => {
            setStep(Math.min(5, step + 1));
            onAction?.({variantId: spec.id, actionId: 'step', value: String(step + 1)})
        }}>Continue</HbarAppUiButton></HbarAppUiSpotlight></ActionSurfaceFrame>
}

function PlanSelection({spec, onAction}: WizardProps) {
    const [plan, setPlan] = useState('Team');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-wizard-variant-3"><HbarAppUiToolbar title="Select a plan"
                                                                                          detail="Draft quote"/>
        <div className="hbar-app-ui-plan-selection-layout">
            <div>{['Starter', 'Pro', 'Team'].map((item) => <label className={plan === item ? 'is-selected' : ''}
                                                                  key={item}><input type="radio" name="plan"
                                                                                    checked={plan === item}
                                                                                    onChange={() => setPlan(item)}/><span><strong>{item}</strong><small>{item === 'Starter' ? '$0 / mo' : item === 'Pro' ? '$24 / mo' : '$48 / mo'}</small></span></label>)}</div>
            <HbarAppUiSpotlight><HbarAppUiStatus value="Draft"/><strong>Invoice preview</strong><span>{plan} plan · 12 seats</span><b>{plan === 'Starter' ? '$0.00' : plan === 'Pro' ? '$288.00' : '$576.00'}</b></HbarAppUiSpotlight>
        </div>
        <HbarAppUiButton tone="accent" onClick={() => onAction?.({
            variantId: spec.id,
            actionId: 'select',
            value: plan
        })}>Continue</HbarAppUiButton></ActionSurfaceFrame>
}

function ServiceSelection({spec, onAction}: WizardProps) {
    const [services, setServices] = useState<string[]>(['Git provider']);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-wizard-variant-4">
        <div className="hbar-app-ui-wizard-band"><strong>Connect services</strong><small>Choose what this workspace can
            access</small></div>
        <div
            className="hbar-app-ui-service-tiles">{['Git provider', 'Issue tracker', 'Notifications', 'Storage'].map((service) =>
            <button type="button" className={services.includes(service) ? 'is-selected' : ''} key={service}
                    onClick={() => setServices((current) => current.includes(service) ? current.filter((item) => item !== service) : [...current, service])}>
                <PackageCheck
                    size={17}/><strong>{service}</strong><small>{services.includes(service) ? 'Selected' : 'Available'}</small>
            </button>)}</div>
        <footer className="hbar-app-ui-summary-footer"><span>{services.length} services selected</span><HbarAppUiButton
            tone="accent" onClick={() => onAction?.({
            variantId: spec.id,
            actionId: 'continue',
            value: services.join(',')
        })}>Continue</HbarAppUiButton></footer>
    </ActionSurfaceFrame>
}

function ReviewConfirm({spec, onAction}: WizardProps) {
    const [confirmed, setConfirmed] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-wizard-variant-5"><HbarAppUiToolbar title="Review and confirm"
                                                                                          detail="Edit any section before submit"/>
        <div className="hbar-app-ui-review-sections">{['Workspace', 'Members', 'Permissions'].map((section) =>
            <HbarAppUiSpotlight key={section}>
                <div>
                    <strong>{section}</strong><small>{section === 'Workspace' ? 'Project Atlas · us-east' : section === 'Members' ? '12 seats' : 'Read + write'}</small>
                </div>
                <HbarAppUiButton onClick={() => onAction?.({
                    variantId: spec.id,
                    actionId: 'edit',
                    value: section
                })}>Edit</HbarAppUiButton></HbarAppUiSpotlight>)}</div>
        <label><input type="checkbox" checked={confirmed} onChange={() => setConfirmed((value) => !value)}/>I confirm
            these details are correct.</label><HbarAppUiButton tone="accent" disabled={!confirmed}
                                                               onClick={() => onAction?.({
                                                                   variantId: spec.id,
                                                                   actionId: 'confirm'
                                                               })}>Submit</HbarAppUiButton></ActionSurfaceFrame>
}

function RunningWizard({spec, onAction}: WizardProps) {
    const [running, setRunning] = useState(true);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-wizard-variant-6"><HbarAppUiToolbar title="Running task"
                                                                                          detail="Overall progress and per-task state"/><HbarAppUiButton
        onClick={() => {
            setRunning((value) => !value);
            onAction?.({variantId: spec.id, actionId: running ? 'pause' : 'resume'})
        }}>{running ? 'Pause' : 'Resume'}</HbarAppUiButton><HbarAppUiProgress value={running ? 64 : 52}
                                                                              label="Overall task progress"
                                                                              tone={running ? 'accent' : 'warning'}/><HbarAppUiTimeline
        steps={activitySteps.slice(0, 5).map((step, index) => ({
            ...step,
            status: index < 2 ? 'complete' : index === 2 && running ? 'active' : index === 2 ? 'failed' : 'pending'
        }))}/></ActionSurfaceFrame>
}

function CompactWizard({spec, onAction}: WizardProps) {
    const [step, setStep] = useState(0);
    const questions = ['What is the workspace name?', 'Which region should it use?', 'Ready to create?'];
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-wizard-variant-7">
        <div className="hbar-app-ui-dot-pagination">{questions.map((_, index) => <button type="button"
                                                                                         className={index === step ? 'is-active' : ''}
                                                                                         key={index}
                                                                                         onClick={() => setStep(index)}/>)}</div>
        <HbarAppUiSpotlight><strong>{questions[step]}</strong>{step < 2 ?
            <input placeholder={step === 0 ? 'Project Atlas' : 'us-east'}/> :
            <HbarAppUiStatus value="Ready to create" tone="positive"/>}
            <div><HbarAppUiButton disabled={step === 0} onClick={() => setStep((value) => value - 1)}><ArrowLeft
                size={13}/>Back</HbarAppUiButton><HbarAppUiButton tone="accent" onClick={() => {
                setStep(Math.min(2, step + 1));
                onAction?.({variantId: spec.id, actionId: 'step', value: String(step + 1)})
            }}>{step === 2 ? 'Create' : 'Continue'}<ArrowRight size={13}/></HbarAppUiButton></div>
        </HbarAppUiSpotlight></ActionSurfaceFrame>
}

export function Wizard({spec, onAction}: WizardProps) {
    switch (spec.variant) {
        case 1:
            return <CardWizard spec={spec} onAction={onAction}/>;
        case 2:
            return <FullWizard spec={spec} onAction={onAction}/>;
        case 3:
            return <PlanSelection spec={spec} onAction={onAction}/>;
        case 4:
            return <ServiceSelection spec={spec} onAction={onAction}/>;
        case 5:
            return <ReviewConfirm spec={spec} onAction={onAction}/>;
        case 6:
            return <RunningWizard spec={spec} onAction={onAction}/>;
        case 7:
            return <CompactWizard spec={spec} onAction={onAction}/>;
        default:
            return <CardWizard spec={spec} onAction={onAction}/>
    }
}
