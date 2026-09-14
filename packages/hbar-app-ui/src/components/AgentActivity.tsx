import {useMemo, useState} from 'react'
import {
    Activity,
    AlertTriangle,
    ChevronDown,
    Clock3,
    Filter,
    GitBranch,
    Play,
    RotateCcw,
    Square,
    Terminal,
    Timer
} from 'lucide-react'
import {
    HbarAppUiButton,
    HbarAppUiDataTable,
    HbarAppUiProgress,
    HbarAppUiSpotlight,
    HbarAppUiStatus,
    HbarAppUiTimeline,
    HbarAppUiToolbar
} from '../primitives'
import type {HbarAppUiDataRow, HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'
import {activitySteps, workspaceRows} from './data'
import {actionText, scenarioLead, seededNumber} from './helpers'

type ActivityProps = HbarAppUiVariantProps

function LiveStream({spec, onAction}: ActivityProps) {
    const [running, setRunning] = useState(spec.profile.initialState === 'active')
    const count = Math.max(3, Math.min(activitySteps.length, spec.profile.itemCount + 1))
    const currentSteps = useMemo(() => activitySteps.slice(0, count).map((step, index) => {
        if (!running && index === 2) return {...step, status: 'failed' as const, detail: 'Stopped'}
        if (running && index === 2) return {...step, detail: `Running ${10 + (spec.profile.seed % 40)}s`}
        return step
    }), [count, running, spec.profile.seed])
    const title = scenarioLead(spec.profile.scenario, 'Reconcile workspace data')
    return <ActionSurfaceFrame spec={spec} onAction={onAction}><HbarAppUiToolbar title={title}
                                                                                 detail={`${running ? 'Running' : 'Stopped'} · ${100 + (spec.profile.seed % 180)}s`}/><HbarAppUiButton
        tone="danger" disabled={!running} onClick={() => {
        setRunning(false);
        onAction?.({variantId: spec.id, actionId: 'cancel'})
    }}><Square size={13}/>{actionText(spec, 'cancel', 'Stop')}</HbarAppUiButton><HbarAppUiSpotlight
        className="hbar-app-ui-activity-card">
        <div className="hbar-app-ui-activity-heading">
            <div><strong>{title}</strong><HbarAppUiStatus value={running ? 'Running' : 'Stopped'}
                                                          tone={running ? 'warning' : 'danger'}/></div>
            <Clock3 size={15}/></div>
        <HbarAppUiTimeline steps={currentSteps}/></HbarAppUiSpotlight></ActionSurfaceFrame>
}

function NestedTimeline({spec, onAction}: ActivityProps) {
    const [expanded, setExpanded] = useState(true)
    const groups = ['Prepare context', 'Inspect records', 'Reconcile entries']
    return <ActionSurfaceFrame spec={spec} onAction={onAction}><HbarAppUiToolbar title="Nested run timeline"
                                                                                 detail="Durations are grouped by step"/><HbarAppUiButton
        onClick={() => {
            setExpanded((value) => !value);
            onAction?.({variantId: spec.id, actionId: 'expand', value: String(!expanded)})
        }}><ChevronDown size={14}/>{expanded ? 'Collapse' : 'Expand'} all</HbarAppUiButton>
        <div
            className="hbar-app-ui-nested-timeline">{groups.slice(0, Math.max(2, Math.min(groups.length, spec.profile.itemCount))).map((group, index) =>
            <HbarAppUiSpotlight key={group}>
                <button type="button" className="hbar-app-ui-nested-heading"
                        onClick={() => setExpanded((value) => !value)}><ChevronDown size={14}
                                                                                    className={expanded ? '' : 'is-collapsed'}/><strong>{group}</strong><span>{(index + 1) * 1.2}s</span>
                </button>
                {expanded && <div className="hbar-app-ui-nested-children"><span><i
                    className="is-done"/>Load inputs <small>{0.4 + index / 10}s</small></span><span><i
                    className={index === 2 ? 'is-active' : 'is-done'}/>Process batch <small>{1.1 + index / 5}s</small></span>
                </div>}</HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function StatusRail({spec, onAction}: ActivityProps) {
    const [running, setRunning] = useState(spec.profile.initialState === 'active')
    const progress = running ? seededNumber(spec.profile.seed, 34, 50) : 100
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-activity-rail-variant"><HbarAppUiToolbar title="Agent status rail"
                                                                                               detail="Compact current-action view"/><HbarAppUiButton
        tone="danger" disabled={!running} onClick={() => {
        setRunning(false);
        onAction?.({variantId: spec.id, actionId: 'cancel'})
    }}><Square size={13}/>Stop</HbarAppUiButton>
        <div className="hbar-app-ui-status-rail">
            <div className="hbar-app-ui-status-rail-icon"><Activity size={18}/></div>
            <div>
                <strong>{running ? 'Applying requested change' : 'Run stopped'}</strong><small>{running ? 'Worker 2 · step 3 of 7' : 'Stopped by operator'}</small><HbarAppUiProgress
                value={progress} label="Agent progress" tone={running ? 'accent' : 'warning'}/></div>
            <b>{progress}%</b></div>
        <div className="hbar-app-ui-rail-events"><span><Timer
            size={13}/>Elapsed <strong>{running ? '00:36' : '00:37'}</strong></span><span><GitBranch
            size={13}/>Queue <strong>{spec.profile.itemCount}</strong></span></div>
    </ActionSurfaceFrame>
}

function RunHistory({spec, onAction}: ActivityProps) {
    const [selected, setSelected] = useState('')
    const historyRows: readonly HbarAppUiDataRow[] = workspaceRows.slice(0, Math.max(3, Math.min(5, spec.profile.itemCount))).map((row, index) => ({
        ...row,
        id: `run-${index}`,
        name: `run-${String(2026 - index).slice(-2)}-${String(91 - index).padStart(3, '0')}`,
        value: `${12 + index * 3}.${index}s`,
        detail: `$${(0.08 + index * 0.04).toFixed(2)} · ${row.detail}`
    }))
    return <ActionSurfaceFrame spec={spec} onAction={onAction}><HbarAppUiToolbar title="Run history"
                                                                                 detail="Status, duration, cost and replay"/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'retry'})}><RotateCcw size={13}/>Re-run
        selected</HbarAppUiButton>
        <div className="hbar-app-ui-history-table"><HbarAppUiDataTable rows={historyRows} selected={selected}
                                                                       onSelect={(id) => {
                                                                           setSelected(id);
                                                                           onAction?.({
                                                                               variantId: spec.id,
                                                                               actionId: 'open',
                                                                               value: id
                                                                           })
                                                                       }}/></div>
    </ActionSurfaceFrame>
}

function TerminalStream({spec, onAction}: ActivityProps) {
    const [level, setLevel] = useState('All')
    const logs = [{level: 'INFO', text: 'Loaded workspace context'}, {
        level: 'INFO',
        text: 'Pulled bank statement export'
    }, {level: 'WARN', text: '12 unmatched entries found'}, {
        level: 'ERROR',
        text: 'Currency conversion needs review'
    }, {level: 'INFO', text: 'Waiting for operator'}]
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-terminal-activity"><HbarAppUiToolbar title="Terminal activity"
                                                                                           detail="Live log stream"/>
        <div className="hbar-app-ui-log-filters">{['All', 'INFO', 'WARN', 'ERROR'].map((option) => <HbarAppUiButton
            key={option} className={level === option ? 'is-selected' : ''} onClick={() => {
            setLevel(option);
            onAction?.({variantId: spec.id, actionId: 'filter', value: option})
        }}><Filter size={12}/>{option}</HbarAppUiButton>)}</div>
        <HbarAppUiButton><Terminal size={13}/>Autoscroll</HbarAppUiButton>
        <div className="hbar-app-ui-terminal-log" role="log"
             aria-live="polite">{logs.filter((log) => level === 'All' || log.level === level).map((log, index) => <div
            className={`hbar-app-ui-log-${log.level.toLowerCase()}`} key={`${log.level}-${index}`}>
            <span>{`10:${String(24 + index).padStart(2, '0')}:1${index}`}</span><b>{log.level}</b><code>{log.text}</code>
        </div>)}</div>
    </ActionSurfaceFrame>
}

function ParallelLanes({spec, onAction}: ActivityProps) {
    const lanes = ['Planner', 'Builder', 'Reviewer', 'Indexer'].slice(0, Math.max(2, Math.min(4, spec.profile.itemCount)))
    return <ActionSurfaceFrame spec={spec} onAction={onAction}><HbarAppUiToolbar title="Parallel agent lanes"
                                                                                 detail={`${lanes.length} workers · queue depth ${spec.profile.itemCount}`}/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'filter'})}><Filter size={13}/>Filter
        lanes</HbarAppUiButton>
        <div className="hbar-app-ui-parallel-lanes">{lanes.map((lane, index) => <HbarAppUiSpotlight key={lane}>
            <div className="hbar-app-ui-lane-heading"><strong>{lane}</strong><HbarAppUiStatus
                value={index === 1 ? 'Running' : index === lanes.length - 1 ? 'Queued' : 'Complete'}
                tone={index === 1 ? 'warning' : index === lanes.length - 1 ? 'neutral' : 'positive'}/></div>
            <HbarAppUiProgress value={index === 1 ? 54 : index === lanes.length - 1 ? 8 : 100}
                               label={`${lane} throughput`}
                               tone={index === 1 ? 'accent' : 'positive'}/><small>{index === 1 ? '12 items/min' : `${7 + index * 3} items/min`}</small></HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function RunDetail({spec, onAction}: ActivityProps) {
    const [attempt, setAttempt] = useState(1)
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-run-detail"><HbarAppUiToolbar
        title="Run detail" detail="Inputs, outputs and recovery"/><HbarAppUiButton tone="danger"
                                                                                   onClick={() => onAction?.({
                                                                                       variantId: spec.id,
                                                                                       actionId: 'retry',
                                                                                       value: String(attempt)
                                                                                   })}><RotateCcw size={13}/>Retry
        attempt {attempt}</HbarAppUiButton>
        <div className="hbar-app-ui-run-detail-grid"><HbarAppUiSpotlight>
            <div className="hbar-app-ui-detail-heading"><AlertTriangle size={17}/><strong>Run
                failed</strong><HbarAppUiStatus value="Error" tone="danger"/></div>
            <p>Currency conversion returned an incomplete response.</p><code>ERR_PARTIAL_RESULT · step
            3</code></HbarAppUiSpotlight><HbarAppUiSpotlight><strong>Inputs</strong>
            <pre>{'{"workspace":"october","mode":"reconcile"}'}</pre>
        </HbarAppUiSpotlight><HbarAppUiSpotlight><strong>Outputs</strong>
            <pre>{attempt > 1 ? '{"recovered":true,"rows":12}' : '{"recovered":false}'}</pre>
            <HbarAppUiButton tone="accent" onClick={() => {
                setAttempt((value) => value + 1);
                onAction?.({variantId: spec.id, actionId: 'retry', value: 'run'})
            }}><Play size={13}/>Run again</HbarAppUiButton></HbarAppUiSpotlight></div>
    </ActionSurfaceFrame>
}

export function AgentActivity({spec, onAction}: ActivityProps) {
    switch (spec.variant) {
        case 1:
            return <LiveStream spec={spec} onAction={onAction}/>
        case 2:
            return <NestedTimeline spec={spec} onAction={onAction}/>
        case 3:
            return <StatusRail spec={spec} onAction={onAction}/>
        case 4:
            return <RunHistory spec={spec} onAction={onAction}/>
        case 5:
            return <TerminalStream spec={spec} onAction={onAction}/>
        case 6:
            return <ParallelLanes spec={spec} onAction={onAction}/>
        case 7:
            return <RunDetail spec={spec} onAction={onAction}/>
        default:
            return <LiveStream spec={spec} onAction={onAction}/>
    }
}
