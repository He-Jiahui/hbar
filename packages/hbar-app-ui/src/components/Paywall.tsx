import {useState} from 'react'
import {Check, LockKeyhole, Mail, Sparkles} from 'lucide-react'
import {
    HbarAppUiButton,
    HbarAppUiDialog,
    HbarAppUiMetricStrip,
    HbarAppUiProgress,
    HbarAppUiSpotlight,
    HbarAppUiStatus,
    HbarAppUiTabs,
    HbarAppUiToolbar
} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'

type PaywallProps = HbarAppUiVariantProps

function ArticleLock({spec, onAction}: PaywallProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-paywall-variant-1"><HbarAppUiToolbar title="Members-only article"
                                                                                           detail="Preview fades before the lock"/>
        <div className="hbar-app-ui-article-preview"><h2>Reliable workspace operations</h2><p>Keep actions, status and
            recovery close together so teams can move quickly.</p><p>Use a shared activity surface to show what is
            running and what needs review.</p>
            <div className="hbar-app-ui-fade-text">The rest of this guide includes practical patterns for handling long
                histories and partial failures.
            </div>
        </div>
        <HbarAppUiSpotlight className="hbar-app-ui-membership-card"><LockKeyhole size={18}/><strong>Continue reading
            with a workspace membership</strong><p>Unlock the complete article and saved examples.</p><HbarAppUiButton
            tone="accent" onClick={() => onAction?.({variantId: spec.id, actionId: 'upgrade'})}>Unlock
            article</HbarAppUiButton></HbarAppUiSpotlight></ActionSurfaceFrame>
}

function FeatureGate({spec, onAction}: PaywallProps) {
    const [open, setOpen] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-paywall-variant-2"><HbarAppUiToolbar title="Feature locked"
                                                                                           detail="Upgrade to unlock this capability"/><HbarAppUiButton
        tone="accent" onClick={() => setOpen(true)}><Sparkles size={13}/>See what's
        included</HbarAppUiButton><HbarAppUiSpotlight><LockKeyhole size={18}/><strong>Advanced run analytics</strong>
        <p>Compare cohorts, export reports and keep custom dashboards.</p></HbarAppUiSpotlight><HbarAppUiDialog
        open={open} title="Upgrade unlocks" onClose={() => setOpen(false)}
        footer={<><HbarAppUiButton onClick={() => setOpen(false)}>Maybe later</HbarAppUiButton><HbarAppUiButton
            tone="accent" onClick={() => {
            setOpen(false);
            onAction?.({variantId: spec.id, actionId: 'upgrade'})
        }}>Upgrade now</HbarAppUiButton></>}>
        <ul>
            <li><Check size={13}/>Unlimited analytics</li>
            <li><Check size={13}/>Exportable reports</li>
            <li><Check size={13}/>Priority support</li>
        </ul>
    </HbarAppUiDialog></ActionSurfaceFrame>
}

function PlanComparison({spec, onAction}: PaywallProps) {
    const [period, setPeriod] = useState('Monthly');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-paywall-variant-3"><HbarAppUiToolbar title="Choose a plan"
                                                                                           detail="Compare capabilities"/><HbarAppUiTabs
        label="Billing period" value={period}
        options={[{id: 'Monthly', label: 'Monthly'}, {id: 'Yearly', label: 'Yearly · save 20%'}]} onChange={setPeriod}/>
        <div className="hbar-app-ui-paywall-plans">{[{name: 'Starter', price: '$0'}, {
            name: 'Pro',
            price: period === 'Yearly' ? '$19' : '$24'
        }, {name: 'Team', price: period === 'Yearly' ? '$38' : '$48'}].map((plan, index) => <HbarAppUiSpotlight
            className={index === 1 ? 'is-featured' : ''}
            key={plan.name}><strong>{plan.name}</strong><b>{plan.price}<small>/month</small></b>
            <ul>
                <li>Activity history</li>
                <li>Scoped approvals</li>
                <li>Usage insights</li>
            </ul>
            <HbarAppUiButton tone={index === 1 ? 'accent' : 'neutral'} onClick={() => onAction?.({
                variantId: spec.id,
                actionId: 'choose',
                value: plan.name
            })}>{index === 0 ? 'Current plan' : 'Choose plan'}</HbarAppUiButton></HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function UsageCap({spec, onAction}: PaywallProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-paywall-variant-4"><HbarAppUiToolbar title="Usage cap reached"
                                                                                           detail="Choose top-up or upgrade"/><HbarAppUiStatus
        value="Limit reached" tone="warning"/>
        <div className="hbar-app-ui-cap-meters">{['Tokens', 'Requests', 'Seats'].map((label) => <HbarAppUiSpotlight
            key={label}><strong>{label}</strong><span>100% used</span><HbarAppUiProgress value={100}
                                                                                         label={`${label} quota`}
                                                                                         tone="warning"/></HbarAppUiSpotlight>)}</div>
        <div><HbarAppUiButton onClick={() => onAction?.({variantId: spec.id, actionId: 'top-up'})}>Top
            up</HbarAppUiButton><HbarAppUiButton tone="accent" onClick={() => onAction?.({
            variantId: spec.id,
            actionId: 'upgrade'
        })}>Upgrade</HbarAppUiButton></div>
    </ActionSurfaceFrame>
}

function TrialExpired({spec, onAction}: PaywallProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-paywall-variant-5"><HbarAppUiSpotlight
        className="hbar-app-ui-trial-card"><LockKeyhole size={20}/><strong>Your trial has ended</strong><p>Your projects
        and data are retained. Reactivate to continue where you left off.</p><HbarAppUiButton tone="accent"
                                                                                              onClick={() => onAction?.({
                                                                                                  variantId: spec.id,
                                                                                                  actionId: 'reactivate'
                                                                                              })}>Reactivate
        trial</HbarAppUiButton><small>One click · no data migration
        required</small></HbarAppUiSpotlight></ActionSurfaceFrame>
}

function MeteredReads({spec, onAction}: PaywallProps) {
    const [email, setEmail] = useState('');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-paywall-variant-6"><HbarAppUiToolbar title="Reading limit"
                                                                                           detail="Capture an email or sign in"/><HbarAppUiMetricStrip
        metrics={[{label: 'Reads used', value: '8 / 10'}, {label: 'Resets', value: 'Tomorrow'}]}/><HbarAppUiProgress
        value={80} label="Reads used" tone="warning"/><label><Mail size={13}/>Email<input type="email" value={email}
                                                                                          onChange={(event) => setEmail(event.target.value)}
                                                                                          placeholder="you@workspace.test"/></label><HbarAppUiButton
        tone="accent" disabled={!email.includes('@')}
        onClick={() => onAction?.({variantId: spec.id, actionId: 'save', value: email})}>Email me
        access</HbarAppUiButton>
        <button type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'sign-in'})}>Already a member?
            Sign in
        </button>
    </ActionSurfaceFrame>
}

function SeatGate({spec, onAction}: PaywallProps) {
    const [requested, setRequested] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-paywall-variant-7"><HbarAppUiToolbar
        title="Seat-level feature gate" detail="Ask a workspace admin"/><HbarAppUiSpotlight><LockKeyhole
        size={18}/><strong>This feature needs an additional seat</strong><p>Send an upgrade request to your workspace
        admins.</p><HbarAppUiButton tone="accent" disabled={requested} onClick={() => {
        setRequested(true);
        onAction?.({variantId: spec.id, actionId: 'request-upgrade'})
    }}>{requested ? 'Request sent' : 'Request upgrade'}</HbarAppUiButton></HbarAppUiSpotlight></ActionSurfaceFrame>
}

export function Paywall({spec, onAction}: PaywallProps) {
    switch (spec.variant) {
        case 1:
            return <ArticleLock spec={spec} onAction={onAction}/>;
        case 2:
            return <FeatureGate spec={spec} onAction={onAction}/>;
        case 3:
            return <PlanComparison spec={spec} onAction={onAction}/>;
        case 4:
            return <UsageCap spec={spec} onAction={onAction}/>;
        case 5:
            return <TrialExpired spec={spec} onAction={onAction}/>;
        case 6:
            return <MeteredReads spec={spec} onAction={onAction}/>;
        case 7:
            return <SeatGate spec={spec} onAction={onAction}/>;
        default:
            return <ArticleLock spec={spec} onAction={onAction}/>
    }
}
