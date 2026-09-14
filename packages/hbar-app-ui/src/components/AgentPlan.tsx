import {useState} from 'react'
import {
    Check,
    ChevronDown,
    ChevronRight,
    CircleDashed,
    GripVertical,
    ListChecks,
    Plus,
    SkipForward,
    Timer,
    X
} from 'lucide-react'
import {
    HbarAppUiButton,
    HbarAppUiMetricStrip,
    HbarAppUiProgress,
    HbarAppUiSpotlight,
    HbarAppUiStatus,
    HbarAppUiToolbar
} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'
import {seededNumber} from './helpers'

type PlanProps = HbarAppUiVariantProps

function ChecklistPlan({spec, onAction}: PlanProps) {
    const [completed, setCompleted] = useState(2)
    const items = ['Load workspace context', 'Inspect task requirements', 'Apply requested change', 'Validate result', 'Prepare handoff']
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-plan-variant-1"><HbarAppUiToolbar
        title="Task plan" detail={`${completed} of ${items.length} complete`}/><HbarAppUiStatus value="Live"
                                                                                                tone="warning"/>
        <div className="hbar-app-ui-plan-checklist"><HbarAppUiProgress value={completed / items.length * 100}
                                                                       label="Plan completion"/>{items.slice(0, Math.max(3, Math.min(items.length, spec.profile.itemCount + 2))).map((item, index) =>
            <button type="button" className={index < completed ? 'is-complete' : index === completed ? 'is-active' : ''}
                    key={item} onClick={() => {
                setCompleted(Math.min(items.length, index + 1));
                onAction?.({variantId: spec.id, actionId: 'step', value: item})
            }}><span>{index < completed ? <Check size={13}/> : <CircleDashed
                size={13}/>}</span><strong>{item}</strong><small>{index < completed ? 'Done' : index === completed ? 'Running' : 'Queued'}</small>
            </button>)}</div>
    </ActionSurfaceFrame>
}

function EditablePlan({spec, onAction}: PlanProps) {
    const [items, setItems] = useState(['Define scope', 'Draft implementation', 'Run checks'])
    const [skipped, setSkipped] = useState<string[]>([])
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-plan-variant-2"><HbarAppUiToolbar
        title="Editable plan" detail="Reorder or skip before starting"/><HbarAppUiButton
        onClick={() => setItems((current) => [...current, `New step ${current.length + 1}`])}><Plus size={13}/>Add step</HbarAppUiButton><HbarAppUiButton
        tone="accent"
        onClick={() => onAction?.({variantId: spec.id, actionId: 'save', value: `${items.length} steps`})}>Start
        plan</HbarAppUiButton>
        <ol className="hbar-app-ui-editable-plan">{items.slice(0, Math.max(3, Math.min(items.length, spec.profile.itemCount))).map((item) =>
            <li className={skipped.includes(item) ? 'is-skipped' : ''} key={item}><GripVertical
                size={14}/><span><strong>{item}</strong><small>{skipped.includes(item) ? 'Skipped' : 'Ready to run'}</small></span>
                <button type="button" onClick={() => {
                    setSkipped((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]);
                    onAction?.({variantId: spec.id, actionId: 'skip', value: item})
                }}><SkipForward size={13}/></button>
                <ChevronRight size={13}/></li>)}</ol>
    </ActionSurfaceFrame>
}

function PlanTree({spec, onAction}: PlanProps) {
    const [open, setOpen] = useState(true)
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-plan-variant-3"><HbarAppUiToolbar
        title="Plan dependency tree" detail="Nested subtasks and blocked states"/><HbarAppUiButton
        onClick={() => setOpen((value) => !value)}><ChevronDown size={14}/>{open ? 'Collapse tree' : 'Expand tree'}
    </HbarAppUiButton>
        <div className="hbar-app-ui-plan-tree">
            <button type="button" onClick={() => setOpen((value) => !value)}><ChevronDown size={14}/><strong>Release
                workspace</strong><HbarAppUiStatus value="Blocked" tone="danger"/></button>
            {open && <div className="hbar-app-ui-plan-tree-children"><span><ChevronRight
                size={13}/>Prepare migration <HbarAppUiStatus value="Complete"
                                                              tone="positive"/></span><span><ChevronRight size={13}/>Update permissions <HbarAppUiStatus
                value="Blocked" tone="danger"/></span><span><ChevronRight size={13}/>Run verification <HbarAppUiStatus
                value="Waiting"/></span></div>}</div>
        <div className="hbar-app-ui-dependency-note"><X size={13}/>Blocked by <button type="button"
                                                                                      onClick={() => onAction?.({
                                                                                          variantId: spec.id,
                                                                                          actionId: 'open',
                                                                                          value: 'permissions'
                                                                                      })}>permissions check</button>
        </div>
    </ActionSurfaceFrame>
}

function PlanActual({spec, onAction}: PlanProps) {
    const rows = ['Load context', 'Process entries', 'Validate output', 'Archive report']
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-plan-variant-4"><HbarAppUiToolbar
        title="Plan vs actual" detail="Drift is shown per step"/><HbarAppUiStatus value="2 steps ahead"
                                                                                  tone="positive"/>
        <div className="hbar-app-ui-plan-actual">
            <div className="hbar-app-ui-plan-actual-header">
                <span>Step</span><span>Planned</span><span>Actual</span><span>Delta</span></div>
            {rows.slice(0, Math.max(3, Math.min(rows.length, spec.profile.itemCount + 2))).map((row, index) => <div
                className="hbar-app-ui-plan-actual-row" key={row}>
                <strong>{row}</strong><span>{(index + 1) * 1.2}s</span><span>{(index + 1) * 1.05}s</span><b
                className={index === 2 ? 'is-warning' : 'is-positive'}>{index === 2 ? '+0.8s' : `−0.${index + 2}s`}</b>
            </div>)}</div>
    </ActionSurfaceFrame>
}

function TodoBoard({spec, onAction}: PlanProps) {
    const columns = [{title: 'Queued', items: ['Collect inputs', 'Check permissions']}, {
        title: 'Running',
        items: ['Build report']
    }, {title: 'Done', items: ['Load context', 'Read history']}]
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-plan-variant-5"><HbarAppUiToolbar
        title="Agent work board" detail="Queued · running · done"/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'filter'})}>Filter items</HbarAppUiButton>
        <div className="hbar-app-ui-plan-board">{columns.map((column) => <section key={column.title}>
            <header><strong>{column.title}</strong><small>{column.items.length}</small></header>
            {column.items.slice(0, Math.max(1, Math.min(column.items.length, spec.profile.itemCount))).map((item) =>
                <HbarAppUiSpotlight key={item}><ListChecks size={14}/><span>{item}</span><ChevronRight
                    size={13}/></HbarAppUiSpotlight>)}</section>)}</div>
    </ActionSurfaceFrame>
}

function PlanSummary({spec, onAction}: PlanProps) {
    const [open, setOpen] = useState(false)
    const steps = Math.max(3, Math.min(8, spec.profile.itemCount + 2))
    const cost = seededNumber(spec.profile.seed, 12, 48)
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-plan-variant-6"><HbarAppUiToolbar
        title="Plan summary" detail="Estimated steps, tools and cost"/><HbarAppUiButton tone="accent" onClick={() => {
        setOpen((value) => !value);
        onAction?.({variantId: spec.id, actionId: 'expand', value: String(!open)})
    }}><ChevronDown size={14}/>{open ? 'Hide details' : 'Show details'}</HbarAppUiButton><HbarAppUiMetricStrip
        metrics={[{label: 'Steps', value: String(steps)}, {
            label: 'Tools',
            value: String(Math.max(2, spec.profile.itemCount - 1))
        }, {label: 'Projected cost', value: `$${(cost / 10).toFixed(2)}`}]}/><HbarAppUiSpotlight
        className="hbar-app-ui-plan-summary-card">
        <div><Timer size={15}/><strong>Approx. {steps * 18}s</strong></div>
        <HbarAppUiProgress value={spec.profile.initialState === 'warning' ? 74 : 28} label="Projected budget"
                           tone={spec.profile.initialState === 'warning' ? 'warning' : 'accent'}/>{open && <ul>
        <li>file.read · workspace scope</li>
        <li>search · indexed sources</li>
        <li>test.run · isolated worker</li>
    </ul>}</HbarAppUiSpotlight></ActionSurfaceFrame>
}

export function AgentPlan({spec, onAction}: PlanProps) {
    switch (spec.variant) {
        case 1:
            return <ChecklistPlan spec={spec} onAction={onAction}/>
        case 2:
            return <EditablePlan spec={spec} onAction={onAction}/>
        case 3:
            return <PlanTree spec={spec} onAction={onAction}/>
        case 4:
            return <PlanActual spec={spec} onAction={onAction}/>
        case 5:
            return <TodoBoard spec={spec} onAction={onAction}/>
        case 6:
            return <PlanSummary spec={spec} onAction={onAction}/>
        default:
            return <ChecklistPlan spec={spec} onAction={onAction}/>
    }
}
