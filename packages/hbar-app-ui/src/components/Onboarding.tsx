import {useState} from 'react'
import {Check, ChevronRight, Copy, Mail} from 'lucide-react'
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

type OnboardingProps = HbarAppUiVariantProps

function ProfileSetup({spec, onAction}: OnboardingProps) {
    const [name, setName] = useState('Avery Chen');
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-onboarding-variant-1">
        <div className="hbar-app-ui-onboarding-split">
            <main><HbarAppUiToolbar title="Set up your profile"
                                    detail="Your teammates will see this information"/><label>Name<input value={name}
                                                                                                         onChange={(event) => setName(event.target.value)}/></label><label>Role<input
                defaultValue="Workspace operator"/></label><HbarAppUiButton tone="accent" onClick={() => onAction?.({
                variantId: spec.id,
                actionId: 'save',
                value: name
            })}>Continue</HbarAppUiButton></main>
            <HbarAppUiSpotlight><span
                className="hbar-app-ui-avatar hbar-app-ui-avatar-large">{name[0]}</span><strong>{name}</strong><small>Workspace
                operator</small>
                <div className="hbar-app-ui-directory-preview"><span>Active runs <b>24</b></span><span>Projects <b>8</b></span>
                </div>
            </HbarAppUiSpotlight></div>
    </ActionSurfaceFrame>
}

function SixStep({spec, onAction}: OnboardingProps) {
    const [step, setStep] = useState(2);
    const labels = ['Profile', 'Connect host', 'Choose workspace', 'Preferences', 'Invite team', 'Finish'];
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-onboarding-variant-2"><HbarAppUiToolbar title="Getting started"
                                                                                              detail={`${step} of ${labels.length}`}/>
        <div className="hbar-app-ui-vertical-stepper">{labels.map((label, index) => <button type="button"
                                                                                            className={index < step ? 'is-complete' : index === step ? 'is-active' : ''}
                                                                                            key={label}
                                                                                            onClick={() => setStep(index)}>
            <span>{index < step ? <Check size={13}/> : index + 1}</span>
            <div>
                <strong>{label}</strong><small>{index < step ? 'Complete' : index === step ? 'Current step' : 'Not started'}</small>
            </div>
            <ChevronRight size={13}/></button>)}</div>
        <HbarAppUiSpotlight><strong>{labels[step] ?? labels[0]}</strong><p>Complete this step to unlock the next part of
            your workspace.</p><HbarAppUiButton tone="accent" onClick={() => {
            setStep(Math.min(labels.length - 1, step + 1));
            onAction?.({variantId: spec.id, actionId: 'step', value: labels[step] ?? ''})
        }}>Continue</HbarAppUiButton></HbarAppUiSpotlight></ActionSurfaceFrame>
}

function GettingStarted({spec, onAction}: OnboardingProps) {
    const [done, setDone] = useState(1);
    const tasks = ['Connect a host', 'Create a project', 'Run a first task', 'Invite a teammate'];
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-onboarding-variant-3"><HbarAppUiToolbar
        title="Getting started checklist" detail={`${done} of ${tasks.length} complete`}/><HbarAppUiProgress
        value={done / tasks.length * 100} label="Onboarding completion"/>
        <div className="hbar-app-ui-start-checklist">{tasks.map((task, index) => <HbarAppUiSpotlight
            key={task}><span>{index < done ? <Check size={13}/> : index + 1}</span>
            <div><strong>{task}</strong><small>{index < done ? 'Complete' : 'Action required'}</small></div>
            <HbarAppUiButton onClick={() => {
                setDone(Math.max(done, index + 1));
                onAction?.({variantId: spec.id, actionId: 'task', value: task})
            }}>{index < done ? 'View' : 'Start'}</HbarAppUiButton></HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function UseCasePicker({spec, onAction}: OnboardingProps) {
    const [useCase, setUseCase] = useState('Product');
    const [size, setSize] = useState('2–10');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-onboarding-variant-4"><HbarAppUiToolbar
        title="Choose your use case" detail="Tailor the workspace to your team"/>
        <div className="hbar-app-ui-option-tiles">{['Product', 'Engineering', 'Support', 'Research'].map((item) =>
            <button type="button" className={useCase === item ? 'is-selected' : ''} key={item}
                    onClick={() => setUseCase(item)}><strong>{item}</strong><small>Recommended workflows</small>
            </button>)}</div>
        <HbarAppUiTabs label="Team size" value={size}
                       options={['1', '2–10', '11–50', '51+'].map((id) => ({id, label: id}))}
                       onChange={setSize}/><HbarAppUiButton tone="accent" onClick={() => onAction?.({
            variantId: spec.id,
            actionId: 'save',
            value: `${useCase}:${size}`
        })}>Continue</HbarAppUiButton></ActionSurfaceFrame>
}

function InviteTeam({spec, onAction}: OnboardingProps) {
    const [copied, setCopied] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-onboarding-variant-5"><HbarAppUiToolbar title="Invite teammates"
                                                                                              detail="Roles and shareable link"/>
        <div className="hbar-app-ui-invite-row"><input type="email" placeholder="teammate@workspace.test"/><select
            aria-label="Invite role">
            <option>Member</option>
            <option>Admin</option>
        </select><HbarAppUiButton tone="accent"
                                  onClick={() => onAction?.({variantId: spec.id, actionId: 'invite'})}><Mail size={13}/>Send
            invite</HbarAppUiButton></div>
        <div className="hbar-app-ui-invite-list"><HbarAppUiSpotlight><span
            className="hbar-app-ui-avatar">A</span><strong>Avery Chen</strong><HbarAppUiStatus value="Joined"
                                                                                               tone="positive"/></HbarAppUiSpotlight><HbarAppUiSpotlight><span
            className="hbar-app-ui-avatar">?</span><strong>pending@workspace.test</strong><HbarAppUiStatus
            value="Pending" tone="warning"/></HbarAppUiSpotlight></div>
        <div className="hbar-app-ui-share-link"><code>hbar.local/invite/atlas-91a2</code><HbarAppUiButton
            onClick={() => {
                setCopied(true);
                onAction?.({variantId: spec.id, actionId: 'copy'})
            }}><Copy size={13}/>{copied ? 'Copied' : 'Copy link'}</HbarAppUiButton></div>
    </ActionSurfaceFrame>
}

function CompleteSummary({spec, onAction}: OnboardingProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-onboarding-variant-6"><HbarAppUiToolbar title="Workspace ready"
                                                                                              detail="Everything is configured"/><HbarAppUiStatus
        value="Complete" tone="positive"/>
        <div className="hbar-app-ui-complete-summary"><Check size={28}/><h2>You're ready to go</h2><p>Host connected,
            workspace created and preferences saved.</p><HbarAppUiMetricStrip
            metrics={[{label: 'Host', value: 'Connected', tone: 'positive'}, {
                label: 'Workspace',
                value: 'Atlas'
            }, {label: 'Members', value: '1'}]}/>
            <div><HbarAppUiButton tone="accent"
                                  onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: 'task'})}>Run
                first task</HbarAppUiButton><HbarAppUiButton
                onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: 'settings'})}>Review
                settings</HbarAppUiButton></div>
        </div>
    </ActionSurfaceFrame>
}

function SlugStepper({spec, onAction}: OnboardingProps) {
    const [step, setStep] = useState('Workspace');
    const [slug, setSlug] = useState('project-atlas');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-onboarding-variant-7"><HbarAppUiTabs label="Setup steps"
                                                                                           value={step}
                                                                                           options={['Workspace', 'Team', 'Finish'].map((id) => ({
                                                                                               id,
                                                                                               label: id
                                                                                           }))}
                                                                                           onChange={setStep}/><HbarAppUiSpotlight><HbarAppUiToolbar
        title={step} detail="Live URL slug preview"/><label>Workspace name<input
        defaultValue="Project Atlas"/></label><label>URL slug<input value={slug}
                                                                    onChange={(event) => setSlug(event.target.value)}/></label><span
        className="hbar-app-ui-slug-preview">hbar.local/{slug}</span></HbarAppUiSpotlight><HbarAppUiButton tone="accent"
                                                                                                           onClick={() => onAction?.({
                                                                                                               variantId: spec.id,
                                                                                                               actionId: 'step',
                                                                                                               value: step
                                                                                                           })}>{step === 'Finish' ? 'Finish setup' : 'Next'}</HbarAppUiButton></ActionSurfaceFrame>
}

export function Onboarding({spec, onAction}: OnboardingProps) {
    switch (spec.variant) {
        case 1:
            return <ProfileSetup spec={spec} onAction={onAction}/>;
        case 2:
            return <SixStep spec={spec} onAction={onAction}/>;
        case 3:
            return <GettingStarted spec={spec} onAction={onAction}/>;
        case 4:
            return <UseCasePicker spec={spec} onAction={onAction}/>;
        case 5:
            return <InviteTeam spec={spec} onAction={onAction}/>;
        case 6:
            return <CompleteSummary spec={spec} onAction={onAction}/>;
        case 7:
            return <SlugStepper spec={spec} onAction={onAction}/>;
        default:
            return <ProfileSetup spec={spec} onAction={onAction}/>
    }
}
