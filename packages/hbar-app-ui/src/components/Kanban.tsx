import {useState} from 'react'
import {ChevronDown, GripVertical, MoreHorizontal, Plus, ShieldAlert} from 'lucide-react'
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

type KanbanProps = HbarAppUiVariantProps

function StatusBoard({spec, onAction}: KanbanProps) {
    const [items, setItems] = useState(['Review API contract', 'Update empty state', 'Check permissions']);
    const move = (index: number) => {
        const next = [...items];
        const [item] = next.splice(index, 1);
        if (item) next.push(item);
        setItems(next);
        onAction?.({variantId: spec.id, actionId: 'drag', value: next.join('|')})
    };
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-kanban-variant-1"><HbarAppUiToolbar title="Status board"
                                                                                          detail="Drag or use keyboard card moves"/><HbarAppUiButton
        onClick={() => setItems((current) => [...current, 'New task'])}><Plus size={13}/>Add task</HbarAppUiButton>
        <div className="hbar-app-ui-kanban-board">{['Todo', 'In progress', 'Done'].map((column, columnIndex) => <section
            key={column}>
            <header>
                <strong>{column}</strong><small>{columnIndex === 0 ? items.length : columnIndex}</small><HbarAppUiProgress
                value={columnIndex === 0 ? 42 : columnIndex === 1 ? 68 : 100} label={`${column} capacity`}
                tone="accent"/></header>
            {columnIndex === 0 && items.map((item, index) => <HbarAppUiSpotlight draggable key={item}
                                                                                 onDragEnd={() => move(index)}><GripVertical
                size={13}/><strong>{item}</strong><small>Today <MoreHorizontal
                size={12}/></small></HbarAppUiSpotlight>)}{columnIndex > 0 &&
            <HbarAppUiSpotlight><strong>{column === 'Done' ? 'Create workspace' : 'Build activity panel'}</strong><small>Assigned
                to Avery</small></HbarAppUiSpotlight>}</section>)}</div>
    </ActionSurfaceFrame>
}

function Swimlanes({spec, onAction}: KanbanProps) {
    const [open, setOpen] = useState<Record<string, boolean>>({Core: true, Growth: true});
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-kanban-variant-2"><HbarAppUiToolbar title="Swimlane board"
                                                                                          detail="Sticky stage header · drag across lanes"/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'drag', value: 'lane'})}>Move card</HbarAppUiButton>
        <div className="hbar-app-ui-swimlanes">
            <header><span>Workstream</span><span>Todo</span><span>Doing</span><span>Done</span></header>
            {Object.keys(open).map((lane) => <div className="hbar-app-ui-swimlane" key={lane}>
                <button type="button" onClick={() => setOpen((current) => ({...current, [lane]: !current[lane]}))}>
                    <ChevronDown size={13} className={open[lane] ? '' : 'is-collapsed'}/>{lane}</button>
                {open[lane] && <>
                    <HbarAppUiSpotlight><span>{lane} discovery</span></HbarAppUiSpotlight><HbarAppUiSpotlight><span>{lane} implementation</span></HbarAppUiSpotlight><HbarAppUiSpotlight><span>{lane} shipped</span></HbarAppUiSpotlight></>}
            </div>)}</div>
    </ActionSurfaceFrame>
}

function Regroupable({spec, onAction}: KanbanProps) {
    const [group, setGroup] = useState('Status');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-kanban-variant-3"><HbarAppUiToolbar title="Regroupable board"
                                                                                          detail="Drop sets status, assignee or priority"/><HbarAppUiTabs
        label="Group by" value={group} options={['Status', 'Assignee', 'Priority'].map((id) => ({id, label: id}))}
        onChange={(value) => {
            setGroup(value);
            onAction?.({variantId: spec.id, actionId: 'group', value})
        }}/>
        <div className="hbar-app-ui-regroup-board">{['Review API', 'Update docs', 'Fix latency'].map((item, index) =>
            <HbarAppUiSpotlight draggable key={item} onDragEnd={() => onAction?.({
                variantId: spec.id,
                actionId: 'drop',
                value: `${item}:${group}`
            })}><GripVertical
                size={13}/><strong>{item}</strong><span>{group === 'Status' ? ['Todo', 'Doing', 'Done'][index] : group === 'Assignee' ? ['Avery', 'Mina', 'Jon'][index] : ['High', 'Medium', 'Low'][index]}</span></HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function DetailBoard({spec, onAction}: KanbanProps) {
    const [selected, setSelected] = useState('Build activity panel');
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-kanban-variant-4">
        <div className="hbar-app-ui-kanban-detail">
            <main><HbarAppUiToolbar title="Work board" detail="Select a card for details"/><HbarAppUiButton
                onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: 'new'})}><Plus size={13}/>Add
                card</HbarAppUiButton>{['Build activity panel', 'Validate response', 'Publish notes'].map((item) =>
                <button type="button" className={selected === item ? 'is-selected' : ''} key={item}
                        onClick={() => setSelected(item)}><strong>{item}</strong><small>In progress</small></button>)}
            </main>
            <aside><HbarAppUiToolbar title={selected} detail="Properties and activity"/><HbarAppUiStatus
                value="In progress" tone="warning"/><label>Assignee<select defaultValue="Avery">
                <option>Avery</option>
                <option>Mina</option>
            </select></label><label>Priority<select defaultValue="High">
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
            </select></label><p>Activity · moved to In progress 4m ago</p><HbarAppUiButton tone="accent"
                                                                                           onClick={() => onAction?.({
                                                                                               variantId: spec.id,
                                                                                               actionId: 'save',
                                                                                               value: selected
                                                                                           })}>Save
                changes</HbarAppUiButton></aside>
        </div>
    </ActionSurfaceFrame>
}

function SprintBoard({spec, onAction}: KanbanProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-kanban-variant-5"><HbarAppUiToolbar title="Sprint board"
                                                                                          detail="Points, capacity and blocked flags"/><HbarAppUiMetricStrip
        metrics={[{label: 'Points', value: '42 / 60'}, {
            label: 'Capacity',
            value: '70%',
            tone: 'positive'
        }, {label: 'Blocked', value: '2', tone: 'warning'}]}/>
        <div className="hbar-app-ui-sprint-columns">{['Backlog', 'Doing', 'Done'].map((column, index) => <section
            key={column}>
            <header><strong>{column}</strong><span>{index * 4 + 6} pts</span></header>
            <HbarAppUiProgress value={index === 1 ? 76 : index === 2 ? 100 : 36} label={`${column} capacity`}
                               tone={index === 1 ? 'warning' : 'accent'}/>{['Review contract', 'Ship editor', 'Resolve incident'].slice(0, index + 1).map((item, itemIndex) =>
            <HbarAppUiSpotlight key={item}><strong>{item}</strong><small>{itemIndex === 0 && index === 0 ? <>
                <ShieldAlert size={11}/> Blocked</> : `${itemIndex + 2} pts`}</small></HbarAppUiSpotlight>)}
        </section>)}</div>
    </ActionSurfaceFrame>
}

function CompactBoard({spec, onAction}: KanbanProps) {
    const [column, setColumn] = useState('Todo');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-kanban-variant-6"><HbarAppUiToolbar title="Compact task board"
                                                                                          detail="Segmented column pager"/><HbarAppUiTabs
        label="Column" value={column} options={['Todo', 'Doing', 'Done'].map((id) => ({id, label: id}))}
        onChange={setColumn}/>
        <div className="hbar-app-ui-compact-column">
            <HbarAppUiSpotlight><strong>{column === 'Todo' ? 'Review API contract' : column === 'Doing' ? 'Build activity panel' : 'Create workspace'}</strong><small>Step
                controls · 3 steps</small>
                <div><HbarAppUiButton onClick={() => onAction?.({variantId: spec.id, actionId: 'step', value: column})}>Next
                    step</HbarAppUiButton><HbarAppUiButton><MoreHorizontal size={13}/></HbarAppUiButton></div>
            </HbarAppUiSpotlight></div>
    </ActionSurfaceFrame>
}

export function Kanban({spec, onAction}: KanbanProps) {
    switch (spec.variant) {
        case 1:
            return <StatusBoard spec={spec} onAction={onAction}/>;
        case 2:
            return <Swimlanes spec={spec} onAction={onAction}/>;
        case 3:
            return <Regroupable spec={spec} onAction={onAction}/>;
        case 4:
            return <DetailBoard spec={spec} onAction={onAction}/>;
        case 5:
            return <SprintBoard spec={spec} onAction={onAction}/>;
        case 6:
            return <CompactBoard spec={spec} onAction={onAction}/>;
        default:
            return <StatusBoard spec={spec} onAction={onAction}/>
    }
}
