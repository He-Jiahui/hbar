import { HbarAppUiIcon } from '../icon'
import {useState} from 'react'
import {AlertCircle, Bell, Check, ChevronDown, Filter, Pause, Play, RefreshCw, ShieldCheck} from 'lucide-react'
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

type MonitoringProps = HbarAppUiVariantProps

function HealthOverview({spec, onAction}: MonitoringProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-monitoring-variant-1"><HbarAppUiToolbar title="Platform health"
                                                                                              detail="KPI deltas · throughput · incidents"/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'refresh'})}><HbarAppUiIcon icon={RefreshCw} tier="sm"
        />Refresh</HbarAppUiButton><HbarAppUiMetricStrip
        metrics={[{label: 'Availability', value: '99.98%', detail: '+0.02%', tone: 'positive'}, {
            label: 'Throughput',
            value: '1,240 / min',
            detail: '+18%',
            tone: 'positive'
        }, {label: 'Incidents', value: '2', detail: '−1', tone: 'positive'}, {
            label: 'Latency p95',
            value: '280ms',
            tone: 'warning'
        }]}/>
        <div className="hbar-app-ui-monitor-chart">{Array.from({length: 14}, (_, index) => <i
            style={{height: `${18 + ((spec.profile.seed + index * 9) % 56)}px`}} key={index}/>)}</div>
        <div className="hbar-app-ui-incident-feed"><strong>Incident feed</strong><span><HbarAppUiIcon icon={AlertCircle} tier="sm" />Queue latency elevated <small>8m ago</small></span><span><HbarAppUiIcon icon={Check} tier="sm"
            />Storage recovered <small>22m ago</small></span></div>
    </ActionSurfaceFrame>
}

function LiveStream({spec, onAction}: MonitoringProps) {
    const [paused, setPaused] = useState(false);
    const [threshold, setThreshold] = useState(70);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-monitoring-variant-2"><HbarAppUiToolbar title="Live metrics"
                                                                                              detail="Rolling window · threshold line"/><HbarAppUiButton
        onClick={() => {
            setPaused((value) => !value);
            onAction?.({variantId: spec.id, actionId: paused ? 'resume' : 'pause'})
        }}>{paused ? <HbarAppUiIcon icon={Play} tier="sm" /> :
        <HbarAppUiIcon icon={Pause} tier="sm" />}{paused ? 'Resume' : 'Pause'}</HbarAppUiButton><HbarAppUiButton
        onClick={() => setThreshold(threshold === 70 ? 85 : 70)}>Threshold {threshold}</HbarAppUiButton>
        <div className="hbar-app-ui-live-chart"><span className="hbar-app-ui-threshold"
                                                      style={{bottom: `${threshold}%`}}/>{Array.from({length: 18}, (_, index) =>
            <i className={paused ? 'is-paused' : ''}
               style={{height: `${24 + ((spec.profile.seed + index * 15) % 64)}%`}} key={index}/>)}</div>
        <HbarAppUiMetricStrip metrics={[{label: 'Peak', value: '94%', tone: 'warning'}, {
            label: 'Window',
            value: '15 min'
        }, {label: 'Samples', value: '180'}]}/></ActionSurfaceFrame>
}

function IncidentDetail({spec, onAction}: MonitoringProps) {
    const [status, setStatus] = useState('Investigating');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-monitoring-variant-3"><HbarAppUiToolbar title="Incident detail"
                                                                                              detail="Response timeline · responders"/><select
        aria-label="Incident status" value={status} onChange={(event) => {
        setStatus(event.target.value);
        onAction?.({variantId: spec.id, actionId: 'status', value: event.target.value})
    }}>
        <option>Investigating</option>
        <option>Identified</option>
        <option>Monitoring</option>
        <option>Resolved</option>
    </select><HbarAppUiSpotlight className="hbar-app-ui-incident-summary"><HbarAppUiIcon icon={AlertCircle} tier="md" />
        <div><strong>Queue latency above threshold</strong><p>Started 10 minutes ago · 3 services affected.</p></div>
        <HbarAppUiStatus value={status} tone={status === 'Resolved' ? 'positive' : 'warning'}/></HbarAppUiSpotlight>
        <ol className="hbar-app-ui-response-timeline">
            <li><b>10:14</b><span>Alert fired</span></li>
            <li><b>10:18</b><span>Avery acknowledged</span></li>
            <li><b>10:22</b><span>Mitigation deployed</span></li>
        </ol>
        <textarea placeholder="Post an incident update" onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                onAction?.({variantId: spec.id, actionId: 'update', value: event.currentTarget.value});
                event.currentTarget.value = ''
            }
        }}/></ActionSurfaceFrame>
}

function AlertInbox({spec, onAction}: MonitoringProps) {
    const [tab, setTab] = useState('Firing');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-monitoring-variant-4"><HbarAppUiToolbar title="Alert inbox"
                                                                                              detail="Runbooks and silence controls"/><HbarAppUiTabs
        label="Alert state" value={tab} options={['Firing', 'Pending', 'Resolved'].map((id) => ({id, label: id}))}
        onChange={(value) => setTab(value)}/>
        <div
            className="hbar-app-ui-alert-list">{['Queue latency', 'Error rate', 'Storage capacity'].map((alert, index) =>
            <HbarAppUiSpotlight key={alert}>
                <div><strong>{alert}</strong><small>{tab} · service-{index + 1}</small></div>
                <div className="hbar-app-ui-mini-sparkline">{[1, 2, 3, 4, 5].map((point) => <i
                    style={{height: `${10 + (index + point) * 3}px`}} key={point}/>)}</div>
                <HbarAppUiButton onClick={() => onAction?.({
                    variantId: spec.id,
                    actionId: 'silence',
                    value: alert
                })}>Silence</HbarAppUiButton></HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function LogTail({spec, onAction}: MonitoringProps) {
    const [level, setLevel] = useState('INFO');
    const [paused, setPaused] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-monitoring-variant-5"><HbarAppUiToolbar title="Live log tail"
                                                                                              detail="Filters · follow mode · JSON context"/>
        <div className="hbar-app-ui-chip-row">{['INFO', 'WARN', 'ERROR'].map((item) => <HbarAppUiButton
            className={level === item ? 'is-selected' : ''} key={item} onClick={() => setLevel(item)}><HbarAppUiIcon icon={Filter} tier="xs"
            />{item}</HbarAppUiButton>)}</div>
        <HbarAppUiButton onClick={() => {
            setPaused((value) => !value);
            onAction?.({variantId: spec.id, actionId: paused ? 'resume' : 'pause'})
        }}>{paused ? 'Follow' : 'Pause'}</HbarAppUiButton>
        <div className="hbar-app-ui-log-tail" role="log">{[0, 1, 2, 3, 4].map((index) => <button type="button"
                                                                                                 key={index}
                                                                                                 onClick={() => onAction?.({
                                                                                                     variantId: spec.id,
                                                                                                     actionId: 'expand',
                                                                                                     value: String(index)
                                                                                                 })}>
            <code>10:24:{18 + index}</code><b>{level}</b><span>request completed</span><HbarAppUiIcon icon={ChevronDown} tier="xs" />
        </button>)}</div>
    </ActionSurfaceFrame>
}

function UptimeGrid({spec, onAction}: MonitoringProps) {
    const [days, setDays] = useState(7);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-monitoring-variant-6"><HbarAppUiToolbar title="Uptime grid"
                                                                                              detail="Per-day status and incident history"/><HbarAppUiTabs
        label="Window" value={String(days)} options={['7', '30', '90'].map((id) => ({id, label: `${id}d`}))}
        onChange={(value) => setDays(Number(value))}/>
        <div
            className="hbar-app-ui-uptime-grid">{['API gateway', 'Worker pool', 'Storage', 'Scheduler'].map((service, row) =>
            <div key={service}><strong>{service}</strong>{Array.from({length: days === 7 ? 7 : 10}, (_, day) => <button
                type="button" className={(row === 1 && day === 4) ? 'is-degraded' : 'is-up'}
                aria-label={`${service} day ${day + 1}`} key={day}
                onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: `${service}:${day + 1}`})}/>)}
            </div>)}</div>
    </ActionSurfaceFrame>
}

function FleetTable({spec, onAction}: MonitoringProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-monitoring-variant-7"><HbarAppUiToolbar title="Fleet resources"
                                                                                              detail="Region filters · sortable columns"/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'filter', value: 'region'})}>Region:
        All</HbarAppUiButton>
        <div className="hbar-app-ui-fleet-table">
            <header><span>Node</span><span>Region</span><span>Utilisation</span><span>Status</span></header>
            {['worker-01', 'worker-02', 'worker-03', 'worker-04'].map((node, index) => <div key={node}>
                <strong>{node}</strong><span>{index % 2 ? 'eu-west' : 'us-east'}</span><HbarAppUiProgress
                value={42 + index * 12} label={`${node} utilisation`}
                tone={index === 3 ? 'warning' : 'accent'}/><HbarAppUiStatus value={index === 3 ? 'Draining' : 'Ready'}
                                                                            tone={index === 3 ? 'warning' : 'positive'}/>
            </div>)}</div>
    </ActionSurfaceFrame>
}

function ResponseTimes({spec, onAction}: MonitoringProps) {
    const [sort, setSort] = useState('p95');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-monitoring-variant-8"><HbarAppUiToolbar title="Response time"
                                                                                              detail="Percentiles · histogram · endpoints"/><HbarAppUiButton
        onClick={() => {
            setSort(sort === 'p95' ? 'p99' : 'p95');
            onAction?.({variantId: spec.id, actionId: 'sort', value: sort})
        }}>Sort {sort}</HbarAppUiButton><HbarAppUiMetricStrip
        metrics={[{label: 'p50', value: '120ms'}, {label: 'p95', value: '280ms', tone: 'warning'}, {
            label: 'p99',
            value: '640ms',
            tone: 'warning'
        }]}/>
        <div className="hbar-app-ui-latency-histogram">{Array.from({length: 16}, (_, index) => <i
            style={{height: `${10 + ((index * 9) % 46)}px`}} key={index}/>)}</div>
        <div className="hbar-app-ui-endpoint-table">
            <span>/runs</span><span>180ms</span><span>/events</span><span>240ms</span><span>/files</span><span>92ms</span>
        </div>
    </ActionSurfaceFrame>
}

function RunQueue({spec, onAction}: MonitoringProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-monitoring-variant-9"><HbarAppUiToolbar title="Live run queue"
                                                                                              detail="Grouped by state · attention filter"/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'filter', value: 'attention'})}><HbarAppUiIcon icon={Bell} tier="sm" />Attention
        only</HbarAppUiButton>
        <div className="hbar-app-ui-run-queue">{['Running', 'Queued', 'Needs attention'].map((state, group) => <section
            key={state}>
            <header><strong>{state}</strong><small>{group + 1}</small></header>
            {['reconcile-october', 'sync-workspace'].slice(0, group + 1).map((run, index) => <HbarAppUiSpotlight
                key={run}>
                <div className="hbar-app-ui-progress-ring"><span>{group === 0 ? `${54 + index * 12}%` : '—'}</span>
                </div>
                <div><strong>{run}</strong><small>Production · {index + 1} worker</small></div>
                <HbarAppUiStatus value={state}
                                 tone={state === 'Needs attention' ? 'warning' : state === 'Running' ? 'positive' : 'neutral'}/></HbarAppUiSpotlight>)}
        </section>)}</div>
    </ActionSurfaceFrame>
}

function SloBoard({spec, onAction}: MonitoringProps) {
    const [window, setWindow] = useState('30d');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-monitoring-variant-10"><HbarAppUiToolbar
        title="Service objectives" detail="Error budget burn-down"/><HbarAppUiTabs label="Window" value={window}
                                                                                   options={['7d', '30d', '90d'].map((id) => ({
                                                                                       id,
                                                                                       label: id
                                                                                   }))}
                                                                                   onChange={(value) => setWindow(value)}/>
        <div className="hbar-app-ui-slo-list">{['Availability', 'Latency', 'Successful runs'].map((objective, index) =>
            <HbarAppUiSpotlight key={objective}>
                <div><HbarAppUiIcon icon={ShieldCheck} tier="sm"
                    /><strong>{objective}</strong><small>{window} target {index === 1 ? '99.5%' : '99.9%'}</small>
                </div>
                <HbarAppUiProgress value={index === 1 ? 68 : 28 + index * 9} label={`${objective} budget`}
                                   tone={index === 1 ? 'warning' : 'positive'}/><span>{index === 1 ? '32% budget left' : '72% budget left'}</span></HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

export function Monitoring({spec, onAction}: MonitoringProps) {
    switch (spec.variant) {
        case 1:
            return <HealthOverview spec={spec} onAction={onAction}/>;
        case 2:
            return <LiveStream spec={spec} onAction={onAction}/>;
        case 3:
            return <IncidentDetail spec={spec} onAction={onAction}/>;
        case 4:
            return <AlertInbox spec={spec} onAction={onAction}/>;
        case 5:
            return <LogTail spec={spec} onAction={onAction}/>;
        case 6:
            return <UptimeGrid spec={spec} onAction={onAction}/>;
        case 7:
            return <FleetTable spec={spec} onAction={onAction}/>;
        case 8:
            return <ResponseTimes spec={spec} onAction={onAction}/>;
        case 9:
            return <RunQueue spec={spec} onAction={onAction}/>;
        case 10:
            return <SloBoard spec={spec} onAction={onAction}/>;
        default:
            return <HealthOverview spec={spec} onAction={onAction}/>
    }
}
