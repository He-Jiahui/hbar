import { LumenButton } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../icon'
import {useState} from 'react'
import {Bookmark, Check, Download, FileText, GitBranch} from 'lucide-react'
import {
    HbarAppUiButton,
    HbarAppUiIconButton,
    HbarAppUiMetricStrip,
    HbarAppUiSpotlight,
    HbarAppUiStatus,
    HbarAppUiTabs,
    HbarAppUiToolbar
} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'

type CardProps = HbarAppUiVariantProps

function MemberCard({spec, onAction}: CardProps) {
    const [connected, setConnected] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-card-variant-1"><HbarAppUiSpotlight
        className="hbar-app-ui-member-card"><span
        className="hbar-app-ui-avatar hbar-app-ui-avatar-large">A</span><HbarAppUiStatus
        value={connected ? 'Connected' : 'Online'} tone="positive"/><strong>Avery Chen</strong><small>Workspace
        operator</small><HbarAppUiMetricStrip metrics={[{label: 'Runs', value: '24'}, {label: 'Reviews', value: '08'}, {
        label: 'Uptime',
        value: '99%'
    }]}/><HbarAppUiButton onClick={() => {
        setConnected((value) => !value);
        onAction?.({variantId: spec.id, actionId: 'connect', value: String(!connected)})
    }}>{connected ? 'Connected' : 'Connect'}</HbarAppUiButton></HbarAppUiSpotlight></ActionSurfaceFrame>
}

function IntegrationCard({spec, onAction}: CardProps) {
    const [connected, setConnected] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-card-variant-2">
        <div
            className="hbar-app-ui-integration-rows">{['Git provider', 'Notifications', 'Issue tracker'].map((name, index) =>
            <HbarAppUiSpotlight key={name}><HbarAppUiIcon icon={GitBranch} tier="md" />
                <div>
                    <strong>{name}</strong><small>{connected && index === 0 ? 'Connected to Project Atlas' : 'Connect this service'}</small>
                </div>
                <LumenButton type="button" role="switch" aria-checked={connected && index === 0}
                        className={`hbar-app-ui-switch ${connected && index === 0 ? 'is-on' : ''}`} onClick={() => {
                    setConnected((value) => !value);
                    onAction?.({variantId: spec.id, actionId: 'connect', value: name})
                }}><i/></LumenButton>
            </HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function OnboardingCards({spec, onAction}: CardProps) {
    const [done, setDone] = useState(2);
    const items = ['Connect host', 'Choose workspace', 'Run first task', 'Invite teammate'];
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-card-variant-3"><HbarAppUiToolbar
        title="Get started" detail={`${done} of ${items.length} complete`}/><HbarAppUiButton onClick={() => {
        setDone(0);
        onAction?.({variantId: spec.id, actionId: 'reset'})
    }}>Reset</HbarAppUiButton>
        <div className="hbar-app-ui-onboarding-columns">{items.map((item, index) => <HbarAppUiSpotlight
            className={index < done ? 'is-complete' : ''} key={item}><span>{index < done ?
            <HbarAppUiIcon icon={Check} tier="sm" /> : index + 1}</span><strong>{item}</strong>
            <LumenButton type="button" onClick={() => {
                setDone(Math.max(done, index + 1));
                onAction?.({variantId: spec.id, actionId: 'step', value: item})
            }}>{index < done ? 'Done' : 'Start'}</LumenButton>
        </HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function AgendaCard({spec, onAction}: CardProps) {
    const [rsvp, setRsvp] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-card-variant-4"><HbarAppUiSpotlight
        className="hbar-app-ui-agenda-card">
        <div className="hbar-app-ui-date-tile"><strong>24</strong><small>SEP</small></div>
        <div><strong>Workspace review</strong><small>Thursday · 14:00–15:00</small><span
            className="hbar-app-ui-avatar-stack"><i>A</i><i>M</i><i>+3</i></span></div>
        <HbarAppUiButton tone={rsvp ? 'positive' : 'accent'} onClick={() => {
            setRsvp((value) => !value);
            onAction?.({variantId: spec.id, actionId: 'rsvp', value: String(!rsvp)})
        }}>{rsvp ? 'Going' : 'RSVP'}</HbarAppUiButton></HbarAppUiSpotlight></ActionSurfaceFrame>
}

function PlanCard({spec, onAction}: CardProps) {
    const [annual, setAnnual] = useState(false);
    const plans = [{name: 'Starter', price: 0}, {name: 'Pro', price: annual ? 19 : 24}, {
        name: 'Team',
        price: annual ? 38 : 48
    }];
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-card-variant-5"><HbarAppUiToolbar
        title="Plans" detail="Pick the right workspace capacity"/><HbarAppUiTabs label="Billing period"
                                                                                 value={annual ? 'yearly' : 'monthly'}
                                                                                 options={[{
                                                                                     id: 'monthly',
                                                                                     label: 'Monthly'
                                                                                 }, {id: 'yearly', label: 'Yearly'}]}
                                                                                 onChange={(value) => setAnnual(value === 'yearly')}/>
        <div className="hbar-app-ui-plan-card-grid">{plans.map((plan, index) => <HbarAppUiSpotlight
            className={index === 1 ? 'is-featured' : ''}
            key={plan.name}><strong>{plan.name}</strong><b>${plan.price}<small>/mo</small></b>
            <ul>
                <li>Shared activity</li>
                <li>Usage insights</li>
                <li>Scoped approvals</li>
            </ul>
            <HbarAppUiButton tone={index === 1 ? 'accent' : 'neutral'} onClick={() => onAction?.({
                variantId: spec.id,
                actionId: 'choose',
                value: plan.name
            })}>{index === 0 ? 'Current' : 'Choose'}</HbarAppUiButton></HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function AccountMetrics({spec, onAction}: CardProps) {
    const [range, setRange] = useState('7d');
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-card-variant-6"><HbarAppUiToolbar
        title="Account metrics" detail={range}/><HbarAppUiTabs label="Date range" value={range}
                                                               options={[{id: '24h', label: '24h'}, {
                                                                   id: '7d',
                                                                   label: '7d'
                                                               }, {id: '30d', label: '30d'}]} onChange={(value) => {
        setRange(value);
        onAction?.({variantId: spec.id, actionId: 'tabs', value})
    }}/><HbarAppUiMetricStrip metrics={[{label: 'Active members', value: '128', detail: '+12%', tone: 'positive'}, {
        label: 'Tasks shipped',
        value: '64',
        detail: '+8%',
        tone: 'positive'
    }, {label: 'Review time', value: '2.4h', detail: '−18%', tone: 'positive'}]}/></ActionSurfaceFrame>
}

function ChangelogCard({spec, onAction}: CardProps) {
    const [saved, setSaved] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-card-variant-7"><HbarAppUiSpotlight
        className="hbar-app-ui-changelog-card"><small>v1.4.0 · September 2026</small><h3>Faster activity recovery</h3>
        <p>Runs now explain failures beside the action that can recover them.</p>
        <div><span className="hbar-app-ui-avatar">M</span><span>Mina Patel · Product</span><HbarAppUiIconButton
            label="Bookmark" onClick={() => {
            setSaved((value) => !value);
            onAction?.({variantId: spec.id, actionId: 'bookmark', value: String(!saved)})
        }}><HbarAppUiIcon icon={Bookmark} tier="sm" /></HbarAppUiIconButton></div>
    </HbarAppUiSpotlight></ActionSurfaceFrame>
}

function FileTiles({spec, onAction}: CardProps) {
    const [selected, setSelected] = useState('README.md');
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-card-variant-8"><HbarAppUiToolbar
        title="Asset library" detail={`${selected} selected`}/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: selected})}>Open
        selection</HbarAppUiButton>
        <div
            className="hbar-app-ui-file-tile-grid">{['README.md', 'report.csv', 'design.fig', 'archive.zip'].map((file) =>
            <LumenButton type="button" className={selected === file ? 'is-selected' : ''} key={file}
                    onClick={() => setSelected(file)}><HbarAppUiIcon icon={FileText} tier="lg" /><strong>{file}</strong><small>Updated
                today</small></LumenButton>)}</div>
        <HbarAppUiSpotlight className="hbar-app-ui-file-preview"><HbarAppUiIcon icon={FileText} tier="md" />
            <div><strong>{selected}</strong><p>Preview and metadata appear here for the selected asset.</p></div>
        </HbarAppUiSpotlight></ActionSurfaceFrame>
}

function ProfileCard({spec, onAction}: CardProps) {
    const [following, setFollowing] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-card-variant-9"><HbarAppUiSpotlight
        className="hbar-app-ui-profile-card"><span
        className="hbar-app-ui-avatar hbar-app-ui-avatar-large">M</span><strong>Mina Patel</strong><small>Design systems
        · @mina</small>
        <div className="hbar-app-ui-tag-row"><span>UI</span><span>Research</span><span>Remote</span></div>
        <HbarAppUiMetricStrip metrics={[{label: 'Projects', value: '18'}, {label: 'Followers', value: '240'}]}/>
        <div><HbarAppUiButton tone={following ? 'positive' : 'accent'} onClick={() => {
            setFollowing((value) => !value);
            onAction?.({variantId: spec.id, actionId: 'follow', value: String(!following)})
        }}>{following ? 'Following' : 'Follow'}</HbarAppUiButton><HbarAppUiButton
            onClick={() => onAction?.({variantId: spec.id, actionId: 'message'})}>Message</HbarAppUiButton></div>
    </HbarAppUiSpotlight></ActionSurfaceFrame>
}

function BalanceCard({spec, onAction}: CardProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-card-variant-10"><HbarAppUiSpotlight
        className="hbar-app-ui-balance-card"><small>Available balance</small><strong>$12,480.00</strong>
        <div className="hbar-app-ui-balance-split">
            <span>Pending <b>$820.40</b></span><span>Reserved <b>$1,200.00</b></span></div>
        <div className="hbar-app-ui-card-actions"><HbarAppUiButton tone="accent" onClick={() => onAction?.({
            variantId: spec.id,
            actionId: 'transfer'
        })}>Transfer</HbarAppUiButton><HbarAppUiButton
            onClick={() => onAction?.({variantId: spec.id, actionId: 'deposit'})}>Deposit</HbarAppUiButton></div>
        <small>Recent activity · +$240.00 today</small></HbarAppUiSpotlight></ActionSurfaceFrame>
}

function InvoiceCard({spec, onAction}: CardProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-card-variant-11"><HbarAppUiSpotlight
        className="hbar-app-ui-invoice-card">
        <div><HbarAppUiIcon icon={FileText} tier="md" /><span><strong>INV-2026-09</strong><small>Issued Sep 01 · Workspace plan</small></span><HbarAppUiStatus
            value="Paid" tone="positive"/></div>
        <dl>
            <div>
                <dt>Subtotal</dt>
                <dd>$120.00</dd>
            </div>
            <div>
                <dt>Tax</dt>
                <dd>$8.40</dd>
            </div>
            <div>
                <dt>Total</dt>
                <dd>$128.40</dd>
            </div>
        </dl>
        <HbarAppUiButton
            onClick={() => onAction?.({variantId: spec.id, actionId: 'download', value: 'INV-2026-09'})}><HbarAppUiIcon icon={Download} tier="sm"
            />Download PDF</HbarAppUiButton></HbarAppUiSpotlight></ActionSurfaceFrame>
}

export function Card({spec, onAction}: CardProps) {
    switch (spec.variant) {
        case 1:
            return <MemberCard spec={spec} onAction={onAction}/>;
        case 2:
            return <IntegrationCard spec={spec} onAction={onAction}/>;
        case 3:
            return <OnboardingCards spec={spec} onAction={onAction}/>;
        case 4:
            return <AgendaCard spec={spec} onAction={onAction}/>;
        case 5:
            return <PlanCard spec={spec} onAction={onAction}/>;
        case 6:
            return <AccountMetrics spec={spec} onAction={onAction}/>;
        case 7:
            return <ChangelogCard spec={spec} onAction={onAction}/>;
        case 8:
            return <FileTiles spec={spec} onAction={onAction}/>;
        case 9:
            return <ProfileCard spec={spec} onAction={onAction}/>;
        case 10:
            return <BalanceCard spec={spec} onAction={onAction}/>;
        case 11:
            return <InvoiceCard spec={spec} onAction={onAction}/>;
        default:
            return <MemberCard spec={spec} onAction={onAction}/>
    }
}
