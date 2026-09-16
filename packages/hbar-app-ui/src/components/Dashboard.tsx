import { HbarAppUiIcon } from '../icon'
import {useState} from 'react'
import {ArrowDown, ArrowUp, Check, ChevronRight, CircleAlert, MoreHorizontal, RefreshCw} from 'lucide-react'
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
import {seededNumber} from './helpers'

type DashboardProps = HbarAppUiVariantProps
const barValues = (seed: number, count = 8) => Array.from({length: count}, (_, index) => 24 + ((seed + index * 17) % 68))

function MetricGrid({spec, onAction}: DashboardProps) {
    const base = seededNumber(spec.profile.seed, 18, 24);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-dashboard-variant-1"><HbarAppUiToolbar title="Operations overview"
                                                                                             detail="Period-over-period deltas"/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'filter', value: 'period'})}>This
        period</HbarAppUiButton>
        <div className="hbar-app-ui-metric-card-grid">{[{
            label: 'Active runs',
            value: base,
            delta: '+12%',
            up: true
        }, {label: 'Completed', value: base * 4, delta: '+8%', up: true}, {
            label: 'Review queue',
            value: 4,
            delta: '−3%',
            up: false
        }, {label: 'Avg. latency', value: '1.8s', delta: '−18%', up: true}].map((metric) => <HbarAppUiSpotlight
            key={metric.label}><small>{metric.label}</small><strong>{metric.value}</strong><span
            className={metric.up ? 'is-up' : 'is-down'}>{metric.up ? <HbarAppUiIcon icon={ArrowUp} tier="xs" /> :
            <HbarAppUiIcon icon={ArrowDown} tier="xs" />}{metric.delta}</span>
            <div
                className="hbar-app-ui-sparkline">{barValues(spec.profile.seed + String(metric.label).length, 7).map((value, index) =>
                <i style={{height: `${value / 2}px`}} key={index}/>)}</div>
        </HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function PrimaryChart({spec, onAction}: DashboardProps) {
    const [range, setRange] = useState('7d');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-dashboard-variant-2"><HbarAppUiToolbar
        title="Throughput dashboard" detail="Chart, breakdown and date range"/><HbarAppUiTabs label="Date range"
                                                                                              value={range} options={[{
        id: '24h',
        label: '24h'
    }, {id: '7d', label: '7d'}, {id: '30d', label: '30d'}]} onChange={(value) => {
        setRange(value);
        onAction?.({variantId: spec.id, actionId: 'tabs', value})
    }}/><HbarAppUiSpotlight className="hbar-app-ui-large-chart"><h3>Runs completed</h3>
        <div className="hbar-app-ui-chart">{barValues(spec.profile.seed, 12).map((value, index) => <span
            style={{height: `${value}%`}} key={index}/>)}</div>
    </HbarAppUiSpotlight>
        <div className="hbar-app-ui-breakdown-table">
            <span>Source</span><span>Runs</span><span>Share</span><span>Workspace</span><span>128</span><span>58%</span><span>Automation</span><span>64</span><span>29%</span>
        </div>
    </ActionSurfaceFrame>
}

function WidgetGrid({spec, onAction}: DashboardProps) {
    const [menu, setMenu] = useState<string | undefined>();
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-dashboard-variant-3"><HbarAppUiToolbar title="Widget board"
                                                                                             detail="Mixed card spans"/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'add-widget'})}>Add widget</HbarAppUiButton>
        <div className="hbar-app-ui-widget-grid">{['Runs', 'Queue', 'Usage', 'Health', 'Reviews'].map((name, index) =>
            <HbarAppUiSpotlight className={index === 0 ? 'is-wide' : ''} key={name}>
                <header><strong>{name}</strong><HbarAppUiButton
                    onClick={() => setMenu(menu === name ? undefined : name)}><HbarAppUiIcon icon={MoreHorizontal} tier="sm"
                    /></HbarAppUiButton></header>
                <b>{[24, 8, '64%', '98%', 4][index]}</b>{menu === name && <div className="hbar-app-ui-widget-menu">
                <button type="button"
                        onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: name})}>Open details
                </button>
                <button type="button">Remove widget</button>
            </div>}</HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function OperationsBoard({spec, onAction}: DashboardProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-dashboard-variant-4"><HbarAppUiToolbar
        title="Operations dashboard" detail="Service board and incidents"/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: 'incidents'})}><HbarAppUiIcon icon={CircleAlert} tier="sm" />Incidents</HbarAppUiButton>
        <div
            className="hbar-app-ui-service-board">{['API gateway', 'Worker pool', 'Event stream', 'Storage'].map((service, index) =>
            <HbarAppUiSpotlight key={service}><HbarAppUiStatus value={index === 2 ? 'Degraded' : 'Healthy'}
                                                               tone={index === 2 ? 'warning' : 'positive'}/><strong>{service}</strong><small>{index === 2 ? '3 alerts' : `${120 + index * 18}ms`}</small></HbarAppUiSpotlight>)}</div>
        <div className="hbar-app-ui-incident-feed"><strong>Incident feed</strong><span><HbarAppUiIcon icon={CircleAlert} tier="sm" />Queue latency above threshold <small>8m ago</small></span><span><HbarAppUiIcon icon={Check} tier="sm"
            />Storage recovered <small>22m ago</small></span></div>
    </ActionSurfaceFrame>
}

function UsageBoard({spec, onAction}: DashboardProps) {
    const usage = seededNumber(spec.profile.seed, 42, 44);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-dashboard-variant-5"><HbarAppUiToolbar title="Usage dashboard"
                                                                                             detail="Quota meters and burn-down"/><HbarAppUiButton
        tone="accent"
        onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: 'upgrade'})}>Upgrade</HbarAppUiButton>
        <div className="hbar-app-ui-quota-grid">{['Tokens', 'Requests', 'Seats'].map((name, index) =>
            <HbarAppUiSpotlight
                key={name}><strong>{name}</strong><span>{usage - index * 12}% used</span><HbarAppUiProgress
                value={usage - index * 12} label={`${name} quota`}
                tone={usage - index * 12 > 75 ? 'warning' : 'accent'}/><small>Resets
                in {index + 1}d</small></HbarAppUiSpotlight>)}</div>
        <HbarAppUiSpotlight><h3>Burn-down</h3>
            <div
                className="hbar-app-ui-chart hbar-app-ui-chart-line">{barValues(spec.profile.seed, 10).map((value, index) =>
                <span style={{height: `${value}%`}} key={index}/>)}</div>
        </HbarAppUiSpotlight></ActionSurfaceFrame>
}

function ComparisonDashboard({spec, onAction}: DashboardProps) {
    const [mode, setMode] = useState('current');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-dashboard-variant-6"><HbarAppUiToolbar title="Analytics overview"
                                                                                             detail="Compare periods"/><HbarAppUiTabs
        label="Comparison" value={mode} options={[{id: 'current', label: 'Current'}, {id: 'compare', label: 'Compare'}]}
        onChange={(value) => {
            setMode(value);
            onAction?.({variantId: spec.id, actionId: 'tabs', value})
        }}/><HbarAppUiMetricStrip metrics={[{
        label: 'Throughput',
        value: mode === 'compare' ? '+18%' : '128 / hr',
        tone: 'positive'
    }, {label: 'Quality', value: '98.4%', detail: mode === 'compare' ? '+2.1%' : 'Current'}, {
        label: 'Review time',
        value: '2.4h'
    }]}/><HbarAppUiSpotlight><h3>{mode === 'compare' ? 'Current vs previous' : 'Current period'}</h3>
        <div className="hbar-app-ui-comparison-bars"><span style={{width: '72%'}}/><span
            style={{width: mode === 'compare' ? '58%' : '44%'}}/></div>
    </HbarAppUiSpotlight></ActionSurfaceFrame>
}

function LoadingDashboard({spec, onAction}: DashboardProps) {
    const [loaded, setLoaded] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-dashboard-variant-7"><HbarAppUiToolbar title="Project dashboard"
                                                                                             detail={loaded ? 'Ready' : 'First run'}/><HbarAppUiButton
        onClick={() => {
            setLoaded(true);
            onAction?.({variantId: spec.id, actionId: 'load'})
        }}><HbarAppUiIcon icon={RefreshCw} tier="sm" />{loaded ? 'Refresh' : 'Load project'}</HbarAppUiButton>{loaded ? <HbarAppUiMetricStrip
            metrics={[{label: 'Projects', value: '1'}, {label: 'Runs', value: '0'}, {label: 'Members', value: '1'}]}/> :
        <div className="hbar-app-ui-dashboard-empty">
            <div className="hbar-app-ui-skeleton-row"/>
            <div className="hbar-app-ui-skeleton-row"/>
            <strong>No project data yet</strong><p>Connect a workspace to populate this dashboard.</p></div>}
    </ActionSurfaceFrame>
}

function DeliveryBoard({spec, onAction}: DashboardProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-dashboard-variant-8"><HbarAppUiToolbar title="Delivery board"
                                                                                             detail="Sortable modules and progress rings"/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'sort'})}>Sort modules</HbarAppUiButton>
        <div className="hbar-app-ui-delivery-grid">{['API', 'Web', 'Docs', 'Mobile'].map((name, index) =>
            <HbarAppUiSpotlight key={name}><strong>{name}</strong>
                <div className="hbar-app-ui-progress-ring"
                     style={{'--hbar-app-ui-progress': `${32 + index * 16}%`} as React.CSSProperties}>
                    <span>{32 + index * 16}%</span></div>
                <small>Next milestone in {index + 2}d</small></HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function Worklog({spec, onAction}: DashboardProps) {
    const [week, setWeek] = useState(0);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-dashboard-variant-9"><HbarAppUiToolbar title="Weekly worklog"
                                                                                             detail={`Week ${week + 1}`}/><HbarAppUiButton
        onClick={() => setWeek((value) => value - 1)}>Previous</HbarAppUiButton><HbarAppUiButton
        onClick={() => setWeek((value) => value + 1)}>Next</HbarAppUiButton>
        <div className="hbar-app-ui-worklog-grid">
            <header><span>Person</span>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day) => <span key={day}>{day}</span>)}
            </header>
            {['Avery', 'Mina', 'Jon', 'Sam'].map((person, row) => <div key={person}>
                <strong>{person}</strong>{[0, 1, 2, 3, 4].map((day) => <span
                className={((row + day + week) % 3 === 0) ? 'is-busy' : ''} key={day}>{(row + day) % 4 + 1}h</span>)}
            </div>)}</div>
    </ActionSurfaceFrame>
}

function Explorer({spec, onAction}: DashboardProps) {
    const [measure, setMeasure] = useState('Runs');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-dashboard-variant-10"><HbarAppUiToolbar title="Metric explorer"
                                                                                              detail="One chart · six measures"/><HbarAppUiTabs
        label="Measure" value={measure}
        options={['Runs', 'Tokens', 'Latency', 'Errors', 'Cost', 'Reviews'].map((id) => ({id, label: id}))}
        onChange={(value) => {
            setMeasure(value);
            onAction?.({variantId: spec.id, actionId: 'tabs', value})
        }}/><HbarAppUiSpotlight className="hbar-app-ui-area-chart"><strong>{measure}</strong>
        <svg viewBox="0 0 320 100" role="img" aria-label={`${measure} area chart`}>
            <path d="M0 78 C40 40 64 82 100 50 S160 70 200 30 S260 58 320 12 V100 H0Z"/>
            <path d="M0 78 C40 40 64 82 100 50 S160 70 200 30 S260 58 320 12"/>
        </svg>
    </HbarAppUiSpotlight></ActionSurfaceFrame>
}

function CoverageBoard({spec, onAction}: DashboardProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-dashboard-variant-11"><HbarAppUiToolbar title="Workforce coverage"
                                                                                              detail="Staffing bars and demand"/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: 'queue'})}>Open action
        queue</HbarAppUiButton>
        <div
            className="hbar-app-ui-staffing-bars">{['Engineering', 'Design', 'Support', 'Operations'].map((team, index) =>
            <div key={team}><strong>{team}</strong><HbarAppUiProgress value={48 + index * 11} label={`${team} staffing`}
                                                                      tone={index === 2 ? 'warning' : 'accent'}/><span>{8 + index} / {12 + index} staffed</span>
            </div>)}</div>
        <HbarAppUiSpotlight><strong>Demand next 7 days</strong>
            <div className="hbar-app-ui-chart">{barValues(spec.profile.seed, 7).map((value, index) => <span
                style={{height: `${value}%`}} key={index}/>)}</div>
        </HbarAppUiSpotlight></ActionSurfaceFrame>
}

function PayoutDesk({spec, onAction}: DashboardProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-dashboard-variant-12"><HbarAppUiToolbar title="Payout desk"
                                                                                              detail="Balance, pace and sweep lanes"/><HbarAppUiButton
        tone="accent" onClick={() => onAction?.({variantId: spec.id, actionId: 'sweep'})}>Sweep
        funds</HbarAppUiButton><HbarAppUiMetricStrip
        metrics={[{label: 'Available', value: '$12,480', tone: 'positive'}, {
            label: 'Pending',
            value: '$820'
        }, {label: 'Next sweep', value: 'Tomorrow'}]}/><HbarAppUiSpotlight className="hbar-app-ui-dual-series"><strong>Payout
        pace</strong>
        <div className="hbar-app-ui-chart">{barValues(spec.profile.seed, 10).map((value, index) => <span
            style={{height: `${value}%`}} key={index}/>)}</div>
    </HbarAppUiSpotlight>
        <div className="hbar-app-ui-sweep-lanes"><span>Ready · 18 payouts</span><span>Review · 2 payouts</span></div>
    </ActionSurfaceFrame>
}

function Scorecard({spec, onAction}: DashboardProps) {
    const [quarter, setQuarter] = useState('Q3');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-dashboard-variant-13"><HbarAppUiToolbar
        title="Quarterly scorecard" detail="Objectives and key results"/><select aria-label="Quarter" value={quarter}
                                                                                 onChange={(event) => {
                                                                                     setQuarter(event.target.value);
                                                                                     onAction?.({
                                                                                         variantId: spec.id,
                                                                                         actionId: 'picker',
                                                                                         value: event.target.value
                                                                                     })
                                                                                 }}>
        <option>Q2</option>
        <option>Q3</option>
        <option>Q4</option>
    </select>
        <div
            className="hbar-app-ui-scorecard">{['Ship reliable runs', 'Improve review time', 'Grow shared usage'].map((objective, index) =>
            <HbarAppUiSpotlight key={objective}><strong>{objective}</strong><small>Key
                result {index + 1} · {quarter}</small><HbarAppUiProgress value={46 + index * 17} label={objective}
                                                                         tone={index === 1 ? 'warning' : 'positive'}/><span>{46 + index * 17}% against plan</span></HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function ServiceDetail({spec, onAction}: DashboardProps) {
    const [service, setService] = useState('API gateway');
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-dashboard-variant-14">
        <div className="hbar-app-ui-service-detail">
            <aside><strong>Services</strong>{['API gateway', 'Worker pool', 'Event stream', 'Storage'].map((item) =>
                <button type="button" className={service === item ? 'is-selected' : ''} key={item} onClick={() => {
                    setService(item);
                    onAction?.({variantId: spec.id, actionId: 'open', value: item})
                }}>{item}<HbarAppUiIcon icon={ChevronRight} tier="sm" /></button>)}</aside>
            <main><HbarAppUiToolbar title={service} detail="Metrics, chart and activity"/><HbarAppUiStatus
                value="Healthy" tone="positive"/><HbarAppUiMetricStrip
                metrics={[{label: 'Requests', value: `${1_240 + service.length * 8}`}, {
                    label: 'Latency',
                    value: `${120 + service.length * 3}ms`
                }, {label: 'Errors', value: '0.2%', tone: 'positive'}]}/><HbarAppUiSpotlight><h3>Activity</h3><p>Latest
                deploy completed 2m ago. No unresolved incidents.</p></HbarAppUiSpotlight></main>
        </div>
    </ActionSurfaceFrame>
}

export function Dashboard({spec, onAction}: DashboardProps) {
    switch (spec.variant) {
        case 1:
            return <MetricGrid spec={spec} onAction={onAction}/>;
        case 2:
            return <PrimaryChart spec={spec} onAction={onAction}/>;
        case 3:
            return <WidgetGrid spec={spec} onAction={onAction}/>;
        case 4:
            return <OperationsBoard spec={spec} onAction={onAction}/>;
        case 5:
            return <UsageBoard spec={spec} onAction={onAction}/>;
        case 6:
            return <ComparisonDashboard spec={spec} onAction={onAction}/>;
        case 7:
            return <LoadingDashboard spec={spec} onAction={onAction}/>;
        case 8:
            return <DeliveryBoard spec={spec} onAction={onAction}/>;
        case 9:
            return <Worklog spec={spec} onAction={onAction}/>;
        case 10:
            return <Explorer spec={spec} onAction={onAction}/>;
        case 11:
            return <CoverageBoard spec={spec} onAction={onAction}/>;
        case 12:
            return <PayoutDesk spec={spec} onAction={onAction}/>;
        case 13:
            return <Scorecard spec={spec} onAction={onAction}/>;
        case 14:
            return <ServiceDetail spec={spec} onAction={onAction}/>;
        default:
            return <MetricGrid spec={spec} onAction={onAction}/>
    }
}
